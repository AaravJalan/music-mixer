import type { GhostProfile, GenreStat } from '@music-mixer/shared';
import type { ProfileArtist } from '../spotify/taste';
import ghostProfilesData from '../mock/ghost-profiles.json';
import { mapToParentGenre } from '../spotify/genreMapper';
interface GhostDefinition {
  id: string;
  displayName: string;
  tagline: string;
  avatarUrl: string;
  genres: string[];
  vector: {
    danceability: number;
    energy: number;
    acousticness: number;
    valence: number;
    instrumentalness: number;
    liveness: number;
  };
}

const GHOST_DEFINITIONS: GhostDefinition[] = [
  {
    id: 'ghost-thrasher',
    displayName: 'The Thrasher',
    tagline: 'Heavy Metal',
    avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=thrasher&backgroundColor=1a0505',
    genres: ['metal', 'thrash metal', 'heavy metal'],
    vector: { danceability: 0.4, energy: 0.95, acousticness: 0.05, valence: 0.3, instrumentalness: 0.4, liveness: 0.2 },
  },
  {
    id: 'ghost-hype-beast',
    displayName: 'The Hype Beast',
    tagline: 'US Hip-Hop',
    avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=hypebeast&backgroundColor=0a0a1a',
    genres: ['hip hop', 'rap', 'trap'],
    vector: { danceability: 0.78, energy: 0.72, acousticness: 0.12, valence: 0.55, instrumentalness: 0.02, liveness: 0.15 },
  },
  {
    id: 'ghost-study-buddy',
    displayName: 'The Study Buddy',
    tagline: 'Lo-Fi Ambient',
    avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=studybuddy&backgroundColor=0a1a14',
    genres: ['lo-fi', 'ambient', 'chill'],
    vector: { danceability: 0.45, energy: 0.25, acousticness: 0.55, valence: 0.42, instrumentalness: 0.65, liveness: 0.08 },
  },
  {
    id: 'ghost-pop-princess',
    displayName: 'The Pop Princess',
    tagline: 'Dance Pop',
    avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=popprincess&backgroundColor=2a0a2a',
    genres: ['pop', 'dance pop', 'post-teen pop'],
    vector: { danceability: 0.78, energy: 0.72, acousticness: 0.12, valence: 0.72, instrumentalness: 0.02, liveness: 0.1 },
  },
  {
    id: 'ghost-bollywood-buff',
    displayName: 'The Bollywood Buff',
    tagline: 'Filmi & Desi Pop',
    avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=bollywoodbuff&backgroundColor=1a1408',
    genres: ['bollywood', 'desi pop', 'filmi'],
    vector: { danceability: 0.65, energy: 0.7, acousticness: 0.3, valence: 0.7, instrumentalness: 0.05, liveness: 0.2 },
  },
];

export function cleanGenreList(genres: (string | null | undefined)[] | undefined): string[] {
  if (!Array.isArray(genres)) return [];
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of genres) {
    if (raw == null) continue;
    const g = String(raw).trim().toLowerCase();
    if (g === '' || g === 'default') continue;
    if (seen.has(g)) continue;
    seen.add(g);
    cleaned.push(g);
  }
  return cleaned;
}

function normalizeGhost(raw: Record<string, any>, base: GhostDefinition | undefined): GhostProfile | null {
  const id = raw?.id ?? base?.id;
  if (!id) return null;

  const genres = cleanGenreList(raw?.genres);
  const rawTracks = Array.isArray(raw?.tracks)
    ? raw.tracks
    : Array.isArray(raw?.topTracks)
      ? raw.topTracks
      : [];
  const tracks = rawTracks.filter((t: any) => t && t.id);
  const topArtists = Array.isArray(raw?.topArtists) ? raw.topArtists.filter((a: any) => a && a.id) : [];

  return {
    id,
    displayName: raw?.displayName ?? base?.displayName ?? id,
    tagline: raw?.tagline ?? base?.tagline ?? '',
    avatarUrl: raw?.avatarUrl ?? base?.avatarUrl ?? '',
    vector: raw?.vector ?? base?.vector,
    genres: genres.length > 0 ? genres : cleanGenreList(base?.genres),
    tracks,
    topArtists,
  };
}

function loadGhosts(): GhostProfile[] {
  const fromFile = ghostProfilesData as Record<string, any>[];
  const fileById = new Map<string, Record<string, any>>(
    (Array.isArray(fromFile) ? fromFile : []).filter((g) => g?.id).map((g) => [g.id, g]),
  );

  const merged: GhostProfile[] = [];
  const defById = new Map(GHOST_DEFINITIONS.map((d) => [d.id, d]));

  for (const def of GHOST_DEFINITIONS) {
    const raw = fileById.get(def.id);
    const normalized = raw ? normalizeGhost(raw, def) : null;
    merged.push(normalized ?? { ...def, tracks: [], topArtists: [] });
    fileById.delete(def.id);
  }

  for (const [id, raw] of fileById) {
    const normalized = normalizeGhost(raw, defById.get(id));
    if (normalized) merged.push(normalized);
  }

  return merged;
}

export function listGhostProfiles(): GhostProfile[] {
  return loadGhosts();
}

export function getGhostProfile(id: string): GhostProfile | null {
  return loadGhosts().find((g) => g.id === id) ?? null;
}

export function ghostToUserProfile(ghost: GhostProfile): import('@music-mixer/shared').UserProfile {
  return {
    id: ghost.id,
    displayName: ghost.displayName,
    avatarUrl: ghost.avatarUrl,
    platform: 'spotify',
  };
}

export function ghostToProfileArtists(ghost: GhostProfile): ProfileArtist[] {
  return (ghost.topArtists ?? []).map((a) => ({
    id: a.id,
    name: a.name,
    imageUrl: a.imageUrl ?? ghost.avatarUrl,
  }));
}

export function isGhostUserId(id: string): boolean {
  return id.startsWith('ghost-');
}

export function ghostGenresToStats(genres: string[]): GenreStat[] {
  if (genres.length === 0) return [];
  
  // Convert ghost micro-genres to the new macro-genres
  const mappedGenres = [...new Set(genres.map(mapToParentGenre))];
  
  const base = Math.floor(100 / mappedGenres.length);
  const remainder = 100 % mappedGenres.length;
  
  return mappedGenres.map((genre, i) => ({
    genre,
    percentage: i === 0 ? base + remainder : base,
    count: 10 - i, // fake count for sorting
  }));
}
