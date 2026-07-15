import type { AudioFeatureVector, GenreStat, TasteTimeRange } from '@music-mixer/shared';
import { SPOTIFY_TOP_TRACKS_LIMIT } from '@music-mixer/shared';
import { aggregateWeightedGenres } from '../analytics/genres';
import { computeWeightedTasteVector, type WeightedGenre } from './genreModel';
import {
  getCachedArtistGenres,
  setCachedArtistGenres,
  getCachedLastfmTrackGenres,
  setCachedLastfmTrackGenres,
  getCachedLastfmArtistGenres,
  setCachedLastfmArtistGenres,
} from '../lib/cache';
import { inferGenresFromArtistName, inferGenresFromText } from './inference';
import { fetchTrackTags, fetchArtistTags } from '../spotify/lastfm';
import { spotifyFetch } from '../spotify/client';
import { fetchTopTracks, resolveSpotifyTimeRange, type TopTrack } from '../spotify/tracks';

const PROFILE_CACHE_TTL = 5 * 60 * 1000;
const profileCache = new Map<string, { at: number; promise: Promise<UserTasteProfile> }>();


interface SpotifyArtist {
  id: string;
  name: string;
  genres?: string[] | null;
  images?: { url: string }[];
}

interface SpotifyTopArtistsResponse {
  items: SpotifyArtist[];
}


/**
 * Waterfall metadata resolver for a single artist (+ optional track).
 *
 * Priority:
 *   a) Redis: genres:track:<artist>:<track>
 *   b) Redis: genres:artist:<artist>
 *   c) Last.fm track.getTopTags  → cache 14d
 *   d) Last.fm artist.getTopTags → cache 30d
 *   e) Lexical inference (regex + known-artist map)
 *   f) ['Pop'] baseline
 */
async function resolveMetadata(artistName: string, trackName?: string): Promise<string[]> {
  const artist = artistName.toLowerCase().trim();

  // a) Track-level Redis hit
  if (trackName) {
    const cached = await getCachedLastfmTrackGenres(artist, trackName);
    if (cached && cached.length > 0) return cached;
  }

  // b) Artist-level Redis hit
  const cachedArtist = await getCachedLastfmArtistGenres(artist);
  if (cachedArtist && cachedArtist.length > 0) return cachedArtist;

  // c) Last.fm track tags
  if (trackName) {
    const trackGenres = await fetchTrackTags(artist, trackName);
    if (trackGenres.length > 0) {
      await setCachedLastfmTrackGenres(artist, trackName, trackGenres);
      return trackGenres;
    }
  }

  // d) Last.fm artist tags
  const artistGenres = await fetchArtistTags(artist);
  if (artistGenres.length > 0) {
    await setCachedLastfmArtistGenres(artist, artistGenres);
    return artistGenres;
  }

  // e) Lexical inference
  const inferred = trackName
    ? inferGenresFromText(artistName, trackName)
    : inferGenresFromArtistName(artistName);
  if (inferred.length > 0) return inferred;

  // f) Baseline
  return ['Pop'];
}


export interface ProfileArtist {
  id: string;
  name: string;
  imageUrl: string;
  genres?: string[];
}

export interface UserTasteProfile {
  vector: AudioFeatureVector;
  genres: GenreStat[];
  tracks: TopTrack[];
  artists: ProfileArtist[];
  weightedGenres: WeightedGenre[];
  artistGenreMap: Map<string, string[]>;
  totalArtists: number;
  totalTracks: number;
  usedEstimatedFeatures: true;
}

function safeGenres(genres: string[] | null | undefined): string[] {
  if (!genres || !Array.isArray(genres)) return [];
  return genres.filter((g) => typeof g === 'string' && g.length > 0);
}

function rankWeight(rankIndex: number, total: number): number {
  return Math.max(1, total - rankIndex);
}

