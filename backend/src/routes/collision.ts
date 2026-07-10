import { Router } from 'express';
import type { Request, Response } from 'express';
import type { TasteTimeRange, PlaylistGenerationMode } from '@music-mixer/shared';
import { requireAuth } from '../middleware/auth';
import {
  createCollision,
  createGhostCollision,
  createSoloCollision,
  getCollision,
  joinCollision,
  getCollisionResult,
  setCollisionComplete,
  updateCollisionStatus,
  updateCollisionConfig,
  getStoredConfig,
  isGhostCollision,
  nextPlaylistSearchOffset,
  incrementRegenerateCount,
  updateCollisionPlaylist,
} from '../collision/store';
import {
  ghostToParticipant,
  profileToParticipant,
  runCollisionEngine,
  runMultiUserCollision,
  regenerateCollisionPlaylist,
} from '../collision/engine';
import { recordCollisionHistory, getCollisionHistory, getCollisionSnapshot, rerunCollisionFromHistory, deleteCollisionHistoryEntry, clearCollisionHistory } from '../collision/history';
import { recordRecommendationLatency, getMetricsSnapshot } from '../middleware/telemetry';
import { env } from '../config/env';
import { areFriends } from '../services/friends';
import { getGhostProfile, ghostToUserProfile, isGhostUserId } from '../services/ghosts';

const router = Router();

function paramId(req: Request): string {
  const id = req.params.id;
  return Array.isArray(id) ? id[0] : id;
}

router.post('/create', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as Request & { user: import('@music-mixer/shared').UserProfile; sessionId: string };
  const body = req.body as {
    mode?: string;
    friendId?: string;
    userAWeight?: number;
    userBWeight?: number;
    playlistLength?: number;
    playlistDurationMinutes?: number;
    playlistLengthMode?: import('@music-mixer/shared').PlaylistLengthMode;
    participantTimeRanges?: import('@music-mixer/shared').TasteTimeRange[];
  };

  if (body.friendId && !isGhostUserId(body.friendId) && !areFriends(authReq.user.id, body.friendId)) {
    res.status(400).json({ error: 'User is not in your friends list' });
    return;
  }

  const config = {
    userAWeight: body.userAWeight ?? 50,
    userBWeight: body.userBWeight ?? 50,
    playlistLength: body.playlistLength ?? 30,
    playlistLengthMode: body.playlistLengthMode ?? ('track_count' as import('@music-mixer/shared').PlaylistLengthMode),
    playlistDurationMinutes: body.playlistDurationMinutes,
    participantTimeRanges: body.participantTimeRanges ?? ['medium_term', 'medium_term'],
  };

  if (body.friendId && isGhostUserId(body.friendId)) {
    const ghost = await getGhostProfile(body.friendId);
    if (!ghost) {
      res.status(400).json({ error: 'Unknown profile' });
      return;
    }
    const collision = await createGhostCollision(
      authReq.user,
      authReq.sessionId,
      ghostToUserProfile(ghost),
      body.friendId,
      env.frontendUrl,
      config,
    );
    res.json({ collision });
    return;
  }

  const collision = await createCollision(authReq.user, authReq.sessionId, env.frontendUrl, {
    mode: body.mode as 'link' | 'friend' | undefined,
    friendId: body.friendId,
    config,
  });

  res.json({ collision });
});

router.post('/create-solo', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as Request & { user: import('@music-mixer/shared').UserProfile; sessionId: string };
  const body = req.body as { userAWeight?: number; userBWeight?: number; playlistLength?: number };

  const collision = await createSoloCollision(authReq.user, authReq.sessionId, env.frontendUrl, {
    userAWeight: body.userAWeight ?? 60,
    userBWeight: body.userBWeight ?? 40,
    participantWeights: [body.userAWeight ?? 60, body.userBWeight ?? 40],
    participantTimeRanges: ['medium_term', 'medium_term'] as TasteTimeRange[],
    playlistGenerationMode: 'equal_share' as PlaylistGenerationMode,
    playlistLength: body.playlistLength ?? 15,
  });

  res.json({ collision });
});

router.get('/history', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as Request & { user: { id: string } }).user.id;
  res.json({ collisions: await getCollisionHistory(userId) });
});

