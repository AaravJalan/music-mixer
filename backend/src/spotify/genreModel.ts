import type { AudioFeatureVector, GenreStat } from '@music-mixer/shared';
import { AUDIO_FEATURE_KEYS } from '@music-mixer/shared';

/** Anchor genre → baseline 6D coordinates (2026 heuristic model). */
export const ANCHOR_GENRE_PROFILES: Record<string, AudioFeatureVector> = {
  pop: { danceability: 0.75, energy: 0.7, acousticness: 0.15, valence: 0.65, instrumentalness: 0.05, liveness: 0.12 },
  rock: { danceability: 0.5, energy: 0.85, acousticness: 0.1, valence: 0.55, instrumentalness: 0.15, liveness: 0.18 },
  electronic: { danceability: 0.8, energy: 0.9, acousticness: 0.05, valence: 0.6, instrumentalness: 0.45, liveness: 0.15 },
  edm: { danceability: 0.8, energy: 0.9, acousticness: 0.05, valence: 0.6, instrumentalness: 0.45, liveness: 0.15 },
  acoustic: { danceability: 0.45, energy: 0.3, acousticness: 0.8, valence: 0.4, instrumentalness: 0.1, liveness: 0.1 },
  folk: { danceability: 0.45, energy: 0.3, acousticness: 0.8, valence: 0.4, instrumentalness: 0.1, liveness: 0.1 },
  'hip hop': { danceability: 0.78, energy: 0.72, acousticness: 0.15, valence: 0.55, instrumentalness: 0.0, liveness: 0.1 },
  rap: { danceability: 0.75, energy: 0.7, acousticness: 0.12, valence: 0.5, instrumentalness: 0.0, liveness: 0.1 },
  'r&b': { danceability: 0.68, energy: 0.55, acousticness: 0.2, valence: 0.52, instrumentalness: 0.01, liveness: 0.1 },
  indie: { danceability: 0.55, energy: 0.58, acousticness: 0.25, valence: 0.48, instrumentalness: 0.05, liveness: 0.14 },
  alternative: { danceability: 0.5, energy: 0.7, acousticness: 0.1, valence: 0.42, instrumentalness: 0.02, liveness: 0.16 },
  country: { danceability: 0.58, energy: 0.55, acousticness: 0.45, valence: 0.55, instrumentalness: 0.01, liveness: 0.15 },
  jazz: { danceability: 0.48, energy: 0.35, acousticness: 0.55, valence: 0.45, instrumentalness: 0.35, liveness: 0.2 },
  classical: { danceability: 0.25, energy: 0.2, acousticness: 0.9, valence: 0.35, instrumentalness: 0.75, liveness: 0.15 },
  metal: { danceability: 0.35, energy: 0.92, acousticness: 0.02, valence: 0.28, instrumentalness: 0.08, liveness: 0.2 },
  latin: { danceability: 0.78, energy: 0.72, acousticness: 0.18, valence: 0.72, instrumentalness: 0.0, liveness: 0.15 },
  bollywood: { danceability: 0.65, energy: 0.7, acousticness: 0.3, valence: 0.7, instrumentalness: 0.05, liveness: 0.2 },
  'k-pop': { danceability: 0.72, energy: 0.78, acousticness: 0.1, valence: 0.68, instrumentalness: 0.02, liveness: 0.12 },
  soul: { danceability: 0.58, energy: 0.5, acousticness: 0.25, valence: 0.55, instrumentalness: 0.01, liveness: 0.12 },
  funk: { danceability: 0.75, energy: 0.7, acousticness: 0.15, valence: 0.72, instrumentalness: 0.02, liveness: 0.15 },
  default: { danceability: 0.55, energy: 0.6, acousticness: 0.2, valence: 0.5, instrumentalness: 0.05, liveness: 0.12 },
};

const ANCHOR_KEYS = Object.keys(ANCHOR_GENRE_PROFILES).filter((k) => k !== 'default');

const SUB_GENRE_RULES: Array<{ test: (g: string) => boolean; anchor: string }> = [
  { test: (g) => /indie rock|alt(?:ernative)? rock|hard rock|punk|grunge|post-rock|shoegaze/.test(g), anchor: 'rock' },
  { test: (g) => /synthpop|dance pop|teen pop|bubblegum|electropop|art pop/.test(g), anchor: 'pop' },
  { test: (g) => /k[\s-]?pop|j[\s-]?pop/.test(g), anchor: 'pop' },
  { test: (g) => /house|techno|trance|dubstep|drum and bass|dnb|garage/.test(g), anchor: 'electronic' },
  { test: (g) => /singer-songwriter|americana|bluegrass|roots/.test(g), anchor: 'folk' },
  { test: (g) => /trap|drill|gangsta|conscious hip hop/.test(g), anchor: 'hip hop' },
  { test: (g) => /indie folk|chamber pop|lo-fi/.test(g), anchor: 'indie' },
  { test: (g) => /death metal|black metal|thrash|metalcore/.test(g), anchor: 'metal' },
];

export interface WeightedGenre {
  genre: string;
  weight: number;
}

export type MacroCategory =
  | 'Macro_Electronic'
  | 'Macro_Rock'
  | 'Macro_HipHop'
  | 'Macro_Regional'
  | 'Macro_Acoustic';

export const MACRO_CATEGORY_LABELS: Record<MacroCategory, string> = {
  Macro_Electronic: 'Electronic',
  Macro_Rock: 'Rock',
  Macro_HipHop: 'Hip-Hop',
  Macro_Regional: 'Regional',
  Macro_Acoustic: 'Acoustic',
};

