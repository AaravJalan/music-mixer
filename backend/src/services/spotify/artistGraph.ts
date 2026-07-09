import { spotifyFetch } from './client';
import {
  getCachedRelatedArtists,
  setCachedRelatedArtists,
} from '../cache/relatedArtistsCache';

export interface ArtistSeed {
  id: string;
  name: string;
}

const TOP_SEED_COUNT = 3;
const MAX_HOPS = 2;
const BATCH_SIZE = 3;
const BATCH_DELAY_MS = 250;

interface SpotifyArtistBrief {
  id: string;
  name: string;
}

interface RelatedArtistsResponse {
  artists: SpotifyArtistBrief[];
}

export interface ArtistNeighborhood {
  id: string;
  name: string;
  hop: number;
}

export interface ArtistGraphAnalysis {
  minDistance: 0 | 1 | 2 | null;
  multiplier: number;
  bridgeArtists: { id: string; name: string }[];
}

/** Harsh penalty when artist seeds are missing or invalid — never default to 1.0. */
export const INVALID_ARTIST_SEED_PENALTY = 0.5;

/** Degree-based multipliers applied to cosine similarity. */
const GRAPH_MULTIPLIERS = {
  direct: 1.12,
  firstDegree: 1.08,
  secondDegree: 0.92,
  disconnected: 0.72,
} as const;

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchRelatedArtists(
  sessionId: string,
  artistId: string,
): Promise<SpotifyArtistBrief[]> {
  const cached = getCachedRelatedArtists(artistId);
  if (cached) return cached;

  try {
    const data = await spotifyFetch<RelatedArtistsResponse>(
      sessionId,
      `/artists/${artistId}/related-artists`,
    );
    const artists = (data.artists ?? []).map((a) => ({ id: a.id, name: a.name }));
    setCachedRelatedArtists(artistId, artists);
    return artists;
  } catch {
    return [];
  }
}

/** 2-hop BFS from seed artist IDs through Spotify's related-artists graph. */
async function buildNeighborhood(
  sessionId: string,
  seeds: ArtistSeed[],
): Promise<Map<string, ArtistNeighborhood>> {
  const neighborhood = new Map<string, ArtistNeighborhood>();

  for (const seed of seeds) {
    neighborhood.set(seed.id, { id: seed.id, name: seed.name, hop: 0 });
  }

  let frontier = seeds.map((s) => s.id);

  for (let hop = 1; hop <= MAX_HOPS; hop++) {
    const nextFrontier: string[] = [];

    for (let i = 0; i < frontier.length; i += BATCH_SIZE) {
      const batch = frontier.slice(i, i + BATCH_SIZE);
      const batches = await Promise.all(
        batch.map((id) => fetchRelatedArtists(sessionId, id)),
      );

      for (const related of batches) {
        for (const artist of related) {
          if (!neighborhood.has(artist.id)) {
            neighborhood.set(artist.id, { id: artist.id, name: artist.name, hop });
            nextFrontier.push(artist.id);
          }
        }
      }

      if (i + BATCH_SIZE < frontier.length) {
        await wait(BATCH_DELAY_MS);
      }
    }

    frontier = nextFrontier;
    if (frontier.length > 0) {
      await wait(BATCH_DELAY_MS);
    }
  }

  return neighborhood;
}

function minIntersectionDistance(
  seedsA: string[],
  seedsB: string[],
  neighborhoodA: Map<string, ArtistNeighborhood>,
  neighborhoodB: Map<string, ArtistNeighborhood>,
): 0 | 1 | 2 | null {
  const setB = new Set(seedsB);
  for (const id of seedsA) {
    if (setB.has(id)) return 0;
  }

  let best = Infinity;

  for (const id of seedsB) {
    const entry = neighborhoodA.get(id);
    if (entry) best = Math.min(best, entry.hop);
  }

  for (const id of seedsA) {
    const entry = neighborhoodB.get(id);
    if (entry) best = Math.min(best, entry.hop);
  }

  if (best === Infinity) return null;
  if (best <= 2) return best as 0 | 1 | 2;
  return null;
}

