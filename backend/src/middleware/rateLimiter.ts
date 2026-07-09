import type { Request, Response, NextFunction } from 'express';

const buckets = new Map<string, { tokens: number; lastRefill: number }>();

const CAPACITY = 60;
const REFILL_RATE = 10;

const EXEMPT_PREFIXES = ['/api/auth/login', '/api/auth/callback', '/api/health'];

export function rateLimiter(req: Request, res: Response, next: NextFunction): void {
  if (EXEMPT_PREFIXES.some((p) => req.path.startsWith(p))) {
    next();
    return;
  }

  const key = req.ip ?? 'unknown';
  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: CAPACITY, lastRefill: now };
    buckets.set(key, bucket);
  }

  const elapsed = (now - bucket.lastRefill) / 1000;
  bucket.tokens = Math.min(CAPACITY, bucket.tokens + elapsed * REFILL_RATE);
  bucket.lastRefill = now;

  if (bucket.tokens < 1) {
    res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' });
    return;
  }

  bucket.tokens -= 1;
  next();
}
