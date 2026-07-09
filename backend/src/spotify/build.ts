import type {
  AudioFeatureVector,
  GenreStat,
  PlaylistGenerationMode,
  PlaylistLengthMode,
  RecommendationTrack,
} from '@music-mixer/shared';
import { AUDIO_FEATURE_KEYS, PLAYLIST_MATCH_THRESHOLD, SPOTIFY_SEARCH_LIMIT } from '@music-mixer/shared';
import type { AudioFeatureDimension } from '@music-mixer/shared';
import { resolveAnchorGenre } from './genreModel';
import { applyLinguisticVetoToPools } from './veto';
import { normalizeArtistName } from '../math/sharedArtists';
import { spotifyFetch, SpotifyApiError } from './client';
import type { TopTrack } from './tracks';

/**
 * Deterministic Data Sanitization: implemented a deterministic deduplication pipeline
 * using canonical string normalization to ensure a 100% unique track distribution in
 * generated playlists, eliminating version-based API redundancy.
 */

interface SpotifySearchResponse {
  tracks: { items: SpotifyTrackItem[] };
}

interface SpotifyTrackItem {
  id: string;
  name: string;
  duration_ms?: number;
  artists: { id?: string; name: string }[];
  album: { images: { url: string }[] };
  preview_url: string | null;
}

export interface PlaylistBuildInput {
  sessionId: string;
  centroidVector: AudioFeatureVector;
  trackPools: TopTrack[][];
  artistPools: { id: string; name: string; genres?: string[] }[][];
  genrePools: string[][];
  genreStatPools: GenreStat[][];
  sharedArtists: { id: string; name: string }[];
  genreHints: string[];
  targetLength: number;
  blendWeights: number[];
  compatibilityScore: number;
  generationMode: PlaylistGenerationMode;
  playlistLengthMode?: PlaylistLengthMode;
  targetDurationMs?: number;
  /** Spotify search offset for discovery variety on regenerate. */
  randomOffset?: number;
}

export interface PlaylistBuildResult {
  tracks: RecommendationTrack[];
  usedFallback: boolean;
  effectiveMode: PlaylistGenerationMode;
  guardrailApplied: boolean;
}

function toRecommendationTrack(t: SpotifyTrackItem): RecommendationTrack {
  return {
    id: t.id,
    name: t.name,
    artist: t.artists.map((a) => a.name).join(', '),
    albumArtUrl: t.album.images[0]?.url ?? '',
    previewUrl: t.preview_url,
    durationMs: t.duration_ms,
    artistIds: t.artists.map((a) => a.id).filter((id): id is string => !!id),
  };
}

export const DEFAULT_TRACK_DURATION_MS = 210_000;
const MAX_GENERATION_TRACKS = 50;

/** Minimum genre affinity (0–1) for high-affinity intersection. */
export const MIN_AFFINITY_THRESHOLD = 0.20;

/** Regional/linguistic genres — strict intersection policy (>20% both users). */
export const REGIONAL_GENRES = [
  'bollywood',
  'desi',
  'filmi',
  'punjabi',
  'indian',
  'k-pop',
  'k-r&b',
  'k-hip hop',
  'mandopop',
  'cantopop',
  'c-pop',
  'latin',
  'reggaeton',
  'salsa',
  'urbano',
  'french pop',
] as const;

const GLOBAL_SUPERSTAR_ARTISTS = new Set([
  'coldplay',
  'ed sheeran',
  'taylor swift',
  'drake',
  'the weeknd',
  'ariana grande',
  'beyoncé',
  'beyonce',
  'justin bieber',
  'rihanna',
  'eminem',
  'post malone',
  'bad bunny',
  'billie eilish',
  'dua lipa',
  'harry styles',
  'adele',
  'bruno mars',
  'kanye west',
  'kendrick lamar',
]);

function genreAffinity(stat: GenreStat): number {
  return stat.percentage / 100;
}

/**
 * Genre dampening for search intent.
 *
 * Spotify "top genres" are spiky: one dominant genre can exceed 10% and hijack
 * centroid-style query selection. We reduce the gravitational pull of any genre
 * above 10% using a logarithmic penalty, then re-normalize to 100.
 */
function dampenGenreStatsForSearch(pool: GenreStat[]): GenreStat[] {
  const dampened = (pool ?? []).map((g) => {
    const pct = g.percentage ?? 0;
    if (pct <= 10) return { ...g };
    // factor in (0,1]: grows slowly as pct rises, so dominant genres are dampened.
    const factor = 1 / (1 + Math.log(pct / 10));
    return { ...g, percentage: pct * factor };
  });
  const total = dampened.reduce((sum, g) => sum + (g.percentage ?? 0), 0);
  if (total <= 0) return dampened;
  return dampened.map((g) => ({ ...g, percentage: Math.round(((g.percentage ?? 0) / total) * 1000) / 10 }));
}

function normalizeGenreKey(g: string): string {
  return resolveAnchorGenre(String(g ?? '').trim().toLowerCase());
}

/**
 * Intersection-first: shared genres across all participants after dampening.
 * Regional genres are included only if they are shared-safe across everyone.
 */
function sharedGenresForMidpointQuery(
  genreStatPools: GenreStat[][],
  sharedRegionalTokens: Set<string>,
): string[] {
  if (genreStatPools.length === 0) return [];

  const pools = genreStatPools.map((p) =>
    dampenGenreStatsForSearch(p)
      .filter((x) => x?.genre && String(x.genre).trim().toLowerCase() !== 'default')
      .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0))
      .slice(0, 12),
  );

  const sets = pools.map((p) => new Set(p.map((x) => normalizeGenreKey(x.genre))));
  const [first, ...rest] = sets;
  const shared = [...first].filter((g) => rest.every((s) => s.has(g)));

  // Prefer non-regional shared genres first.
  const nonRegional = shared.filter((g) => !isRegionalGenre(g));
  if (nonRegional.length > 0) return nonRegional;

  // If only regional overlap exists, allow only shared-safe regional tokens.
  return shared.filter((g) => {
    const tokens = regionalTokens(g);
    if (tokens.length === 0) return false;
    return tokens.every((t) => sharedRegionalTokens.has(t));
  });
}

