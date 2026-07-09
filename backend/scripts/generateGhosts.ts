/**
 * One-time Ghost Persona hydration script.
 *
 * Pre-computes static GhostProfile data so the live app never hydrates ghosts at
 * request time. Run: npm run generate:ghosts -w backend
 *
 * Spotify blocks client-credentials access to editorial playlist tracks (403), so we
 * hydrate each persona from seed artists' top-tracks + genre search (both work with
 * client credentials). Writes backend/.data/ghost-profiles.json.
 */
import { config } from 'dotenv';
import fs from 'fs';
import path from 'path';
import type { GhostProfile } from '@music-mixer/shared';
import { normalizeSpotifyId } from '@music-mixer/shared';
import { spotifyFetch } from '../src/services/spotify/client';
import { fetchWithRetry } from '../src/utils/fetch';

config({ path: path.resolve(__dirname, '../.env') });
config({ path: path.resolve(__dirname, '../../.env') });

const API_BASE = 'https://api.spotify.com/v1';

/**
 * Optional personal Bearer token. Spotify Development Mode apps get 403 on editorial
 * (`37i9…`) playlists and several discovery endpoints even with a valid user token. A
 * token minted from the Spotify Web API console ("Get Token") is scoped to Spotify's own
 * console app and CAN read those, so pasting one here (via env) bypasses the 403s.
 *
 * Set it for a single run without committing a secret:
 *   SPOTIFY_BEARER_TOKEN="BQ...your-token" npm run generate:ghosts -w backend
 *
 * When unset, the script falls back to the logged-in user's session token.
 */
const BEARER_TOKEN = process.env.SPOTIFY_BEARER_TOKEN?.trim() || '';
const OUTPUT_PATH = path.resolve(__dirname, '../.data/ghost-profiles.json');
const TARGET_TRACKS = 100;
const PAGE_SIZE = 50;
const ARTIST_BATCH_SIZE = 50;
const MARKET = 'US';

interface PersonaSeed {
  id: string;
  displayName: string;
  tagline: string;
  avatarUrl: string;
  vector: GhostProfile['vector'];
  fallbackGenres: string[];
  /** Known-good Spotify artist IDs to seed top-tracks + genre search. */
  seedArtistIds: string[];
  /** Optional playlist ID — tried first, falls back on 403. */
  playlistId?: string;
}

