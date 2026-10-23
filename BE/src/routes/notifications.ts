import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { authRequired } from '../middleware/auth';
import { AuthedRequest } from '../types';

const router = Router();

// GET /api/notifications  — current user's notifications, unread first
router.get('/', authRequired, (req: Request, res: Response) => {
  const me = (req as AuthedRequest).user!;
  const rows = db.prepare('SELECT * FROM notifications WHERE userId = ? ORDER BY read ASC, created DESC').all(me.id);
  res.json({ notifications: rows });
});

// PATCH /api/notifications/read-all  — mark current user's notifications read
router.patch('/read-all', authRequired, (req: Request, res: Response) => {
  const me = (req as AuthedRequest).user!;
  db.prepare('UPDATE notifications SET read = 1 WHERE userId = ?').run(me.id);
  res.json({ message: 'All notifications marked read' });
});

export default router;
