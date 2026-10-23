import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { authRequired, adminOnly } from '../middleware/auth';
import { notifyAdmins, notifyUser } from '../agents/notify';
import { uid } from '../agents/clock';
import { AuthedRequest, LeaveRow } from '../types';

const router = Router();

// Leave-category bell.
const notify = (userId: string, text: string): void => notifyUser(userId, text, 'leave');

// POST /api/leaves  { type, from, to, reason }
router.post('/', authRequired, (req: Request, res: Response) => {
  const me = (req as AuthedRequest).user!;
  const { type, from, to, reason } = (req.body || {}) as { type?: unknown; from?: unknown; to?: unknown; reason?: unknown };
  if (!from || !to || !reason) {
    res.status(400).json({ error: 'From, to and reason required' });
    return;
  }
  if (String(to) < String(from)) {
    res.status(400).json({ error: '"To" date must be after "From"' });
    return;
  }

  const leave = {
    id: uid(),
    userId: me.id,
    name: me.name,
    type: String(type || 'Permission'),
    from: String(from),
    to: String(to),
    reason: String(reason),
    status: 'pending',
    adminNote: '',
    appliedAt: Date.now(),
  };

  db.prepare('INSERT INTO leaves (id,userId,name,type,"from","to",reason,status,adminNote,appliedAt) VALUES (?,?,?,?,?,?,?,?,?,?)').run(
    leave.id, leave.userId, leave.name, leave.type, leave.from, leave.to, leave.reason, leave.status, leave.adminNote, leave.appliedAt,
  );

  const designation = (me as { designation?: string }).designation || '';
  notifyAdmins(`New leave: <b>${me.name}</b> (${designation}) — ${leave.type}, ${leave.from} → ${leave.to}.`, 'leave');

  res.status(201).json({ message: 'Leave sent for admin approval', leave });
});

// GET /api/leaves  — admin: all | employee: own
router.get('/', authRequired, (req: Request, res: Response) => {
  const me = (req as AuthedRequest).user!;
  const rows =
    me.role === 'admin'
      ? db.prepare('SELECT * FROM leaves ORDER BY appliedAt DESC').all()
      : db.prepare('SELECT * FROM leaves WHERE userId = ? ORDER BY appliedAt DESC').all(me.id);
  res.json({ leaves: rows });
});

// PATCH /api/leaves/:id  { status: 'approved' | 'rejected', note? }  — admin only
router.patch('/:id', authRequired, adminOnly, (req: Request, res: Response) => {
  const { status, note } = (req.body || {}) as { status?: unknown; note?: unknown };
  if (status !== 'approved' && status !== 'rejected') {
    res.status(400).json({ error: "Status must be 'approved' or 'rejected'" });
    return;
  }
  const info = db.prepare('UPDATE leaves SET status = ?, adminNote = ? WHERE id = ? AND status = ?').run(
    status, String(note || ''), req.params.id, 'pending',
  ) as unknown as { changes: number };
  if (info.changes === 0) {
    res.status(404).json({ error: 'Pending request not found' });
    return;
  }

  const leave = db.prepare('SELECT * FROM leaves WHERE id = ?').get(req.params.id) as unknown as LeaveRow;
  notify(
    leave.userId,
    status === 'approved'
      ? `<b>Leave approved:</b> ${leave.type}, ${leave.from} → ${leave.to}. Enjoy!`
      : `<b>Leave rejected:</b> ${leave.type}, ${leave.from} → ${leave.to}. Contact admin.`,
  );

  res.json({ message: status === 'approved' ? 'Leave approved' : 'Leave rejected' });
});

export default router;
