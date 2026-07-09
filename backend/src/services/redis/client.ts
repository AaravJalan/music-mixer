import { Redis } from '@upstash/redis';

/**
 * Shared Upstash Redis client using HTTP (not TCP).
 * Safe for serverless/Lambda environments — no persistent connection pools.
 * Reads credentials from UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.
 */
export const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});
