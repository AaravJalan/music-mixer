import { v4 as uuidv4 } from 'uuid';
import { refreshAccessToken } from '../spotify/auth';
import { buildUserTasteProfile } from '../spotify/taste';
import { measureListeningMsSince } from '../spotify/tracks';
import { redis } from './redis/client';
import { getListeningTrends, getOldestListeningTrend, saveListeningHabitSnapshot, type TrendSnapshot } from './db';

/** Minimum DynamoDB snapshots before we expose the daily listening chart. */
export const MIN_SNAPSHOTS_FOR_DAILY_CHART = 2;

/** Cron cadence phases out as the account ages. */
export function getCronIntervalDays(accountAgeDays: number): number {
  if (accountAgeDays <= 10) return 1;
  if (accountAgeDays <= 20) return 2;
  return 3;
}

function daysBetween(a: string, b: string): number {
  const ms = Math.abs(new Date(b).getTime() - new Date(a).getTime());
  return Math.floor(ms / (24 * 60 * 60 * 1000));
}

/**
 * Rewrite a legacy estimate snapshot (no `capturedAt`) as a 0h baseline.
 * Does not call Spotify — safe when the API lock is tripped.
 */
export async function upgradeLegacyBaselineSnapshot(
  snapshot: TrendSnapshot,
): Promise<TrendSnapshot> {
  const upgraded: TrendSnapshot = {
    ...snapshot,
    capturedAt: new Date().toISOString(),
    totalListeningTimeMs: 0,
  };
  await saveListeningHabitSnapshot(upgraded);
  return upgraded;
}

/**
 * Build and persist a listening-habit snapshot for one user from a live Spotify session.
 *
 * Listening hours come from Spotify recently-played (real plays), not top-track estimates.
 * - First snapshot: baseline genres only — 0 listening hours (tracking clock starts here).
 * - Later snapshots: sum of play durations since the previous snapshot's `capturedAt`.
 */
export async function snapshotListeningHabits(
  sessionId: string,
  userId: string,
  date = new Date().toISOString().slice(0, 10),
): Promise<TrendSnapshot> {
  const nowIso = new Date().toISOString();
  const profile = await buildUserTasteProfile(sessionId, 'short_term', 10);

  const prior = await getListeningTrends(userId, 1);
  let totalListeningTimeMs = 0;

  if (prior?.[0]?.capturedAt) {
    totalListeningTimeMs = await measureListeningMsSince(
      sessionId,
      new Date(prior[0].capturedAt).getTime(),
    );
  } else if (prior?.[0] && prior[0].date !== date) {
    // Legacy estimate row (no capturedAt): measure real plays since that calendar day.
    totalListeningTimeMs = await measureListeningMsSince(
      sessionId,
      new Date(`${prior[0].date}T00:00:00.000Z`).getTime(),
    );
  }
  // else: first snapshot, or rewriting same-day legacy baseline → 0 hours


  const genrePercentages: Record<string, number> = {};
  for (const g of profile.genres) {
    genrePercentages[g.genre] = g.percentage;
  }

  const snapshot: TrendSnapshot = {
    userId,
    date,
    capturedAt: nowIso,
    topGenres: profile.genres.map((g) => g.genre).slice(0, 5),
    genrePercentages,
    totalListeningTimeMs,
    topTracks: profile.tracks.slice(0, 5).map((t) => t.id),
  };

  await saveListeningHabitSnapshot(snapshot);
  return snapshot;
}

/**
 * First-login / empty-history bootstrap: take an immediate snapshot if the user has none.
 * Safe to call fire-and-forget after OAuth; no-ops when trends already exist.
 */
export async function ensureInitialListeningSnapshot(
  sessionId: string,
  userId: string,
): Promise<TrendSnapshot | null> {
  const trends = await getListeningTrends(userId, 1);
  if (trends && trends.length > 0) return null;
  return snapshotListeningHabits(sessionId, userId);
}

/**
 * Cron path: use a refresh token to create a short-lived session, then snapshot.
 * Skips users who already have a snapshot within SNAPSHOT_INTERVAL_DAYS.
 */
export async function snapshotUserFromRefreshToken(
  userId: string,
  refreshToken: string,
): Promise<'saved' | 'skipped' | 'failed'> {
  const today = new Date().toISOString().slice(0, 10);
  try {
    const trends = await getListeningTrends(userId, 1);
    const oldestTrend = await getOldestListeningTrend(userId);
    
    if (trends?.[0]?.date && oldestTrend?.date) {
      const accountAge = daysBetween(oldestTrend.date, today);
      const interval = getCronIntervalDays(accountAge);
      if (daysBetween(trends[0].date, today) < interval) {
        return 'skipped';
      }
    }

    const tokens = await refreshAccessToken(refreshToken);
    const tempSessionId = `cron_${uuidv4()}`;
    await redis.set(
      `session:${tempSessionId}`,
      JSON.stringify({
        user: { id: userId },
        accessToken: tokens.access_token,
        accessTokenExpiresAt: Date.now() + tokens.expires_in * 1000,
        refreshToken: tokens.refresh_token || refreshToken,
      }),
      { ex: 300 },
    );

    try {
      await snapshotListeningHabits(tempSessionId, userId, today);
      return 'saved';
    } finally {
      await redis.del(`session:${tempSessionId}`);
    }
  } catch (err) {
    console.error(`Failed to snapshot user ${userId}:`, err);
    return 'failed';
  }
}
