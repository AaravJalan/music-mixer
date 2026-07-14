import type {
  CollisionConfig,
  CollisionParticipantResult,
  CollisionResult,
  GhostProfile,
  TasteTimeRange,
  UserProfile,
} from '@music-mixer/shared';
import { weightedCentroid } from '../analytics/vector';
import { averagePairwiseSimilarity } from '../analytics/similarity';
import { estimateListeningHoursFromTopTracks } from '../analytics/listening';
import { findSharedTopArtists } from '../analytics/sharedArtists';
import type { TopTrack } from '../spotify/tracks';
import type { ProfileArtist } from '../spotify/taste';
import { buildUserTasteProfile } from '../spotify/taste';
import { computeMacroAdjustedSimilarity } from '../spotify/genreModel';
import {
  buildMultiCollisionPlaylist,
  resolveGenreHints,
  resolvePlaylistBuildTargets,
} from '../spotify/build';
import { sharedGenresMulti } from '../analytics/genres';
import { ghostGenresToStats, getGhostProfile, ghostToProfileArtists, isGhostUserId } from '../services/ghosts';
import { getCachedTasteProfile, setCachedTasteProfile } from '../lib/cache';

const FEATURE_LABELS: Record<string, string> = {
  danceability: 'Danceability',
  energy: 'Energy',
  acousticness: 'Acousticness',
  valence: 'Valence',
  instrumentalness: 'Instrumentalness',
  liveness: 'Liveness',
};

export interface ParticipantBundle {
  user: UserProfile;
  weight: number;
  vector: import('@music-mixer/shared').AudioFeatureVector;
  genres: import('@music-mixer/shared').GenreStat[];
  tracks: TopTrack[];
  artists: ProfileArtist[];
  isGhost?: boolean;
  timeRange?: TasteTimeRange;
  totalTracks?: number;
}

export interface MultiCollisionInput {
  sessionId: string;
  participants: ParticipantBundle[];
  config: CollisionConfig;
  collisionId?: string;
  randomOffset?: number;
}

function normalizeWeights(weights: number[], count: number): number[] {
  const slice = weights.slice(0, count);
  while (slice.length < count) slice.push(1);
  const total = slice.reduce((s, w) => s + w, 0) || count;
  return slice.map((w) => Math.round((w / total) * 100));
}

function toLegacyResult(
  collisionId: string,
  participants: CollisionParticipantResult[],
  centroidVector: import('@music-mixer/shared').AudioFeatureVector,
  similarityScore: number,
  shared: string[],
  sharedArtists: import('@music-mixer/shared').SharedArtist[],
  weights: number[],
  playlist: CollisionResult['playlist'],
  usedFallbackPlaylist: boolean,
  playlistGenerationMode: import('@music-mixer/shared').PlaylistGenerationMode,
  effectivePlaylistGenerationMode: import('@music-mixer/shared').PlaylistGenerationMode,
  playlistGuardrailApplied: boolean,
): CollisionResult {
  const p0 = participants[0];
  const p1 = participants[1] ?? participants[0];

  return {
    collisionId,
    similarityScore,
    participants,
    centroidVector,
    midpointVector: centroidVector,
    playlist,
    featureLabels: FEATURE_LABELS,
    sharedGenres: shared,
    sharedArtists,
    participantWeights: weights,
    usedEstimatedFeatures: true,
    usedFallbackPlaylist,
    playlistGenerationMode,
    effectivePlaylistGenerationMode,
    playlistGuardrailApplied,
    userAVector: p0.vector,
    userBVector: p1.vector,
    userA: p0.user,
    userB: p1.user,
    userAGenres: p0.genres,
    userBGenres: p1.genres,
    blendWeights: { userA: weights[0] ?? 50, userB: weights[1] ?? 50 },
  };
}

function trackKey(t: TopTrack): string {
  const id = (t.id ?? '').replace(/^spotify:track:/, '').trim();
  if (id && !id.startsWith('ghost-')) return `id:${id}`;
  return `name:${t.name.toLowerCase().trim()}|${t.artist.toLowerCase().trim()}`;
}

