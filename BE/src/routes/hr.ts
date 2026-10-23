import { Router, Request, Response } from 'express';
import { authRequired, adminOnly } from '../middleware/auth';
import { askHR } from '../agents/hr';

const router = Router();
import { requireFeature } from '../agents/features';
router.use(requireFeature('hr', 'HR Assistant'));

// POST /api/hr/ask  { question } — HR Assistant (admin/HR only)
// Uses the AI model when LLM_API_KEY is set, else honest rule-based answers.
router.post('/ask', authRequired, adminOnly, async (req: Request, res: Response) => {
  const { question } = (req.body || {}) as { question?: unknown };
  if (!question || !String(question).trim()) {
    res.status(400).json({ error: 'Ask a question, e.g. "Who was absent this week?"' });
    return;
  }
  try {
    const result = await askHR(String(question));
    res.json(result);
  } catch (e) {
    res.status(500).json({ error: (e as Error).message || 'HR assistant failed' });
  }
});

export default router;
