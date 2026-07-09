import type {
  CollisionConfig,
  CollisionHistoryEntry,
  CollisionHistoryParticipant,
  CollisionHistorySnapshot,
  CollisionMode,
  CollisionResult,
  UserProfile,
} from '@music-mixer/shared';
import { loadJsonFile, saveJsonFile } from '../lib/persist';
import {
  ghostToParticipant,
  profileToParticipant,
  runMultiUserCollision,
  type ParticipantBundle,
} from './engine';
import { getGhostProfile } from '../services/ghosts';

const HISTORY_FILE = 'collision-history.json';
const SNAPSHOTS_FILE = 'collision-snapshots.json';

type HistoryStore = Record<string, CollisionHistoryEntry[]>;
type SnapshotStore = Record<string, CollisionHistorySnapshot>;

const byUser = loadJsonFile<HistoryStore>(HISTORY_FILE, {});
const snapshots = loadJsonFile<SnapshotStore>(SNAPSHOTS_FILE, {});

function persist(): void {
  saveJsonFile(HISTORY_FILE, byUser);
  saveJsonFile(SNAPSHOTS_FILE, snapshots);
}

export function recordCollisionHistory(
  userId: string,
  result: CollisionResult,
  mode: CollisionMode,
  config: CollisionConfig,
): void {
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

  const list = byUser[userId] ?? [];
  list.unshift(entry);
  byUser[userId] = list.slice(0, 50);

  snapshots[result.collisionId] = {
    entry,
    result,
    config,
    participants,
  };

  persist();
}

export function getCollisionHistory(userId: string): CollisionHistoryEntry[] {
  return byUser[userId] ?? [];
}

export function deleteCollisionHistoryEntry(
  userId: string,
  collisionId: string,
  completedAt: string,
): boolean {
  const list = byUser[userId] ?? [];
  const next = list.filter((e) => !(e.id === collisionId && e.completedAt === completedAt));
  if (next.length === list.length) return false;

  byUser[userId] = next;

  const stillReferenced = Object.values(byUser).some(
    (entries) => entries.some((e) => e.id === collisionId),
  );
  if (!stillReferenced) {
    delete snapshots[collisionId];
  }

  persist();
  return true;
}

/** Remove every history entry for a user, cleaning up any now-orphaned snapshots. */
export function clearCollisionHistory(userId: string): number {
  const list = byUser[userId] ?? [];
  const removed = list.length;
  if (removed === 0) return 0;

  delete byUser[userId];

  for (const entry of list) {
    const stillReferenced = Object.values(byUser).some(
      (entries) => entries.some((e) => e.id === entry.id),
    );
    if (!stillReferenced) delete snapshots[entry.id];
  }

  persist();
  return removed;
}

export function getCollisionSnapshot(
  userId: string,
  collisionId: string,
): CollisionHistorySnapshot | null {
  const snapshot = snapshots[collisionId];
  if (!snapshot) return null;
  const owned = (byUser[userId] ?? []).some((e) => e.id === collisionId);
  if (!owned) return null;
  return snapshot;
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
  const snapshot = getCollisionSnapshot(userId, collisionId);
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

  recordCollisionHistory(userId, result, snapshot.config.mode, config);
  return result;
}