function topNonRegionalGenresForQuery(genreStatPools: GenreStat[][], perUser = 3): string[] {
  const out: string[] = [];
  for (const pool of genreStatPools) {
    const damp = dampenGenreStatsForSearch(pool)
      .filter((g) => g?.genre && String(g.genre).trim().toLowerCase() !== 'default')
      .sort((a, b) => (b.percentage ?? 0) - (a.percentage ?? 0));
    for (const stat of damp) {
      const key = normalizeGenreKey(stat.genre);
      if (!key || key === 'default') continue;
      if (isRegionalGenre(key)) continue;
      out.push(key);
      if (out.length >= perUser * Math.max(1, genreStatPools.length)) return out;
    }
  }
  return out;
}

function isSharedSafeRegionalGenre(
  genre: string,
  sharedRegionalTokens: Set<string>,
): boolean {
  if (!isRegionalGenre(genre)) return true;
  const tokens = regionalTokens(genre);
  if (tokens.length === 0) return false;
  return tokens.every((t) => sharedRegionalTokens.has(t));
}

function buildMultiGenreQuery(genres: string[]): string {
  const cleaned = genres
    .map((g) => String(g).trim())
    .filter((g) => g && g.toLowerCase() !== 'default')
    .slice(0, 2);
  if (cleaned.length === 0) return 'genre:"pop"';
  // Spotify search syntax: multiple `genre:"..."` tokens in the query.
  return cleaned.map((g) => `genre:"${g}"`).join(' ');
}

function uniqueOrdered<T>(arr: T[]): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const x of arr) {
    if (seen.has(x)) continue;
    seen.add(x);
    out.push(x);
  }
  return out;
}

function isRegionalGenre(genre: string): boolean {
  const key = genre.toLowerCase().trim();
  return REGIONAL_GENRES.some((regional) => key.includes(regional) || regional.includes(key));
}

function isFullyRegionalPool(pool: GenreStat[]): boolean {
  if (pool.length === 0) return false;
  return pool.every((g) => isRegionalGenre(g.genre));
}

function isFullyGlobalPool(pool: GenreStat[]): boolean {
  if (pool.length === 0) return false;
  return pool.every((g) => !isRegionalGenre(g.genre));
}

/** The regional-language tokens (e.g. 'bollywood', 'punjabi') a genre string maps to. */
function regionalTokens(genre: string): string[] {
  const key = genre.toLowerCase().trim();
  return REGIONAL_GENRES.filter((r) => key.includes(r) || r.includes(key));
}

/**
 * Per-song Cultural Guardrail.
 *
 * Strict ban: if a track's metadata (its artist's genres) carries a regional-language tag
 * — Bollywood, Punjabi, Filmi, K-pop, Latin, etc. — but at least one other participant has
 * ZERO overlap with that regional genre in their own library, the track is excluded from the
 * shared mix. Regional songs survive only when every participant shares that regional taste.
 */
interface CulturalGuardrail {
  isBanned(track: RecommendationTrack): boolean;
}

function buildCulturalGuardrail(
  artistPools: { id: string; name: string; genres?: string[] }[][],
  genreStatPools: GenreStat[][],
): CulturalGuardrail {
  // Map every known artist (by id and normalized name) to its genres for song classification.
  const genresById = new Map<string, string[]>();
  const genresByName = new Map<string, string[]>();
  for (const pool of artistPools) {
    for (const artist of pool ?? []) {
      const genres = artist.genres ?? [];
      if (genres.length === 0) continue;
      if (artist.id) genresById.set(artist.id, genres);
      if (artist.name) genresByName.set(normalizeArtistName(artist.name), genres);
    }
  }

  // Regional tokens each participant actually listens to.
  const perParticipantTokens = genreStatPools.map((pool) => {
    const tokens = new Set<string>();
    for (const stat of pool ?? []) {
      if (!stat?.genre) continue;
      for (const token of regionalTokens(stat.genre)) tokens.add(token);
    }
    return tokens;
  });

  // A regional token is "shared-safe" only if EVERY participant has it.
  const sharedRegionalTokens = new Set<string>();
  if (perParticipantTokens.length > 0) {
    for (const token of perParticipantTokens[0]) {
      if (perParticipantTokens.every((set) => set.has(token))) {
        sharedRegionalTokens.add(token);
      }
    }
  }

  const trackGenres = (track: RecommendationTrack): string[] => {
    for (const id of track.artistIds ?? []) {
      const g = genresById.get(id);
      if (g) return g;
    }
    for (const name of track.artist.split(',')) {
      const g = genresByName.get(normalizeArtistName(name));
      if (g) return g;
    }
    return [];
  };

  const trackRegionalTokens = (track: RecommendationTrack): Set<string> => {
    const genres = trackGenres(track);
    const tokens = new Set<string>();
    for (const genre of genres) {
      for (const token of regionalTokens(genre)) tokens.add(token);
    }
    return tokens;
  };

  return {
    // Exposed for internal filtering where we want to *prefer* non-regional even when
    // we can't hard-ban due to missing metadata.
    isBanned(track: RecommendationTrack): boolean {
      const genres = trackGenres(track);
      if (genres.length === 0) return false; // unknown genre → best-effort allow
      const tokens = new Set<string>();
      for (const genre of genres) {
        for (const token of regionalTokens(genre)) tokens.add(token);
      }
      if (tokens.size === 0) return false; // not a regional track
      // Ban if any regional token isn't shared by every participant.
      for (const token of tokens) {
        if (!sharedRegionalTokens.has(token)) return true;
      }
      return false;
    },
    // @ts-expect-error internal helper attached dynamically (kept out of interface to avoid rippling types)
    trackRegionalTokens,
  };
}

/**
 * Cultural Safety Layer — regional genres only when in high-affinity intersection;
 * global genres use standard sourcing. Handles 100% regional vs 100% global edge case.
 *
 * When the linguistic veto has already been bypassed (e.g., shared regional artists,
 * high blend weight), regional genres will exist in the pools and should NOT be
 * stripped again here.
 */
