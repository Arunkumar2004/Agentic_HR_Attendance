import { Router, Request, Response, NextFunction } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/database';
import * as excel from '../db/excel';
import { authRequired, adminOnly, toPublic } from '../middleware/auth';
import { validBirthday } from '../agents/clock';
import { AuthedRequest, UserRow } from '../types';

const router = Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const ah =
  (fn: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// GET /api/users  — admin: all users | employee: self
router.get('/', authRequired, (req: Request, res: Response) => {
  const me = (req as AuthedRequest).user!;
  if (me.role === 'admin') {
    const users = (db.prepare('SELECT * FROM users ORDER BY id').all() as unknown as UserRow[]).map(toPublic);
    res.json({ users });
    return;
  }
  const self = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id) as unknown as UserRow | undefined;
  res.json({ users: self ? [toPublic(self)] : [] });
});

// PATCH /api/users/me  — employee edits OWN name + phone + birthday.
// Designation & department are admin-controlled (sent fields are ignored).
router.patch(
  '/me',
  authRequired,
  ah(async (req: Request, res: Response) => {
    const { name, phone, birthday } = (req.body || {}) as { name?: unknown; phone?: unknown; birthday?: unknown };
    const updates: Record<string, string> = {};
    if (name !== undefined) {
      const n = String(name).trim();
      if (n.length < 2) {
        res.status(400).json({ error: 'Full name must be at least 2 characters' });
        return;
      }
      updates.name = n;
    }
    if (phone !== undefined) updates.phone = String(phone).trim() || '—';
    if (birthday !== undefined) {
      const b = validBirthday(birthday);
      if (b === null) {
        res.status(400).json({ error: 'Birthday must be a valid past date (YYYY-MM-DD)' });
        return;
      }
      updates.birthday = b;
    }
    const keys = Object.keys(updates);
    if (!keys.length) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }

    const me = (req as AuthedRequest).user!;
    const current = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id) as unknown as UserRow;
    const nameChanged = !!updates.name && updates.name !== current.name;
    db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
      ...keys.map((k) => updates[k]),
      me.id,
    );
    if (nameChanged) {
      db.prepare('UPDATE attendance SET name = ? WHERE userId = ?').run(updates.name, me.id);
      db.prepare('UPDATE leaves SET name = ? WHERE userId = ?').run(updates.name, me.id);
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id) as unknown as UserRow;
    let exRes: excel.ExcelResult = { added: false, reason: 'skipped' };
    if (nameChanged) {
      exRes = await excel.appendEmployee(user.name, user.designation).catch(() => ({ added: false, reason: 'excel append failed' }));
    }
    res.json({ user: toPublic(user), message: 'Profile saved', excel: exRes });
  }),
);

// GET /api/users/:id  — admin: any | employee: own only
router.get('/:id', authRequired, (req: Request, res: Response) => {
  const me = (req as AuthedRequest).user!;
  if (me.role !== 'admin' && req.params.id !== me.id) {
    res.status(403).json({ error: 'You can only view your own profile' });
    return;
  }
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as unknown as UserRow | undefined;
  if (!user) {
    res.status(404).json({ error: 'User not found' });
    return;
  }
  res.json({ user: toPublic(user) });
});

// POST /api/users  — admin only: creates login { email, password? }
router.post(
  '/',
  authRequired,
  adminOnly,
  ah(async (req: Request, res: Response) => {
    const { email, password } = (req.body || {}) as { email?: unknown; password?: unknown };
    if (!email || !String(email).includes('@')) {
      res.status(400).json({ error: 'Valid email required' });
      return;
    }

    const tempPass = String(password || 'emp123');
    if (tempPass.length < 6) {
      res.status(400).json({ error: 'Temporary password must be at least 6 characters' });
      return;
    }

    const emailNorm = String(email).toLowerCase().trim();
    const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(emailNorm);
    if (exists) {
      res.status(409).json({ error: 'Email already registered' });
      return;
    }

    const maxNum = (db.prepare("SELECT id FROM users WHERE role = 'employee'").all() as unknown as { id: string }[]).reduce(
      (m, r) => {
        const n = parseInt(String(r.id).replace(/^ELN-?/, ''), 10);
        return !isNaN(n) && n > m ? n : m;
      },
      100,
    );
    const id = 'ELN-' + (maxNum + 1);
    const passHash = bcrypt.hashSync(tempPass, 10);
    const guess =
      emailNorm.split('@')[0].replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).trim() || 'New Employee';
    const today = new Date().toLocaleDateString('en-CA', { timeZone: process.env.TZ_OFFICE || 'Asia/Kolkata' });

    db.prepare('INSERT INTO users (id,name,email,pass,role,dept,designation,phone,"join",mustChangePass) VALUES (?,?,?,?,?,?,?,?,?,1)').run(
      id, guess, emailNorm, passHash, 'employee', 'General', 'Employee', '—', today,
    );

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as unknown as UserRow;
    res.status(201).json({
      user: toPublic(user),
      message: `Login created for ${emailNorm} (temporary password: ${tempPass}). Employee completes their profile after first login.`,
    });
  }),
);

