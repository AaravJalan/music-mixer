import type { AudioFeatureVector, DashboardTopTrack, SonicOutlierInsight } from '@music-mixer/shared';
import { AUDIO_FEATURE_KEYS } from '@music-mixer/shared';
import { computeWeightedTasteVector } from '../spotify/genreModel';
import { inferGenresFromText } from '../spotify/inference';

const FEATURE_LABELS: Record<string, string> = {
  danceability: 'Danceability',
  energy: 'Energy',
  acousticness: 'Acousticness',
  valence: 'Valence',
  instrumentalness: 'Instrumentalness',
  liveness: 'Liveness',
};

function estimateTrackVector(name: string, artist: string): AudioFeatureVector {
  const genres = inferGenresFromText(name, artist);
  if (genres.length === 0) {
    return computeWeightedTasteVector([{ genre: 'pop', weight: 1 }]);
  }
  return computeWeightedTasteVector(genres.map((genre) => ({ genre, weight: 1 })));
}

/** Population std-dev of per-dimension deltas from baseline. */
function deviationFromBaseline(trackVector: AudioFeatureVector, baseline: AudioFeatureVector): number {
  const deltas = AUDIO_FEATURE_KEYS.map((key) => trackVector[key] - baseline[key]);
  const mean = deltas.reduce((s, d) => s + d, 0) / deltas.length;
  const variance = deltas.reduce((s, d) => s + (d - mean) ** 2, 0) / deltas.length;
  return Math.sqrt(variance);
}

function dominantDelta(
  trackVector: AudioFeatureVector,
  baseline: AudioFeatureVector,
): { key: string; delta: number } {
  let best = { key: AUDIO_FEATURE_KEYS[0], delta: 0 };
  for (const key of AUDIO_FEATURE_KEYS) {
    const delta = trackVector[key] - baseline[key];
    if (Math.abs(delta) > Math.abs(best.delta)) {
      best = { key, delta };
    }
  }
  return best;
}

export function findSonicOutlier(
  tracks: DashboardTopTrack[],
  baseline: AudioFeatureVector,
): SonicOutlierInsight | null {
  if (tracks.length === 0) return null;

  let best: { track: DashboardTopTrack; score: number; vector: AudioFeatureVector } | null = null;

  for (const track of tracks) {
    const vector = estimateTrackVector(track.name, track.artist);
    const score = deviationFromBaseline(vector, baseline);
    if (!best || score > best.score) {
      best = { track, score, vector };
    }
  }

  if (!best || best.score < 0.05) return null;

  const { key, delta } = dominantDelta(best.vector, baseline);
  const direction = delta > 0 ? 'higher' : 'lower';
  const label = FEATURE_LABELS[key] ?? key;

  const dimensionDeltas = Object.fromEntries(
    AUDIO_FEATURE_KEYS.map((k) => [k, Math.round((best!.vector[k] - baseline[k]) * 100) / 100]),
  );

  return {
    track: best.track,
    deviationScore: Math.round(best.score * 1000) / 1000,
    outlierVector: best.vector,
    baselineVector: baseline,
    headline: `Sonic Outlier: "${best.track.name}"`,
    explanation: `"${best.track.name}" by ${best.track.artist} deviates most from your taste shape — notably ${direction} ${label.toLowerCase()} than your usual profile.`,
    dimensionDeltas,
  };
}
