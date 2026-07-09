import type { UserProfile } from '@music-mixer/shared';
import { v4 as uuidv4 } from 'uuid';
import { refreshAccessToken } from '../spotify/auth';
import { loadJsonFile, saveJsonFile } from '../lib/persist';

export interface SessionData {
  user: UserProfile;
  refreshToken: string;
  accessToken: string;
  accessTokenExpiresAt: number;
}

interface OAuthStateEntry {
  redirect: string;
  createdAt: number;
}

type SessionsStore = Record<string, SessionData>;
type OAuthStore = Record<string, OAuthStateEntry>;
type RefreshTokenStore = Record<string, string>;

const sessions = new Map<string, SessionData>(
  Object.entries(loadJsonFile<SessionsStore>('sessions.json', {})),
);
const oauthStates = new Map<string, OAuthStateEntry>(
  Object.entries(loadJsonFile<OAuthStore>('oauth-states.json', {})),
);
const userRefreshTokens = new Map<string, string>(
  Object.entries(loadJsonFile<RefreshTokenStore>('refresh-tokens.json', {})),
);
const profileCache = new Map<string, UserProfile>(
  Object.entries(loadJsonFile<Record<string, UserProfile>>('profiles.json', {})),
);

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

function persistSessions(): void {
  saveJsonFile('sessions.json', Object.fromEntries(sessions));
}

function persistOAuthStates(): void {
  saveJsonFile('oauth-states.json', Object.fromEntries(oauthStates));
}

function persistRefreshTokens(): void {
  saveJsonFile('refresh-tokens.json', Object.fromEntries(userRefreshTokens));
}

function persistProfiles(): void {
  saveJsonFile('profiles.json', Object.fromEntries(profileCache));
}

function cleanupExpiredStates(): void {
  const now = Date.now();
  let changed = false;
  for (const [state, entry] of oauthStates) {
    if (now - entry.createdAt > OAUTH_STATE_TTL_MS) {
      oauthStates.delete(state);
      changed = true;
    }
  }
  if (changed) persistOAuthStates();
}

export function createOAuthState(redirect: string): string {
  cleanupExpiredStates();
  const state = uuidv4();
  oauthStates.set(state, { redirect, createdAt: Date.now() });
  persistOAuthStates();
  return state;
}

export function consumeOAuthState(state: string): string | null {
  const entry = oauthStates.get(state);
  if (!entry) return null;
  oauthStates.delete(state);
  persistOAuthStates();
  if (Date.now() - entry.createdAt > OAUTH_STATE_TTL_MS) return null;
  return entry.redirect;
}

export function getStoredRefreshToken(userId: string): string | null {
  return userRefreshTokens.get(userId) ?? null;
}

export function createSession(
  user: UserProfile,
  tokens: { accessToken: string; refreshToken: string; expiresIn: number },
): string {
  const sessionId = uuidv4();
  sessions.set(sessionId, {
    user,
    refreshToken: tokens.refreshToken,
    accessToken: tokens.accessToken,
    accessTokenExpiresAt: Date.now() + tokens.expiresIn * 1000 - 60_000,
  });
  userRefreshTokens.set(user.id, tokens.refreshToken);
  cacheUserProfile({ ...user, platform: 'spotify' });
  persistSessions();
  persistRefreshTokens();
  return sessionId;
}

export function getSession(sessionId: string): SessionData | null {
  return sessions.get(sessionId) ?? null;
}

export function getSessionUser(sessionId: string): UserProfile | null {
  return sessions.get(sessionId)?.user ?? null;
}

export function destroySession(sessionId: string): void {
  sessions.delete(sessionId);
  persistSessions();
}

export function cacheUserProfile(user: UserProfile): void {
  profileCache.set(user.id, { ...user, platform: 'spotify' });
  persistProfiles();
}

export function getCachedProfile(userId: string): UserProfile | null {
  return profileCache.get(userId) ?? null;
}

export async function getValidAccessToken(sessionId: string): Promise<string | null> {
  const session = sessions.get(sessionId);
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
      userRefreshTokens.set(session.user.id, tokens.refresh_token);
      persistRefreshTokens();
    }
    persistSessions();
    return session.accessToken;
  } catch {
    sessions.delete(sessionId);
    persistSessions();
    return null;
  }
}