// PATCH /api/users/:id  — admin only: set employee details { name, phone, designation, dept, birthday }
router.patch(
  '/:id',
  authRequired,
  adminOnly,
  ah(async (req: Request, res: Response) => {
    const target = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.params.id, 'employee') as unknown as
      | UserRow
      | undefined;
    if (!target) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    const { name, phone, designation, dept, password, birthday } = (req.body || {}) as {
      name?: unknown; phone?: unknown; designation?: unknown; dept?: unknown; password?: unknown; birthday?: unknown;
    };
    const updates: Record<string, string | number> = {};
    if (name !== undefined) {
      const n = String(name).trim();
      if (n.length < 2) {
        res.status(400).json({ error: 'Full name must be at least 2 characters' });
        return;
      }
      updates.name = n;
    }
    if (phone !== undefined) updates.phone = String(phone).trim() || '—';
    if (designation !== undefined) {
      const d = String(designation).trim();
      if (!d) {
        res.status(400).json({ error: 'Designation cannot be empty' });
        return;
      }
      updates.designation = d;
    }
    if (dept !== undefined) updates.dept = String(dept).trim() || 'General';
    if (birthday !== undefined) {
      const b = validBirthday(birthday);
      if (b === null) {
        res.status(400).json({ error: 'Birthday must be a valid past date (YYYY-MM-DD)' });
        return;
      }
      updates.birthday = b;
    }
    let pwReset = false;
    if (password !== undefined && String(password).trim() !== '') {
      const p = String(password).trim();
      if (p.length < 6) {
        res.status(400).json({ error: 'Temporary password must be at least 6 characters' });
        return;
      }
      updates.pass = bcrypt.hashSync(p, 10);
      updates.mustChangePass = '1';
      pwReset = true;
    }
    const keys = Object.keys(updates);
    if (!keys.length) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }
    const nameChanged = !!updates.name && updates.name !== target.name;
    db.prepare(`UPDATE users SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
      ...keys.map((k) => updates[k]),
      req.params.id,
    );
    if (nameChanged) {
      db.prepare('UPDATE attendance SET name = ? WHERE userId = ?').run(updates.name, req.params.id);
      db.prepare('UPDATE leaves SET name = ? WHERE userId = ?').run(updates.name, req.params.id);
    }
    if (pwReset) {
      // Kill all existing sessions everywhere; temp password forces a fresh login.
      db.prepare('UPDATE users SET tokenVersion = tokenVersion + 1 WHERE id = ?').run(req.params.id);
    }
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.params.id) as unknown as UserRow;
    let exRes: excel.ExcelResult = { added: false, reason: 'skipped' };
    if (updates.designation || nameChanged) {
      exRes = await excel.appendEmployee(user.name, user.designation).catch(() => ({ added: false, reason: 'excel append failed' }));
    }
    res.json({
      user: toPublic(user),
      message: pwReset ? 'Temporary password set — employee must change it on next login' : 'Employee updated',
      excel: exRes,
    });
  }),
);

// DELETE /api/users/:id  — admin only
router.delete('/:id', authRequired, adminOnly, (req: Request, res: Response) => {
  const u = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(req.params.id, 'employee');
  if (!u) {
    res.status(404).json({ error: 'Employee not found' });
    return;
  }
  db.prepare('DELETE FROM attendance WHERE userId = ?').run(req.params.id);
  db.prepare('DELETE FROM leaves WHERE userId = ?').run(req.params.id);
  db.prepare('DELETE FROM notifications WHERE userId = ?').run(req.params.id);
  db.prepare('DELETE FROM eod_reports WHERE userId = ?').run(req.params.id);
  db.prepare('DELETE FROM feedback WHERE userId = ?').run(req.params.id);
  db.prepare('DELETE FROM users WHERE id = ?').run(req.params.id);
  res.json({ message: 'Employee removed' });
});

export default router;
