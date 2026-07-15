import type { DashboardResponse, TasteTimeRange } from '@music-mixer/shared';
import type { UserTasteProfile } from '../engine/taste';
import { redis } from '../services/redis/client';

// ─── TTLs (seconds) ──────────────────────────────────────────────────────────
const ARTIST_GENRES_TTL = 30 * 24 * 60 * 60; // 30 days
const DASHBOARD_TTL = 24 * 60 * 60;           // 24 hours
const TASTE_PROFILE_TTL = 3 * 60 * 60;        // 3 hours
const LASTFM_TRACK_TTL  = 14 * 24 * 60 * 60; // 14 days
const LASTFM_ARTIST_TTL = 30 * 24 * 60 * 60; // 30 days
const LASTFM_SIMILAR_TTL = 7 * 24 * 60 * 60; // 7 days

const DASHBOARD_CACHE_VERSION = 'v20';
const TASTE_PROFILE_CACHE_VERSION = 'v6';

// ─── Key helpers ──────────────────────────────────────────────────────────────
function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
}

const artistGenresKey  = (artistId: string) => `artist_genres:${artistId}`;
const dashboardKey     = (userId: string, term: TasteTimeRange) =>
  `dashboard:${userId}:${term}:${DASHBOARD_CACHE_VERSION}`;
const tasteProfileKey  = (userId: string, term: TasteTimeRange) =>
  `taste_profile:${userId}:${term}:${TASTE_PROFILE_CACHE_VERSION}`;
const lastfmTrackKey   = (artist: string, track: string) =>
  `genres:track:${slugify(artist)}:${slugify(track)}`;
const lastfmArtistKey  = (artist: string) =>
  `genres:artist:${slugify(artist)}`;
const lastfmSimilarTracksKey = (artist: string, track: string) =>
  `lastfm:similar_tracks:${slugify(artist)}:${slugify(track)}`;
const lastfmSimilarArtistsKey = (artist: string) =>
  `lastfm:similar_artists:${slugify(artist)}`;
const lastfmTagTracksKey = (tag: string) =>
  `lastfm:tag_tracks:${slugify(tag)}`;

// ─── Artist Genres Cache ──────────────────────────────────────────────────────

interface ArtistCacheEntry {
  genres: string[];
  name: string;
  cachedAt: string;
}

export async function getCachedArtistGenres(artistId: string): Promise<string[] | null> {
  const raw = await redis.get<string>(artistGenresKey(artistId));
  if (!raw) return null;
  try {
    const entry: ArtistCacheEntry =
      typeof raw === 'string' ? JSON.parse(raw) : (raw as ArtistCacheEntry);
    return entry.genres ?? null;
  } catch {
    return null;
  }
}

export async function setCachedArtistGenres(artistId: string, name: string, genres: string[]): Promise<void> {
  const entry: ArtistCacheEntry = { genres, name, cachedAt: new Date().toISOString() };
  await redis.set(artistGenresKey(artistId), JSON.stringify(entry), { ex: ARTIST_GENRES_TTL });
}

// ─── Dashboard Cache ──────────────────────────────────────────────────────────

interface DashboardCacheEntry {
  data: DashboardResponse;
  cachedAt: string;
}

export async function getCachedDashboard(userId: string, term: TasteTimeRange): Promise<DashboardResponse | null> {
  const raw = await redis.get<string>(dashboardKey(userId, term));
  if (!raw) return null;
  try {
    const entry: DashboardCacheEntry =
      typeof raw === 'string' ? JSON.parse(raw) : (raw as DashboardCacheEntry);
    return { ...entry.data, cachedAt: entry.cachedAt };
  } catch {
    return null;
  }
}

export async function setCachedDashboard(
  userId: string,
  term: TasteTimeRange,
  data: DashboardResponse,
): Promise<void> {
  const cachedAt = new Date().toISOString();
  const entry: DashboardCacheEntry = { data: { ...data, cachedAt }, cachedAt };
  await redis.set(dashboardKey(userId, term), JSON.stringify(entry), { ex: DASHBOARD_TTL });
}

// ─── Taste Profile Cache ──────────────────────────────────────────────────────

export async function getCachedTasteProfile(userId: string, term: TasteTimeRange): Promise<UserTasteProfile | null> {
  const raw = await redis.get<string>(tasteProfileKey(userId, term));
  if (!raw) return null;
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (parsed.artistGenreMap && Array.isArray(parsed.artistGenreMap)) {
      parsed.artistGenreMap = new Map(parsed.artistGenreMap);
    }
    return parsed as UserTasteProfile;
  } catch {
    return null;
  }
}

export async function setCachedTasteProfile(
  userId: string,
  term: TasteTimeRange,
  profile: UserTasteProfile,
): Promise<void> {
  const toCache = {
    ...profile,
    artistGenreMap: Array.from(profile.artistGenreMap.entries())
  };
  await redis.set(tasteProfileKey(userId, term), JSON.stringify(toCache), { ex: TASTE_PROFILE_TTL });
}

// ─── Last.fm Genre Cache ──────────────────────────────────────────────────────

export async function getCachedLastfmTrackGenres(artist: string, track: string): Promise<string[] | null> {
  const raw = await redis.get<string>(lastfmTrackKey(artist, track));
  if (!raw) return null;
  try { return JSON.parse(raw) as string[]; } catch { return null; }
}

export async function setCachedLastfmTrackGenres(artist: string, track: string, genres: string[]): Promise<void> {
  await redis.set(lastfmTrackKey(artist, track), JSON.stringify(genres), { ex: LASTFM_TRACK_TTL });
}

export async function getCachedLastfmArtistGenres(artist: string): Promise<string[] | null> {
  const raw = await redis.get<string>(lastfmArtistKey(artist));
  if (!raw) return null;
  try { return JSON.parse(raw) as string[]; } catch { return null; }
}

export async function setCachedLastfmArtistGenres(artist: string, genres: string[]): Promise<void> {
  await redis.set(lastfmArtistKey(artist), JSON.stringify(genres), { ex: LASTFM_ARTIST_TTL });
}

// ─── Last.fm Similarity Cache (7 Days) ────────────────────────────────────────

export async function getCachedLastfmSimilarTracks(artist: string, track: string): Promise<any[] | null> {
  const raw = await redis.get<string>(lastfmSimilarTracksKey(artist, track));
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

export async function setCachedLastfmSimilarTracks(artist: string, track: string, tracks: any[]): Promise<void> {
  await redis.set(lastfmSimilarTracksKey(artist, track), JSON.stringify(tracks), { ex: LASTFM_SIMILAR_TTL });
}

export async function getCachedLastfmSimilarArtists(artist: string): Promise<any[] | null> {
  const raw = await redis.get<string>(lastfmSimilarArtistsKey(artist));
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

export async function setCachedLastfmSimilarArtists(artist: string, artists: any[]): Promise<void> {
  await redis.set(lastfmSimilarArtistsKey(artist), JSON.stringify(artists), { ex: LASTFM_SIMILAR_TTL });
}

export async function getCachedLastfmTagTracks(tag: string): Promise<any[] | null> {
  const raw = await redis.get<string>(lastfmTagTracksKey(tag));
  if (!raw) return null;
  try { return typeof raw === 'string' ? JSON.parse(raw) : raw; } catch { return null; }
}

export async function setCachedLastfmTagTracks(tag: string, tracks: any[]): Promise<void> {
  await redis.set(lastfmTagTracksKey(tag), JSON.stringify(tracks), { ex: LASTFM_SIMILAR_TTL });
}