router.delete('/history', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as Request & { user: { id: string } }).user.id;
  const cleared = await clearCollisionHistory(userId);
  res.json({ ok: true, cleared });
});

router.get('/history/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as Request & { user: { id: string } }).user.id;
  const id = paramId(req);
  const snapshot = await getCollisionSnapshot(userId, id);
  if (!snapshot) {
    res.status(404).json({ error: 'Collision not found' });
    return;
  }
  res.json({ snapshot });
});

router.post('/history/:id/rerun', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as Request & {
    user: import('@music-mixer/shared').UserProfile;
    sessionId: string;
  };
  const id = paramId(req);
  const body = req.body as {
    userAWeight?: number;
    userBWeight?: number;
    participantWeights?: number[];
    playlistLength?: number;
  };

  const start = performance.now();

  try {
    const result = await rerunCollisionFromHistory(
      authReq.user.id,
      authReq.sessionId,
      authReq.user,
      id,
      body,
    );
    const latency = performance.now() - start;
    recordRecommendationLatency(latency);
    res.json({ result, metrics: getMetricsSnapshot(latency) });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Collision rerun error:', message);
    res.status(500).json({ error: message });
  }
});

router.delete('/history/:id', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as Request & { user: { id: string } }).user.id;
  const id = paramId(req);
  const completedAt = typeof req.query.completedAt === 'string' ? req.query.completedAt : '';

  if (!completedAt) {
    res.status(400).json({ error: 'completedAt query parameter is required' });
    return;
  }

  const deleted = await deleteCollisionHistoryEntry(userId, id, completedAt);
  if (!deleted) {
    res.status(404).json({ error: 'Collision not found in your history' });
    return;
  }

  res.json({ ok: true });
});

router.get('/:id', async (req: Request, res: Response) => {
  const stored = await getCollision(paramId(req));
  if (!stored) {
    res.status(404).json({ error: 'Collision not found' });
    return;
  }
  res.json({ collision: stored.session });
});

router.patch('/:id/config', requireAuth, async (req: Request, res: Response) => {
  const config = await updateCollisionConfig(paramId(req), req.body);
  if (!config) {
    res.status(404).json({ error: 'Collision not found' });
    return;
  }
  res.json({ config });
});

router.post('/:id/join', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as Request & { user: import('@music-mixer/shared').UserProfile; sessionId: string };
  const session = await joinCollision(paramId(req), authReq.user, authReq.sessionId);
  if (!session) {
    res.status(400).json({ error: 'Cannot join this collision' });
    return;
  }
  res.json({ collision: session });
});