/** Common tracks across all participants (matched by Spotify ID, or name+artist for ghosts). */
function commonTracks(participants: ParticipantBundle[]): TopTrack[] {
  if (participants.length < 2) return [];
  const [first, ...rest] = participants;
  const restKeys = rest.map((p) => new Set(p.tracks.map(trackKey)));
  const seen = new Set<string>();
  const common: TopTrack[] = [];
  for (const track of first.tracks) {
    const key = trackKey(track);
    if (seen.has(key)) continue;
    seen.add(key);
    if (restKeys.every((set) => set.has(key))) common.push(track);
  }
  return common;
}

/** Pretty-print each participant's top artists/songs and the common ones to the terminal. */
function logCollisionInsights(
  participants: ParticipantBundle[],
  sharedArtists: import('@music-mixer/shared').SharedArtist[],
): void {
  const TOP_N = 10;
  console.log('\n════════════════════ COLLISION ════════════════════');

  for (const p of participants) {
    console.log(`\n👤 ${p.user.displayName}${p.isGhost ? ' (ghost)' : ''}`);

    const artists = p.artists.slice(0, TOP_N).map((a, i) => `   ${i + 1}. ${a.name}`);
    console.log(`  Top artists:${artists.length ? '\n' + artists.join('\n') : ' (none)'}`);

    const songs = p.tracks.slice(0, TOP_N).map((t, i) => `   ${i + 1}. ${t.name} — ${t.artist}`);
    console.log(`  Top songs:${songs.length ? '\n' + songs.join('\n') : ' (none)'}`);
  }

  console.log('\n🤝 In common:');
  if (sharedArtists.length > 0) {
    console.log(`  Artists: ${sharedArtists.map((a) => a.name).join(', ')}`);
  } else {
    console.log('  Artists: (none)');
  }

  const songs = commonTracks(participants);
  if (songs.length > 0) {
    console.log(`  Songs: ${songs.map((t) => `${t.name} — ${t.artist}`).join(', ')}`);
  } else {
    console.log('  Songs: (none)');
  }
  console.log('════════════════════════════════════════════════════\n');
}