const PERSONAS: PersonaSeed[] = [
  {
    id: 'ghost-hype-beast',
    playlistId: '3mpxH96YTKzTvcNtM1gTEK',
    displayName: 'The Hype Beast',
    tagline: 'US Hip-Hop',
    avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=hypebeast&backgroundColor=0a0a1a',
    vector: { danceability: 0.78, energy: 0.72, acousticness: 0.12, valence: 0.55, instrumentalness: 0.02, liveness: 0.15 },
    fallbackGenres: ['hip hop', 'rap', 'trap'],
    seedArtistIds: [
      '0Y5tJX1MQlPlqiwlOH1tJY', '3TVXtAsR1Inumwj472S9r4', '1RyvyyTE3xzB2ZywiAwp0i',
      '2YZyLoL8N0Wb9xBt1NhZWg', '6l3HvQ5sa6mXTsMTB19rO5', '246dkjvS1zLTtiykXe5h60',
      '4MCxR4QHpkQ5ZqH75h28lT', '1vyhD5VmyZ7KMfW5gqLGO5', '166TmCGea1yD1M27Y0yGjL',
    ],
  },
  {
    id: 'ghost-study-buddy',
    playlistId: '2yiKQf565X5jO3smnbFLiQ',
    displayName: 'The Study Buddy',
    tagline: 'Lo-Fi Ambient',
    avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=studybuddy&backgroundColor=0a1a14',
    vector: { danceability: 0.45, energy: 0.25, acousticness: 0.55, valence: 0.42, instrumentalness: 0.65, liveness: 0.08 },
    fallbackGenres: ['lo-fi', 'chillhop', 'ambient'],
    seedArtistIds: [
      '1eDIWVJt7ZWKsrXw5WVNsN', '6YJ4EgQzDfJnIHRbqIHAdD', '5FsfZj0Mp6YwEWytuJUcWt',
      '3Rq3YOF9YG9YfCWD4D56RZ', '0g1fsd3G4dGpa3bGHriL0', '4kYSro6adA99QjyaTTNZGI',
      '3uH3wtZ9KtqLidjTRf7kLb', '4MXHi7ibeDHd89pfuW1oJP', '7vkzxldH4YSmF8Sbq7X0C3',
    ],
  },
  {
    id: 'ghost-thrasher',
    playlistId: '1MpRo07bNTbYhATaRc2SSl',
    displayName: 'The Thrasher',
    tagline: 'Heavy Metal',
    avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=thrasher&backgroundColor=1a0505',
    vector: { danceability: 0.4, energy: 0.95, acousticness: 0.05, valence: 0.3, instrumentalness: 0.4, liveness: 0.2 },
    fallbackGenres: ['rock', 'metal', 'hard rock'],
    seedArtistIds: [
      '2ye2Wgw4gimLv2eAKyk1NB', '1IQ2e1buppatiN1bxUVkrk', '05fG473iIaoy82BF1aGhL8',
      '1Yox196W7bzVNZI7RBaPnf', '14pVkFUHDL207LzLHtSA18', '6mdiAmATAx73kdxrNrnlao',
      '5M52tdBnJaKSvOpJGz8mfZ', '2tRsMl4eGxwoNabM08Dm4I', '3JysSUOyfVs1UQ0UaESheP',
    ],
  },
  {
    id: 'ghost-pop-princess',
    playlistId: '0N7Tq2cM7bCH3kEEmgRqic',
    displayName: 'The Pop Princess',
    tagline: 'Dance Pop',
    avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=popprincess&backgroundColor=2a0a2a',
    vector: { danceability: 0.78, energy: 0.72, acousticness: 0.12, valence: 0.72, instrumentalness: 0.02, liveness: 0.1 },
    fallbackGenres: ['pop', 'dance pop', 'post-teen pop'],
    seedArtistIds: [
      '06HL4z0CvFAxyc27GXpf02', '66CXWjxzNUsdJxJ2JdwvnR', '6M2wZ9GZgrQXHCFfjv46we',
      '74KM79TiuVKeVCqs8QtB0B', '1McMsnEElThX1knmY4oliG', '6qqNVTkY8uBg9cP3Jd7DAH',
      '1Xyo4u8uXC1ZmMpatF05PJ', '6KImCVD70vtIoJWnq6nZn3', '1wRPtKGflJrBx9BmLsSwlU',
    ],
  },
  {
    id: 'ghost-bollywood-buff',
    playlistId: '42LxFgjPyuOU3u1uy0DxIk',
    displayName: 'The Bollywood Buff',
    tagline: 'Filmi & Desi Pop',
    avatarUrl: 'https://api.dicebear.com/7.x/shapes/svg?seed=bollywoodbuff&backgroundColor=1a1408',
    vector: { danceability: 0.65, energy: 0.7, acousticness: 0.3, valence: 0.7, instrumentalness: 0.05, liveness: 0.2 },
    fallbackGenres: ['bollywood', 'desi pop', 'filmi'],
    seedArtistIds: [
      '1wRPtKGflJrBx9BmLsSwlU', '4YRxDV8wJFPHPTeXepOstw', '0oOet2f43PA68X5RxKobEy',
      '6Mv8GjQa7LKUGCAqa9qqdb', '1mYsTxnqsietFxj1OgoGbG', '4f7KfxeHq9BixHDyzj1Hn8',
      '6Mv8G3YdfgJipAZRfX0LLM', '0L8ExT028jH3ddEcZwqJJ5', '4YRxDV8wROuPEcgv2g0PI1',
    ],
  },
];

interface SpotifyTrackItem {
  id: string;
  name: string;
  duration_ms?: number;
  popularity?: number;
  artists: { id?: string; name: string }[];
  album?: { images?: { url: string }[]; release_date?: string };
}
/**
 * Playlist item shape returned by GET /playlists/{id}. Note: the live/current API nests
 * the track under `.item` (not the classic `.track`) and pages under a top-level `items`
 * object. We tolerate both. The `/playlists/{id}/tracks` sub-endpoint is 403 in Dev Mode,
 * but the parent object works and embeds the first 100 tracks.
 */