export const MACRO_GENRE_GROUPS: Record<MacroCategory, string[]> = {
  Macro_Electronic: ['electronic', 'edm', 'techno', 'house', 'synthpop', 'electropop', 'trance', 'dubstep'],
  Macro_Rock: ['metal', 'rock', 'alternative', 'punk', 'thrash', 'grunge', 'hard rock', 'indie rock'],
  Macro_HipHop: ['hip hop', 'rap', 'trap', 'lo-fi', 'lofi', 'r&b', 'drill', 'soul', 'funk'],
  Macro_Regional: ['bollywood', 'indian pop', 'k-pop', 'kpop', 'latin', 'reggaeton', 'bachata'],
  Macro_Acoustic: ['folk', 'acoustic', 'country', 'singer-songwriter', 'americana', 'bluegrass'],
};

const MACRO_PATTERN_RULES: Array<{ test: (g: string) => boolean; macro: MacroCategory }> = [
  { test: (g) => /bollywood|indian|desi|filmi|punjabi|tamil|telugu/.test(g), macro: 'Macro_Regional' },
  { test: (g) => /k[\s-]?pop|j[\s-]?pop|latin|reggaeton|bachata|cumbia/.test(g), macro: 'Macro_Regional' },
  { test: (g) => /techno|house|trance|dubstep|dnb|drum and bass|edm|electronic|synthpop|electropop/.test(g), macro: 'Macro_Electronic' },
  { test: (g) => /metal|thrash|punk|grunge|hard rock|alt(?:ernative)? rock|shoegaze/.test(g), macro: 'Macro_Rock' },
  { test: (g) => /hip hop|hip-hop|rap|trap|drill|lo[\s-]?fi|r&b|grime/.test(g), macro: 'Macro_HipHop' },
  { test: (g) => /folk|acoustic|country|singer-songwriter|americana|bluegrass|roots/.test(g), macro: 'Macro_Acoustic' },
];

const ADJACENT_MACRO_PAIRS: Array<[MacroCategory, MacroCategory]> = [
  ['Macro_Electronic', 'Macro_HipHop'],
  ['Macro_Electronic', 'Macro_Rock'],
  ['Macro_Rock', 'Macro_Acoustic'],
  ['Macro_HipHop', 'Macro_Acoustic'],
];

export const MACRO_MULTIPLIERS = {
  same: 1.0,
  adjacent: 0.85,
  distant: 0.65,
} as const;

function pairKey(a: MacroCategory, b: MacroCategory): string {
  return [a, b].sort().join('|');
}

const ADJACENT_PAIR_KEYS = new Set(
  ADJACENT_MACRO_PAIRS.map(([a, b]) => pairKey(a, b)),
);

export function resolveMacroCategory(genre: string): MacroCategory {
  const key = genre.toLowerCase().trim();
  if (!key) return 'Macro_Electronic';

  for (const rule of MACRO_PATTERN_RULES) {
    if (rule.test(key)) return rule.macro;
  }

  for (const [macro, genres] of Object.entries(MACRO_GENRE_GROUPS) as [MacroCategory, string[]][]) {
    for (const g of genres) {
      if (key.includes(g) || g.includes(key)) return macro;
    }
  }

  const anchor = resolveAnchorGenre(genre);
  for (const [macro, genres] of Object.entries(MACRO_GENRE_GROUPS) as [MacroCategory, string[]][]) {
    if (genres.includes(anchor)) return macro;
  }

  if (anchor === 'pop') return 'Macro_Electronic';
  if (anchor === 'indie' || anchor === 'jazz' || anchor === 'classical') return 'Macro_Acoustic';
  return 'Macro_Electronic';
}

export function macroDistanceMultiplier(macroA: MacroCategory, macroB: MacroCategory): number {
  if (macroA === macroB) return MACRO_MULTIPLIERS.same;
  if (ADJACENT_PAIR_KEYS.has(pairKey(macroA, macroB))) return MACRO_MULTIPLIERS.adjacent;
  return MACRO_MULTIPLIERS.distant;
}

export function resolveAnchorGenre(genre: string): string {
  const key = genre.toLowerCase().trim();
  if (!key) return 'default';

  if (ANCHOR_GENRE_PROFILES[key]) return key;

  for (const anchor of ANCHOR_KEYS) {
    if (key.includes(anchor) || anchor.includes(key)) return anchor;
  }

  for (const rule of SUB_GENRE_RULES) {
    if (rule.test(key)) return rule.anchor;
  }

  return 'default';
}

function profileForAnchor(anchor: string): AudioFeatureVector {
  return ANCHOR_GENRE_PROFILES[anchor] ?? ANCHOR_GENRE_PROFILES.default;
}

export function computeWeightedTasteVector(weightedGenres: WeightedGenre[]): AudioFeatureVector {
  if (weightedGenres.length === 0) return { ...ANCHOR_GENRE_PROFILES.default };

  const accum = Object.fromEntries(AUDIO_FEATURE_KEYS.map((k) => [k, 0])) as Record<
    keyof AudioFeatureVector,
    number
  >;
  let totalWeight = 0;

  for (const { genre, weight } of weightedGenres) {
    if (weight <= 0) continue;
    const anchor = resolveAnchorGenre(genre);
    const profile = profileForAnchor(anchor);
    totalWeight += weight;
    for (const k of AUDIO_FEATURE_KEYS) {
      accum[k] += profile[k] * weight;
    }
  }

  if (totalWeight === 0) return { ...ANCHOR_GENRE_PROFILES.default };

  const result = {} as AudioFeatureVector;
  for (const k of AUDIO_FEATURE_KEYS) {
    result[k] = accum[k] / totalWeight;
  }
  return result;
}

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
