import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/database';
import { authRequired } from '../middleware/auth';
import { AuthedRequest } from '../types';
import { istToday, uid } from '../agents/clock';
import { notifyAdmins } from '../agents/notify';

const router = Router();
import { requireFeature } from '../agents/features';
router.use(requireFeature('eod', 'EOD Reports'));

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const ah =
  (fn: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// POST /api/eod — employee submits today's report (one per day; resubmitting updates it)
router.post(
  '/',
  authRequired,
  ah(async (req: Request, res: Response) => {
    const me = (req as AuthedRequest).user!;
    if (me.role !== 'employee') {
      res.status(403).json({ error: 'Only employees submit EOD reports' });
      return;
    }
    const { content, date } = (req.body || {}) as { content?: unknown; date?: unknown };
    const text = String(content || '').trim();
    if (text.length < 3) {
      res.status(400).json({ error: 'Write a few words about your day' });
      return;
    }
    if (text.length > 5000) {
      res.status(400).json({ error: 'Report too long (max 5000 characters)' });
      return;
    }
    const day = date && /^\d{4}-\d{2}-\d{2}$/.test(String(date)) ? String(date) : istToday();
    db.prepare(
      'INSERT INTO eod_reports (id,userId,name,date,content,created) VALUES (?,?,?,?,?,?) ON CONFLICT(userId,date) DO UPDATE SET content=excluded.content, created=excluded.created',
    ).run(uid('e'), me.id, me.name, day, text, Date.now());
    notifyAdmins(`<b>EOD report:</b> ${me.name} submitted the report for ${day}.`, 'eod');
    res.status(201).json({ message: day === istToday() ? "Today's report saved" : `Report saved for ${day}` });
  }),
);

// GET /api/eod — employee: own | admin: all (?userId=, ?date=, ?from=, ?to=)
router.get('/', authRequired, (req: Request, res: Response) => {
  const me = (req as AuthedRequest).user!;
  const q = req.query as { userId?: string; date?: string; from?: string; to?: string };
  if (me.role === 'admin') {
    let sql = 'SELECT * FROM eod_reports';
    const conds: string[] = [];
    const params: string[] = [];
    if (q.userId) {
      conds.push('userId = ?');
      params.push(q.userId);
    }
    if (q.date) {
      conds.push('date = ?');
      params.push(q.date);
    }
    if (q.from) {
      conds.push('date >= ?');
      params.push(q.from);
    }
    if (q.to) {
      conds.push('date <= ?');
      params.push(q.to);
    }
    if (conds.length) sql += ' WHERE ' + conds.join(' AND ');
    sql += ' ORDER BY date DESC LIMIT 500';
    res.json({ reports: db.prepare(sql).all(...params) });
    return;
  }
  const rows = db.prepare('SELECT * FROM eod_reports WHERE userId = ? ORDER BY date DESC LIMIT 100').all(me.id);
  res.json({ reports: rows });
});

export default router;
