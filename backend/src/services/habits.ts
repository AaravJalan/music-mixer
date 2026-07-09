import type {
  DailyListeningPoint,
  GenreDistributionSlice,
  ListeningHabitsResponse,
  TasteTimeRange,
} from '@music-mixer/shared';
import type { TopTrack } from '../spotify/tracks';
import { estimateListeningHours } from '../math/listening';
import { buildUserTasteProfile } from '../spotify/taste';

const DEFAULT_TRACK_MS = 3.5 * 60 * 1000;
const GENRE_SLICE_LIMIT = 8;
const DAILY_WINDOW_DAYS = 30;

/**
 * Short-lived cache so repeat visits to the Listening Habits page don't re-hit Spotify
 * (which is the call volume that trips the rate limiter).
 *
 * TODO(dynamodb): Once the tracking Lambda + `ListeningHabits` table exist, this in-memory
 * cache becomes a read-through cache in front of DynamoDB instead of the Spotify estimate.
 */
const CACHE_TTL_MS = 10 * 60 * 1000;
const cache = new Map<string, { at: number; data: ListeningHabitsResponse }>();

function formatGenre(genre: string): string {
  return genre
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * Genre share across the user's analyzed track history. Each track contributes to the genres
 * of its artists; totals are normalized to percentages and the long tail is grouped as "Other"
 * so the pie chart stays readable.
 */
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
        if (key && key !== 'default') genres.add(key);
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

/**
 * Daily listening hours for the line graph.
 *
 * TODO(dynamodb): This is a MODELED estimate — Spotify never exposes historical daily
 * listening, so we spread the accumulated hours across a trailing window with a gentle
 * weekly rhythm. Once the play-tracking Lambda is deployed, replace this with a real query
 * against the `ListeningEvents` DynamoDB table:
 *   - PK: `USER#<userId>`  SK: `DAY#<yyyy-mm-dd>`
 *   - attribute: `listeningMs` (accumulated per day by the ingestion Lambda)
 * Then set `dailyIsEstimated = false` in getListeningHabits.
 */
function buildDailyListeningSeries(totalHours: number, days = DAILY_WINDOW_DAYS): DailyListeningPoint[] {
  const points: DailyListeningPoint[] = [];
  const perDay = totalHours / days;
  const today = new Date();

  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(today);
    date.setDate(today.getDate() - i);
    const dow = date.getDay();
    // Weekends skew higher; deterministic wobble so the line isn't flat.
    const weekend = dow === 0 || dow === 6 ? 1.35 : 0.9;
    const wobble = 0.85 + ((i * 37) % 30) / 100;
    points.push({
      date: date.toISOString().slice(0, 10),
      hours: Math.round(perDay * weekend * wobble * 10) / 10,
    });
  }

  return points;
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

  const profile = await buildUserTasteProfile(sessionId, term, 50);

  const genreDistribution = computeGenreDistribution(profile.tracks, profile.artistGenreMap);

  // Listening Volume: accumulated duration from account inception (long-term play model).
  const durationsMs = profile.tracks.map((t) => t.durationMs ?? DEFAULT_TRACK_MS);
  const totalListeningHours = estimateListeningHours('long_term', durationsMs);
  const totalListeningMs = Math.round(totalListeningHours * 3_600_000);

  const dailyListening = buildDailyListeningSeries(
    // Show a recent slice of the accumulated volume across the trailing window.
    estimateListeningHours(term, durationsMs),
  );

  const response: ListeningHabitsResponse = {
    term,
    genreDistribution,
    totalTracks: profile.tracks.length,
    totalListeningMs,
    totalListeningHours,
    dailyListening,
    dailyIsEstimated: true, // TODO(dynamodb): flip to false once tracking Lambda backs the series
    platform: 'spotify',
  };

  cache.set(cacheKey, { at: Date.now(), data: response });
  return response;
}
