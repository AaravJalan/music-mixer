import type { UserProfile } from '@music-mixer/shared';
import { v4 as uuidv4 } from 'uuid';
import { refreshAccessToken } from '../spotify/auth';
import { redis } from './redis/client';

export interface SessionData {
  user: UserProfile;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: number;
}

interface OAuthStateEntry {
  redirect: string;
}

// ─── Key helpers ──────────────────────────────────────────────────────────────
const sessionKey = (id: string) => `session:${id}`;
const oauthStateKey = (state: string) => `oauth_state:${state}`;
const refreshTokenKey = (userId: string) => `refresh_token:${userId}`;
const profileKey = (userId: string) => `profile:${userId}`;

// ─── TTLs (seconds) ──────────────────────────────────────────────────────────
const SESSION_TTL = 604800;   // 7 days
const OAUTH_STATE_TTL = 900;  // 15 minutes
const PROFILE_TTL = 604800;   // 7 days

// ─── OAuth State ─────────────────────────────────────────────────────────────

export async function createOAuthState(redirect: string): Promise<string> {
  const state = uuidv4();
  const entry: OAuthStateEntry = { redirect };
  await redis.set(oauthStateKey(state), JSON.stringify(entry), { ex: OAUTH_STATE_TTL });
  return state;
}

export async function consumeOAuthState(state: string): Promise<string | null> {
  const raw = await redis.getdel<string>(oauthStateKey(state));
  if (!raw) return null;
  try {
    const entry: OAuthStateEntry = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return entry.redirect ?? null;
  } catch {
    return null;
  }
}

// ─── Refresh Tokens ───────────────────────────────────────────────────────────

export async function getStoredRefreshToken(userId: string): Promise<string | null> {
  return redis.get<string>(refreshTokenKey(userId));
}

// ─── Sessions ─────────────────────────────────────────────────────────────────

export async function createSession(
  user: UserProfile,
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
): Promise<string> {
  const sessionId = uuidv4();
  const data: SessionData = {
    user,
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: Date.now() + tokens.expiresIn * 1000 - 60_000,
  };
  await Promise.all([
    redis.set(sessionKey(sessionId), JSON.stringify(data), { ex: SESSION_TTL }),
    redis.set(refreshTokenKey(user.id), tokens.refreshToken),
    cacheUserProfile({ ...user, platform: 'spotify' }),
  ]);
  return sessionId;
}

export async function getSession(sessionId: string): Promise<SessionData | null> {
  const raw = await redis.get<string>(sessionKey(sessionId));
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? (JSON.parse(raw) as SessionData) : (raw as SessionData);
  } catch {
    return null;
  }
}

export async function getSessionUser(sessionId: string): Promise<UserProfile | null> {
  const session = await getSession(sessionId);
  return session?.user ?? null;
}

export async function destroySession(sessionId: string): Promise<void> {
  await redis.del(sessionKey(sessionId));
}

// ─── Profile Cache ────────────────────────────────────────────────────────────

export async function cacheUserProfile(user: UserProfile): Promise<void> {
  await redis.set(profileKey(user.id), JSON.stringify({ ...user, platform: 'spotify' }), { ex: PROFILE_TTL });
}

export async function getCachedProfile(userId: string): Promise<UserProfile | null> {
  const raw = await redis.get<string>(profileKey(userId));
  if (!raw) return null;
  try {
    return typeof raw === 'string' ? (JSON.parse(raw) as UserProfile) : (raw as UserProfile);
  } catch {
    return null;
  }
}

// ─── Token Refresh ────────────────────────────────────────────────────────────

export async function getValidAccessToken(sessionId: string): Promise<string | null> {
  const session = await getSession(sessionId);
  if (!session) return null;

  if (Date.now() < session.accessTokenExpiresAt) {
    return session.accessToken;
  }

  try {
    const tokens = await refreshAccessToken(session.refreshToken);
    session.accessToken = tokens.access_token;
    session.accessTokenExpiresAt = Date.now() + tokens.expires_in * 1000 - 60_000;
    if (tokens.refresh_token) {
      session.refreshToken = tokens.refresh_token;
      await redis.set(refreshTokenKey(session.user.id), tokens.refresh_token);
    }
    await redis.set(sessionKey(sessionId), JSON.stringify(session), { ex: SESSION_TTL });
    return session.accessToken;
  } catch {
    await redis.del(sessionKey(sessionId));
    return null;
  }
}
