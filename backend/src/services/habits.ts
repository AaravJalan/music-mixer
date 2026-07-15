import type {
  DailyListeningPoint,
  GenreDistributionSlice,
  ListeningHabitsResponse,
  TasteTimeRange,
} from '@music-mixer/shared';
import { measureListeningMsSince, type TopTrack } from '../spotify/tracks';
import { estimateListeningHours } from '../analytics/insights';
import { buildUserTasteProfile } from '../engine/taste';
import { getListeningTrends } from './db';
import { getSessionUser } from './session';
import { getGhostProfile, isGhostUserId, ghostGenresToStats } from './ghosts';
import { mapToParentGenre } from '../spotify/genreMapper';
import {
  ensureInitialListeningSnapshot,
  upgradeLegacyBaselineSnapshot,
  MIN_SNAPSHOTS_FOR_DAILY_CHART,
  getCronIntervalDays,
} from './listeningSnapshot';

const DEFAULT_TRACK_MS = 3.5 * 60 * 1000;
const GENRE_SLICE_LIMIT = 8;

const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: ListeningHabitsResponse }>();

function formatGenre(genre: string): string {
  return genre
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function computeGenreDistribution(
  tracks: TopTrack[],
  artistGenreMap: Map<string, string[]>,
): GenreDistributionSlice[] {
  const counts = new Map<string, number>();
  let totalHits = 0;

  for (const track of tracks) {
    const genres = new Set<string>();
    for (const artistId of track.artistIds) {
      for (const genre of artistGenreMap.get(artistId) ?? []) {
        const key = genre.trim().toLowerCase();
        if (key && key !== 'default') {
          const parent = mapToParentGenre(key);
          if (parent) genres.add(parent);
        }
      }
    }
    for (const genre of genres) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
      totalHits += 1;
    }
  }

  if (totalHits === 0) return [];

  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, GENRE_SLICE_LIMIT);
  const rest = sorted.slice(GENRE_SLICE_LIMIT);

  const slices: GenreDistributionSlice[] = top.map(([genre, count]) => ({
    genre: formatGenre(genre),
    percentage: Math.round((count / totalHits) * 1000) / 10,
    trackCount: count,
  }));

  if (rest.length > 0) {
    const restCount = rest.reduce((sum, [, c]) => sum + c, 0);
    slices.push({
      genre: 'Other',
      percentage: Math.round((restCount / totalHits) * 1000) / 10,
      trackCount: restCount,
    });
  }

  return slices;
}

/** Map DynamoDB cron snapshots → chart points (hours). Oldest → newest. */
function dailyPointsFromSnapshots(
  trends: { date: string; totalListeningTimeMs?: number; capturedAt?: string }[],
): DailyListeningPoint[] {
  return [...trends]
    .filter((t) => Boolean(t.capturedAt))
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((t) => ({
      date: t.date,
      hours: Math.round(((t.totalListeningTimeMs || 0) / 3_600_000) * 10) / 10,
    }));
}

