import type { CollisionSession, CollisionStatus, UserProfile } from '@music-mixer/shared';
import type { CollisionConfig, CollisionMode } from '@music-mixer/shared';
import type { CollisionResult } from '@music-mixer/shared';
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_CONFIG: CollisionConfig = {
  participantWeights: [50, 50],
  participantTimeRanges: ['medium_term', 'medium_term'],
  userAWeight: 50,
  userBWeight: 50,
  playlistLength: 15,
  playlistLengthMode: 'tracks',
  playlistDurationMinutes: 60,
  playlistGenerationMode: 'midpoint',
  mode: 'link',
};

interface StoredCollision {
  session: CollisionSession;
  userASessionId: string;
  userBSessionId: string | null;
  result: CollisionResult | null;
  config: CollisionConfig;
  intendedFriendId?: string;
  ghostUserBId?: string;
  playlistSearchOffset: number;
  regenerateCount: number;
}

const collisions = new Map<string, StoredCollision>();
const pendingForUser = new Map<string, string[]>();

function defaultConfig(overrides?: Partial<CollisionConfig>): CollisionConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

export function createCollision(
  userA: UserProfile,
  userASessionId: string,
  baseUrl: string,
  options?: {
    mode?: CollisionMode;
    friendId?: string;
    config?: Partial<CollisionConfig>;
  },
): CollisionSession {
  const id = uuidv4().slice(0, 8);
  const mode = options?.mode ?? 'link';
  const config = defaultConfig({ ...options?.config, mode });

  const session: CollisionSession = {
    id,
    status: 'waiting',
    userA,
    userB: null,
    createdAt: new Date().toISOString(),
    shareUrl: `${baseUrl}/join/${id}`,
    config,
    friendId: options?.friendId,
  };

  collisions.set(id, {
    session,
    userASessionId,
    userBSessionId: null,
    result: null,
    config,
    intendedFriendId: options?.friendId,
    playlistSearchOffset: 0,
    regenerateCount: 0,
  });

  if (options?.friendId) {
    const pending = pendingForUser.get(options.friendId) ?? [];
    pending.push(id);
    pendingForUser.set(options.friendId, pending);
  }

  return session;
}

export function createGhostCollision(
  userA: UserProfile,
  userASessionId: string,
  userB: UserProfile,
  ghostId: string,
  baseUrl: string,
  configOverrides?: Partial<CollisionConfig>,
): CollisionSession {
  const id = uuidv4().slice(0, 8);
  const config = defaultConfig({
    ...configOverrides,
    mode: 'friend',
    participantWeights: [50, 50],
  });

  const session: CollisionSession = {
    id,
    status: 'ready',
    userA,
    userB,
    createdAt: new Date().toISOString(),
    shareUrl: `${baseUrl}/collision/${id}`,
    config,
    friendId: ghostId,
  };

  collisions.set(id, {
    session,
    userASessionId,
    userBSessionId: null,
    result: null,
    config,
    ghostUserBId: ghostId,
    playlistSearchOffset: 0,
    regenerateCount: 0,
  });

  return session;
}

export function isGhostCollision(id: string): boolean {
  const stored = collisions.get(id);
  return Boolean(stored?.ghostUserBId || (stored?.session.userB?.id?.startsWith('ghost-')));
}

export function createSoloCollision(
  user: UserProfile,
  sessionId: string,
  baseUrl: string,
  configOverrides?: Partial<CollisionConfig>,
): CollisionSession {
  const id = uuidv4().slice(0, 8);
  const virtualB: UserProfile = {
    id: `${user.id}-recent`,
    displayName: `${user.displayName} (Recent Vibes)`,
    avatarUrl: user.avatarUrl,
    platform: 'spotify',
  };

  const config = defaultConfig({
    ...configOverrides,
    mode: 'solo',
    participantWeights: [60, 40],
    participantTimeRanges: ['long_term', 'short_term'],
    playlistGenerationMode: 'equal_share',
  });

  const session: CollisionSession = {
    id,
    status: 'ready',
    userA: user,
    userB: virtualB,
    createdAt: new Date().toISOString(),
    shareUrl: `${baseUrl}/collision/${id}`,
    config,
  };

  collisions.set(id, {
    session,
    userASessionId: sessionId,
    userBSessionId: sessionId,
    result: null,
    config,
    playlistSearchOffset: 0,
    regenerateCount: 0,
  });

  return session;
}

export function getCollision(id: string): StoredCollision | null {
  return collisions.get(id) ?? null;
}

export function getPendingCollisions(userId: string): CollisionSession[] {
  const ids = pendingForUser.get(userId) ?? [];
  return ids
    .map((id) => collisions.get(id)?.session)
    .filter((s): s is CollisionSession => s !== undefined && s.status !== 'complete');
}

export function joinCollision(
  id: string,
  userB: UserProfile,
  userBSessionId: string,
): CollisionSession | null {
  const stored = collisions.get(id);
  if (!stored || stored.session.status !== 'waiting') return null;
  if (stored.session.userA?.id === userB.id) return null;

  stored.session.userB = userB;
  stored.session.status = 'ready';
  stored.userBSessionId = userBSessionId;

  if (stored.intendedFriendId) {
    const pending = pendingForUser.get(stored.intendedFriendId) ?? [];
    pendingForUser.set(
      stored.intendedFriendId,
      pending.filter((cid) => cid !== id),
    );
  }

  return stored.session;
}

export function updateCollisionConfig(id: string, partial: Partial<CollisionConfig>): CollisionConfig | null {
  const stored = collisions.get(id);
  if (!stored) return null;
  stored.config = { ...stored.config, ...partial };
  stored.session.config = stored.config;
  return stored.config;
}

export function setCollisionComplete(id: string, result: CollisionResult): void {
  const stored = collisions.get(id);
  if (!stored) return;
  stored.session.status = 'complete';
  stored.result = { ...result, collisionId: id };
}

export function getCollisionResult(id: string): CollisionResult | null {
  return collisions.get(id)?.result ?? null;
}

export function nextPlaylistSearchOffset(id: string): number {
  const stored = collisions.get(id);
  const offset = Math.floor(Math.random() * 51);
  if (stored) stored.playlistSearchOffset = offset;
  return offset;
}

export function incrementRegenerateCount(id: string): number {
  const stored = collisions.get(id);
  if (!stored) return 0;
  stored.regenerateCount += 1;
  stored.session.regenerateCount = stored.regenerateCount;
  return stored.regenerateCount;
}

export function updateCollisionPlaylist(id: string, result: CollisionResult): CollisionResult | null {
  const stored = collisions.get(id);
  if (!stored?.result) return null;
  stored.result = { ...result, collisionId: id };
  return stored.result;
}

export function updateCollisionStatus(id: string, status: CollisionStatus): void {
  const stored = collisions.get(id);
  if (stored) stored.session.status = status;
}

export function getStoredConfig(id: string): CollisionConfig | null {
  return collisions.get(id)?.config ?? null;
}
