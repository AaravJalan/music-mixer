import type { DashboardTopTrack, TasteTimeRange } from '@music-mixer/shared';
import type { TopTrack } from '../spotify/tracks';

const DEFAULT_TRACK_MS = 3.5 * 60 * 1000;

/**
 * Spotify does not expose true play counts or listening time, so we model it.
 * Each time range implies a different accumulation window: the #1 ranked track
 * was played `topPlays` times over that window, decaying geometrically by rank.
 * This makes estimates scale meaningfully (4 weeks « 6 months « year « all time).
 */
const TIME_RANGE_PLAY_MODEL: Record<TasteTimeRange, { topPlays: number; decay: number }> = {
  short_term: { topPlays: 28, decay: 0.90 },
  medium_term: { topPlays: 90, decay: 0.93 },
  year_to_date: { topPlays: 120, decay: 0.93 },
  long_term: { topPlays: 320, decay: 0.955 },
};

function modelFor(term: TasteTimeRange) {
  return TIME_RANGE_PLAY_MODEL[term] ?? TIME_RANGE_PLAY_MODEL.medium_term;
}

function estimatedPlaysForRank(rankIndex: number, term: TasteTimeRange): number {
  const model = modelFor(term);
  return model.topPlays * Math.pow(model.decay, rankIndex);
}

/** Estimated total number of song plays across the ranked track list for the window. */
export function estimateTotalPlays(term: TasteTimeRange, trackCount: number): number {
  let plays = 0;
  for (let i = 0; i < trackCount; i++) plays += estimatedPlaysForRank(i, term);
  return Math.round(plays);
}

/** Time-range-aware listening hours from ranked track durations. */
export function estimateListeningHours(term: TasteTimeRange, durationsMs: number[]): number {
  let totalMs = 0;
  durationsMs.forEach((dur, i) => {
    const trackMs = dur && dur > 0 ? dur : DEFAULT_TRACK_MS;
    totalMs += trackMs * estimatedPlaysForRank(i, term);
  });
  return Math.round((totalMs / 3_600_000) * 10) / 10;
}

export function estimateListeningHoursFromTopTracks(
  tracks: TopTrack[],
  term: TasteTimeRange = 'long_term',
): number {
  return estimateListeningHours(term, tracks.map((t) => t.durationMs ?? DEFAULT_TRACK_MS));
}

export function estimateListeningHoursFromDashboardTracks(
  tracks: DashboardTopTrack[],
  term: TasteTimeRange = 'medium_term',
): number {
  return estimateListeningHours(term, tracks.map(() => DEFAULT_TRACK_MS));
}
