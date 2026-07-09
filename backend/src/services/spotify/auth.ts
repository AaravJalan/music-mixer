import { env } from '../../config/env';
import { SPOTIFY_TOKEN_URL, SPOTIFY_API_BASE } from '../../config/spotify';
import type { UserProfile } from '@music-mixer/shared';
import { fetchWithRetry } from '../../utils/fetch';

export interface SpotifyTokenResponse {
  access_token: string;
  token_type: string;
  scope: string;
  expires_in: number;
  refresh_token?: string;
}

interface SpotifyUserResponse {
  id: string;
  display_name: string;
  images: { url: string }[];
}

export async function getClientCredentialsToken(): Promise<string> {
  const credentials = Buffer.from(
    `${env.spotify.clientId()}:${env.spotify.clientSecret()}`,
  ).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'client_credentials',
  });

  const res = await fetchWithRetry(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify client credentials exchange failed: ${err}`);
  }

  const data = await res.json() as SpotifyTokenResponse;
  return data.access_token;
}


export async function exchangeCodeForTokens(code: string): Promise<SpotifyTokenResponse> {
  const credentials = Buffer.from(
    `${env.spotify.clientId()}:${env.spotify.clientSecret()}`,
  ).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: env.spotify.redirectUri(),
  });

  const res = await fetchWithRetry(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify token exchange failed: ${err}`);
  }

  return res.json() as Promise<SpotifyTokenResponse>;
}

export async function refreshAccessToken(refreshToken: string): Promise<SpotifyTokenResponse> {
  const credentials = Buffer.from(
    `${env.spotify.clientId()}:${env.spotify.clientSecret()}`,
  ).toString('base64');

  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetchWithRetry(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify token refresh failed: ${err}`);
  }

  return res.json() as Promise<SpotifyTokenResponse>;
}

export async function fetchSpotifyProfile(accessToken: string): Promise<UserProfile> {
  const res = await fetchWithRetry(`${SPOTIFY_API_BASE}/me`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Spotify profile fetch failed: ${err}`);
  }

  const data = (await res.json()) as SpotifyUserResponse;

  return {
    id: data.id,
    displayName: data.display_name || 'Spotify User',
    avatarUrl:
      data.images[0]?.url ??
      `https://api.dicebear.com/7.x/initials/svg?seed=${encodeURIComponent(data.display_name || data.id)}`,
    platform: 'spotify',
  };
}

export function buildAuthorizeUrl(state: string, showDialog = false): string {
  const params = new URLSearchParams({
    client_id: env.spotify.clientId(),
    response_type: 'code',
    redirect_uri: env.spotify.redirectUri(),
    scope: 'user-read-private user-read-email user-top-read playlist-modify-private',
    state,
  });

  if (showDialog) {
    params.set('show_dialog', 'true');
  }

  return `https://accounts.spotify.com/authorize?${params}`;
}
