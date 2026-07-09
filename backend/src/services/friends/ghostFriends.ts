import type { Friend, UserProfile } from '@music-mixer/shared';
import { ghostToUserProfile, isGhostUserId, listGhostProfiles } from '../sandbox/ghostProfiles';

export async function getDefaultGhostFriends(): Promise<Friend[]> {
  const ghosts = await listGhostProfiles();
  return ghosts.map((ghost) => ({
    user: ghostToUserProfile(ghost),
    addedAt: '1970-01-01T00:00:00.000Z',
    isGhost: true,
  }));
}

export async function resolveFriendProfile(userId: string): Promise<UserProfile | null> {
  if (!isGhostUserId(userId)) return null;
  const ghosts = await listGhostProfiles();
  const ghost = ghosts.find((g) => g.id === userId);
  return ghost ? ghostToUserProfile(ghost) : null;
}
