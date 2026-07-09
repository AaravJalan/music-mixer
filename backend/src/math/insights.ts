import type { AudioFeatureVector, GenreStat } from '@music-mixer/shared';
import { AUDIO_FEATURE_KEYS } from '@music-mixer/shared';
import type { AudioFeatureDimension } from '@music-mixer/shared';
import {
  ANCHOR_GENRE_PROFILES,
  computeWeightedTasteVector,
  resolveAnchorGenre,
  type WeightedGenre,
} from '../spotify/genreModel';
import type { ProfileArtist } from '../spotify/taste';
import type { TopTrack } from '../spotify/tracks';

const BROAD_ANCHORS = new Set(['pop', 'rock', 'electronic', 'edm', 'country', 'hip hop', 'rap', 'r&b']);

const TERM_LABELS: Record<string, string> = {
  short_term: 'last 4 weeks',
  medium_term: 'last 6 months',
  year_to_date: 'this year',
  long_term: 'all time',
};

export interface DashboardInsights {
  nicheScore: number;
  moodConsistencyIndex: number;
  profileLabels: string[];
  dimensionLabels: Record<AudioFeatureDimension, string>;
  headline: string;
  summaries: string[];
  listeningStyle: 'focused' | 'eclectic';
  topGenre: { name: string; percentage: number } | null;
  avgPopularity: number;
  avgTempo: number;
  topReleaseEra: string;
}

