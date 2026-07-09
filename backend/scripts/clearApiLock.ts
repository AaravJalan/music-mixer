import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.resolve(__dirname, '../../.env') });

import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

const ttl = await redis.ttl('status:api_lock');
const del = await redis.del('status:api_lock');

console.log(`status:api_lock — TTL was: ${ttl}s | Deleted: ${del === 1 ? '✅ yes' : '⚠️  key was already gone'}`);