export async function runMultiUserCollision(input: MultiCollisionInput): Promise<CollisionResult> {
  const { sessionId, participants, config, collisionId = '' } = input;

  if (participants.length < 1 || participants.length > 4) {
    throw new Error('Collision requires 1–4 participants');
  }

  const rawWeights = config.participantWeights.length >= participants.length
    ? config.participantWeights
    : participants.map((_, i) => (i === 0 ? config.userAWeight : config.userBWeight));
  const weights = normalizeWeights(rawWeights, participants.length);

  const vectors = participants.map((p) => p.vector);
  const centroidVector = weightedCentroid(vectors, weights);
  const baseSimilarity = averagePairwiseSimilarity(vectors);
  let similarityScore = baseSimilarity;

  if (participants.length >= 2) {
    let multiplierSum = 0;
    let pairCount = 0;

    for (let i = 0; i < participants.length; i++) {
      for (let j = i + 1; j < participants.length; j++) {
        const adjusted = computeMacroAdjustedSimilarity(
          participants[i].genres,
          participants[j].genres,
          1,
          {
            userA: participants[i].user.displayName,
            userB: participants[j].user.displayName,
          },
        );
        multiplierSum += adjusted.multiplier;
        pairCount++;
      }
    }

    if (pairCount > 0) {
      const avgMultiplier = multiplierSum / pairCount;
      similarityScore = Math.min(1, Math.max(0, baseSimilarity * avgMultiplier));
    }
  }

  const allGenreLists = participants.map((p) => p.genres);
  const shared = sharedGenresMulti(participants.map((p) => p.genres.filter((g) => g.percentage > 0)));
  const genreHints = resolveGenreHints(allGenreLists);

  const trackPools = participants.map((p) => p.tracks);
  const artistPools = participants.map((p) => p.artists.map((a) => ({ id: a.id, name: a.name, genres: a.genres })));
  const genrePools = participants.map((p) => p.genres.map((g) => g.genre));

  const sharedArtists = findSharedTopArtists(
    participants.map((p) => p.artists),
    15,
  );

  logCollisionInsights(participants, sharedArtists);

  const playlistTargets = resolvePlaylistBuildTargets(config);
  const playlistResult = await buildMultiCollisionPlaylist({
    sessionId,
    centroidVector,
    trackPools,
    artistPools,
    genrePools,
    genreStatPools: allGenreLists,
    sharedArtists,
    genreHints,
    targetLength: playlistTargets.targetLength,
    playlistLengthMode: playlistTargets.playlistLengthMode,
    targetDurationMs: playlistTargets.targetDurationMs,
    blendWeights: weights,
    compatibilityScore: similarityScore,
    generationMode: config.playlistGenerationMode ?? 'midpoint',
    randomOffset: input.randomOffset,
  });

  const playlist = playlistResult.tracks;
  const usedFallbackPlaylist = playlistResult.usedFallback;

  const participantResults: CollisionParticipantResult[] = participants.map((p, i) => ({
    user: p.user,
    vector: p.vector,
    genres: p.genres.filter((g) => g.percentage > 0),
    weight: weights[i],
    isGhost: p.isGhost,
    timeRange: p.timeRange,
    estimatedListeningHours: estimateListeningHoursFromTopTracks(p.tracks, p.timeRange ?? 'long_term'),
    topArtists: p.artists.map((a) => ({
      id: a.id,
      name: a.name,
      imageUrl: a.imageUrl,
    })),
    totalTracks: p.totalTracks,
  }));

  return toLegacyResult(
    collisionId,
    participantResults,
    centroidVector,
    similarityScore,
    shared,
    sharedArtists,
    weights,
    playlist,
    usedFallbackPlaylist,
    config.playlistGenerationMode ?? 'midpoint',
    playlistResult.effectiveMode,
    playlistResult.guardrailApplied,
  );
}

export function ghostToParticipant(ghost: GhostProfile, weight: number): ParticipantBundle {
  return {
    user: {
      id: ghost.id,
      displayName: ghost.displayName,
      avatarUrl: ghost.avatarUrl,
      platform: 'spotify',
    },
    weight,
    vector: ghost.vector,
    genres: ghostGenresToStats(ghost.genres),
    tracks: ghost.tracks.map((t) => ({
      ...t,
      artistIds: t.artistIds ?? ghost.topArtists?.map((a) => a.id) ?? [],
      popularity: t.popularity ?? 50,
      releaseDate: t.releaseDate ?? '2020-01-01',
    })),
    artists: ghostToProfileArtists(ghost),
    isGhost: true,
    totalTracks: ghost.tracks.length,
  };
}

export async function profileToParticipant(
  sessionId: string,
  user: UserProfile,
  weight: number,
  timeRange: TasteTimeRange = 'long_term',
): Promise<ParticipantBundle> {
  let profile = await getCachedTasteProfile(user.id, timeRange);
  if (!profile) {
    profile = await buildUserTasteProfile(sessionId, timeRange);
    if (profile.tracks.length > 0) {
      await setCachedTasteProfile(user.id, timeRange, profile);
    }
  }

  if (profile.tracks.length === 0) {
    throw new Error('Need top tracks — listen to more music on Spotify first');
  }
  return {
    user,
    weight,
    vector: profile.vector,
    genres: profile.genres,
    tracks: profile.tracks,
    artists: profile.artists,
    timeRange,
    totalTracks: profile.totalTracks,
  };
}

function evenWeights(count: number): number[] {
  const base = Math.floor(100 / count);
  const weights = Array(count).fill(base);
  weights[0] += 100 - weights.reduce((sum, w) => sum + w, 0);
  return weights;
}