function resolveSearchableGenres(genreStatPools: GenreStat[][]): string[] {
  const highAffinityShared = identifyHighAffinitySharedGenres(genreStatPools);
  const regionalAllowed = highAffinityShared.filter(isRegionalGenre);
  const globalFromIntersection = highAffinityShared.filter((g) => !isRegionalGenre(g));

  if (regionalAllowed.length + globalFromIntersection.length > 0) {
    return [...regionalAllowed, ...globalFromIntersection];
  }

  // If pools contain regional genres (survived the veto/cultural override),
  // include them in the searchable set instead of blocking them.
  const allPoolGenres = collectTopPerformingGenres(genreStatPools);
  const hasRegionalInPools = allPoolGenres.some(isRegionalGenre);

  if (hasRegionalInPools) {
    // Regional genres survived the veto — include ALL top genres (regional + global)
    return allPoolGenres;
  }

  const regionalDominant = genreStatPools.some(isFullyRegionalPool);
  const globalDominant = genreStatPools.some(isFullyGlobalPool);
  if (regionalDominant && globalDominant) {
    // Deadlock: one pool is 100% regional, another 100% global, and regional
    // was NOT allowed through. Fall back to global dominant.
    const globalPool = genreStatPools.find((pool) => pool[0] && !isRegionalGenre(pool[0].genre));
    const dominant = globalPool?.[0]?.genre ?? 'pop';
    return [resolveAnchorGenre(dominant)];
  }

  return allPoolGenres.filter((g) => !isRegionalGenre(g));
}

function buildGenreQuery(genre: string): string {
  return `genre:"${resolveAnchorGenre(genre)}"`;
}

/** Shared genres where every participant's affinity meets the high-affinity threshold. */
function identifyHighAffinitySharedGenres(genreStatPools: GenreStat[][]): string[] {
  if (genreStatPools.length < 2) return [];

  const [first, ...rest] = genreStatPools;
  const candidates = first
    .filter((g) => genreAffinity(g) >= MIN_AFFINITY_THRESHOLD)
    .map((g) => g.genre);

  const shared = candidates.filter((genre) =>
    rest.every((pool) => {
      const stat = pool.find((g) => g.genre === genre);
      return stat != null && genreAffinity(stat) >= MIN_AFFINITY_THRESHOLD;
    }),
  );

  const affinityScore = (genre: string) =>
    genreStatPools.reduce((sum, pool) => {
      const stat = pool.find((g) => g.genre === genre);
      return sum + (stat ? genreAffinity(stat) : 0);
    }, 0);

  return shared
    .sort((a, b) => affinityScore(b) - affinityScore(a))
    .slice(0, 5)
    .map((g) => resolveAnchorGenre(g));
}

/** Top-performing genres per user for OR fallback when no high-affinity overlap exists. */
function collectTopPerformingGenres(genreStatPools: GenreStat[][], perUser = 3): string[] {
  const genres = new Set<string>();
  for (const pool of genreStatPools) {
    for (const stat of pool.slice(0, perUser)) {
      genres.add(resolveAnchorGenre(stat.genre));
    }
  }
  return [...genres].slice(0, 8);
}

/**
 * Deterministic identity index for trusted artists. Matching is keyed on Spotify artist
 * IDs first (unique entity URIs); normalized names are only a fallback for sources that
 * lack IDs (e.g. embedded ghost tracks).
 */
interface TrustedArtists {
  ids: Set<string>;
  names: Set<string>;
}

function buildTrustedArtists(
  artistPools: { id: string; name: string }[][],
  sharedArtists: { id: string; name: string }[],
): TrustedArtists {
  const ids = new Set<string>();
  const names = new Set<string>();
  const add = (artist: { id: string; name: string }) => {
    if (artist.id) ids.add(artist.id);
    if (artist.name) names.add(normalizeArtistName(artist.name));
  };
  for (const pool of artistPools) pool.forEach(add);
  sharedArtists.forEach(add);
  return { ids, names };
}

/**
 * ID-first trust check. When a track carries artist IDs we match exclusively on ID, so a
 * different artist who happens to share a name is never treated as trusted. Name matching
 * is used only when no IDs are available.
 */
function isArtistTrusted(
  artistId: string | undefined,
  artistName: string,
  trusted: TrustedArtists,
): boolean {
  if (artistId) return trusted.ids.has(artistId);
  return trusted.names.has(normalizeArtistName(artistName));
}

function isGlobalSuperstarArtist(name: string): boolean {
  return GLOBAL_SUPERSTAR_ARTISTS.has(name.toLowerCase().trim());
}

/** Drop one-off collabs where a global superstar is the primary artist but not core to either user. */
function shouldDiscardSuperstarCollab(
  track: RecommendationTrack,
  trusted: TrustedArtists,
): boolean {
  const primaryName = track.artist.split(',')[0] ?? track.artist;
  if (!isGlobalSuperstarArtist(primaryName)) return false;
  return !isArtistTrusted(track.artistIds?.[0], primaryName, trusted);
}

/** Higher score = stronger match to high-affinity participant artists (ID-first). */
function scoreTrackAffinity(
  track: RecommendationTrack,
  trusted: TrustedArtists,
): number {
  let score = 0;
  const ids = track.artistIds ?? [];
  if (ids.length > 0) {
    for (const id of ids) if (trusted.ids.has(id)) score += 2;
    return score;
  }
  for (const name of track.artist.split(',')) {
    if (trusted.names.has(normalizeArtistName(name))) score += 2;
  }
  return score;
}

function refineDiscoveredTracks(
  tracks: RecommendationTrack[],
  trusted: TrustedArtists,
): RecommendationTrack[] {
  return tracks
    .filter((track) => !shouldDiscardSuperstarCollab(track, trusted))
    .sort((a, b) => scoreTrackAffinity(b, trusted) - scoreTrackAffinity(a, trusted));
}

/**
 * Apply linguistic veto to genre pools, but bypass the veto when:
 * - Shared artists exist in a regional bucket (cultural override), OR
 * - A participant's blend weight is > 80% (their genres should dominate)
 */