/**
 * Enrich artist genre map.
 *
 * Resolution order per artist:
 *   1. Genres already attached to the Spotify artist object (from /me/top/artists)
 *   2. Redis artist_genres cache (legacy Spotify batch cache)
 *   3. resolveMetadata waterfall (Last.fm → inference → baseline)
 */
async function enrichArtistGenres(
  _sessionId: string,
  artists: SpotifyArtist[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();

  // 1. Use any genres Spotify already returned on the top-artists endpoint
  for (const artist of artists) {
    const fromList = safeGenres(artist.genres);
    if (fromList.length > 0) {
      map.set(artist.id, fromList);
    }
  }

  // 2. Check legacy artist_genres Redis cache for artists still missing
  const stillMissing = artists.filter((a) => !map.has(a.id));
  await Promise.all(
    stillMissing.map(async (artist) => {
      const cached = await getCachedArtistGenres(artist.id);
      if (cached && cached.length > 0) map.set(artist.id, cached);
    }),
  );

  // 3. Waterfall resolution for anything still unresolved
  const needsWaterfall = artists.filter((a) => !map.has(a.id));
  await Promise.all(
    needsWaterfall.map(async (artist) => {
      const genres = await resolveMetadata(artist.name);
      map.set(artist.id, genres);
      // Backfill legacy cache so subsequent builds skip the waterfall
      await setCachedArtistGenres(artist.id, artist.name, genres);
    }),
  );

  return map;
}

function collectWeightedGenres(
  artists: SpotifyArtist[],
  artistGenreMap: Map<string, string[]>,
): WeightedGenre[] {
  const weighted: WeightedGenre[] = [];
  const total = artists.length || 1;

  for (let i = 0; i < artists.length; i++) {
    const artist = artists[i];
    const genres = artistGenreMap.get(artist.id) ?? inferGenresFromArtistName(artist.name);
    const w = rankWeight(i, total);
    for (const genre of genres) {
      weighted.push({ genre, weight: w });
    }
  }

  return weighted;
}

async function supplementFromTracks(
  tracks: TopTrack[],
  artistGenreMap: Map<string, string[]>,
  weighted: WeightedGenre[],
  topArtistIds: Set<string>,
): Promise<WeightedGenre[]> {
  const result = [...weighted];

  await Promise.all(
    tracks.map(async (track, i) => {
      const w = rankWeight(i, tracks.length) * 0.2;

      // Use waterfall for track-level genre signal
      const trackGenres = await resolveMetadata(track.artist, track.name);
      for (const genre of trackGenres) result.push({ genre, weight: w });

      for (const artistId of track.artistIds) {
        if (!artistGenreMap.has(artistId) || artistGenreMap.get(artistId)!.length === 0) {
          const resolved = await resolveMetadata(track.artist, track.name);
          if (resolved.length > 0) artistGenreMap.set(artistId, resolved);
        }

        // Only supplement artist genres for artists not already in top-100
        if (!topArtistIds.has(artistId)) {
          const genres = artistGenreMap.get(artistId) ?? await resolveMetadata(track.artist);
          for (const genre of genres) result.push({ genre, weight: w });
        }
      }
    }),
  );

  return result;
}

import { normalizeSpotifyId } from '@music-mixer/shared';

function artistsFromTracks(tracks: TopTrack[]): SpotifyArtist[] {
  const counts = new Map<string, { name: string; count: number; fallbackImage: string }>();

  for (const track of tracks) {
    track.artistIds.forEach((rawId, index) => {
      const id = normalizeSpotifyId(rawId);
      const name = track.artist.split(', ')[index] ?? track.artist;
      const entry = counts.get(id) ?? { name, count: 0, fallbackImage: track.albumArtUrl };
      entry.count += 1;
      counts.set(id, entry);
    });
  }

  return [...counts.entries()]
    .sort((a, b) => b[1].count - a[1].count)
    .slice(0, SPOTIFY_TOP_TRACKS_LIMIT)
    .map(([id, { name, fallbackImage }]) => ({ 
      id, 
      name, 
      genres: null, 
      images: fallbackImage ? [{ url: fallbackImage }] : [] as any[] 
    }));
}

const sessionLocks = new Map<string, Promise<any>>();

export function buildUserTasteProfile(
  sessionId: string,
  timeRange: TasteTimeRange = 'medium_term',
  genreDisplayLimit = 50,
): Promise<UserTasteProfile> {
  const cacheKey = `${sessionId}:${timeRange}`;
  const cached = profileCache.get(cacheKey);
  if (cached && Date.now() - cached.at < PROFILE_CACHE_TTL) {
    return cached.promise;
  }
  
  const lock = sessionLocks.get(sessionId) || Promise.resolve();
  const promise = lock.then(() => doBuildUserTasteProfile(sessionId, timeRange, genreDisplayLimit));
  
  sessionLocks.set(sessionId, promise.catch(() => {}));
  profileCache.set(cacheKey, { at: Date.now(), promise });
  
  promise.catch(() => profileCache.delete(cacheKey));
  
  return promise;
}

async function doBuildUserTasteProfile(
  sessionId: string,
  timeRange: TasteTimeRange = 'medium_term',
  genreDisplayLimit = 15,
): Promise<UserTasteProfile> {
  let tracks: TopTrack[];
  let artists: SpotifyArtist[];

  if (timeRange === 'year_to_date') {
    // YTD: derive artists directly from tracks (album art already set as fallbackImage)
    tracks = await fetchTopTracks(sessionId, timeRange);
    artists = artistsFromTracks(tracks);
  } else {
    // Concurrency fix: fetch this user's Top Tracks and Top Artists at the same time
    // (they are independent) to cut collision latency roughly in half.
    const [fetchedTracks, artistPage1, artistPage2] = await Promise.all([
      fetchTopTracks(sessionId, timeRange),
      spotifyFetch<SpotifyTopArtistsResponse>(sessionId, '/me/top/artists', {
        limit: '50',
        offset: '0',
        time_range: resolveSpotifyTimeRange(timeRange),
      }).catch(() => ({ items: [] as SpotifyArtist[] })),
      spotifyFetch<SpotifyTopArtistsResponse>(sessionId, '/me/top/artists', {
        limit: '50',
        offset: '50',
        time_range: resolveSpotifyTimeRange(timeRange),
      }).catch(() => ({ items: [] as SpotifyArtist[] })),
    ]);

    tracks = fetchedTracks;

    const items = [...(artistPage1.items ?? []), ...(artistPage2.items ?? [])];
    const seen = new Set<string>();
    artists = items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });

    if (artists.length < 100 && tracks.length > 0) {
      const derived = artistsFromTracks(tracks);
      const missing = derived.filter((d) => !seen.has(d.id));
      const needed = 100 - artists.length;
      const toFetch = missing.slice(0, needed);
      
      // Pad with track-derived artists (album art already set as fallbackImage)
      if (toFetch.length > 0) {
        artists.push(...toFetch);
      }
    }
  }

  const artistGenreMap = await enrichArtistGenres(sessionId, artists);

  let weightedGenres = collectWeightedGenres(artists, artistGenreMap);
  const topArtistIds = new Set(artists.map((a) => a.id));
  weightedGenres = await supplementFromTracks(tracks, artistGenreMap, weightedGenres, topArtistIds);

  const vector = computeWeightedTasteVector(weightedGenres);
  const genres = aggregateWeightedGenres(weightedGenres, genreDisplayLimit);

  const profileArtists: ProfileArtist[] = artists.map((a) => ({
    id: a.id,
    name: a.name,
    imageUrl: a.images?.[0]?.url ?? '',
    genres: (a.genres && a.genres.length > 0) ? a.genres : (artistGenreMap.get(a.id) ?? []),
  }));

  return {
    vector,
    genres,
    tracks,
    artists: profileArtists,
    weightedGenres,
    artistGenreMap,
    totalArtists: artists.length,
    totalTracks: tracks.length,
    usedEstimatedFeatures: true,
  };
}
