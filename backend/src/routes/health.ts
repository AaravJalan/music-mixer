import { Router } from 'express';
import { getMetricsSnapshot } from '../middleware/telemetry';

const router = Router();

router.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'music-mixer-api',
  });
});

router.get('/metrics', (_req, res) => {
  res.json(getMetricsSnapshot(0));
});

export default router;