function applyLinguisticVetoToGenreStats(
  genreStatPools: GenreStat[][],
  sharedArtists?: { id: string; name: string }[],
  blendWeights?: number[],
): GenreStat[][] {
  // If we have shared artists in regional genres, skip the veto entirely.
  // This is the "Cultural Override" — if both users share Bollywood artists,
  // Bollywood songs should appear in the playlist.
  if (sharedArtists && sharedArtists.length > 0) {
    const hasSharedRegional = genreStatPools.some((pool) =>
      pool.some((g) => isRegionalGenre(g.genre)),
    );
    if (hasSharedRegional) {
      console.log('[cultural-override] Shared regional artists detected — skipping linguistic veto');
      return genreStatPools;
    }
  }

  const genrePools = genreStatPools.map((pool) => pool.map((g) => g.genre));
  const vetoed = applyLinguisticVetoToPools(genrePools);
  return genreStatPools.map((pool, index) => {
    // If this participant has > 80% blend weight, don't veto their genres
    if (blendWeights && blendWeights[index] > 80) {
      console.log(`[cultural-override] Participant ${index} has ${blendWeights[index]}% weight (> 80%) — preserving their genres`);
      return pool;
    }
    const allowed = new Set(vetoed[index]);
    const filtered = pool.filter((g) => allowed.has(g.genre));
    return filtered.length > 0 ? filtered : pool;
  });
}

export function resolveGenreHints(genreStatPools: GenreStat[][]): string[] {
  const searchable = resolveSearchableGenres(genreStatPools);
  if (searchable.length > 0) return searchable;
  return collectTopPerformingGenres(genreStatPools);
}

export function resolvePlaylistBuildTargets(config: {
  playlistLength: number;
  playlistLengthMode?: PlaylistLengthMode;
  playlistDurationMinutes?: number;
}): {
  playlistLengthMode: PlaylistLengthMode;
  targetLength: number;
  targetDurationMs?: number;
} {
  const mode = config.playlistLengthMode ?? 'tracks';
  if (mode === 'duration') {
    const targetDurationMs = (config.playlistDurationMinutes ?? 60) * 60 * 1000;
    const targetLength = Math.min(
      MAX_GENERATION_TRACKS,
      Math.ceil(targetDurationMs / 180_000) + 12,
    );
    return { playlistLengthMode: 'duration', targetLength, targetDurationMs };
  }
  return {
    playlistLengthMode: 'tracks',
    targetLength: config.playlistLength,
    targetDurationMs: undefined,
  };
}

/**
 * Fill toward the target runtime, keeping whichever boundary lands closest to it.
 * When the next track would overshoot, we include it only if the overshoot is smaller
 * than the undershoot from stopping — so the playlist hugs the requested time instead
 * of always finishing short.
 */
function trimPlaylistToDuration(
  tracks: RecommendationTrack[],
  targetMs: number,
): RecommendationTrack[] {
  const result: RecommendationTrack[] = [];
  let totalMs = 0;

  for (const track of tracks) {
    const durationMs = track.durationMs ?? DEFAULT_TRACK_DURATION_MS;
    if (result.length > 0 && totalMs + durationMs > targetMs) {
      const overshoot = totalMs + durationMs - targetMs;
      const undershoot = targetMs - totalMs;
      if (overshoot < undershoot) {
        result.push(track);
        totalMs += durationMs;
      }
      break;
    }
    totalMs += durationMs;
    result.push(track);
  }

  return result;
}

/** Strips remix/version suffixes from a track title for canonical matching. */
function normalizeTrackTitle(name: string): string {
  let title = name.toLowerCase().trim();
  // Parenthetical suffixes: (Remix), (Elyanna Version), (feat. X), etc.
  title = title.replace(/\s*\([^)]*\)/g, '');
  // Hyphen suffixes: " - TWICE Version", " - Single", " - Remix"
  title = title.replace(/\s*-\s*.+$/i, '');
  return title.replace(/\s+/g, ' ').replace(/\s*-\s*$/g, '').trim();
}

/** Strips remix/version suffixes and pairs title with primary artist for dedup. */
export function getCanonicalKey(track: Pick<RecommendationTrack, 'name' | 'artist'>): string {
  const primaryArtist = (track.artist.split(',')[0] ?? track.artist).trim().toLowerCase();
  return `${normalizeTrackTitle(track.name)}_${primaryArtist}`;
}

interface PlaylistSeenState {
  ids: Set<string>;
  /** Canonical keys — version/remix variants collapse to one entry. */
  seenTracks: Set<string>;
  /** Per-song cultural ban; set on the main pipeline state. */
  culturalGuardrail?: CulturalGuardrail;
}

function isUniqueCandidate(track: RecommendationTrack, state: PlaylistSeenState): boolean {
  if (state.ids.has(track.id)) return false;
  return !state.seenTracks.has(getCanonicalKey(track));
}

function registerTrack(track: RecommendationTrack, state: PlaylistSeenState): void {
  state.ids.add(track.id);
  state.seenTracks.add(getCanonicalKey(track));
}

function dedupeOverlapTracks(tracks: RecommendationTrack[]): RecommendationTrack[] {
  const seen = new Set<string>();
  const result: RecommendationTrack[] = [];
  for (const track of tracks) {
    const key = getCanonicalKey(track);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(track);
  }
  return result;
}

/** Final pass — collapses any version variants that slipped through earlier stages. */
function sanitizePlaylistUniqueness(tracks: RecommendationTrack[]): RecommendationTrack[] {
  const state: PlaylistSeenState = { ids: new Set(), seenTracks: new Set() };
  const unique: RecommendationTrack[] = [];
  for (const track of tracks) {
    if (!isUniqueCandidate(track, state)) continue;
    registerTrack(track, state);
    unique.push(track);
  }
  return unique;
}

function resolveEffectiveMode(
  mode: PlaylistGenerationMode,
  compatibilityScore: number,
): { effectiveMode: PlaylistGenerationMode; guardrailApplied: boolean } {
  // Common-songs-only is intentional at any match score — never override it.
  if (mode === 'common_only') {
    return { effectiveMode: 'common_only', guardrailApplied: false };
  }
  if (compatibilityScore < PLAYLIST_MATCH_THRESHOLD) {
    return { effectiveMode: 'equal_share', guardrailApplied: mode !== 'equal_share' };
  }
  return { effectiveMode: mode, guardrailApplied: false };
}

