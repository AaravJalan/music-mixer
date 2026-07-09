import type { AudioFeatureVector } from '@music-mixer/shared';
import { toDenseVector } from './vector';

/**
 * Cosine similarity: cos(θ) = (a · b) / (||a|| · ||b||)
 *
 * Returns a value in [0, 1] when both vectors have non-negative components
 * (Spotify audio features are always ∈ [0, 1]).
 */
export function cosineSimilarity(a: AudioFeatureVector, b: AudioFeatureVector): number {
  const va = toDenseVector(a);
  const vb = toDenseVector(b);

  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < va.length; i++) {
    // Mean-center at 0.5 to convert uncentered cosine to Pearson-like correlation
    const centeredA = va[i] - 0.5;
    const centeredB = vb[i] - 0.5;

    dot += centeredA * centeredB;
    normA += centeredA * centeredA;
    normB += centeredB * centeredB;
  }

  const denominator = Math.sqrt(normA) * Math.sqrt(normB);
  if (denominator === 0) return 0;

  const correlation = dot / denominator;
  // Map [-1, 1] correlation back to [0, 1] scale for the frontend
  return (correlation + 1) / 2;
}

/** Human-readable compatibility label from cosine similarity score. */
export function compatibilityLabel(score: number): string {
  if (score >= 0.95) return 'Soulmates';
  if (score >= 0.85) return 'Perfect Harmony';
  if (score >= 0.75) return 'Great Match';
  if (score >= 0.60) return 'Solid Vibe';
  if (score >= 0.45) return 'Interesting Mix';
  if (score >= 0.30) return 'Opposites Attract';
  return 'Chaotic Energy';
}

/** Mean pairwise cosine similarity across all unique pairs. */
export function averagePairwiseSimilarity(vectors: AudioFeatureVector[]): number {
  if (vectors.length < 2) return 1;
  let sum = 0;
  let count = 0;
  for (let i = 0; i < vectors.length; i++) {
    for (let j = i + 1; j < vectors.length; j++) {
      sum += cosineSimilarity(vectors[i], vectors[j]);
      count++;
    }
  }
  return count > 0 ? sum / count : 0;
}
