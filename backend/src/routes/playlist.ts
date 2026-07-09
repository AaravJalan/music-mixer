import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import { getCollisionResult } from '../collision/store';
import { getCollisionSnapshot } from '../collision/history';
import { exportPlaylistToSpotify } from '../spotify/export';

const router = Router();

router.post('/export', requireAuth, async (req: Request, res: Response) => {
  const authReq = req as Request & {
    user: import('@music-mixer/shared').UserProfile;
    sessionId: string;
  };
  const { collisionId, name, public: isPublic } = req.body as {
    collisionId: string;
    name?: string;
    public?: boolean;
  };

  const result = getCollisionResult(collisionId)
    ?? getCollisionSnapshot(authReq.user.id, collisionId)?.result
    ?? null;
  if (!result) {
    res.status(404).json({ error: 'Collision result not found' });
    return;
  }

  const playlistName =
    name ?? `MusicMixer: ${result.userA.displayName} × ${result.userB.displayName}`;

  try {
    const exported = await exportPlaylistToSpotify(
      authReq.sessionId,
      result.playlist,
      playlistName,
      isPublic ?? false,
    );
    res.json(exported);
  } catch (err) {
    res.status(500).json({ error: 'Export failed', details: String(err) });
  }
});

export default router;
