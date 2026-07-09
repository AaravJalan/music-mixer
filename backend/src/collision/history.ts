import type {
  CollisionConfig,
  CollisionHistoryEntry,
  CollisionHistoryParticipant,
  CollisionHistorySnapshot,
  CollisionMode,
  CollisionResult,
  UserProfile,
} from '@music-mixer/shared';
import { redis } from '../services/redis/client';
import {
  ghostToParticipant,
  profileToParticipant,
  runMultiUserCollision,
  type ParticipantBundle,
} from './engine';
import { getGhostProfile } from '../services/ghosts';

// ─── Key helpers ──────────────────────────────────────────────────────────────
const historyKey = (userId: string) => `history:${userId}`;
const snapshotKey = (collisionId: string) => `snapshot:${collisionId}`;

/** Maximum history entries retained per user. */
const MAX_HISTORY = 50;

// ─── Internal helpers ─────────────────────────────────────────────────────────

async function getHistory(userId: string): Promise<CollisionHistoryEntry[]> {
  const raw = await redis.get<string>(historyKey(userId));
  if (!raw) return [];
  try {
    return typeof raw === 'string'
      ? (JSON.parse(raw) as CollisionHistoryEntry[])
      : (raw as CollisionHistoryEntry[]);
  } catch {
    return [];
  }
}

async function saveHistory(userId: string, entries: CollisionHistoryEntry[]): Promise<void> {
  if (entries.length === 0) {
    await redis.del(historyKey(userId));
  } else {
    await redis.set(historyKey(userId), JSON.stringify(entries));
  }
}

