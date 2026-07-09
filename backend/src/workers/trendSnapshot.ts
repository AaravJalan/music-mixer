import { saveListeningHabitSnapshot, TrendSnapshot } from "../services/db";
import { redis } from "../services/redis/client";
import { refreshAccessToken } from "../spotify/auth";
import { buildUserTasteProfile } from "../spotify/taste";
import { estimateListeningHours } from "../math/listening";
import { v4 as uuidv4 } from 'uuid';

const DEFAULT_TRACK_MS = 3.5 * 60 * 1000;

export async function handler() {
  console.log("Starting trend snapshot cron job...");
  const today = new Date().toISOString().split("T")[0];

  let cursor = 0;
  do {
    // Scan for all user refresh tokens
    const [nextCursor, keys] = await redis.scan(cursor, { match: "refresh_token:*", count: 100 });
    cursor = nextCursor === "0" ? 0 : Number(nextCursor);

    for (const key of keys) {
      const userId = key.split(":")[1];
      const refreshToken = await redis.get<string>(key);
      if (!refreshToken) continue;

      try {
        // Get fresh access token
        const tokens = await refreshAccessToken(refreshToken);
        
        // Create temporary session just for fetching Spotify data
        const tempSessionId = `cron_${uuidv4()}`;
        await redis.set(`session:${tempSessionId}`, JSON.stringify({
          user: { id: userId },
          accessToken: tokens.access_token,
          accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
          refreshToken: tokens.refresh_token || refreshToken
        }), { ex: 300 }); // 5 min ttl

        // Fetch user data
        const profile = await buildUserTasteProfile(tempSessionId, "short_term", 10);
        
        const durationsMs = profile.tracks.map((t) => t.durationMs ?? DEFAULT_TRACK_MS);
        const totalListeningTimeMs = Math.round(estimateListeningHours('short_term', durationsMs) * 3600000);

        // Calculate genre percentages
        const genrePercentages: Record<string, number> = {};
        for (const g of profile.genres) {
          genrePercentages[g.genre] = g.percentage;
        }

        const snapshot: TrendSnapshot = {
          userId,
          date: today,
          topGenres: profile.genres.map(g => g.genre).slice(0, 5),
          genrePercentages,
          totalListeningTimeMs,
          topTracks: profile.tracks.slice(0, 5).map(t => t.id)
        };

        await saveListeningHabitSnapshot(snapshot);
        console.log(`Saved snapshot for user ${userId}`);

        // Cleanup
        await redis.del(`session:${tempSessionId}`);

      } catch (err) {
        console.error(`Failed to snapshot user ${userId}:`, err);
      }
    }
  } while (cursor !== 0);

  console.log("Trend snapshot complete.");
}
