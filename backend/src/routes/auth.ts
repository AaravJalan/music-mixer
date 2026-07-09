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

function authErrorRedirect(code: string, redirect?: string): string {
  const base = `${env.frontendUrl}/?auth_error=${encodeURIComponent(code)}`;
  if (redirect && redirect !== '/') {
    return `${base}&auth_redirect=${encodeURIComponent(redirect)}`;
  }
  return base;
}

router.get('/me', (req: Request, res: Response) => {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId) {
    res.json({ authenticated: false, user: null });
    return;
  }
  const user = getSessionUser(sessionId);
  res.json({ authenticated: !!user, user });
});

router.get('/login', (req: Request, res: Response) => {
  if (!isSpotifyConfigured()) {
    res.status(503).json({
      error: 'Spotify OAuth is not configured. Add credentials to .env',
      code: 'SPOTIFY_NOT_CONFIGURED',
    });
    return;
  }

  const redirect = safeRedirect(req.query.redirect as string | undefined);
  const forceConsent = req.query.consent === '1' || req.query.force === '1';
  const state = createOAuthState(redirect);
  res.redirect(buildAuthorizeUrl(state, forceConsent));
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

  const redirect = consumeOAuthState(state);
  if (!redirect) {
    res.redirect(authErrorRedirect('invalid_state'));
    return;
  }

  try {
    const tokens = await exchangeCodeForTokens(code);
    const user = await fetchSpotifyProfile(tokens.access_token);

    let refreshToken = tokens.refresh_token ?? getStoredRefreshToken(user.id);
    if (!refreshToken) {
      res.redirect(authErrorRedirect('reconsent_required', redirect));
      return;
    }

    const sessionId = createSession(user, {
      accessToken: tokens.access_token,
      refreshToken,
      expiresIn: tokens.expires_in,
    });

    res.cookie(SESSION_COOKIE, sessionId, sessionCookieOptions());
    res.redirect(`${env.frontendUrl}${redirect}`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('OAuth callback error:', message, err instanceof Error ? err.cause : '');

    if (isNetworkError(err)) {
      res.redirect(authErrorRedirect('network_error', redirect));
      return;
    }

    if (message.includes('invalid_grant')) {
      res.redirect(authErrorRedirect('expired_code', redirect));
      return;
    }

    res.redirect(authErrorRedirect('callback_failed', redirect));
  }
});

router.post('/logout', (req: Request, res: Response) => {
  const sessionId = req.cookies?.[SESSION_COOKIE];
  if (sessionId) destroySession(sessionId);
  res.clearCookie(SESSION_COOKIE, sessionCookieOptions(0));
  res.json({ ok: true });
});

export default router;