export async function runSandboxCollision(
  user: UserProfile,
  sessionId: string,
  ghostIds: string[],
  options?: {
    participantWeights?: number[];
    playlistLength?: number;
    playlistLengthMode?: import('@music-mixer/shared').PlaylistLengthMode;
    playlistDurationMinutes?: number;
    playlistGenerationMode?: import('@music-mixer/shared').PlaylistGenerationMode;
    randomOffset?: number;
    timeRange?: import('@music-mixer/shared').TasteTimeRange;
  },
): Promise<CollisionResult> {
  if (ghostIds.length < 1 || ghostIds.length > 3) {
    throw new Error('Select 1–3 ghost profiles');
  }

  const ghosts = await Promise.all(
    ghostIds.map(async (id) => {
      const ghost = await getGhostProfile(id);
      if (!ghost) throw new Error(`Unknown ghost profile: ${id}`);
      return ghost;
    })
  );

  const count = 1 + ghosts.length;
  const weights = options?.participantWeights?.length === count
    ? options.participantWeights
    : evenWeights(count);

  const normalizedWeights = normalizeWeights(weights, count);

  const realParticipant = await profileToParticipant(
    sessionId,
    user,
    normalizedWeights[0],
    options?.timeRange ?? 'medium_term',
  );
  const ghostParticipants = ghosts.map((g, i) =>
    ghostToParticipant(g, normalizedWeights[i + 1] ?? Math.floor(100 / count)),
  );

  const config: CollisionConfig = {
    participantWeights: normalizedWeights,
    participantTimeRanges: Array(count).fill('long_term') as TasteTimeRange[],
    userAWeight: normalizedWeights[0],
    userBWeight: normalizedWeights[1] ?? 50,
    playlistLength: options?.playlistLength ?? 15,
    playlistLengthMode: options?.playlistLengthMode ?? 'tracks',
    playlistDurationMinutes: options?.playlistDurationMinutes ?? 60,
    playlistGenerationMode: options?.playlistGenerationMode ?? 'equal_share',
    mode: 'sandbox',
  };

  return runMultiUserCollision({
    sessionId,
    participants: [realParticipant, ...ghostParticipants],
    config,
    collisionId: `sandbox-${Date.now().toString(36)}`,
    randomOffset: options?.randomOffset,
  });
}

export interface RegeneratePlaylistContext {
  userASessionId: string;
  userBSessionId: string | null;
  config: CollisionConfig;
  ghostUserBId?: string;
}