function getTopDimensions(vector: AudioFeatureVector, count = 2): AudioFeatureDimension[] {
  return [...AUDIO_FEATURE_KEYS]
    .map((key) => ({ key, value: vector[key] }))
    .sort((a, b) => b.value - a.value)
    .slice(0, count)
    .map((d) => d.key);
}

function genresForDominantDimensions(dims: AudioFeatureDimension[]): string[] {
  const hints = new Set<string>();
  for (const dim of dims) {
    switch (dim) {
      case 'energy':
      case 'danceability':
        hints.add('electronic');
        hints.add('pop');
        break;
      case 'acousticness':
        hints.add('acoustic');
        hints.add('folk');
        break;
      case 'instrumentalness':
        hints.add('classical');
        break;
      case 'valence':
        hints.add('pop');
        break;
      case 'liveness':
        hints.add('rock');
        break;
      default:
        break;
    }
  }
  return [...hints];
}

import { normalizeSpotifyId } from '@music-mixer/shared';

/**
 * Strict Set-based intersection of top tracks across pools.
 * Matches by Spotify ID first (normalized), then falls back to canonical key
 * (title + artist) for ghost profiles that lack real Spotify IDs.
 */
function overlappingTracksMulti(pools: TopTrack[][]): TopTrack[] {
  if (pools.length < 2) return [];

  // Build index sets for each pool: both normalized IDs and canonical keys
  const poolIdSets = pools.map((pool) => {
    const ids = new Set<string>();
    const keys = new Set<string>();
    for (const track of pool) {
      ids.add(normalizeSpotifyId(track.id));
      keys.add(getCanonicalKey(track));
    }
    return { ids, keys };
  });

  // Use pool[0] as the base, intersect against ALL other pools
  const result: TopTrack[] = [];
  const seen = new Set<string>();
  for (const track of pools[0]) {
    const nid = normalizeSpotifyId(track.id);
    const ckey = getCanonicalKey(track);
    const dedup = nid.startsWith('ghost-') ? ckey : nid;
    if (seen.has(dedup)) continue;
    seen.add(dedup);
    const inAll = poolIdSets.slice(1).every(
      ({ ids, keys }) => ids.has(nid) || keys.has(ckey),
    );
    if (inAll) result.push(track);
  }
  return result;
}

function buildSearchGenres(midpointVector: AudioFeatureVector, genreHints: string[]): string[] {
  const dominant = genresForDominantDimensions(getTopDimensions(midpointVector));
  const fromHints = genreHints.map((g) => resolveAnchorGenre(g));
  
  // Surgical Searching: Disable generic genre-tag appending if regional genres are present
  const hasRegional = fromHints.some(isRegionalGenre);
  if (hasRegional) {
    return [...new Set(fromHints)].slice(0, 5);
  }
  
  return [...new Set([...fromHints, ...dominant, 'pop'])].slice(0, 5);
}

/** Catalog depth sampling window for Spotify search offset (0–50). */
const DISCOVERY_OFFSET_MAX = 50;

/**
 * Discovery circuit breaker.
 *
 * Safe-Discovery caps `/search` calls per playlist build, but 403/429 still trip a global
 * cooldown so collisions finish from local pools instead of hammering a blocked endpoint.
 */
const DISCOVERY_BREAKER_COOLDOWN_MS = 60_000;
/** Cap how long a single Retry-After can suspend discovery (avoid pinning for hours). */
const MAX_BREAKER_COOLDOWN_MS = 15 * 60_000;
let discoveryDisabledUntil = 0;

function discoveryAvailable(): boolean {
  return Date.now() >= discoveryDisabledUntil;
}

/** Trip the breaker on a 403 or 429; returns true if the error was a discovery block. */
function tripDiscoveryBreakerIfBlocked(err: unknown): boolean {
  if (!(err instanceof SpotifyApiError)) return false;
  if (err.status !== 403 && err.status !== 429) return false;

  const wasAvailable = discoveryAvailable();
  const cooldownMs =
    err.status === 429 && err.retryAfterSeconds
      ? Math.min(err.retryAfterSeconds * 1000, MAX_BREAKER_COOLDOWN_MS)
      : DISCOVERY_BREAKER_COOLDOWN_MS;
  discoveryDisabledUntil = Math.max(discoveryDisabledUntil, Date.now() + cooldownMs);

  if (wasAvailable) {
    const reason =
      err.status === 429
        ? `rate limited (Retry-After ${err.retryAfterSeconds ?? '?'}s)`
        : 'Development Mode 403';
    console.warn(
      `[discovery] Spotify ${reason} — pausing /search + artist top-tracks for ` +
      `${Math.round(cooldownMs / 1000)}s and building from local pools.`,
    );
  }
  return true;
}

function discoverySessionSeed(randomOffset?: number): number {
  if (randomOffset == null) return Math.floor(Math.random() * (DISCOVERY_OFFSET_MAX + 1));
  return randomOffset % (DISCOVERY_OFFSET_MAX + 1);
}

/** Per-query catalog depth offset in 0–50. */
function perQueryDiscoveryOffset(sessionSeed: number, queryIndex: number): number {
  return (sessionSeed + queryIndex * 7) % (DISCOVERY_OFFSET_MAX + 1);
}

function topTrackToRecommendation(track: TopTrack): RecommendationTrack {
  return {
    id: track.id,
    name: track.name,
    artist: track.artist,
    albumArtUrl: track.albumArtUrl,
    previewUrl: null,
    durationMs: track.durationMs,
    artistIds: track.artistIds,
  };
}

/** Minimum viable playlist size — below this we relax filters rather than ship a thin list. */
const MIN_VIABLE_PLAYLIST = 15;

/** Strip null / undefined / empty / "default" genres from every participant's stat pool. */
function stripDefaultGenres(genreStatPools: GenreStat[][]): GenreStat[][] {
  return genreStatPools.map((pool) =>
    (pool ?? []).filter((stat) => {
      if (!stat || stat.genre == null) return false;
      const g = String(stat.genre).trim().toLowerCase();
      return g !== '' && g !== 'default';
    }),
  );
}

/**
 * Emergency baseline: when the whole pipeline starves to 0 tracks, seed directly from the
 * participants' own top tracks so the user never receives an empty playlist.
 */
