import type { CookieOptions } from 'express';
import { env } from '../config/env';

export const SESSION_COOKIE = 'mm_session';

export function sessionCookieOptions(maxAgeMs = 30 * 24 * 60 * 60 * 1000): CookieOptions {
  return {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    maxAge: maxAgeMs,
    path: '/',
  };
}
