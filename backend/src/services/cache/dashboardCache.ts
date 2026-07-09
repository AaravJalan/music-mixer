import type { DashboardResponse, TasteTimeRange } from '@music-mixer/shared';
import { loadJsonFile, saveJsonFile } from '../session/persist';

const CACHE_FILE = 'dashboard-cache.json';
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // once per day
/** Bump when the DashboardResponse shape or stat computation changes. */
const CACHE_VERSION = 'v5';

interface DashboardCacheEntry {
  data: DashboardResponse;
  cachedAt: string;
}

type DashboardCacheStore = Record<string, DashboardCacheEntry>;

const memory = new Map<string, DashboardCacheEntry>(
  Object.entries(loadJsonFile<DashboardCacheStore>(CACHE_FILE, {})),
);

function cacheKey(userId: string, term: TasteTimeRange): string {
  return `${userId}:${term}:${CACHE_VERSION}`;
}

function persist(): void {
  saveJsonFile(CACHE_FILE, Object.fromEntries(memory));
}

function isFresh(entry: DashboardCacheEntry): boolean {
  return Date.now() - new Date(entry.cachedAt).getTime() < MAX_AGE_MS;
}

export function getCachedDashboard(userId: string, term: TasteTimeRange): DashboardResponse | null {
  const entry = memory.get(cacheKey(userId, term));
  if (!entry || !isFresh(entry)) return null;
  return { ...entry.data, cachedAt: entry.cachedAt };
}

export function setCachedDashboard(userId: string, term: TasteTimeRange, data: DashboardResponse): void {
  const cachedAt = new Date().toISOString();
  memory.set(cacheKey(userId, term), { data: { ...data, cachedAt }, cachedAt });
  persist();
}