function emergencyBaselineTracks(trackPools: TopTrack[][]): RecommendationTrack[] {
  const primary = (trackPools[0] ?? []).slice(0, 8);
  const secondary = (trackPools[1] ?? []).slice(0, 7);
  const rest = trackPools.slice(2).flatMap((pool) => (pool ?? []).slice(0, 4));
  return sanitizePlaylistUniqueness(
    [...primary, ...secondary, ...rest].map(topTrackToRecommendation),
  );
}

function emergencyBaselineTracksForTarget(
  trackPools: TopTrack[][],
  limit: number,
  seed: number,
): RecommendationTrack[] {
  const results: RecommendationTrack[] = [];
  const state: PlaylistSeenState = { ids: new Set(), seenTracks: new Set() };
  const rotatedPools = trackPools.map((p, i) => rotate(p ?? [], seed + i * 11));

  let madeProgress = true;
  while (results.length < limit && madeProgress) {
    madeProgress = false;
    for (const pool of rotatedPools) {
      for (const t of pool) {
        if (results.length >= limit) break;
        const rec = topTrackToRecommendation(t);
        if (!isUniqueCandidate(rec, state)) continue;
        registerTrack(rec, state);
        results.push(rec);
        madeProgress = true;
        break;
      }
    }
  }

  return results;
}

/**
 * Discovery response cache + in-flight de-duplication.
 *
 * A single collision re-issues the same genre queries and artist top-track lookups several
 * times over (Stage 3, Stage 4, backfill, cultural-relax). Without memoization each repeat
 * is a fresh Spotify call — that call volume is exactly what triggered the rate-limit ban.
 *
 * We cache successful responses for a short TTL (well within a collision's lifetime but
 * short enough that fresh runs still see new catalog data) and collapse concurrent
 * identical requests into a single in-flight promise.
 */
const DISCOVERY_CACHE_TTL_MS = 10 * 60_000;
const DISCOVERY_CACHE_MAX_ENTRIES = 500;

interface DiscoveryCacheEntry {
  value: RecommendationTrack[];
  expiresAt: number;
}
const discoveryCache = new Map<string, DiscoveryCacheEntry>();
const discoveryInFlight = new Map<string, Promise<RecommendationTrack[]>>();

function discoveryCacheGet(key: string): RecommendationTrack[] | undefined {
  const hit = discoveryCache.get(key);
  if (!hit) return undefined;
  if (Date.now() >= hit.expiresAt) {
    discoveryCache.delete(key);
    return undefined;
  }
  return hit.value;
}

function discoveryCacheSet(key: string, value: RecommendationTrack[]): void {
  if (discoveryCache.size >= DISCOVERY_CACHE_MAX_ENTRIES) {
    const oldest = discoveryCache.keys().next().value;
    if (oldest !== undefined) discoveryCache.delete(oldest);
  }
  discoveryCache.set(key, { value, expiresAt: Date.now() + DISCOVERY_CACHE_TTL_MS });
}

/**
 * Run a discovery fetch through the cache + in-flight dedupe. Cache misses are populated
 * only on success; failures propagate to the caller (which decides whether to trip the
 * breaker) and are never cached.
 */
async function memoizedDiscovery(
  key: string,
  fetcher: () => Promise<RecommendationTrack[]>,
): Promise<RecommendationTrack[]> {
  const cached = discoveryCacheGet(key);
  if (cached) return cached;

  const pending = discoveryInFlight.get(key);
  if (pending) return pending;

  const promise = (async () => {
    const value = await fetcher();
    discoveryCacheSet(key, value);
    return value;
  })();
  discoveryInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    discoveryInFlight.delete(key);
  }
}

async function searchTracks(
  sessionId: string,
  query: string,
  limit: number,
  offset = 0,
): Promise<RecommendationTrack[]> {
  if (!discoveryAvailable()) return [];
  // Spotify allows up to 50 results per search call; Safe-Discovery uses few calls,
  // so we maximize per-call yield to reduce 429 risk.
  const capped = Math.min(limit, 50);
  const clampedOffset = Math.min(Math.max(0, offset), DISCOVERY_OFFSET_MAX);
  const cacheKey = `search:${query}:${capped}:${clampedOffset}`;
  try {
    return await memoizedDiscovery(cacheKey, async () => {
      const data = await spotifyFetch<SpotifySearchResponse>(sessionId, '/search', {
        q: query,
        type: 'track',
        limit: String(capped),
        offset: String(clampedOffset),
      });
      return data.tracks?.items?.map(toRecommendationTrack) ?? [];
    });
  } catch (err) {
    if (tripDiscoveryBreakerIfBlocked(err)) return [];
    throw err;
  }
}

function rotate<T>(arr: T[], by: number): T[] {
  if (arr.length <= 1) return [...arr];
  const n = ((by % arr.length) + arr.length) % arr.length;
  return [...arr.slice(n), ...arr.slice(0, n)];
}

/** Chunked interleave: 2–3 tracks per participant per round for organic flow. */
function chunkInterleave(
  pools: RecommendationTrack[][],
  weights: number[],
  limit: number,
  state: PlaylistSeenState,
): RecommendationTrack[] {
  const result: RecommendationTrack[] = [];
  const indices = pools.map(() => 0);
  const chunkSizes = weights.map((w) => (w >= 55 ? 3 : 2));

  while (result.length < limit) {
    let addedAny = false;
    for (let p = 0; p < pools.length; p++) {
      for (let c = 0; c < chunkSizes[p] && result.length < limit; c++) {
        while (indices[p] < pools[p].length) {
          const track = pools[p][indices[p]++];
          if (state.culturalGuardrail?.isBanned(track)) continue;
          if (!isUniqueCandidate(track, state)) continue;
          registerTrack(track, state);
          // Tag which participant this track came from so the UI can color-code sources.
          result.push({ ...track, sourceParticipantIndex: p });
          addedAny = true;
          break;
        }
      }
    }
    if (!addedAny) break;
  }

  return result;
}

