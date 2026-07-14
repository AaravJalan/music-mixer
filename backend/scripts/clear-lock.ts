import 'dotenv/config';
import { redis } from '../src/services/redis/client';
async function clear() {
  const ttl = await redis.ttl('status:api_lock');
  console.log('TTL was:', ttl);
  await redis.del('status:api_lock');
  console.log('Cleared lock!');
  process.exit(0);
}
clear();
