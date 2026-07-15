import { config } from 'dotenv';
import path from 'path';

config({ path: path.resolve(__dirname, '../../.env') });
config({ path: path.resolve(__dirname, '../../../.env') });

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] ?? fallback;
}

export const SPOTIFY_AUTH_URL = 'https://accounts.spotify.com/authorize';
export const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token';
export const SPOTIFY_API_BASE = 'https://api.spotify.com/v1';

export const SPOTIFY_SCOPES = [
  'user-read-private',
  'user-read-email',
  'user-top-read',
  'user-read-recently-played',
].join(' ');

export const env = {
  port: parseInt(optional('PORT', '3001'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  frontendUrl: optional('FRONTEND_URL', 'http://127.0.0.1:5173'),
  spotify: {
    clientId: () => required('SPOTIFY_CLIENT_ID'),
    clientSecret: () => required('SPOTIFY_CLIENT_SECRET'),
    redirectUri: () => required('SPOTIFY_REDIRECT_URI'),
  },
  redis: {
    url: () => required('UPSTASH_REDIS_REST_URL'),
    token: () => required('UPSTASH_REDIS_REST_TOKEN'),
  },
  lastfmApiKey: optional('LASTFM_API_KEY', ''),
  isProd: optional('NODE_ENV', 'development') === 'production',
};

export function isSpotifyConfigured(): boolean {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID &&
    process.env.SPOTIFY_CLIENT_SECRET &&
    process.env.SPOTIFY_REDIRECT_URI,
  );
}

export function isRedisConfigured(): boolean {
  return Boolean(
    process.env.UPSTASH_REDIS_REST_URL &&
    process.env.UPSTASH_REDIS_REST_TOKEN,
  );
}