/** Rebuild playlist tracks only — keeps similarity analytics from the prior result. */
export async function regenerateCollisionPlaylist(
  sessionId: string,
  existing: CollisionResult,
  context: RegeneratePlaylistContext,
  randomOffset: number,
): Promise<CollisionResult> {
  const { config } = context;
  const weights = existing.participantWeights?.length
    ? existing.participantWeights
    : [config.userAWeight, config.userBWeight];
  const timeRanges = config.participantTimeRanges ?? [];

  const participantResults = existing.participants ?? [];
  const bundles: ParticipantBundle[] = [];

  if (participantResults.length > 0) {
    const bundlePromises = participantResults.map(async (p, i) => {
      if (p.isGhost || isGhostUserId(p.user.id)) {
        const ghost = await getGhostProfile(p.user.id);
        if (!ghost) throw new Error(`Ghost profile not found: ${p.user.id}`);
        return ghostToParticipant(ghost, weights[i] ?? p.weight);
      } else {
        const participantSession = i === 0
          ? context.userASessionId
          : (context.userBSessionId ?? sessionId);
        return profileToParticipant(
          participantSession,
          p.user,
          weights[i] ?? p.weight,
          p.timeRange ?? timeRanges[i] ?? 'long_term',
        );
      }
    });
    bundles.push(...(await Promise.all(bundlePromises)));
  } else {
    if (!existing.userA || !existing.userB) {
      throw new Error('Cannot regenerate playlist without participant data');
    }
    
    const p1Promise = profileToParticipant(
      context.userASessionId,
      existing.userA,
      weights[0] ?? config.userAWeight,
      timeRanges[0] ?? 'long_term',
    );
    
    let p2Promise: Promise<ParticipantBundle>;
    if (context.ghostUserBId) {
      const ghost = getGhostProfile(context.ghostUserBId);
      if (!ghost) throw new Error(`Ghost profile not found: ${context.ghostUserBId}`);
      p2Promise = Promise.resolve(ghostToParticipant(ghost, weights[1] ?? config.userBWeight));
    } else {
      p2Promise = profileToParticipant(
        context.userBSessionId ?? sessionId,
        existing.userB,
        weights[1] ?? config.userBWeight,
        timeRanges[1] ?? 'long_term',
      );
    }
    
    const [p1, p2] = await Promise.all([p1Promise, p2Promise]);
    bundles.push(p1, p2);
  }

  const trackPools = bundles.map((p) => p.tracks);
  const artistPools = bundles.map((p) => p.artists.map((a) => ({ id: a.id, name: a.name, genres: a.genres })));
  const genrePools = bundles.map((p) => p.genres.map((g) => g.genre));
  const allGenreLists = bundles.map((p) => p.genres);
  const shared = sharedGenresMulti(allGenreLists);
  const genreHints = resolveGenreHints(allGenreLists);
  const sharedArtists = findSharedTopArtists(
    bundles.map((p) => p.artists),
    15,
  );

  const centroidVector = existing.centroidVector ?? existing.midpointVector;
  const playlistTargets = resolvePlaylistBuildTargets(config);

  const playlistResult = await buildMultiCollisionPlaylist({
    sessionId,
    centroidVector,
    trackPools,
    artistPools,
    genrePools,
    genreStatPools: allGenreLists,
    sharedArtists,
    genreHints,
    targetLength: playlistTargets.targetLength,
    playlistLengthMode: playlistTargets.playlistLengthMode,
    targetDurationMs: playlistTargets.targetDurationMs,
    blendWeights: weights,
    compatibilityScore: existing.similarityScore,
    generationMode: config.playlistGenerationMode ?? existing.playlistGenerationMode ?? 'midpoint',
    randomOffset,
  });

  return {
    ...existing,
    playlist: playlistResult.tracks,
    usedFallbackPlaylist: playlistResult.usedFallback,
    effectivePlaylistGenerationMode: playlistResult.effectiveMode,
    playlistGuardrailApplied: playlistResult.guardrailApplied,
    exportedPlaylistUrl: undefined,
  };
}

/** Legacy 2-user collision entry point used by link/friend/solo routes. */
export interface CollisionEngineOptions {
  sessionIdA: string;
  sessionIdB: string;
  userA: UserProfile;
  userB: UserProfile;
  config: CollisionConfig;
  soloMode?: boolean;
}

export async function runCollisionEngine(opts: CollisionEngineOptions): Promise<CollisionResult> {
  const { sessionIdA, sessionIdB, userA, userB, config, soloMode } = opts;
  const timeRanges = config.participantTimeRanges ?? [];
  const timeRangeA = timeRanges[0] ?? (soloMode ? 'long_term' : 'long_term');
  const timeRangeB = timeRanges[1] ?? (soloMode ? 'short_term' : 'long_term');

  let participantA: ParticipantBundle;
  let participantB: ParticipantBundle;

  if (sessionIdA === sessionIdB && timeRangeA === timeRangeB) {
    participantA = await profileToParticipant(sessionIdA, userA, config.userAWeight, timeRangeA);
    participantB = {
      ...participantA,
      weight: config.userBWeight,
      user: userB,
    };
  } else {
    const [pA, pB] = await Promise.all([
      profileToParticipant(sessionIdA, userA, config.userAWeight, timeRangeA),
      profileToParticipant(sessionIdB, userB, config.userBWeight, timeRangeB)
    ]);
    participantA = pA;
    participantB = pB;
  }

  if (participantB.tracks.length === 0 || (soloMode && participantB.tracks.length < 3)) {
    if (soloMode) {
      participantB = await profileToParticipant(sessionIdB, userB, config.userBWeight, 'medium_term');
    } else {
      throw new Error('Both users need top tracks — listen to more music on Spotify first');
    }
  }

  return runMultiUserCollision({
    sessionId: sessionIdA,
    participants: [participantA, participantB],
    config,
  });
}
