import type { CollisionSession, CollisionStatus, UserProfile } from '@music-mixer/shared';
import type { CollisionConfig, CollisionMode } from '@music-mixer/shared';
import type { CollisionResult } from '@music-mixer/shared';
import { v4 as uuidv4 } from 'uuid';
import { redis } from '../services/redis/client';

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

export interface StoredCollision {
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

// ─── Key helpers ──────────────────────────────────────────────────────────────
const collisionKey = (id: string) => `collision:${id}`;
const pendingKey = (userId: string) => `pending:${userId}`;

/** 24-hour TTL — abandoned sessions are garbage-collected automatically. */
const COLLISION_TTL = 86400;

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getStored(id: string): Promise<StoredCollision | null> {
  const raw = await redis.get<string>(collisionKey(id));
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? (JSON.parse(raw) as StoredCollision) : (raw as StoredCollision);
  } catch {
    return null;
  }
}

async function saveStored(id: string, stored: StoredCollision): Promise<void> {
  await redis.set(collisionKey(id), JSON.stringify(stored), { ex: COLLISION_TTL });
}

async function getPendingIds(userId: string): Promise<string[]> {
  const raw = await redis.get<string>(pendingKey(userId));
  if (!raw) return [];
  try {
    return typeof raw === 'string' ? (JSON.parse(raw) as string[]) : (raw as string[]);
  } catch {
    return [];
  }
}

async function savePendingIds(userId: string, ids: string[]): Promise<void> {
  if (ids.length === 0) {
    await redis.del(pendingKey(userId));
  } else {
    await redis.set(pendingKey(userId), JSON.stringify(ids), { ex: COLLISION_TTL });
  }
}

function defaultConfig(overrides?: Partial<CollisionConfig>): CollisionConfig {
  return { ...DEFAULT_CONFIG, ...overrides };
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function createCollision(
  userA: UserProfile,
  userASessionId: string,
  baseUrl: string,
  options?: {
    mode?: CollisionMode;
    friendId?: string;
    config?: Partial<CollisionConfig>;
  },
): Promise<CollisionSession> {
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

  const stored: StoredCollision = {
    session,
    userASessionId,
    userBSessionId: null,
    result: null,
    config,
    intendedFriendId: options?.friendId,
    playlistSearchOffset: 0,
    regenerateCount: 0,
  };

  await saveStored(id, stored);

  if (options?.friendId) {
    const pending = await getPendingIds(options.friendId);
    pending.push(id);
    await savePendingIds(options.friendId, pending);
  }

  return session;
}

export async function createGhostCollision(
  userA: UserProfile,
  userASessionId: string,
  userB: UserProfile,
  ghostId: string,
  baseUrl: string,
  configOverrides?: Partial<CollisionConfig>,
): Promise<CollisionSession> {
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

  const stored: StoredCollision = {
    session,
    userASessionId,
    userBSessionId: null,
    result: null,
    config,
    ghostUserBId: ghostId,
    playlistSearchOffset: 0,
    regenerateCount: 0,
  };

  await saveStored(id, stored);
  return session;
}

export async function isGhostCollision(id: string): Promise<boolean> {
  const stored = await getStored(id);
  return Boolean(stored?.ghostUserBId || stored?.session.userB?.id?.startsWith('ghost-'));
}

export async function createSoloCollision(
  user: UserProfile,
  sessionId: string,
  baseUrl: string,
  configOverrides?: Partial<CollisionConfig>,
): Promise<CollisionSession> {
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

  const stored: StoredCollision = {
    session,
    userASessionId: sessionId,
    userBSessionId: sessionId,
    result: null,
    config,
    playlistSearchOffset: 0,
    regenerateCount: 0,
  };

  await saveStored(id, stored);
  return session;
}

export async function getCollision(id: string): Promise<StoredCollision | null> {
  return getStored(id);
}

export async function getPendingCollisions(userId: string): Promise<CollisionSession[]> {
  const ids = await getPendingIds(userId);
  const results = await Promise.all(ids.map((id) => getStored(id)));
  return results
    .map((s) => s?.session)
    .filter((s): s is CollisionSession => s !== undefined && s.status !== 'complete');
}

export async function joinCollision(
  id: string,
  userB: UserProfile,
  userBSessionId: string,
): Promise<CollisionSession | null> {
  const stored = await getStored(id);
  if (!stored || stored.session.status !== 'waiting') return null;
  if (stored.session.userA?.id === userB.id) return null;

  stored.session.userB = userB;
  stored.session.status = 'ready';
  stored.userBSessionId = userBSessionId;

  if (stored.intendedFriendId) {
    const pending = await getPendingIds(stored.intendedFriendId);
    await savePendingIds(
      stored.intendedFriendId,
      pending.filter((cid) => cid !== id),
    );
  }

  await saveStored(id, stored);
  return stored.session;
}

export async function updateCollisionConfig(id: string, partial: Partial<CollisionConfig>): Promise<CollisionConfig | null> {
  const stored = await getStored(id);
  if (!stored) return null;
  stored.config = { ...stored.config, ...partial };
  stored.session.config = stored.config;
  await saveStored(id, stored);
  return stored.config;
}

export async function setCollisionComplete(id: string, result: CollisionResult): Promise<void> {
  const stored = await getStored(id);
  if (!stored) return;
  stored.session.status = 'complete';
  stored.result = { ...result, collisionId: id };
  await saveStored(id, stored);
}

export async function getCollisionResult(id: string): Promise<CollisionResult | null> {
  const stored = await getStored(id);
  return stored?.result ?? null;
}

export async function nextPlaylistSearchOffset(id: string): Promise<number> {
  const stored = await getStored(id);
  const offset = Math.floor(Math.random() * 51);
  if (stored) {
    stored.playlistSearchOffset = offset;
    await saveStored(id, stored);
  }
  return offset;
}

export async function incrementRegenerateCount(id: string): Promise<number> {
  const stored = await getStored(id);
  if (!stored) return 0;
  stored.regenerateCount += 1;
  stored.session.regenerateCount = stored.regenerateCount;
  await saveStored(id, stored);
  return stored.regenerateCount;
}

export async function updateCollisionPlaylist(id: string, result: CollisionResult): Promise<CollisionResult | null> {
  const stored = await getStored(id);
  if (!stored?.result) return null;
  stored.result = { ...result, collisionId: id };
  await saveStored(id, stored);
  return stored.result;
}

export async function updateCollisionStatus(id: string, status: CollisionStatus): Promise<void> {
  const stored = await getStored(id);
  if (stored) {
    stored.session.status = status;
    await saveStored(id, stored);
  }
}

export async function getStoredConfig(id: string): Promise<CollisionConfig | null> {
  const stored = await getStored(id);
  return stored?.config ?? null;
}
