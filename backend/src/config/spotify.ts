export const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

/** Scopes for taste collision: profile + top tracks (audio features use client credentials or user token). */
export const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-read-recently-played',
].join(' ');
