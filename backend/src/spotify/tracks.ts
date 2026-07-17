import { SPOTIFY_TOP_TRACKS_LIMIT } from '@music-mixer/shared';
import type { TasteTimeRange } from '@music-mixer/shared';
import { spotifyFetch } from './client';

const TRACKS_CACHE_TTL = 5 * 60 * 1000;
const listeningMsCache = new Map<string, { at: number; promise: Promise<number> }>();
const ytdTracksCache = new Map<string, { at: number; promise: Promise<TopTrack[]> }>();

interface SpotifyTopTracksResponse {
  items: SpotifyTrack[];
}

interface SpotifyRecentlyPlayedResponse {
  items: { played_at: string; track: SpotifyTrack }[];
  cursors?: { after: string; before: string };
}

interface SpotifyTrack {
  id: string;
  name: string;
  duration_ms?: number;
  popularity: number;
  artists: { id: string; name: string }[];
  album: { images: { url: string }[]; release_date: string };
}

export interface TopTrack {
  id: string;
  name: string;
  artist: string;
  albumArtUrl: string;
  artistIds: string[];
  durationMs?: number;
  popularity: number;
  releaseDate: string;
}

export type SpotifyTimeRangeParam = 'short_term' | 'medium_term' | 'long_term';

export function resolveSpotifyTimeRange(term: TasteTimeRange): SpotifyTimeRangeParam {
  if (term === 'year_to_date') return 'medium_term';
  return term;
}

function toTopTrack(track: SpotifyTrack): TopTrack {
  return {
    id: track.id,
    name: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    albumArtUrl: track.album.images[0]?.url ?? '',
    artistIds: track.artists.map((a) => a.id),
    durationMs: track.duration_ms,
    popularity: track.popularity,
    releaseDate: track.album.release_date,
  };
}

export async function fetchTopTracks(
  sessionId: string,
  timeRange: TasteTimeRange = 'medium_term',
): Promise<TopTrack[]> {
  if (timeRange === 'year_to_date') {
    return fetchYearToDateTracks(sessionId);
  }

  // Fetch up to 100 tracks by doing two requests of 50
  const [page1, page2] = (await Promise.all([
    spotifyFetch<SpotifyTopTracksResponse>(sessionId, '/me/top/tracks', {
      limit: '50',
      offset: '0',
      time_range: resolveSpotifyTimeRange(timeRange),
    }),
    spotifyFetch<SpotifyTopTracksResponse>(sessionId, '/me/top/tracks', {
      limit: '50',
      offset: '50',
      time_range: resolveSpotifyTimeRange(timeRange),
    }).catch(() => ({ items: [] })), // Handle 404/errors gracefully on page 2
  ])) as [SpotifyTopTracksResponse, SpotifyTopTracksResponse];

  const items = [...page1.items, ...(page2.items || [])];
  
  // Ensure we don't have duplicates just in case
  const seen = new Set();
  const uniqueItems = items.filter(item => {
    if (seen.has(item.id)) return false;
    seen.add(item.id);
    return true;
  });

  return uniqueItems.map(toTopTrack);
}

const DEFAULT_TRACK_MS = 3.5 * 60 * 1000;

function yearStartTimestamp(): number {
  const now = new Date();
  return new Date(now.getFullYear(), 0, 1).getTime();
}

/**
 * Sum actual play durations from Spotify recently-played since `sinceMs` (exclusive).
 * Spotify only exposes ~50 recent plays per page; we paginate a few pages max.
 */
export function measureListeningMsSince(
  sessionId: string,
  sinceMs: number,
): Promise<number> {
  const cacheKey = `${sessionId}:${sinceMs}`;
  const cached = listeningMsCache.get(cacheKey);
  if (cached && Date.now() - cached.at < TRACKS_CACHE_TTL) {
    return cached.promise;
  }
  
  const promise = doMeasureListeningMsSince(sessionId, sinceMs);
  listeningMsCache.set(cacheKey, { at: Date.now(), promise });
  promise.catch(() => listeningMsCache.delete(cacheKey));
  
  return promise;
}

