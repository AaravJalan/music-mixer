import type { GenreStat } from '@music-mixer/shared';
import {
  MACRO_CATEGORY_LABELS,
  type MacroCategory,
  macroDistanceMultiplier,
  resolveMacroCategory,
} from './featureEstimate';

export function dominantMacroCategory(genres: GenreStat[]): MacroCategory | null {
  if (genres.length === 0) return null;

  const scores = new Map<MacroCategory, number>();
  for (const g of genres) {
    const macro = resolveMacroCategory(g.genre);
    scores.set(macro, (scores.get(macro) ?? 0) + (g.percentage || g.count || 1));
  }

  let best: MacroCategory | null = null;
  let bestScore = -1;
  for (const [macro, score] of scores) {
    if (score > bestScore) {
      best = macro;
      bestScore = score;
    }
  }
  return best;
}

export function macroPenaltyMultiplier(genresA: GenreStat[], genresB: GenreStat[]): number {
  const macroA = dominantMacroCategory(genresA);
  const macroB = dominantMacroCategory(genresB);

  if (!macroA || !macroB) {
    console.warn(
      '[macroPenalty] Missing genre data for macro analysis — applying distant fallback (0.65x)',
    );
    return 0.65;
  }

  return macroDistanceMultiplier(macroA, macroB);
}

export function applyMacroPenalty(baseSimilarity: number, multiplier: number): number {
  return Math.min(1, Math.max(0, baseSimilarity * multiplier));
}

export interface MacroAdjustedSimilarity {
  similarityScore: number;
  macroA: MacroCategory | null;
  macroB: MacroCategory | null;
  multiplier: number;
}

/** Step A–C: dominant macros → distance multiplier → adjusted cosine similarity. */
export function computeMacroAdjustedSimilarity(
  genresA: GenreStat[],
  genresB: GenreStat[],
  baseSimilarity: number,
  labels?: { userA?: string; userB?: string },
): MacroAdjustedSimilarity {
  const macroA = dominantMacroCategory(genresA);
  const macroB = dominantMacroCategory(genresB);
  const multiplier = macroPenaltyMultiplier(genresA, genresB);
  const similarityScore = applyMacroPenalty(baseSimilarity, multiplier);

  const nameA = labels?.userA ?? 'User A';
  const nameB = labels?.userB ?? 'User B';

  if (macroA && macroB) {
    const labelA = MACRO_CATEGORY_LABELS[macroA];
    const labelB = MACRO_CATEGORY_LABELS[macroB];
    console.info(
      `[macroPenalty] ${nameA}=${labelA}, ${nameB}=${labelB} → ${multiplier}x ` +
      `(base ${(baseSimilarity * 100).toFixed(1)}% → final ${(similarityScore * 100).toFixed(1)}%)`,
    );
  }

  return { similarityScore, macroA, macroB, multiplier };
}
