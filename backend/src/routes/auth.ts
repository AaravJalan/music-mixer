import { Router } from 'express';
import type { Request, Response } from 'express';
import { env, isSpotifyConfigured } from '../config/env';
import {
  buildAuthorizeUrl,
  exchangeCodeForTokens,
  fetchSpotifyProfile,
} from '../spotify/auth';
import {
  consumeOAuthState,
  createOAuthState,
  createSession,
  destroySession,
  getSessionUser,
  getStoredRefreshToken,
} from '../services/session';
import { SESSION_COOKIE, sessionCookieOptions } from '../lib/cookies';
import { isNetworkError } from '../lib/fetch';

const router = Router();

function safeRedirect(path: string | undefined): string {
  if (!path || !path.startsWith('/')) return '/';
  return path;
}

function getRedirectUri(origin: string): string {
  // Always use the exact origin that initiated the request to ensure Spotify redirects back to the correct domain (e.g. Vercel)
  return `${origin.replace(/\/$/, '')}/api/auth/callback`;
}

function authErrorRedirect(code: string, redirect?: string, origin?: string): string {
  const base = `${origin || env.frontendUrl}/?auth_error=${encodeURIComponent(code)}`;
  if (redirect && redirect !== '/') {
    return `${base}&auth_redirect=${encodeURIComponent(redirect)}`;
  }
  return base;
}

router.get('/me', async (req: Request, res: Response) => {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId) {
    res.json({ authenticated: false, user: null });
    return;
  }
  const user = await getSessionUser(sessionId);
  res.json({ authenticated: !!user, user });
});

router.get('/login', async (req: Request, res: Response) => {
  if (!isSpotifyConfigured()) {
    res.status(503).json({
      error: 'Spotify OAuth is not configured. Add credentials to .env',
      code: 'SPOTIFY_NOT_CONFIGURED',
    });
    return;
  }

  const redirect = safeRedirect(req.query.redirect as string | undefined);
  const origin = typeof req.query.origin === 'string' ? req.query.origin : env.frontendUrl;
  const forceConsent = req.query.consent === '1' || req.query.force === '1';
  const state = await createOAuthState(redirect, origin);
  const redirectUri = getRedirectUri(origin);
  res.redirect(buildAuthorizeUrl(state, redirectUri, forceConsent));
});

router.get('/callback', async (req: Request, res: Response) => {
  const { code, state, error } = req.query;

  if (error) {
    res.redirect(authErrorRedirect(String(error)));
    return;
  }

  if (!code || !state || typeof code !== 'string' || typeof state !== 'string') {
    res.redirect(authErrorRedirect('missing_code'));
    return;
  }

  const stateEntry = await consumeOAuthState(state);
  if (!stateEntry) {
    res.redirect(authErrorRedirect('invalid_state'));
    return;
  }
  const { redirect, origin } = stateEntry;

  try {
    const redirectUri = getRedirectUri(origin || env.frontendUrl);
    const tokens = await exchangeCodeForTokens(code, redirectUri);
    const user = await fetchSpotifyProfile(tokens.access_token);

    let refreshToken = tokens.refresh_token ?? (await getStoredRefreshToken(user.id));
    if (!refreshToken) {
      res.redirect(authErrorRedirect('reconsent_required', redirect, origin));
      return;
    }

    const sessionId = await createSession(user, {
      accessToken: tokens.access_token,
      refreshToken,
      expiresIn: tokens.expires_in,
    });

    // Kick off first listening-habits snapshot immediately for new accounts.
    // Cron continues every 3 days afterward (skips if a recent snapshot exists).
    void import('../services/listeningSnapshot')
      .then(({ ensureInitialListeningSnapshot }) =>
        ensureInitialListeningSnapshot(sessionId, user.id),
      )
      .catch((err) => console.error('Initial listening snapshot failed:', err));

    res.cookie(SESSION_COOKIE, sessionId, sessionCookieOptions());
    res.redirect(`${origin || env.frontendUrl}${redirect}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('OAuth callback error:', message, err instanceof Error ? err.cause : '');

    if (isNetworkError(err)) {
      res.redirect(authErrorRedirect('network_error', redirect, origin));
      return;
    }

    if (message.includes('invalid_grant')) {
      res.redirect(authErrorRedirect('expired_code', redirect, origin));
      return;
    }

    res.redirect(authErrorRedirect('callback_failed', redirect, origin));
  }
});

router.post('/logout', async (req: Request, res: Response) => {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (sessionId) await destroySession(sessionId);
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions(0));
  res.json({ ok: true });
});

export default router;
