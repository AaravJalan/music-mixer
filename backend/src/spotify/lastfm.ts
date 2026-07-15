/**
 * Last.fm API integration — genre tag resolution.
 *
 * Endpoints used:
 *   track.getTopTags  → genres for a specific track
 *   artist.getTopTags → genres for an artist (fallback)
 *
 * Requires LASTFM_API_KEY in env. When absent, all calls return [].
 */

import { env } from '../config/env';
import { isValidMicroGenre } from './genreMapper';

const LASTFM_BASE = 'https://ws.audioscrobbler.com/2.0/';
const TIMEOUT_MS = 8_000;

interface LastfmTag {
  name: string;
  count?: number | string;
  url?: string;
}

interface LastfmTagsResponse {
  toptags?: { tag?: LastfmTag[] };
  error?: number;
  message?: string;
}

export interface LastfmSimilarTrack {
  name: string;
  artist: { name: string };
  match: number;
}

export interface LastfmSimilarArtist {
  name: string;
  match: number;
}

export interface LastfmTagTrack {
  name: string;
  artist: { name: string };
}

function buildUrl(params: Record<string, string>): string {
  const u = new URL(LASTFM_BASE);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

async function fetchWithTimeout<T = any>(url: string): Promise<T | { error: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return { error: res.status };
    return (await res.json()) as T;
  } catch {
    return { error: 500 };
  } finally {
    clearTimeout(timer);
  }
}

function parseTags(data: LastfmTagsResponse, artistName: string): string[] {
  const normalizedArtist = artistName.toLowerCase().trim();
  const tags = data.toptags?.tag ?? [];
  return tags
    .map((t) => t.name?.toLowerCase().trim())
    .filter((name): name is string =>
      Boolean(name) &&
      name !== normalizedArtist &&
      isValidMicroGenre(name)
    )
    .slice(0, 6);
}

/**
 * Fetch track-level top tags from Last.fm.
 * Returns mapped parent genres, or [] on any error / missing key.
 */
export async function fetchTrackTags(artist: string, track: string): Promise<string[]> {
  if (!env.lastfmApiKey) return [];
  const url = buildUrl({
    method: 'track.getTopTags',
    artist,
    track,
    api_key: env.lastfmApiKey,
    format: 'json',
    autocorrect: '1',
  });
  const data = await fetchWithTimeout<LastfmTagsResponse>(url);
  if ('error' in data && data.error) return [];
  return parseTags(data as LastfmTagsResponse, artist);
}

/**
 * Fetch artist-level top tags from Last.fm.
 * Returns mapped parent genres, or [] on any error / missing key.
 */
export async function fetchArtistTags(artist: string): Promise<string[]> {
  if (!env.lastfmApiKey) return [];
  const url = buildUrl({
    method: 'artist.getTopTags',
    artist,
    api_key: env.lastfmApiKey,
    format: 'json',
    autocorrect: '1',
  });
  const data = await fetchWithTimeout<LastfmTagsResponse>(url);
  if ('error' in data && data.error) return [];
  return parseTags(data, artist);
}

export async function fetchSimilarTracks(artist: string, track: string, limit = 20): Promise<LastfmSimilarTrack[]> {
  if (!env.lastfmApiKey) return [];
  const url = buildUrl({
    method: 'track.getsimilar',
    artist,
    track,
    limit: limit.toString(),
    api_key: env.lastfmApiKey,
    format: 'json',
    autocorrect: '1',
  });
  const data = await fetchWithTimeout<any>(url);
  if ('error' in data && data.error) return [];
  return data.similartracks?.track ?? [];
}

export async function fetchSimilarArtists(artist: string, limit = 5): Promise<LastfmSimilarArtist[]> {
  if (!env.lastfmApiKey) return [];
  const url = buildUrl({
    method: 'artist.getsimilar',
    artist,
    limit: limit.toString(),
    api_key: env.lastfmApiKey,
    format: 'json',
    autocorrect: '1',
  });
  const data = await fetchWithTimeout<any>(url);
  if ('error' in data && data.error) return [];
  return data.similarartists?.artist ?? [];
}

export async function fetchTopTracksForTag(tag: string, limit = 50): Promise<LastfmTagTrack[]> {
  if (!env.lastfmApiKey) return [];
  const url = buildUrl({
    method: 'tag.gettoptracks',
    tag,
    limit: limit.toString(),
    api_key: env.lastfmApiKey,
    format: 'json',
  });
  const data = await fetchWithTimeout<any>(url);
  if ('error' in data && data.error) return [];
  return data.tracks?.track ?? [];
}
