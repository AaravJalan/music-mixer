import type { AudioFeatureVector } from '@music-mixer/shared';
import { AUDIO_FEATURE_KEYS, VECTOR_DIMENSION } from '@music-mixer/shared';

/** Convert an AudioFeatureVector to a dense numeric array for linear algebra. */
export function toDenseVector(v: AudioFeatureVector): number[] {
  return AUDIO_FEATURE_KEYS.map((key) => v[key]);
}

/** Compute the arithmetic mean of N feature vectors (centroid in R^6). */
function averageVectors(vectors: AudioFeatureVector[]): AudioFeatureVector {
  if (vectors.length === 0) {
    throw new Error('Cannot average an empty set of vectors');
  }

  const sums = new Array<number>(VECTOR_DIMENSION).fill(0);
  for (const v of vectors) {
    const dense = toDenseVector(v);
    for (let i = 0; i < VECTOR_DIMENSION; i++) {
      sums[i] += dense[i];
    }
  }

  const n = vectors.length;
  const result = {} as AudioFeatureVector;
  AUDIO_FEATURE_KEYS.forEach((key, i) => {
    result[key] = sums[i] / n;
  });
  return result;
}

/** Component-wise weighted blend: m = wA·a + wB·b (weights normalized) */
function weightedBlend(
  a: AudioFeatureVector,
  b: AudioFeatureVector,
  weightA: number,
  weightB: number,
): AudioFeatureVector {
  const total = weightA + weightB;
  if (total === 0) return midpoint(a, b);
  const wA = weightA / total;
  const wB = weightB / total;
  const result = {} as AudioFeatureVector;
  for (const key of AUDIO_FEATURE_KEYS) {
    result[key] = wA * a[key] + wB * b[key];
  }
  return result;
}

/** Weighted centroid across N vectors: c = Σ(wᵢ·vᵢ) / Σ(wᵢ) */
export function weightedCentroid(
  vectors: AudioFeatureVector[],
  weights: number[],
): AudioFeatureVector {
  if (vectors.length === 0) {
    throw new Error('Cannot compute centroid of empty vector set');
  }
  if (vectors.length !== weights.length) {
    throw new Error('Vector and weight counts must match');
  }

  const totalWeight = weights.reduce((s, w) => s + w, 0) || vectors.length;
  const result = {} as AudioFeatureVector;

  for (const key of AUDIO_FEATURE_KEYS) {
    let sum = 0;
    for (let i = 0; i < vectors.length; i++) {
      sum += vectors[i][key] * (weights[i] || 1);
    }
    result[key] = sum / totalWeight;
  }
  return result;
}

/** Component-wise midpoint: m = (a + b) / 2 */
function midpoint(a: AudioFeatureVector, b: AudioFeatureVector): AudioFeatureVector {
  const result = {} as AudioFeatureVector;
  for (const key of AUDIO_FEATURE_KEYS) {
    result[key] = (a[key] + b[key]) / 2;
  }
  return result;
}
