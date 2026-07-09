import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { listGhostProfiles } from '../services/ghosts';
import { runSandboxCollision } from '../collision/engine';
import { recordRecommendationLatency, getMetricsSnapshot } from '../middleware/telemetry';
import { recordCollisionHistory } from '../collision/history';

const router = Router();

router.get('/ghosts', async (_req: Request, res: Response) => {
  try {
    const ghosts = await listGhostProfiles();
    res.json({ ghosts });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.post('/collision', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as Request & {
    user: import('@music-mixer/shared').UserProfile;
    sessionId: string;
  };

  const body = req.body as import('@music-mixer/shared').SandboxCollisionRequest;

  const ghostIds = body.ghostIds ?? [];
  if (!Array.isArray(ghostIds) || ghostIds.length < 1 || ghostIds.length > 3) {
    res.status(400).json({ error: 'Select 1–3 ghost profiles' });
    return;
  }

  const start = performance.now();

  try {
    const result = await runSandboxCollision(authReq.user, authReq.sessionId, ghostIds, {
      participantWeights: body.participantWeights,
      playlistLength: body.playlistLength,
      playlistLengthMode: body.playlistLengthMode,
      playlistDurationMinutes: body.playlistDurationMinutes,
      playlistGenerationMode: body.playlistGenerationMode,
      randomOffset: body.randomOffset ?? Math.floor(Math.random() * 21),
    });
    const latency = performance.now() - start;
    recordRecommendationLatency(latency);
    await recordCollisionHistory(authReq.user.id, result, 'sandbox', {
      participantWeights: result.participantWeights,
      participantTimeRanges: Array(result.participantWeights.length).fill('medium_term') as import('@music-mixer/shared').TasteTimeRange[],
      playlistGenerationMode: body.playlistGenerationMode ?? 'equal_share',
      userAWeight: result.blendWeights.userA,
      userBWeight: result.blendWeights.userB,
      playlistLength: body.playlistLength ?? result.playlist.length,
      playlistLengthMode: body.playlistLengthMode ?? 'tracks',
      playlistDurationMinutes: body.playlistDurationMinutes ?? 60,
      mode: 'sandbox',
    });
    res.json({ result, metrics: getMetricsSnapshot(latency) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Sandbox collision error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
