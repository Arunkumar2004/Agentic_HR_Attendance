import { Router, Request, Response } from 'express';
import { authRequired, adminOnly } from '../middleware/auth';
import { FEATURES, allFlags, setFeature } from '../agents/features';

const router = Router();

// GET /api/settings/features — full flag map (admin)
router.get('/features', authRequired, adminOnly, (_req: Request, res: Response) => {
  res.json({ features: FEATURES, flags: allFlags() });
});

// PATCH /api/settings/features { key, enabled } — flip a kill-switch (admin)
router.patch('/features', authRequired, adminOnly, (req: Request, res: Response) => {
  const { key, enabled } = (req.body || {}) as { key?: unknown; enabled?: unknown };
  try {
    setFeature(String(key), !!enabled);
    res.json({ flags: allFlags(), message: `Feature ${enabled ? 'enabled' : 'disabled'}` });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

// GET /api/settings/public — enabled-map for every logged-in user (drives tab hiding)
router.get('/public', authRequired, (_req: Request, res: Response) => {
  res.json({ flags: allFlags() });
});

export default router;