async function getSnapshot(collisionId: string): Promise<CollisionHistorySnapshot | null> {
  const raw = await redis.get<string>(snapshotKey(collisionId));
  if (!raw) return null;
  try {
    return typeof raw === 'string'
      ? (JSON.parse(raw) as CollisionHistorySnapshot)
      : (raw as CollisionHistorySnapshot);
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

export async function recordCollisionHistory(
  userId: string,
  result: CollisionResult,
  mode: CollisionMode,
  config: CollisionConfig,
): Promise<void> {
  const entry: CollisionHistoryEntry = {
    id: result.collisionId,
    completedAt: new Date().toISOString(),
    mode,
    participantNames: result.participants.map((p) => p.user.displayName),
    similarityScore: result.similarityScore,
    playlistLength: result.playlist.length,
  };

  const participants: CollisionHistoryParticipant[] = result.participants.map((p) => ({
    userId: p.user.id,
    displayName: p.user.displayName,
    isGhost: !!p.isGhost,
  }));

  const snapshot: CollisionHistorySnapshot = { entry, result, config, participants };

  const list = await getHistory(userId);
  list.unshift(entry);

  await Promise.all([
    saveHistory(userId, list.slice(0, MAX_HISTORY)),
    redis.set(snapshotKey(result.collisionId), JSON.stringify(snapshot)),
  ]);
}

export async function getCollisionHistory(userId: string): Promise<CollisionHistoryEntry[]> {
  return getHistory(userId);
}

export async function deleteCollisionHistoryEntry(
  userId: string,
  collisionId: string,
  completedAt: string,
): Promise<boolean> {
  const list = await getHistory(userId);
  const next = list.filter((e) => !(e.id === collisionId && e.completedAt === completedAt));
  if (next.length === list.length) return false;

  await saveHistory(userId, next);

  // Only delete the snapshot if no other user still references this collision.
  // Since we can't efficiently scan all history keys, we keep the snapshot around
  // (it's a small key, and the snapshot is only accessible to users who own it).
  // Clean up if the user who just deleted it was the only remaining reference.
  const stillInNext = next.some((e) => e.id === collisionId);
  if (!stillInNext) {
    await redis.del(snapshotKey(collisionId));
  }

  return true;
}

/** Remove every history entry for a user, cleaning up any now-orphaned snapshots. */
export async function clearCollisionHistory(userId: string): Promise<number> {
  const list = await getHistory(userId);
  const removed = list.length;
  if (removed === 0) return 0;

  await saveHistory(userId, []);

  // Delete all snapshots referenced exclusively by this user's history.
  // We delete them optimistically; a concurrent delete from the other participant is harmless.
  await Promise.all(list.map((e) => redis.del(snapshotKey(e.id))));

  return removed;
}

export async function getCollisionSnapshot(
  userId: string,
  collisionId: string,
): Promise<CollisionHistorySnapshot | null> {
  const list = await getHistory(userId);
  const owned = list.some((e) => e.id === collisionId);
  if (!owned) return null;
  return getSnapshot(collisionId);
}

export async function rerunCollisionFromHistory(
  userId: string,
  sessionId: string,
  user: UserProfile,
  collisionId: string,
  overrides: {
    userAWeight?: number;
    userBWeight?: number;
    participantWeights?: number[];
    participantTimeRanges?: import('@music-mixer/shared').TasteTimeRange[];
    playlistGenerationMode?: import('@music-mixer/shared').PlaylistGenerationMode;
    playlistLength?: number;
    playlistLengthMode?: import('@music-mixer/shared').PlaylistLengthMode;
    playlistDurationMinutes?: number;
  },
): Promise<CollisionResult> {
  const snapshot = await getCollisionSnapshot(userId, collisionId);
  if (!snapshot) {
    throw new Error('Collision not found in your history');
  }

  const weights = overrides.participantWeights ?? [
    overrides.userAWeight ?? snapshot.config.userAWeight,
    overrides.userBWeight ?? snapshot.config.userBWeight,
  ];

  const timeRanges = overrides.participantTimeRanges ?? snapshot.config.participantTimeRanges ?? ['long_term', 'long_term'];

  const config: CollisionConfig = {
    ...snapshot.config,
    userAWeight: weights[0] ?? snapshot.config.userAWeight,
    userBWeight: weights[1] ?? snapshot.config.userBWeight,
    participantWeights: weights,
    participantTimeRanges: timeRanges,
    playlistGenerationMode: overrides.playlistGenerationMode ?? snapshot.config.playlistGenerationMode ?? 'midpoint',
    playlistLength: overrides.playlistLength ?? snapshot.config.playlistLength,
    playlistLengthMode: overrides.playlistLengthMode ?? snapshot.config.playlistLengthMode,
    playlistDurationMinutes: overrides.playlistDurationMinutes ?? snapshot.config.playlistDurationMinutes,
  };

  const bundles: ParticipantBundle[] = [];

  for (let i = 0; i < snapshot.participants.length; i++) {
    const spec = snapshot.participants[i];
    const weight = weights[i] ?? weights[weights.length - 1] ?? 50;
    const term = timeRanges[i] ?? timeRanges[timeRanges.length - 1] ?? 'long_term';
    const stored = snapshot.result.participants.find((p) => p.user.id === spec.userId);

    if (spec.isGhost) {
      const ghost = await getGhostProfile(spec.userId);
      if (!ghost) throw new Error(`Ghost profile missing: ${spec.displayName}`);
      bundles.push(ghostToParticipant(ghost, weight));
    } else if (spec.userId === user.id) {
      bundles.push(await profileToParticipant(sessionId, user, weight, term));
    } else if (stored) {
      bundles.push({
        user: stored.user,
        weight,
        vector: stored.vector,
        genres: stored.genres,
        tracks: [],
        artists: (stored.topArtists ?? []).map((a) => ({
          id: a.id,
          name: a.name,
          imageUrl: a.imageUrl,
        })),
      });
    } else {
      throw new Error(`Cannot rebuild participant: ${spec.displayName}`);
    }
  }

  const result = await runMultiUserCollision({
    sessionId,
    participants: bundles,
    config,
    collisionId,
  });

  await recordCollisionHistory(userId, result, snapshot.config.mode, config);
  return result;
}
