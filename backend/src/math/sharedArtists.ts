import type { SharedArtist } from '@music-mixer/shared';

export interface ArtistSeed {
  id: string;
  name: string;
  imageUrl: string;
}

export function normalizeArtistName(name: string): string {
  return name.toLowerCase().trim();
}

import { normalizeSpotifyId } from '@music-mixer/shared';

/**
 * Identity-aware intersection: matches strictly by Spotify artist ID (unique entity URI).
 * Name matching is deliberately excluded to prevent "Identity Collision" (e.g. two
 * different artists both named "Pritam" being conflated).
 */
export function findSharedTopArtists(artistLists: ArtistSeed[][], limit = 15): SharedArtist[] {
  if (artistLists.length < 2 || artistLists[0].length === 0) return [];

  // Literally just compare exact artist IDs. Base62 is case-sensitive, so no lowercasing.
  let shared = [...artistLists[0]];

  for (let i = 1; i < artistLists.length; i++) {
    const otherIds = new Set(artistLists[i].map((a) => normalizeSpotifyId(a.id)));
    shared = shared.filter((a) => a.id && otherIds.has(normalizeSpotifyId(a.id)));
  }

  // Deduplicate the result just in case list 0 has duplicates
  const uniqueShared: ArtistSeed[] = [];
  const seen = new Set<string>();
  for (const a of shared) {
    if (!seen.has(a.id)) {
      seen.add(a.id);
      uniqueShared.push(a);
    }
  }

  return uniqueShared.slice(0, limit).map((artist) => ({
    id: artist.id,
    name: artist.name,
    imageUrl: artist.imageUrl,
  }));
}