export async function getListeningHabits(
  sessionId: string,
  term: TasteTimeRange,
  userId?: string,
): Promise<ListeningHabitsResponse> {
  const cacheKey = `${userId ?? sessionId}:${term}`;
  const cached = cache.get(cacheKey);
  if (cached && Date.now() - cached.at < CACHE_TTL_MS) {
    return { ...cached.data, cachedAt: new Date(cached.at).toISOString() };
  }

  const realUserId = userId ?? (await getSessionUser(sessionId))?.id;

  let profile: {
    tracks: TopTrack[];
    genres: { genre: string; percentage: number; count?: number }[];
    artistGenreMap: Map<string, string[]>;
  };

  if (realUserId && isGhostUserId(realUserId)) {
    const ghost = getGhostProfile(realUserId);
    if (!ghost) throw new Error('Ghost profile not found');
    profile = {
      tracks: (ghost.tracks || []).map((t) => ({
        ...t,
        artistIds: t.artistIds ?? [],
        popularity: t.popularity ?? 50,
        releaseDate: t.releaseDate ?? '2020-01-01',
      })),
      genres: ghostGenresToStats(ghost.genres || []),
      artistGenreMap: new Map(),
    };
  } else {
    profile = await buildUserTasteProfile(sessionId, term, 50);
  }

  const genreDistribution = computeGenreDistribution(profile.tracks, profile.artistGenreMap);
  const finalGenreDistribution =
    genreDistribution.length > 0
      ? genreDistribution
      : (profile.genres || []).map((g) => ({
          genre: g.genre,
          percentage: g.percentage,
          trackCount: g.count ?? 0,
        }));

  const durationsMs = profile.tracks.map((t) => t.durationMs ?? DEFAULT_TRACK_MS);
  const totalListeningHours = estimateListeningHours('long_term', durationsMs);
  const totalListeningMs = Math.round(totalListeningHours * 3_600_000);

  const response: ListeningHabitsResponse = {
    term,
    genreDistribution: finalGenreDistribution,
    totalTracks: profile.tracks.length,
    totalListeningMs,
    totalListeningHours,
    // Never show estimated daily hours — wait for enough cron snapshots.
    dailyListening: [],
    dailyIsEstimated: true,
    totalListeningHoursSinceTracking: 0,
    trackingCount: 0,
    firstTrackedDate: null,
    genreTrends: [],
    daysUntilNextCron: 1,
    platform: 'spotify',
  };

  if (realUserId && !isGhostUserId(realUserId)) {
    try {
      let trends = await getListeningTrends(realUserId);

      // New account / empty history: run one snapshot immediately, then cron every 3 days.
      if (!trends || trends.length === 0) {
        try {
          await ensureInitialListeningSnapshot(sessionId, realUserId);
          trends = await getListeningTrends(realUserId);
        } catch (snapErr) {
          console.error(`Initial listening snapshot failed for ${realUserId}:`, snapErr);
        }
      } else if (trends.every((t) => !t.capturedAt)) {
        // Upgrade legacy estimate rows without Spotify (API lock must not hide trackingCount).
        try {
          const latest = [...trends].sort((a, b) => b.date.localeCompare(a.date))[0];
          await upgradeLegacyBaselineSnapshot(latest);
          trends = await getListeningTrends(realUserId);
        } catch (upgradeErr) {
          console.error(`Legacy snapshot upgrade failed for ${realUserId}:`, upgradeErr);
        }
      }

      if (trends && trends.length > 0) {
        trends.sort((a, b) => a.date.localeCompare(b.date));

        response.trackingCount = trends.length;
        response.firstTrackedDate = trends[0].date;

        // Each snapshot stores plays in its window (baseline = 0); sum = hours since tracking.
        // Legacy rows without capturedAt used modeled top-track estimates — exclude them.
        let totalMs = trends.reduce((acc, t) => {
          if (!t.capturedAt) return acc;
          return acc + (t.totalListeningTimeMs || 0);
        }, 0);

        // Add live, unsnapshotted hours since the most recent snapshot
        const latestSnapshot = trends[trends.length - 1];
        if (latestSnapshot?.capturedAt) {
          try {
            const liveMs = await measureListeningMsSince(
              sessionId,
              new Date(latestSnapshot.capturedAt).getTime()
            );
            totalMs += liveMs;
          } catch (err) {
            console.warn(`Failed to fetch live listening ms for ${realUserId}:`, err);
          }
        }

        response.totalListeningHoursSinceTracking =
          Math.round((totalMs / 3_600_000) * 10) / 10;

        response.genreTrends = trends.map((t) => ({
          date: t.date,
          percentages: t.genrePercentages || {},
        }));

        if (trends.length >= MIN_SNAPSHOTS_FOR_DAILY_CHART) {
          response.dailyListening = dailyPointsFromSnapshots(trends);
          response.dailyIsEstimated = false;
        }

        const todayStr = new Date().toISOString().slice(0, 10);
        const accountAgeDays = Math.floor(
          Math.abs(new Date(todayStr).getTime() - new Date(response.firstTrackedDate).getTime()) / 86400000
        );
        const interval = getCronIntervalDays(accountAgeDays);
        const daysSinceLast = Math.floor(
          Math.abs(new Date(todayStr).getTime() - new Date(latestSnapshot.date).getTime()) / 86400000
        );
        response.daysUntilNextCron = Math.max(0, interval - daysSinceLast);
      }
    } catch (err) {
      console.error(`Failed to fetch/save listening trends for ${realUserId}:`, err);
    }
  }

  cache.set(cacheKey, { at: Date.now(), data: response });
  return response;
}
