import 'dotenv/config';
import { Redis } from '@upstash/redis';

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
});

async function main() {
  const [keys1, keys2, keys3, keys4] = await Promise.all([
    redis.keys('dashboard:*'),
    redis.keys('taste_profile:*'),
    redis.keys('artist_genres:*'),
    redis.keys('genres:*'),
  ]);
  const all = [...keys1, ...keys2, ...keys3, ...keys4];
  if (all.length > 0) {
    await redis.del(...(all as [string, ...string[]]));
  }
  console.log(`Deleted ${all.length} keys`);
  process.exit(0);
}

main();
