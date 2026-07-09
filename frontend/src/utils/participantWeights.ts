/** Even integer weights that sum to 100. */
export function evenParticipantWeights(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(100 / count);
  const weights = Array(count).fill(base);
  weights[0] += 100 - weights.reduce((sum, w) => sum + w, 0);
  return weights;
}

/** Adjust one participant's weight; redistribute remainder across others (min 1% each). */
export function redistributeParticipantWeight(
  weights: number[],
  index: number,
  nextValue: number,
): number[] {
  if (weights.length <= 1) return [100];
  if (index < 0 || index >= weights.length) return weights;

  const clamped = Math.min(100 - (weights.length - 1), Math.max(1, Math.round(nextValue)));
  const next = [...weights];
  next[index] = clamped;

  const otherIndices = next.map((_, i) => i).filter((i) => i !== index);
  let remaining = 100 - clamped;
  const otherTotal = otherIndices.reduce((sum, i) => sum + next[i], 0);

  if (otherTotal <= 0) {
    const even = Math.floor(remaining / otherIndices.length);
    for (const i of otherIndices) next[i] = even;
    next[otherIndices[0]] += remaining - even * otherIndices.length;
    return next;
  }

  let assigned = 0;
  for (let o = 0; o < otherIndices.length; o++) {
    const i = otherIndices[o];
    if (o === otherIndices.length - 1) {
      next[i] = Math.max(1, remaining - assigned);
    } else {
      const share = Math.max(1, Math.round((next[i] / otherTotal) * remaining));
      next[i] = share;
      assigned += share;
    }
  }

  const drift = next.reduce((sum, w) => sum + w, 0) - 100;
  if (drift !== 0) {
    const fix = otherIndices[otherIndices.length - 1];
    next[fix] = Math.max(1, next[fix] - drift);
  }

  return next;
}
