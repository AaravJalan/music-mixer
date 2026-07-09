import { loadJsonFile, saveJsonFile } from '../session/persist';

const CACHE_FILE = 'artist-cache.json';
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

interface ArtistCacheEntry {
  genres: string[];
  name: string;
  cachedAt: string;
}

type ArtistCacheStore = Record<string, ArtistCacheEntry>;

const memory = new Map<string, ArtistCacheEntry>(
  Object.entries(loadJsonFile<ArtistCacheStore>(CACHE_FILE, {})),
);

function persist(): void {
  saveJsonFile(CACHE_FILE, Object.fromEntries(memory));
}

function isFresh(entry: ArtistCacheEntry): boolean {
  return Date.now() - new Date(entry.cachedAt).getTime() < MAX_AGE_MS;
}

export function getCachedArtistGenres(artistId: string): string[] | null {
  const entry = memory.get(artistId);
  if (!entry || !isFresh(entry)) return null;
  return entry.genres;
}

export function setCachedArtistGenres(artistId: string, name: string, genres: string[]): void {
  memory.set(artistId, { genres, name, cachedAt: new Date().toISOString() });
  persist();
}
