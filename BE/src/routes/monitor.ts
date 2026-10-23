import { Router, Request, Response } from 'express';
import { authRequired, adminOnly } from '../middleware/auth';
import { recentAlerts, runMonitor } from '../agents/monitor';
import { agentStatus } from '../agents/notify';

const router = Router();
import { requireFeature } from '../agents/features';

// GET /api/monitor/status — agent health + channel state (admin, always visible)
router.get('/status', authRequired, adminOnly, (_req: Request, res: Response) => {
  res.json({ status: agentStatus() });
});

router.use(requireFeature('monitor', 'Monitor Agent'));

// GET /api/monitor/alerts — recent monitor alerts feed (admin)
router.get('/alerts', authRequired, adminOnly, (req: Request, res: Response) => {
  const limit = Math.min(Math.max(parseInt(String(req.query.limit || '50'), 10) || 50, 1), 200);
  res.json({ alerts: recentAlerts(limit) });
});

// POST /api/monitor/run — trigger a monitor check now (admin, for testing/timing)
router.post('/run', authRequired, adminOnly, (_req: Request, res: Response) => {
  const alerts = runMonitor('manual');
  res.json({ alerts, message: alerts.length ? `${alerts.length} new alert(s)` : 'Checked — nothing new' });
});

export default router;