router.post('/:id/run', requireAuth, async (req: Request, res: Response) => {
  const id = paramId(req);
  const stored = await getCollision(id);
  if (!stored || !stored.session.userA || !stored.session.userB) {
    res.status(400).json({ error: 'Both users must be present' });
    return;
  }

  const ghostMode = await isGhostCollision(id);
  if (!ghostMode && !stored.userBSessionId) {
    res.status(400).json({ error: 'Both users must be present' });
    return;
  }

  const body = req.body as {
    userAWeight?: number;
    userBWeight?: number;
    participantWeights?: number[];
    participantTimeRanges?: import('@music-mixer/shared').TasteTimeRange[];
    playlistGenerationMode?: import('@music-mixer/shared').PlaylistGenerationMode;
    playlistLength?: number;
    playlistLengthMode?: import('@music-mixer/shared').PlaylistLengthMode;
    playlistDurationMinutes?: number;
  };
  if (
    body.userAWeight !== undefined
    || body.userBWeight !== undefined
    || body.participantWeights !== undefined
    || body.participantTimeRanges !== undefined
    || body.playlistGenerationMode !== undefined
    || body.playlistLength !== undefined
    || body.playlistLengthMode !== undefined
    || body.playlistDurationMinutes !== undefined
  ) {
    const weights = body.participantWeights ?? [
      body.userAWeight ?? stored.config.userAWeight,
      body.userBWeight ?? stored.config.userBWeight,
    ];
    await updateCollisionConfig(id, {
      userAWeight: weights[0],
      userBWeight: weights[1] ?? stored.config.userBWeight,
      participantWeights: weights,
      participantTimeRanges: body.participantTimeRanges ?? stored.config.participantTimeRanges,
      playlistGenerationMode: body.playlistGenerationMode ?? stored.config.playlistGenerationMode,
      playlistLength: body.playlistLength,
      playlistLengthMode: body.playlistLengthMode,
      playlistDurationMinutes: body.playlistDurationMinutes,
    });
  }

  const config = (await getStoredConfig(id))!;

  if (stored.result) {
    res.json({ result: stored.result, metrics: getMetricsSnapshot(0) });
    return;
  }

  await updateCollisionStatus(id, 'ready');
  const start = performance.now();

  try {
    let result;
    if (ghostMode) {
      const ghost = await getGhostProfile(stored.session.userB!.id);
      if (!ghost) {
        res.status(400).json({ error: 'Ghost profile not found' });
        return;
      }
      const timeRanges = config.participantTimeRanges ?? ['medium_term', 'medium_term'];
      const participantA = await profileToParticipant(
        stored.userASessionId,
        stored.session.userA,
        config.userAWeight,
        timeRanges[0],
      );
      const participantB = ghostToParticipant(ghost, config.userBWeight);
      result = await runMultiUserCollision({
        sessionId: stored.userASessionId,
        participants: [participantA, participantB],
        config,
        collisionId: id,
      });
    } else {
      result = await runCollisionEngine({
        sessionIdA: stored.userASessionId,
        sessionIdB: stored.userBSessionId!,
        userA: stored.session.userA,
        userB: stored.session.userB,
        config,
        soloMode: config.mode === 'solo',
      });
    }
    const latency = performance.now() - start;
    recordRecommendationLatency(latency);
    const finalResult = { ...result, collisionId: id };
    await setCollisionComplete(id, finalResult);
    await recordCollisionHistory(stored.session.userA.id, finalResult, config.mode, config);
    if (!ghostMode && stored.session.userB && config.mode !== 'solo') {
      await recordCollisionHistory(stored.session.userB.id, finalResult, config.mode, config);
    }
    const metrics = getMetricsSnapshot(latency);
    res.json({ result: finalResult, metrics });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Collision engine error:', message);
    res.status(500).json({
      error: message.includes('top tracks') || message.includes('Session expired')
        ? message
        : 'Collision engine failed',
      details: message,
    });
  }
});

router.get('/:id/result', async (req: Request, res: Response) => {
  const result = await getCollisionResult(paramId(req));
  if (!result) {
    res.status(404).json({ error: 'Result not ready' });
    return;
  }
  res.json({ result });
});

router.post('/:id/regenerate-playlist', requireAuth, async (req: Request, res: Response) => {
  const id = paramId(req);
  const stored = await getCollision(id);
  if (!stored?.result) {
    res.status(400).json({ error: 'Collision result not ready' });
    return;
  }

  const authReq = req as Request & {
    user: import('@music-mixer/shared').UserProfile;
    sessionId: string;
  };

  const isParticipant = stored.session.userA?.id === authReq.user.id
    || stored.session.userB?.id === authReq.user.id;
  if (!isParticipant) {
    res.status(403).json({ error: 'Only collision participants can regenerate the playlist' });
    return;
  }

  const start = performance.now();

  try {
    const randomOffset = await nextPlaylistSearchOffset(id);
    const regenerateCount = await incrementRegenerateCount(id);
    const regenerated = await regenerateCollisionPlaylist(
      stored.userASessionId,
      stored.result,
      {
        userASessionId: stored.userASessionId,
        userBSessionId: stored.userBSessionId,
        config: stored.config,
        ghostUserBId: stored.ghostUserBId,
      },
      randomOffset,
    );
    const finalResult = { ...regenerated, collisionId: id };
    await updateCollisionPlaylist(id, finalResult);
    const latency = performance.now() - start;
    recordRecommendationLatency(latency);
    res.json({ result: finalResult, metrics: getMetricsSnapshot(latency), regenerateCount });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Playlist regenerate error:', message);
    res.status(500).json({ error: message });
  }
});

export default router;
