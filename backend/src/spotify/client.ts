import { fetchWithRetry } from '../lib/fetch';
import { getValidAccessToken } from '../services/session';
import { SPOTIFY_API_BASE } from '../config/env';
import { redis } from '../services/redis/client';

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

/** Redis key for the cross-instance circuit breaker lock. */
const API_LOCK_KEY = 'status:api_lock';

/**
 * TTL applied to the circuit breaker on a 403 (forbidden / app-level ban).
 * A 403 is typically a short-lived app-level block, so 60 s is a conservative default.
 */
const FORBIDDEN_LOCK_TTL_S = 60;

export async function spotifyFetch<T>(
  sessionId: string,
  path: string,
  params?: Record<string, string>,
): Promise<T> {
  // ── Circuit breaker check (shared across all Lambda instances via Redis) ────
  const isLocked = await redis.exists(API_LOCK_KEY);
  if (isLocked) {
    throw new SpotifyApiError('Spotify API is temporarily locked — please try again shortly', 503);
  }

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
      // inline is pointless and keeps the ban alive — trip the breaker and fail fast.
      if (retryAfter > MAX_INLINE_RETRY_AFTER_S) {
        await redis.set(API_LOCK_KEY, 'locked', { ex: retryAfter });
        throw new SpotifyApiError('Rate limited', 429, retryAfter);
      }
      await wait(retryAfter * 1000);
      lastError = new SpotifyApiError('Rate limited', 429, retryAfter);
      continue;
    }

    if (res.status === 403) {
      // App-level ban — lock all instances for a short cooling-off period.
      await redis.set(API_LOCK_KEY, 'locked', { ex: FORBIDDEN_LOCK_TTL_S });
      const body = await res.text();
      throw new SpotifyApiError(`Spotify API ${path} forbidden: ${body}`, 403);
    }

    if (!res.ok) {
      const body = await res.text();
      throw new SpotifyApiError(`Spotify API ${path} failed: ${body}`, res.status);
    }

    return res.json() as Promise<T>;
  }

  throw lastError instanceof Error ? lastError : new SpotifyApiError('Rate limited', 429);
}
