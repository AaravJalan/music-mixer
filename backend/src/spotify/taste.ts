import type { AudioFeatureVector, GenreStat, TasteTimeRange } from '@music-mixer/shared';
import { SPOTIFY_TOP_TRACKS_LIMIT } from '@music-mixer/shared';
import { aggregateWeightedGenres } from '../math/genres';
import { computeWeightedTasteVector, type WeightedGenre } from './genreModel';
import { getCachedArtistGenres, setCachedArtistGenres } from '../lib/cache';
import { inferGenresFromArtistName, inferGenresFromText } from './inference';
import { spotifyFetch } from './client';
import { fetchTopTracks, resolveSpotifyTimeRange, type TopTrack } from './tracks';



interface SpotifyArtist {
  id: string;
  name: string;
  genres?: string[] | null;
  images?: { url: string }[];
}

interface SpotifyTopArtistsResponse {
  items: SpotifyArtist[];
}

interface SpotifyArtistsBatchResponse {
  artists: (SpotifyArtist | null)[];
}

/** Batch-hydrate artist details (images + genres) from `/artists?ids=`. */
async function fetchArtistsBatch(
  sessionId: string,
  ids: string[],
): Promise<Map<string, SpotifyArtist>> {
  const map = new Map<string, SpotifyArtist>();
  const validIds = [...new Set(ids.filter((id) => id && id.length > 0))];

  for (let i = 0; i < validIds.length; i += 50) {
    const batch = validIds.slice(i, i + 50);
    try {
      const data = await spotifyFetch<SpotifyArtistsBatchResponse>(sessionId, '/artists', {
        ids: batch.join(','),
      });
      for (const artist of data.artists ?? []) {
        if (artist?.id) map.set(artist.id, artist);
      }
    } catch (e) {
      console.error(`Failed to fetch artist batch: ${e}`);
      // skip failed batch — placeholders will render
    }
  }

  return map;
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

/** Rate-limited artist detail fetch — only top N artists. */
async function enrichArtistGenres(
  sessionId: string,
  artists: SpotifyArtist[],
): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();

  for (const artist of artists) {
    const fromList = safeGenres(artist.genres);
    const inferred = inferGenresFromArtistName(artist.name);
    if (fromList.length > 0) {
      map.set(artist.id, fromList);
    } else if (inferred.length > 0) {
      map.set(artist.id, inferred);
    }
  }

  const needsFetch = artists.filter((a) => !map.has(a.id) || map.get(a.id)!.length === 0);

  if (needsFetch.length > 0) {
    // Check Redis cache first for all missing artists
    const cachedResults = await Promise.all(
      needsFetch.map(async (artist) => ({
        artist,
        genres: await getCachedArtistGenres(artist.id)
      }))
    );

    const stillNeedsFetch: SpotifyArtist[] = [];
    for (const { artist, genres } of cachedResults) {
      if (genres && genres.length > 0) {
        map.set(artist.id, genres);
      } else {
        stillNeedsFetch.push(artist);
      }
    }

    if (stillNeedsFetch.length > 0) {
      // Fetch remaining from Spotify in batches of 50
      const fetchedMap = await fetchArtistsBatch(sessionId, stillNeedsFetch.map((a) => a.id));
      
      // Save to map and Redis cache
      for (const artist of stillNeedsFetch) {
        const detail = fetchedMap.get(artist.id);
        const apiGenres = safeGenres(detail?.genres);
        if (apiGenres.length > 0) {
          map.set(artist.id, apiGenres);
          await setCachedArtistGenres(artist.id, artist.name, apiGenres);
        }
      }
    }
  }

  // Fallback to inference for any that still have no genres
  for (const artist of artists) {
    if (!map.has(artist.id) || map.get(artist.id)!.length === 0) {
      map.set(artist.id, inferGenresFromArtistName(artist.name));
    }
  }

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

function supplementFromTracks(
  tracks: TopTrack[],
  artistGenreMap: Map<string, string[]>,
  weighted: WeightedGenre[],
): WeightedGenre[] {
  const result = [...weighted];

  for (let i = 0; i < tracks.length; i++) {
    const track = tracks[i];
    const w = rankWeight(i, tracks.length) * 0.5;
    const trackGenres = inferGenresFromText(track.name, track.artist);

    for (const genre of trackGenres) {
      result.push({ genre, weight: w });
    }

    for (const artistId of track.artistIds) {
      if (!artistGenreMap.has(artistId) || artistGenreMap.get(artistId)!.length === 0) {
        const inferred = inferGenresFromText(track.artist, track.name);
        if (inferred.length > 0) artistGenreMap.set(artistId, inferred);
      }
      const genres = artistGenreMap.get(artistId) ?? inferGenresFromText(track.artist);
      for (const genre of genres) {
        result.push({ genre, weight: w * 0.5 });
      }
    }
  }

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

export async function buildUserTasteProfile(
  sessionId: string,
  timeRange: TasteTimeRange = 'medium_term',
  genreDisplayLimit = 15,
): Promise<UserTasteProfile> {
  let tracks: TopTrack[];
  let artists: SpotifyArtist[];

  if (timeRange === 'year_to_date') {
    // YTD artists are derived from the ranked track list, so tracks must resolve first.
    tracks = await fetchTopTracks(sessionId, timeRange);
    const derived = artistsFromTracks(tracks);
    const details = await fetchArtistsBatch(sessionId, derived.map((a) => a.id));
    artists = derived.map((a) => {
      const detail = details.get(a.id);
      if (!detail) return a;
      return {
        ...a,
        images: detail.images ?? a.images,
        genres: safeGenres(detail.genres).length > 0 ? detail.genres : a.genres,
      };
    });
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
  }

  const artistGenreMap = await enrichArtistGenres(sessionId, artists);

  let weightedGenres = collectWeightedGenres(artists, artistGenreMap);
  weightedGenres = supplementFromTracks(tracks, artistGenreMap, weightedGenres);

  const vector = computeWeightedTasteVector(weightedGenres);
  const genres = aggregateWeightedGenres(weightedGenres, genreDisplayLimit);

  const profileArtists: ProfileArtist[] = artists.map((a) => ({
    id: a.id,
    name: a.name,
    imageUrl: a.images?.[0]?.url ?? '',
    genres: a.genres ?? [],
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
