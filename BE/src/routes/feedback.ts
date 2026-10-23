import { Router, Request, Response } from 'express';
import { db } from '../db/database';
import { authRequired, adminOnly } from '../middleware/auth';
import { AuthedRequest } from '../types';
import { uid } from '../agents/clock';
import { notifyAdmins } from '../agents/notify';

const router = Router();
import { requireFeature } from '../agents/features';
router.use(requireFeature('feedback', 'Feedback'));

// POST /api/feedback — employee sends feedback { mode: 'direct' | 'indirect', text }
// direct → admin sees the name. indirect → stored anonymous, admin never sees who.
router.post('/', authRequired, (req: Request, res: Response) => {
  const me = (req as AuthedRequest).user!;
  if (me.role !== 'employee') {
    res.status(403).json({ error: 'Only employees send feedback' });
    return;
  }
  const { mode, text } = (req.body || {}) as { mode?: unknown; text?: unknown };
  if (mode !== 'direct' && mode !== 'indirect') {
    res.status(400).json({ error: "Mode must be 'direct' or 'indirect'" });
    return;
  }
  const msg = String(text || '').trim();
  if (msg.length < 3) {
    res.status(400).json({ error: 'Write your feedback first' });
    return;
  }
  if (msg.length > 2000) {
    res.status(400).json({ error: 'Feedback too long (max 2000 characters)' });
    return;
  }
  const anonymous = mode === 'indirect';
  db.prepare('INSERT INTO feedback (id,userId,name,mode,text,created) VALUES (?,?,?,?,?,?)').run(
    uid('f'),
    anonymous ? null : me.id,
    anonymous ? 'Anonymous' : me.name,
    mode,
    msg,
    Date.now(),
  );
  notifyAdmins(
    anonymous
      ? `<b>New anonymous feedback</b> (sender hidden by employee's choice). Open Admin → Feedback to read.`
      : `<b>New feedback from ${me.name}.</b> Open Admin → Feedback to read.`,
    'feedback',
  );
  res.status(201).json({ message: anonymous ? 'Sent anonymously. Admin cannot see who sent this.' : 'Sent to admin' });
});

// GET /api/feedback — admin sees all (direct shows name, indirect shows Anonymous)
router.get('/', authRequired, adminOnly, (_req: Request, res: Response) => {
  const rows = db.prepare('SELECT * FROM feedback ORDER BY created DESC LIMIT 500').all();
  res.json({ feedback: rows });
});

// GET /api/feedback/mine — employee sees only their DIRECT feedback
router.get('/mine', authRequired, (req: Request, res: Response) => {
  const me = (req as AuthedRequest).user!;
  const rows = db.prepare("SELECT * FROM feedback WHERE userId = ? AND mode = 'direct' ORDER BY created DESC LIMIT 100").all(me.id);
  res.json({ feedback: rows });
});

export default router;
