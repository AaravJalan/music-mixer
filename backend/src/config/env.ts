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

export const env = {
  port: parseInt(optional('PORT', '3001'), 10),
  nodeEnv: optional('NODE_ENV', 'development'),
  frontendUrl: optional('FRONTEND_URL', 'http://127.0.0.1:5173'),
  spotify: {
    clientId: () => required('SPOTIFY_CLIENT_ID'),
    clientSecret: () => required('SPOTIFY_CLIENT_SECRET'),
    redirectUri: () => required('SPOTIFY_REDIRECT_URI'),
  },
  isProd: optional('NODE_ENV', 'development') === 'production',
};

export function isSpotifyConfigured(): boolean {
  return Boolean(
    process.env.SPOTIFY_CLIENT_ID &&
    process.env.SPOTIFY_CLIENT_SECRET &&
    process.env.SPOTIFY_REDIRECT_URI,
  );
}