function tryAddTrack(
  track: RecommendationTrack,
  state: PlaylistSeenState,
  results: RecommendationTrack[],
  targetLength: number,
  trustedArtists: TrustedArtists,
): boolean {
  if (results.length >= targetLength) return false;
  if (shouldDiscardSuperstarCollab(track, trustedArtists)) return false;
  if (state.culturalGuardrail?.isBanned(track)) return false;
  if (!isUniqueCandidate(track, state)) return false;
  registerTrack(track, state);
  results.push(track);
  return true;
}

export async function buildMultiCollisionPlaylist(
  input: PlaylistBuildInput,
): Promise<PlaylistBuildResult> {
  const { effectiveMode, guardrailApplied } = resolveEffectiveMode(
    input.generationMode,
    input.compatibilityScore,
  );

  const culturalGuardrail = buildCulturalGuardrail(input.artistPools, input.genreStatPools);
  const state: PlaylistSeenState = { ids: new Set(), seenTracks: new Set(), culturalGuardrail };
  const results: RecommendationTrack[] = []; // local-first bucket (common + local fill)
  const searched: RecommendationTrack[] = []; // search-origin bucket (display first)
  const trustedArtists = buildTrustedArtists(input.artistPools, input.sharedArtists);
  const sessionSeed = discoverySessionSeed(input.randomOffset);
  const targetLength = input.targetLength;

  const tryAddTrackToBucket = (track: RecommendationTrack, bucket: RecommendationTrack[]): boolean => {
    if (searched.length + results.length >= targetLength) return false;
    if (shouldDiscardSuperstarCollab(track, trustedArtists)) return false;
    if (state.culturalGuardrail?.isBanned(track)) return false;
    if (!isUniqueCandidate(track, state)) return false;
    registerTrack(track, state);
    bucket.push(track);
    return true;
  };

  // --- Stage 1: Exact common favorites (strict intersection of top tracks) ---
  if (input.trackPools.length > 0 && input.trackPools[0].length > 0) {
    console.log("Track Normalization Check:", normalizeSpotifyId(input.trackPools[0][0].id));
  }

  const exactOverlap = dedupeOverlapTracks(
    overlappingTracksMulti(input.trackPools).map((t) => {
      const rec = topTrackToRecommendation(t);
      rec.isCommon = true;
      return rec;
    })
  );
  for (const track of exactOverlap) {
    tryAddTrackToBucket(track, results);
  }
  console.log(`Stage 1: Common Favorites — ${results.length} tracks`);

  // Common Songs Only — strict intersection, no discovery stages.
  if (effectiveMode === 'common_only') {
    let tracks = sanitizePlaylistUniqueness(
      results.map((t) => ({ ...t, isCommon: true })),
    ).slice(0, targetLength);
    if (input.playlistLengthMode === 'duration' && input.targetDurationMs) {
      tracks = trimPlaylistToDuration(tracks, input.targetDurationMs);
    }
    console.log(`[common_only] Returning ${tracks.length} shared tracks (no discovery)`);
    return {
      tracks,
      usedFallback: false,
      effectiveMode,
      guardrailApplied,
    };
  }

  /**
   * SAFE-DISCOVERY PIPELINE (Feb 2026 constraints)
   *
   * Tier 1 (Local Synthesis): never calls Spotify discovery endpoints. This is the primary
   * source and must succeed even in full Development Mode.
   * Tier 2 (Search Fallback): if still short, perform EXACTLY ONE `/search` request.
   * Tier 3 (Emergency): if API locked (403/429) or still short, return emergency baseline.
   */

  // Patch the "default" genre bug once (used for hints/scoring).
  const cleanedGenreStatPools = stripDefaultGenres(input.genreStatPools);
  const vetoedGenreStatPools = applyLinguisticVetoToGenreStats(
    cleanedGenreStatPools,
    input.sharedArtists,
    input.blendWeights,
  );

  const sharedRegionalTokens = new Set<string>();
  if (vetoedGenreStatPools.length > 0) {
    const tokenSets = vetoedGenreStatPools.map((pool) => {
      const s = new Set<string>();
      for (const stat of pool ?? []) {
        if (!stat?.genre) continue;
        for (const t of regionalTokens(stat.genre)) s.add(t);
      }
      return s;
    });
    for (const t of tokenSets[0]) {
      if (tokenSets.every((s) => s.has(t))) sharedRegionalTokens.add(t);
    }
  }

  // --- Tier 1: Midpoint = search-first (Safe-Discovery) ---
  const tier1Start = searched.length + results.length;
  if (searched.length + results.length < targetLength) {
    if (effectiveMode === 'midpoint') {
      if (!discoveryAvailable()) {
        console.log('[Tier 1] Midpoint Search Skipped: Circuit Breaker Active');
      } else {
        // Single centroid-genre query only (no loops). If it fails with 403/429, breaker trips
        // inside searchTracks and we fall back to local/emergency tiers.
        // Intersection-first query: shared genres only, with dampening to avoid dominant
        // single-user genres (e.g. Bollywood) hijacking the midpoint intent.
        const sharedGenres = sharedGenresForMidpointQuery(vetoedGenreStatPools, sharedRegionalTokens);
        const centroidGenres = buildSearchGenres(input.centroidVector, input.genreHints);
        const topGlobal = topNonRegionalGenresForQuery(vetoedGenreStatPools, 2);

        // Safe-Discovery Midpoint: up to 3 search calls max.
        const querySeeds = uniqueOrdered([
          ...sharedGenres,
          ...topGlobal,
          ...centroidGenres,
          'pop',
        ])
          .filter((g) => g && String(g).trim().toLowerCase() !== 'default')
          // Never search a regional genre unless it's shared-safe across ALL participants.
          .filter((g) => isSharedSafeRegionalGenre(String(g), sharedRegionalTokens))
          .slice(0, 3);

        let searchCalls = 0;
        for (const seed of querySeeds) {
          if (searched.length + results.length >= targetLength) break;
          if (!discoveryAvailable()) {
            console.log('[Tier 1] Midpoint Search Stopped: Circuit Breaker Active');
            break;
          }
          const query = buildMultiGenreQuery([seed]);
          searchCalls += 1;
          console.log(`[Tier 1] Midpoint Search: ${query} (${searchCalls}/3)`);
          try {
            const found = await searchTracks(
              input.sessionId,
              query,
              Math.min(50, (targetLength - (results.length + searched.length)) * 8),
              perQueryDiscoveryOffset(sessionSeed, 777 + searchCalls * 9),
            );
            for (const t of refineDiscoveredTracks(found, trustedArtists)) {
              if (searched.length + results.length >= targetLength) break;
              tryAddTrackToBucket(t, searched);
            }
          } catch {
            // searchTracks will trip breaker on 403/429; continue only if still available.
            if (!discoveryAvailable()) break;
          }
        }
      }
    } else {
      // Offline proportional/equal-share: fill from each participant's own top tracks and interleave.
      const weights = input.blendWeights.length > 0 ? input.blendWeights : input.trackPools.map(() => 1);
      const remaining = targetLength - results.length;
      const pools = input.trackPools.map((pool) =>
        rotate(pool ?? [], sessionSeed).map(topTrackToRecommendation),
      );
      const interleaved = chunkInterleave(pools, weights, remaining, state);
      // chunkInterleave already enforces uniqueness + registers into state.
      // Just append until we reach targetLength.
      results.push(...interleaved.slice(0, Math.max(0, targetLength - (searched.length + results.length))));
    }
  }
  console.log(`[Tier 1] Added ${(searched.length + results.length) - tier1Start} tracks (now ${searched.length + results.length}/${targetLength})`);

  // --- Tier 2: ONE safe search call (only if still short and API not locked) ---
  if (results.length < targetLength) {
    // Midpoint is search-only: Tier 1 is the single allowed search request.
    // If it didn't fill, we go straight to emergency baseline (Tier 3).
    if (effectiveMode === 'midpoint') {
      console.log('[Tier 2] Skipped: Midpoint uses Tier 1 search budget');
    } else
    if (!discoveryAvailable()) {
      console.log('[Tier 2] API Stage Skipped: Circuit Breaker Active');
    } else {
      const remaining = targetLength - results.length;
      const searchable = resolveSearchableGenres(vetoedGenreStatPools);
      const fallbackGenres = searchable.length > 0 ? searchable : input.genreHints;
      // Avoid picking a regional genre unless it is shared-safe across all participants.
      const nonDefault = fallbackGenres.filter((g) => g && g.toLowerCase() !== 'default');
      const pick =
        nonDefault.find((g) => !isRegionalGenre(g)) ??
        nonDefault.find((g) => sharedRegionalTokens.has(regionalTokens(g)[0] ?? '')) ??
        'pop';
      const query = buildGenreQuery(pick);
      console.log(`[Tier 2] Search Fallback: ${query} (one request)`);
      try {
        const found = await searchTracks(
          input.sessionId,
          query,
          Math.min(SPOTIFY_SEARCH_LIMIT, remaining * 4),
          perQueryDiscoveryOffset(sessionSeed, 999),
        );
        for (const t of refineDiscoveredTracks(found, trustedArtists)) {
          if (results.length >= targetLength) break;
          tryAddTrack(t, state, results, targetLength, trustedArtists);
        }
      } catch (err) {
        // searchTracks already trips breaker on 403/429; fall through to Tier 3.
        console.log('[Tier 2] Search failed — falling back to emergency baseline');
      }
    }
  }

  // Display order: searched tracks first, then local tracks.
  let tracks = sanitizePlaylistUniqueness([...searched, ...results]);

  // --- Tier 3: Emergency fill to hit target safely ---
  if (tracks.length < targetLength) {
    console.log(`[Tier 3] Emergency baseline: ${tracks.length}/${targetLength} — seeding from local top tracks`);
    const baseline = emergencyBaselineTracksForTarget(input.trackPools, targetLength * 3, sessionSeed);
    const emergencyState: PlaylistSeenState = { ids: new Set(), seenTracks: new Set(), culturalGuardrail };
    for (const t of tracks) registerTrack(t, emergencyState);
    const cg: any = state.culturalGuardrail;

    // Midpoint: prefer non-regional emergency fill (to avoid Bollywood dominance),
    // only allowing regional if it is shared-safe. Unknown-genre tracks are allowed last.
    const isMidpoint = effectiveMode === 'midpoint';
    const pass = (allowUnknown: boolean) => {
      for (const t of baseline) {
        if (tracks.length >= targetLength) break;
        if (!isUniqueCandidate(t, emergencyState)) continue;
        if (cg?.isBanned?.(t)) continue;
        if (isMidpoint && cg?.trackRegionalTokens) {
          const tokens: Set<string> = cg.trackRegionalTokens(t);
          const isUnknown = tokens.size === 0 && (t.artistIds?.length ?? 0) === 0;
          // If we have genre metadata and it's regional, it will be banned above unless shared-safe.
          // If we have NO metadata, treat it as "unknown" and only allow on the final pass.
          if (!allowUnknown && isUnknown) continue;
        }
        registerTrack(t, emergencyState);
        tracks.push(t);
      }
    };

    if (isMidpoint) {
      pass(false);
      pass(true);
    } else {
      pass(true);
    }
  }

  if (input.playlistLengthMode === 'duration' && input.targetDurationMs) {
    tracks = trimPlaylistToDuration(tracks, input.targetDurationMs);
  }

  // Track-count mode: enforce the exact requested number as a hard ceiling. Stages cap
  // internally, but the emergency baseline can over-seed, so this guarantees adherence.
  if (input.playlistLengthMode !== 'duration') {
    tracks = tracks.slice(0, targetLength);
  }

  if (guardrailApplied) {
    console.info(
      `[recommendations] Match ${(input.compatibilityScore * 100).toFixed(1)}% < 80% — ` +
      'forced Equal Share playlist generation',
    );
  }

  console.log(
    input.playlistLengthMode === 'duration'
      ? `[length] Duration target ${(input.targetDurationMs ?? 0) / 60000}m → ${tracks.length} tracks, ${(tracks.reduce((s, t) => s + (t.durationMs ?? DEFAULT_TRACK_DURATION_MS), 0) / 60000).toFixed(1)}m`
      : `[length] Track target ${targetLength} → ${tracks.length} tracks`,
  );

  return {
    tracks,
    usedFallback: true,
    effectiveMode,
    guardrailApplied,
  };
}
