import { Router, Request, Response } from 'express';
import { authRequired, adminOnly } from '../middleware/auth';
import { getRules, updateRules } from '../agents/rules';
import { CompanyRules } from '../agents/rules';

const router = Router();

// GET /api/rules — company rules for the agents (admin)
router.get('/', authRequired, adminOnly, (_req: Request, res: Response) => {
  res.json({ rules: getRules() });
});

// PATCH /api/rules — update timings/thresholds (admin)
router.patch('/', authRequired, adminOnly, (req: Request, res: Response) => {
  try {
    const rules = updateRules((req.body || {}) as Partial<CompanyRules>);
    res.json({ rules, message: 'Rules saved — agents use them from the next check' });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

export default router;
