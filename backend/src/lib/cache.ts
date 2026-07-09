import type { DashboardResponse, TasteTimeRange } from '@music-mixer/shared';
import { redis } from '../services/redis/client';

// ─── TTLs (seconds) ──────────────────────────────────────────────────────────
const ARTIST_GENRES_TTL = 30 * 24 * 60 * 60; // 30 days
const DASHBOARD_TTL = 24 * 60 * 60;           // 24 hours

const DASHBOARD_CACHE_VERSION = 'v5';

// ─── Key helpers ──────────────────────────────────────────────────────────────
const artistGenresKey = (artistId: string) => `artist_genres:${artistId}`;
const dashboardKey = (userId: string, term: TasteTimeRange) =>
  `dashboard:${userId}:${term}:${DASHBOARD_CACHE_VERSION}`;

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
