import type { Request, Response, NextFunction } from 'express';
import { getSessionUser } from '../services/session';
import { SESSION_COOKIE } from '../lib/cookies';

export function getSessionId(req: Request): string | undefined {
  return req.cookies?.[SESSION_COOKIE];
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const sessionId = getSessionId(req);
  if (!sessionId) {
    res.status(401).json({ error: 'Not authenticated', code: 'UNAUTHORIZED' });
    return;
  }
  const user = getSessionUser(sessionId);
  if (!user) {
    res.status(401).json({ error: 'Session expired', code: 'SESSION_EXPIRED' });
    return;
  }
  (req as Request & { user: typeof user }).user = user;
  (req as Request & { sessionId: string }).sessionId = sessionId;
  next();
}

export { SESSION_COOKIE };
