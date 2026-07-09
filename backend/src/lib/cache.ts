import type { DashboardResponse, TasteTimeRange } from '@music-mixer/shared';
import { loadJsonFile, saveJsonFile } from './persist';

const ARTIST_CACHE_FILE = 'artist-cache.json';
const ARTIST_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const DASHBOARD_CACHE_FILE = 'dashboard-cache.json';
const DASHBOARD_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const DASHBOARD_CACHE_VERSION = 'v5';

interface ArtistCacheEntry {
  genres: string[];
  name: string;
  cachedAt: string;
}

interface DashboardCacheEntry {
  data: DashboardResponse;
  cachedAt: string;
}

const artistMemory = new Map<string, ArtistCacheEntry>(
  Object.entries(loadJsonFile<Record<string, ArtistCacheEntry>>(ARTIST_CACHE_FILE, {})),
);

const dashboardMemory = new Map<string, DashboardCacheEntry>(
  Object.entries(loadJsonFile<Record<string, DashboardCacheEntry>>(DASHBOARD_CACHE_FILE, {})),
);

function isFresh(cachedAt: string, maxAgeMs: number): boolean {
  return Date.now() - new Date(cachedAt).getTime() < maxAgeMs;
}

function persistArtistCache(): void {
  saveJsonFile(ARTIST_CACHE_FILE, Object.fromEntries(artistMemory));
}

function persistDashboardCache(): void {
  saveJsonFile(DASHBOARD_CACHE_FILE, Object.fromEntries(dashboardMemory));
}

function dashboardCacheKey(userId: string, term: TasteTimeRange): string {
  return `${userId}:${term}:${DASHBOARD_CACHE_VERSION}`;
}

export function getCachedArtistGenres(artistId: string): string[] | null {
  const entry = artistMemory.get(artistId);
  if (!entry || !isFresh(entry.cachedAt, ARTIST_MAX_AGE_MS)) return null;
  return entry.genres;
}

export function setCachedArtistGenres(artistId: string, name: string, genres: string[]): void {
  artistMemory.set(artistId, { genres, name, cachedAt: new Date().toISOString() });
  persistArtistCache();
}

export function getCachedDashboard(userId: string, term: TasteTimeRange): DashboardResponse | null {
  const entry = dashboardMemory.get(dashboardCacheKey(userId, term));
  if (!entry || !isFresh(entry.cachedAt, DASHBOARD_MAX_AGE_MS)) return null;
  return { ...entry.data, cachedAt: entry.cachedAt };
}

export function setCachedDashboard(userId: string, term: TasteTimeRange, data: DashboardResponse): void {
  const cachedAt = new Date().toISOString();
  dashboardMemory.set(dashboardCacheKey(userId, term), { data: { ...data, cachedAt }, cachedAt });
  persistDashboardCache();
}