interface SpotifyPlaylistItem {
  item?: SpotifyTrackItem | null;
  track?: SpotifyTrackItem | null;
}
interface SpotifyArtistFull {
  id: string;
  name: string;
  genres?: string[] | null;
  images?: { url: string }[];
}

type GhostTrack = GhostProfile['tracks'][number];

function cleanGenres(genres: (string | null | undefined)[]): string[] {
  const seen = new Set<string>();
  const cleaned: string[] = [];
  for (const raw of genres) {
    if (raw == null) continue;
    const g = raw.trim().toLowerCase();
    if (g === '' || g === 'default') continue;
    if (seen.has(g)) continue;
    seen.add(g);
    cleaned.push(g);
  }
  return cleaned;
}

function toGhostTrack(t: SpotifyTrackItem): GhostTrack | null {
  if (!t?.id) return null;
  const trackId = normalizeSpotifyId(t.id);
  if (!trackId) return null;
  const artistIds = (t.artists ?? [])
    .map((a) => (a.id ? normalizeSpotifyId(a.id) : ''))
    .filter(Boolean);
  return {
    id: trackId,
    name: t.name,
    artist: (t.artists ?? []).map((a) => a.name).join(', '),
    albumArtUrl: t.album?.images?.[0]?.url ?? '',
    artistIds,
    popularity: t.popularity ?? 50,
    releaseDate: t.album?.release_date ?? '',
    durationMs: t.duration_ms,
  };
}

function getSessionId(): string {
  const sessionsPath = path.resolve(__dirname, '../.data/sessions.json');
  if (!fs.existsSync(sessionsPath)) {
    throw new Error('No sessions.json — log in to the app first so we have a user token');
  }
  const sessions = JSON.parse(fs.readFileSync(sessionsPath, 'utf8')) as Record<string, unknown>;
  const sessionId = Object.keys(sessions)[0];
  if (!sessionId) throw new Error('No active session found — log in to the app first');
  return sessionId;
}