function formatGenre(genre: string): string {
  return genre.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function isNicheGenre(genre: string): boolean {
  const key = genre.toLowerCase().trim();
  if (BROAD_ANCHORS.has(key)) return false;
  if (ANCHOR_GENRE_PROFILES[key]) return true;
  const anchor = resolveAnchorGenre(genre);
  return anchor === 'default' || !BROAD_ANCHORS.has(anchor);
}

export function computeNicheScore(weightedGenres: WeightedGenre[]): number {
  if (weightedGenres.length === 0) return 0;

  let nicheWeight = 0;
  let totalWeight = 0;

  for (const { genre, weight } of weightedGenres) {
    if (weight <= 0) continue;
    totalWeight += weight;
    if (isNicheGenre(genre)) nicheWeight += weight;
  }

  if (totalWeight === 0) return 0;
  return Math.round((nicheWeight / totalWeight) * 100) / 100;
}

function trackGenres(track: TopTrack, artistGenreMap: Map<string, string[]>): string[] {
  const genres = track.artistIds.flatMap((id) => artistGenreMap.get(id) ?? []);
  return [...new Set(genres)];
}

export function computeMoodConsistencyIndex(
  tracks: TopTrack[],
  artistGenreMap: Map<string, string[]>,
): number {
  if (tracks.length < 2) return 1;

  const vectors = tracks.map((track) => {
    const genres = trackGenres(track, artistGenreMap);
    const weighted = genres.map((genre) => ({ genre, weight: 1 }));
    return computeWeightedTasteVector(weighted);
  });

  const dimVariances: number[] = [];
  for (const key of AUDIO_FEATURE_KEYS) {
    const values = vectors.map((v) => v[key]);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    dimVariances.push(variance);
  }

  const avgVariance = dimVariances.reduce((s, v) => s + v, 0) / dimVariances.length;
  const stdDev = Math.sqrt(avgVariance);
  return Math.round(Math.max(0, 1 - stdDev * 3) * 100) / 100;
}

const DIMENSION_LABELS: Array<{
  key: AudioFeatureDimension;
  high: { threshold: number; label: string };
  low?: { threshold: number; label: string };
}> = [
  { key: 'energy', high: { threshold: 0.75, label: 'High energy' }, low: { threshold: 0.35, label: 'Mellow' } },
  { key: 'danceability', high: { threshold: 0.75, label: 'Danceable' }, low: { threshold: 0.4, label: 'Slow tempo' } },
  { key: 'acousticness', high: { threshold: 0.65, label: 'Acoustic' }, low: { threshold: 0.2, label: 'Produced' } },
  { key: 'valence', high: { threshold: 0.65, label: 'Upbeat' }, low: { threshold: 0.35, label: 'Melancholic' } },
  { key: 'instrumentalness', high: { threshold: 0.45, label: 'Instrumental' }, low: { threshold: 0.1, label: 'Vocal-driven' } },
  { key: 'liveness', high: { threshold: 0.45, label: 'Live-feel' }, low: { threshold: 0.15, label: 'Studio' } },
];

function dominantDimension(vector: AudioFeatureVector): { key: AudioFeatureDimension; label: string } {
  const sorted = [...AUDIO_FEATURE_KEYS]
    .map((key) => ({ key, value: vector[key] }))
    .sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const rule = DIMENSION_LABELS.find((r) => r.key === top.key);
  const label = top.value >= (rule?.high.threshold ?? 0.7)
    ? rule?.high.label ?? top.key
    : rule?.low && top.value <= rule.low.threshold
      ? rule.low.label
      : formatGenre(top.key);
  return { key: top.key, label };
}

function interpretVector(vector: AudioFeatureVector): Pick<DashboardInsights, 'profileLabels' | 'dimensionLabels'> {
  const dimensionLabels = {} as Record<AudioFeatureDimension, string>;
  const profileLabels: string[] = [];

  for (const rule of DIMENSION_LABELS) {
    const value = vector[rule.key];
    if (value >= rule.high.threshold) {
      dimensionLabels[rule.key] = rule.high.label;
      profileLabels.push(rule.high.label);
    } else if (rule.low && value <= rule.low.threshold) {
      dimensionLabels[rule.key] = rule.low.label;
      profileLabels.push(rule.low.label);
    } else {
      dimensionLabels[rule.key] = 'Balanced';
    }
  }

  return {
    profileLabels: [...new Set(profileLabels)].slice(0, 4),
    dimensionLabels,
  };
}

function buildSummaries(
  term: string,
  genres: GenreStat[],
  artists: ProfileArtist[],
  tracks: TopTrack[],
  vector: AudioFeatureVector,
  nicheScore: number,
  moodConsistency: number,
  artistGenreMap: Map<string, string[]>,
): { headline: string; summaries: string[]; topGenre: DashboardInsights['topGenre']; listeningStyle: 'focused' | 'eclectic' } {
  const period = TERM_LABELS[term] ?? term;
  const summaries: string[] = [];

  const topGenre = genres[0]
    ? { name: formatGenre(genres[0].genre), percentage: genres[0].percentage }
    : null;

  if (topGenre) {
    summaries.push(`#1 genre over ${period}: ${topGenre.name} (${topGenre.percentage}% of your taste)`);
  }

  if (artists[0]) {
    const g = artistGenreMap.get(artists[0].id)?.[0];
    summaries.push(
      `#1 artist: ${artists[0].name}${g ? ` · ${formatGenre(g)}` : ''}`,
    );
  }

  if (tracks[0]) {
    summaries.push(`Most played track: "${tracks[0].name}" by ${tracks[0].artist}`);
  }

  const dom = dominantDimension(vector);
  summaries.push(`Sound profile: ${dom.label} (${Math.round(vector[dom.key] * 100)}% ${dom.key})`);

  const listeningStyle: 'focused' | 'eclectic' = moodConsistency >= 0.6 ? 'focused' : 'eclectic';
  summaries.push(
    listeningStyle === 'focused'
      ? `You stick to one vibe — top tracks cluster tightly over ${period}`
      : `You genre-hop — your top tracks span many moods over ${period}`,
  );

  if (nicheScore >= 0.5) {
    summaries.push('Deep cuts listener — a lot of your taste sits outside mainstream genres');
  } else if (genres.length >= 2) {
    summaries.push(`Runner-up genre: ${formatGenre(genres[1].genre)} (${genres[1].percentage}%)`);
  }

  const headline = topGenre && artists[0]
    ? `Your ${period}: ${artists[0].name} × ${topGenre.name}`
    : topGenre
      ? `Your ${period}: ${topGenre.name} era`
      : `Your listening over ${period}`;

  return { headline, summaries, topGenre, listeningStyle };
}

export function buildDashboardInsights(
  term: string,
  vector: AudioFeatureVector,
  weightedGenres: WeightedGenre[],
  genres: GenreStat[],
  artists: ProfileArtist[],
  tracks: TopTrack[],
  artistGenreMap: Map<string, string[]>,
): DashboardInsights {
  const base = interpretVector(vector);
  const nicheScore = computeNicheScore(weightedGenres);
  const moodConsistencyIndex = computeMoodConsistencyIndex(tracks, artistGenreMap);
  const { headline, summaries, topGenre, listeningStyle } = buildSummaries(
    term,
    genres,
    artists,
    tracks,
    vector,
    nicheScore,
    moodConsistencyIndex,
    artistGenreMap,
  );

  return {
    ...base,
    nicheScore,
    moodConsistencyIndex,
    profileLabels: base.profileLabels.length > 0 ? base.profileLabels : ['Eclectic'],
    headline,
    summaries,
    topGenre,
    listeningStyle,
    avgPopularity: 0,
    avgTempo: 0,
    topReleaseEra: 'Unknown',
  };
}
