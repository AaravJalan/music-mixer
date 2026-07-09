import { fetchWithRetry } from '../../utils/fetch';
import { getValidAccessToken } from '../session/manager';
import { SPOTIFY_API_BASE } from '../../config/spotify';

export class SpotifyApiError extends Error {
  constructor(
    message: string,
    public status: number,
    /** Seconds Spotify asked us to wait, from the Retry-After header (429 only). */
    public retryAfterSeconds?: number,
  ) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Only auto-retry short, transient throttles inline; longer bans fail fast to the caller. */
const MAX_INLINE_RETRY_AFTER_S = 5;

export async function spotifyFetch<T>(
  sessionId: string,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  const accessToken = await getValidAccessToken(sessionId);
  if (!accessToken) {
    throw new SpotifyApiError('Session expired — please log in again', 401);
  }

  const url = new URL(`${SPOTIFY_API_BASE}${path}`);
  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await fetchWithRetry(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (res.status === 429) {
      const retryAfter = Number(res.headers.get('Retry-After') ?? '1');
      // A large Retry-After means we've been put in a penalty box (can be hours). Retrying
      // inline is pointless and keeps the ban alive — fail fast and let the caller back off.
      if (retryAfter > MAX_INLINE_RETRY_AFTER_S) {
        throw new SpotifyApiError('Rate limited', 429, retryAfter);
      }
      await wait(retryAfter * 1000);
      lastError = new SpotifyApiError('Rate limited', 429, retryAfter);
      continue;
    }

    if (!res.ok) {
      const body = await res.text();
      throw new SpotifyApiError(`Spotify API ${path} failed: ${body}`, res.status);
    }

    return res.json() as Promise<T>;
  }

  throw lastError instanceof Error ? lastError : new SpotifyApiError('Rate limited', 429);
}