/** Direct call using the pasted personal Bearer token (bypasses the session manager). */
async function bearerApi<T>(endpoint: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${API_BASE}${endpoint}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  }
  const res = await fetchWithRetry(url.toString(), {
    headers: { Authorization: `Bearer ${BEARER_TOKEN}` },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Spotify API ${endpoint} failed (${res.status}): ${body.slice(0, 120)}`);
  }
  return res.json() as Promise<T>;
}

async function api<T>(sessionId: string, endpoint: string, params?: Record<string, string>): Promise<T> {
  if (BEARER_TOKEN) return bearerApi<T>(endpoint, params);
  return spotifyFetch<T>(sessionId, endpoint, params);
}

interface PlaylistItemsPage {
  items: SpotifyPlaylistItem[];
  next: string | null;
}
interface PlaylistObject {
  name?: string;
  // Live API embeds the first page of items under a top-level `items` paging object…
  items?: PlaylistItemsPage;
  // …classic API nests them under `tracks`.
  tracks?: PlaylistItemsPage;
}

function pageFrom(pl: PlaylistObject): PlaylistItemsPage | undefined {
  return pl.items ?? pl.tracks;
}

function itemTrack(row: SpotifyPlaylistItem): SpotifyTrackItem | null {
  const t = row.item ?? row.track ?? null;
  if (!t || !t.id || (t as { type?: string }).type === 'episode') return null;
  return t;
}

/**
 * Fetch playlist tracks via the parent GET /playlists/{id} object (the `/tracks`
 * sub-endpoint returns 403 for Development Mode apps). The parent object embeds the first
 * 100 tracks, which is exactly what we need per persona.
 */
async function fetchPlaylistTracks(sessionId: string, playlistId: string): Promise<SpotifyTrackItem[]> {
  const collected: SpotifyTrackItem[] = [];
  const pl = await api<PlaylistObject>(sessionId, `/playlists/${playlistId}`, { market: MARKET });
  const page = pageFrom(pl);
  for (const row of page?.items ?? []) {
    const t = itemTrack(row);
    if (t) collected.push(t);
    if (collected.length >= TARGET_TRACKS) break;
  }
  return collected;
}

async function fetchArtistTopTracks(sessionId: string, artistId: string): Promise<SpotifyTrackItem[]> {
  try {
    const data = await api<{ tracks: SpotifyTrackItem[] }>(
      sessionId,
      `/artists/${normalizeSpotifyId(artistId)}/top-tracks`,
      { market: MARKET },
    );
    return data.tracks ?? [];
  } catch {
    return [];
  }
}

async function searchTracksByGenre(sessionId: string, genre: string, limit: number, offset: number): Promise<SpotifyTrackItem[]> {
  try {
    const data = await api<{ tracks: { items: SpotifyTrackItem[] } }>(sessionId, '/search', {
      q: `genre:"${genre}"`,
      type: 'track',
      limit: String(Math.min(limit, PAGE_SIZE)),
      offset: String(offset),
      market: MARKET,
    });
    return data.tracks?.items ?? [];
  } catch {
    return [];
  }
}

async function fetchArtists(sessionId: string, artistIds: string[]): Promise<Map<string, SpotifyArtistFull>> {
  const map = new Map<string, SpotifyArtistFull>();
  const validIds = [...new Set(artistIds.map(normalizeSpotifyId).filter(Boolean))];
  for (let i = 0; i < validIds.length; i += ARTIST_BATCH_SIZE) {
    const chunk = validIds.slice(i, i + ARTIST_BATCH_SIZE).slice(0, 50);
    try {
      const data = await api<{ artists: (SpotifyArtistFull | null)[] }>(sessionId, '/artists', {
        ids: chunk.join(','),
      });
      for (const artist of data.artists ?? []) {
        if (artist?.id) map.set(artist.id, artist);
      }
    } catch (err) {
      console.warn(`  ! artist batch failed:`, (err as Error).message);
    }
  }
  return map;
}

function addTracks(
  raw: SpotifyTrackItem[],
  tracks: GhostTrack[],
  seen: Set<string>,
  artistCounts: Map<string, { name: string; count: number }>,
): void {
  for (const item of raw) {
    const gt = toGhostTrack(item);
    if (!gt || seen.has(gt.id)) continue;
    seen.add(gt.id);
    tracks.push(gt);
    for (const aid of gt.artistIds ?? []) {
      const name = gt.artist.split(',')[0]?.trim() ?? gt.artist;
      const entry = artistCounts.get(aid) ?? { name, count: 0 };
      entry.count += 1;
      artistCounts.set(aid, entry);
    }
  }
}

/** Hydrate via artist top-tracks + genre search (works with client credentials). */
async function hydrateFromArtistsAndSearch(sessionId: string, seed: PersonaSeed): Promise<GhostTrack[]> {
  const tracks: GhostTrack[] = [];
  const seen = new Set<string>();
  const artistCounts = new Map<string, { name: string; count: number }>();

  console.log('  using artist top-tracks + genre search (playlist blocked for client credentials)');
  for (const artistId of seed.seedArtistIds) {
    if (tracks.length >= TARGET_TRACKS) break;
    const top = await fetchArtistTopTracks(sessionId, artistId);
    addTracks(top, tracks, seen, artistCounts);
  }
  console.log(`  ${tracks.length} tracks from seed artists`);

  for (const genre of seed.fallbackGenres) {
    if (tracks.length >= TARGET_TRACKS) break;
    for (let offset = 0; offset < 50 && tracks.length < TARGET_TRACKS; offset += PAGE_SIZE) {
      const found = await searchTracksByGenre(sessionId, genre, PAGE_SIZE, offset);
      if (!found.length) break;
      addTracks(found, tracks, seen, artistCounts);
    }
  }
  console.log(`  ${tracks.length} tracks after genre search`);

  return tracks.slice(0, TARGET_TRACKS);
}

async function buildPersona(sessionId: string, seed: PersonaSeed): Promise<GhostProfile> {
  console.log(`\n→ ${seed.displayName}`);
  const artistCounts = new Map<string, { name: string; count: number }>();
  let tracks: GhostTrack[] = [];

  if (seed.playlistId) {
    try {
      const raw = await fetchPlaylistTracks(sessionId, seed.playlistId);
      const seen = new Set<string>();
      console.log(`  playlist ${seed.playlistId}: ${raw.length} tracks`);
      addTracks(raw, tracks, seen, artistCounts);
    } catch (err) {
      console.warn(`  playlist blocked (${(err as Error).message.slice(0, 60)}…)`);
    }
  }

  if (tracks.length < 20) {
    tracks = await hydrateFromArtistsAndSearch(sessionId, seed);
    for (const t of tracks) {
      for (const aid of t.artistIds ?? []) {
        const name = t.artist.split(',')[0]?.trim() ?? t.artist;
        const entry = artistCounts.get(aid) ?? { name, count: 0 };
        entry.count += 1;
        artistCounts.set(aid, entry);
      }
    }
  }

  const uniqueArtistIds = [...new Set([
    ...artistCounts.keys(),
    ...seed.seedArtistIds.map(normalizeSpotifyId),
  ])];
  const artistDetails = await fetchArtists(sessionId, uniqueArtistIds);

  for (const id of seed.seedArtistIds.map(normalizeSpotifyId)) {
    const detail = artistDetails.get(id);
    if (detail && !artistCounts.has(id)) {
      artistCounts.set(id, { name: detail.name, count: 1 });
    }
  }

  const topArtists = [...artistCounts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, 15)
    .map(([id, { name }]) => {
      const detail = artistDetails.get(id);
      return { id, name: detail?.name ?? name, imageUrl: detail?.images?.[0]?.url ?? seed.avatarUrl };
    });

  const genreFreq = new Map<string, number>();
  for (const detail of artistDetails.values()) {
    for (const g of cleanGenres(detail.genres ?? [])) {
      genreFreq.set(g, (genreFreq.get(g) ?? 0) + 1);
    }
  }
  const realGenres = [...genreFreq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([g]) => g);
  const genres = realGenres.length >= 3 ? realGenres : cleanGenres([...realGenres, ...seed.fallbackGenres]);

  console.log(`  ✓ ${tracks.length} tracks · ${topArtists.length} top artists · genres: ${genres.join(', ')}`);

  return {
    id: seed.id,
    displayName: seed.displayName,
    tagline: seed.tagline,
    avatarUrl: seed.avatarUrl,
    vector: seed.vector,
    genres,
    tracks,
    topArtists,
  };
}

async function main(): Promise<void> {
  console.log('MusicMixer — Ghost Persona hydration');
  const sessionId = BEARER_TOKEN ? '' : getSessionId();
  console.log(BEARER_TOKEN ? '→ using pasted SPOTIFY_BEARER_TOKEN' : '→ using logged-in user session');
  const me = await api<{ display_name: string }>(sessionId, '/me');
  console.log(`✓ Spotify auth OK (${me.display_name})`);

  const profiles: GhostProfile[] = [];
  for (const seed of PERSONAS) {
    try {
      profiles.push(await buildPersona(sessionId, seed));
    } catch (err) {
      console.error(`✗ ${seed.displayName} failed:`, (err as Error).message);
    }
  }

  if (profiles.length === 0) {
    throw new Error('No personas were generated — aborting write.');
  }

  const totalTracks = profiles.reduce((sum, p) => sum + p.tracks.length, 0);
  if (totalTracks === 0) {
    throw new Error('All personas have 0 tracks — aborting write to avoid clobbering existing data.');
  }

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(profiles, null, 2));
  console.log(`\n✓ wrote ${profiles.length} personas → ${OUTPUT_PATH}`);
  for (const p of profiles) {
    console.log(`  ${p.displayName}: ${p.tracks.length} tracks, ${p.topArtists.length} artists`);
  }
}

main().catch((err) => {
  console.error('\nFatal:', err);
  process.exit(1);
});