function findBridgeArtists(
  neighborhoodA: Map<string, ArtistNeighborhood>,
  neighborhoodB: Map<string, ArtistNeighborhood>,
  seedsA: Set<string>,
  seedsB: Set<string>,
): { id: string; name: string }[] {
  const bridges: { id: string; name: string }[] = [];
  const seen = new Set<string>();

  for (const [id, node] of neighborhoodA) {
    if (!neighborhoodB.has(id)) continue;
    if (seedsA.has(id) && seedsB.has(id) && !seen.has(id)) {
      bridges.push({ id, name: node.name });
      seen.add(id);
    }
  }

  for (const [id, node] of neighborhoodA) {
    if (!neighborhoodB.has(id) || seedsA.has(id) || seedsB.has(id)) continue;
    if (seen.has(id)) continue;
    bridges.push({ id, name: node.name });
    seen.add(id);
  }

  return bridges.slice(0, 8);
}

export function multiplierForDistance(distance: 0 | 1 | 2 | null): number {
  if (distance === 0) return GRAPH_MULTIPLIERS.direct;
  if (distance === 1) return GRAPH_MULTIPLIERS.firstDegree;
  if (distance === 2) return GRAPH_MULTIPLIERS.secondDegree;
  return GRAPH_MULTIPLIERS.disconnected;
}

export function applyGraphPenalty(baseSimilarity: number, multiplier: number): number {
  return Math.min(1, Math.max(0, baseSimilarity * multiplier));
}

function isValidSpotifyArtistId(id: string): boolean {
  return Boolean(id) && !id.startsWith('ghost-') && id.length >= 20;
}

function filterValidSeeds(artists: ArtistSeed[]): ArtistSeed[] {
  return artists.filter((a) => isValidSpotifyArtistId(a.id));
}

function invalidSeedAnalysis(label: string, side: 'A' | 'B'): ArtistGraphAnalysis {
  console.warn(
    `[artistGraph] ${label} (User ${side}) has empty or invalid topArtists — ` +
    `BFS skipped, applying harsh fallback penalty (${INVALID_ARTIST_SEED_PENALTY})`,
  );
  return {
    minDistance: null,
    multiplier: INVALID_ARTIST_SEED_PENALTY,
    bridgeArtists: [],
  };
}

/**
 * Degrees-of-separation analysis via Spotify related-artists BFS.
 * Top 3 artists per user, 2-hop expansion, dynamic similarity multiplier.
 */
export async function analyzeArtistGraph(
  sessionId: string,
  artistsA: ArtistSeed[],
  artistsB: ArtistSeed[],
  context?: { labelA?: string; labelB?: string },
): Promise<ArtistGraphAnalysis> {
  const labelA = context?.labelA ?? 'User A';
  const labelB = context?.labelB ?? 'User B';

  const seedsA = filterValidSeeds(artistsA).slice(0, TOP_SEED_COUNT);
  const seedsB = filterValidSeeds(artistsB).slice(0, TOP_SEED_COUNT);

  if (seedsB.length === 0) {
    return invalidSeedAnalysis(labelB, 'B');
  }
  if (seedsA.length === 0) {
    return invalidSeedAnalysis(labelA, 'A');
  }

  const [neighborhoodA, neighborhoodB] = await Promise.all([
    buildNeighborhood(sessionId, seedsA),
    buildNeighborhood(sessionId, seedsB),
  ]);

  const minDistance = minIntersectionDistance(
    seedsA.map((a) => a.id),
    seedsB.map((a) => a.id),
    neighborhoodA,
    neighborhoodB,
  );

  const bridgeArtists = findBridgeArtists(
    neighborhoodA,
    neighborhoodB,
    new Set(seedsA.map((a) => a.id)),
    new Set(seedsB.map((a) => a.id)),
  );

  if (bridgeArtists.length === 0 && minDistance === null) {
    console.warn(
      `[artistGraph] No graph intersection within 2 hops between ${labelA} and ${labelB}`,
    );
  } else if (bridgeArtists.length > 0) {
    console.info(
      `[artistGraph] Found ${bridgeArtists.length} bridge artist(s): ${bridgeArtists.map((a) => a.name).join(', ')}`,
    );
  }

  return {
    minDistance,
    multiplier: multiplierForDistance(minDistance),
    bridgeArtists,
  };
}
