import { loadJsonFile, saveJsonFile } from '../session/persist';

const CACHE_FILE = 'related-artists-cache.json';
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

interface RelatedCacheEntry {
  artists: { id: string; name: string }[];
  cachedAt: string;
}

type RelatedCacheStore = Record<string, RelatedCacheEntry>;

const memory = new Map<string, RelatedCacheEntry>(
  Object.entries(loadJsonFile<RelatedCacheStore>(CACHE_FILE, {})),
);

function persist(): void {
  saveJsonFile(CACHE_FILE, Object.fromEntries(memory));
}

function isFresh(entry: RelatedCacheEntry): boolean {
  return Date.now() - new Date(entry.cachedAt).getTime() < MAX_AGE_MS;
}

export function getCachedRelatedArtists(artistId: string): { id: string; name: string }[] | null {
  const entry = memory.get(artistId);
  if (!entry || !isFresh(entry)) return null;
  return entry.artists;
}

export function setCachedRelatedArtists(
  artistId: string,
  artists: { id: string; name: string }[],
): void {
  memory.set(artistId, { artists, cachedAt: new Date().toISOString() });
  persist();
}
