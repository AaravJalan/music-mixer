import { redis } from '../services/redis/client';
import { snapshotUserFromRefreshToken } from '../services/listeningSnapshot';

export async function handler() {
  console.log('Starting trend snapshot cron job...');

  let cursor = 0;
  let saved = 0;
  let skipped = 0;
  let failed = 0;

  do {
    const [nextCursor, keys] = await redis.scan(cursor, { match: 'refresh_token:*', count: 100 });
    cursor = nextCursor === '0' ? 0 : Number(nextCursor);

    for (const key of keys) {
      const userId = key.split(':')[1];
      const refreshToken = await redis.get<string>(key);
      if (!refreshToken || !userId) continue;

      const result = await snapshotUserFromRefreshToken(userId, refreshToken);
      if (result === 'saved') {
        saved += 1;
        console.log(`Saved snapshot for user ${userId}`);
      } else if (result === 'skipped') {
        skipped += 1;
      } else {
        failed += 1;
      }
    }
  } while (cursor !== 0);

  console.log(`Trend snapshot complete. saved=${saved} skipped=${skipped} failed=${failed}`);
}