async function doMeasureListeningMsSince(
  sessionId: string,
  sinceMs: number,
): Promise<number> {
  let totalMs = 0;
  let before: string | undefined;

  try {
    for (let page = 0; page < 8; page++) {
      const params: Record<string, string> = {
        limit: '50',
      };
      if (before) params.before = before;

      const data = await spotifyFetch<SpotifyRecentlyPlayedResponse>(
        sessionId,
        '/me/player/recently-played',
        params,
      );

      if (!data.items?.length) break;

      let reachedCutoff = false;
      for (const item of data.items) {
        const playedAt = new Date(item.played_at).getTime();
        if (playedAt <= sinceMs) {
          reachedCutoff = true;
          continue;
        }
        totalMs += item.track.duration_ms && item.track.duration_ms > 0
          ? item.track.duration_ms
          : DEFAULT_TRACK_MS;
      }

      const oldest = data.items[data.items.length - 1];
      if (!oldest || reachedCutoff) break;

      const oldestTime = new Date(oldest.played_at).getTime();
      if (oldestTime <= sinceMs) break;

      const nextBefore = data.cursors?.before ?? oldest.played_at;
      if (nextBefore === before) break;
      before = nextBefore;

      if (data.items.length < 50) break;
    }
  } catch (err) {
    console.warn('[tracks] measureListeningMsSince failed:', err);
  }

  return totalMs;
}

/**
 * Year-to-date profile from recently played (requires user-read-recently-played scope).
 * Paginates with `before` cursor; ranks tracks by play frequency since Jan 1.
 */
function fetchYearToDateTracks(sessionId: string): Promise<TopTrack[]> {
  const cacheKey = sessionId;
  const cached = ytdTracksCache.get(cacheKey);
  if (cached && Date.now() - cached.at < TRACKS_CACHE_TTL) {
    return cached.promise;
  }
  
  const promise = doFetchYearToDateTracks(sessionId);
  ytdTracksCache.set(cacheKey, { at: Date.now(), promise });
  promise.catch(() => ytdTracksCache.delete(cacheKey));
  
  return promise;
}

async function doFetchYearToDateTracks(sessionId: string): Promise<TopTrack[]> {
  const after = yearStartTimestamp();
  const playCounts = new Map<string, { track: TopTrack; count: number }>();
  let before: string | undefined;

  try {
    for (let page = 0; page < 12; page++) {
      const params: Record<string, string> = {
        limit: '50',
      };
      if (before) params.before = before;

      const data = await spotifyFetch<SpotifyRecentlyPlayedResponse>(
        sessionId,
        '/me/player/recently-played',
        params,
      );

      if (!data.items?.length) break;

      let reachedYearStart = false;
      for (const item of data.items) {
        const playedAt = new Date(item.played_at).getTime();
        if (playedAt < after) {
          reachedYearStart = true;
          continue;
        }
        const existing = playCounts.get(item.track.id);
        if (existing) {
          existing.count += 1;
        } else {
          playCounts.set(item.track.id, { track: toTopTrack(item.track), count: 1 });
        }
      }

      const oldest = data.items[data.items.length - 1];
      if (!oldest || reachedYearStart) break;

      const oldestTime = new Date(oldest.played_at).getTime();
      if (oldestTime <= after) break;

      const nextBefore = data.cursors?.before ?? oldest.played_at;
      if (nextBefore === before) break;
      before = nextBefore;

      if (data.items.length < 50) break;
    }
  } catch (err) {
    console.warn('[tracks] year_to_date recently-played failed:', err);
  }

  const ranked = [...playCounts.values()]
    .sort((a, b) => b.count - a.count)
    .map((entry) => entry.track)
    .slice(0, SPOTIFY_TOP_TRACKS_LIMIT);

  if (ranked.length > 0) {
    console.info(`[tracks] year_to_date: ${ranked.length} unique tracks since Jan 1`);
    return ranked;
  }

  console.warn('[tracks] year_to_date empty — falling back to medium_term top tracks');
  return fetchTopTracks(sessionId, 'medium_term');
}
