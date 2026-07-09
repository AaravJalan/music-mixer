import type { GenreStat } from '@music-mixer/shared';

interface WeightedGenreInput {
  genre: string;
  weight: number;
}

/** Rank-weighted genre aggregation for dashboard display and vector hints. */
export function aggregateWeightedGenres(weighted: WeightedGenreInput[], limit = 10): GenreStat[] {
  const totals = new Map<string, number>();

  for (const { genre, weight } of weighted) {
    if (!genre || weight <= 0) continue;
    totals.set(genre, (totals.get(genre) ?? 0) + weight);
  }

  const grandTotal = [...totals.values()].reduce((sum, n) => sum + n, 0) || 1;
  return [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre, count]) => ({
      genre,
      count: Math.round(count * 10) / 10,
      percentage: Math.round((count / grandTotal) * 100),
    }));
}

/** Genres appearing in all participants' top genre lists. */
export function sharedGenresMulti(allGenres: GenreStat[][]): string[] {
  if (allGenres.length === 0) return [];
  const [first, ...rest] = allGenres;
  const sets = rest.map((g) => new Set(g.map((x) => x.genre)));
  return first
    .map((g) => g.genre)
    .filter((genre) => sets.every((set) => set.has(genre)));
}
