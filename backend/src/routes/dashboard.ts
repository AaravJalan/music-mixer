import { Router } from 'express';
import type { Request, Response } from 'express';
import type { TasteTimeRange } from '@music-mixer/shared';
import { requireAuth } from '../middleware/auth';
import { getDashboardAnalytics } from '../services/dashboard';
import { getListeningHabits } from '../services/habits';

const router = Router();

const VALID_TERMS: TasteTimeRange[] = ['short_term', 'medium_term', 'year_to_date', 'long_term'];

function parseTerm(raw: unknown): TasteTimeRange | null {
  if (typeof raw !== 'string') return 'medium_term';
  return VALID_TERMS.includes(raw as TasteTimeRange) ? (raw as TasteTimeRange) : null;
}

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as Request & { sessionId: string; user: { id: string } };
  const term = parseTerm(req.query.term);

  if (!term) {
    res.status(400).json({
      error: 'Invalid term. Use short_term, medium_term, year_to_date, or long_term.',
    });
    return;
  }

  try {
    const data = await getDashboardAnalytics(authReq.sessionId, term, authReq.user.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load dashboard', details: String(err) });
  }
});

router.get('/habits', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as Request & { sessionId: string; user: { id: string } };
  const term = parseTerm(req.query.term);

  if (!term) {
    res.status(400).json({
      error: 'Invalid term. Use short_term, medium_term, year_to_date, or long_term.',
    });
    return;
  }

  try {
    const data = await getListeningHabits(authReq.sessionId, term, authReq.user.id);
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to load listening habits', details: String(err) });
  }
});

export default router;
