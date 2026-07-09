import { Router } from 'express';
import { getMetricsSnapshot } from '../middleware/telemetry';
import { audioFeatureCache } from '../services/cache/audioFeatures';

const router = Router();

router.get('/', (_req, res) => {
  const cacheStats = audioFeatureCache.getStats();
  res.json({
    status: 'ok',
    service: 'music-mixer-api',
    cache: cacheStats,
  });
});

router.get('/metrics', (_req, res) => {
  res.json(getMetricsSnapshot(0));
});

export default router;
