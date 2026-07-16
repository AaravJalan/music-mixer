import { Router } from 'express';
import type { Request, Response } from 'express';
import { requireAuth } from '../middleware/auth';
import {
  createFriendInvite,
  acceptFriendInvite,
  getFriends,
  removeFriend,
  getDefaultGhostFriends,
  resolveFriendProfile,
} from '../services/friends';
import { getCachedProfile } from '../services/session';
import { getPendingCollisions } from '../collision/store';
import { isGhostUserId } from '../services/ghosts';

const router = Router();

router.get('/', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as Request & { user: { id: string } }).user.id;
  const friendIds = await getFriends(userId);
  const realFriendsRaw = await Promise.all(
    friendIds.map(async (f) => {
      const profile = (await getCachedProfile(f.userId)) ?? (await resolveFriendProfile(f.userId));
      if (!profile) return null;
      return { user: profile, addedAt: f.addedAt, isGhost: isGhostUserId(f.userId) };
    })
  );
  const realFriends = realFriendsRaw.filter((f): f is NonNullable<typeof f> => f !== null);

  const ghostIds = new Set(realFriends.filter((f) => f.isGhost).map((f) => f.user.id));
  const defaultGhosts = await getDefaultGhostFriends();
  const ghosts = defaultGhosts.filter((g) => !ghostIds.has(g.user.id));
  const friends = [...ghosts, ...realFriends.filter((f) => !f.isGhost)];

  const pendingCollisions = await getPendingCollisions(userId);
  res.json({ friends, pendingCollisions });
});

router.post('/invite', requireAuth, async (req: Request, res: Response) => {
  const user = (req as Request & { user: import('@music-mixer/shared').UserProfile }).user;
  const { code, inviteUrl } = await createFriendInvite(user);
  res.json({ code, inviteUrl });
});

router.post('/accept/:code', requireAuth, async (req: Request, res: Response) => {
  const user = (req as Request & { user: import('@music-mixer/shared').UserProfile }).user;
  const code = Array.isArray(req.params.code) ? req.params.code[0] : req.params.code;
  const friend = await acceptFriendInvite(code, user);
  if (!friend) {
    res.status(400).json({ error: 'Invalid or expired invite' });
    return;
  }
  res.json({ friend });
});

router.delete('/:friendId', requireAuth, async (req: Request, res: Response) => {
  const userId = (req as Request & { user: { id: string } }).user.id;
  const friendId = Array.isArray(req.params.friendId) ? req.params.friendId[0] : req.params.friendId;
  await removeFriend(userId, friendId);
  res.json({ ok: true });
});

export default router;
