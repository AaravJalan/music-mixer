import type { TasteTimeRange } from '@music-mixer/shared';

export const TASTE_TIME_RANGE_OPTIONS: { value: TasteTimeRange; label: string; short: string }[] = [
  { value: 'short_term', label: '4 weeks', short: '4w' },
  { value: 'medium_term', label: '6 months', short: '6m' },
  { value: 'year_to_date', label: 'This year', short: 'YTD' },
  { value: 'long_term', label: 'All time', short: 'All' },
];

export function tasteTimeRangeLabel(term: TasteTimeRange): string {
  return TASTE_TIME_RANGE_OPTIONS.find((o) => o.value === term)?.label ?? term;
}

export const AUDIO_FEATURE_INFO: Record<string, { title: string; description: string }> = {
  danceability: {
    title: 'Danceability',
    description: 'How suitable a track is for dancing — tempo, rhythm stability, and beat strength.',
  },
  energy: {
    title: 'Energy',
    description: 'Perceived intensity and activity — loud, fast, and noisy tracks score higher.',
  },
  acousticness: {
    title: 'Acousticness',
    description: 'Confidence that the track is acoustic rather than electronic or produced.',
  },
  valence: {
    title: 'Valence',
    description: 'Musical positivity — cheerful, happy tracks vs sad, angry, or dark moods.',
  },
  instrumentalness: {
    title: 'Instrumentalness',
    description: 'Likelihood the track has no vocals — speech-like sounds lower this score.',
  },
  liveness: {
    title: 'Liveness',
    description: 'Presence of a live audience — higher values suggest a live performance feel.',
  },
};
