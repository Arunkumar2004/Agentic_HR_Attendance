import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db/database';
import { signToken, authRequired, toPublic } from '../middleware/auth';
import { notifyAdmins } from '../agents/notify';
import { AuthedRequest, UserRow } from '../types';

const router = Router();

// POST /api/auth/login  { email, password, role }
router.post('/login', (req: Request, res: Response) => {
  const { email, password, role } = req.body as { email?: string; password?: string; role?: string };
  if (!email || !password) {
    res.status(400).json({ error: 'Email and password required' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(
    String(email).toLowerCase().trim(),
  ) as unknown as UserRow | undefined;
  if (!user || !bcrypt.compareSync(password, user.pass)) {
    res.status(401).json({ error: 'Invalid credentials' });
    return;
  }

  if (role && user.role !== role) {
    res.status(403).json({ error: `This is a ${user.role} account. Switch to ${user.role} login.` });
    return;
  }

  const token = signToken(user);
  res.json({ token, user: toPublic(user) });
});

// GET /api/auth/me  — current logged-in user
router.get('/me', authRequired, (req: Request, res: Response) => {
  res.json({ user: (req as AuthedRequest).user });
});

// POST /api/auth/forgot-password  { email } — employee can't log in.
// Always succeeds (no email enumeration); notifies all admins to set a temp password.
router.post('/forgot-password', (req: Request, res: Response) => {
  const { email } = (req.body || {}) as { email?: unknown };
  const emailNorm = String(email || '').toLowerCase().trim();
  if (emailNorm && emailNorm.includes('@')) {
    const user = db.prepare('SELECT id,name,email FROM users WHERE email = ?').get(emailNorm) as unknown as
      | { id: string; name: string; email: string }
      | undefined;
    if (user) {
      const text = `<b>Password reset requested:</b> ${user.name} (${user.email}). Set a temporary password via All Employees → Edit.`;
      notifyAdmins(text, 'password');
    }
  }
  res.json({ message: 'If this email is registered, the admin has been notified to reset your password.' });
});

// PATCH /api/auth/change-password  { current, next } — self-service
router.patch('/change-password', authRequired, (req: Request, res: Response) => {
  const { current, next } = (req.body || {}) as { current?: string; next?: string };
  if (!current || !next) {
    res.status(400).json({ error: 'Current and new password required' });
    return;
  }
  if (String(next).length < 6) {
    res.status(400).json({ error: 'New password must be at least 6 characters' });
    return;
  }

  const me = (req as AuthedRequest).user!;
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id) as unknown as UserRow | undefined;
  if (!row || !bcrypt.compareSync(current, row.pass)) {
    res.status(401).json({ error: 'Current password is wrong' });
    return;
  }
  if (bcrypt.compareSync(next, row.pass)) {
    res.status(400).json({ error: 'New password must be different' });
    return;
  }
  db.prepare('UPDATE users SET pass = ?, mustChangePass = 0, tokenVersion = tokenVersion + 1 WHERE id = ?').run(bcrypt.hashSync(next, 10), me.id);
  const fresh = db.prepare('SELECT * FROM users WHERE id = ?').get(me.id) as unknown as UserRow;
  res.json({ message: 'Password changed successfully. Other devices were logged out.', token: signToken(fresh), user: toPublic(fresh) });
});

export default router;
