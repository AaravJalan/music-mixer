import type { GenreStat } from '@music-mixer/shared';

interface ArtistWithGenres {
  genres: string[];
}

interface WeightedGenreInput {
  genre: string;
  weight: number;
}

/** Aggregate genre frequency across artists (each artist contributes its genres once). */
export function aggregateGenres(artists: ArtistWithGenres[], limit = 10): GenreStat[] {
  const counts = new Map<string, number>();

  for (const artist of artists) {
    const genres = artist.genres ?? [];
    const seen = new Set<string>();
    for (const genre of genres) {
      if (seen.has(genre)) continue;
      seen.add(genre);
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }

  const total = [...counts.values()].reduce((sum, n) => sum + n, 0) || 1;
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([genre, count]) => ({
      genre,
      count,
      percentage: Math.round((count / total) * 100),
    }));
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

/** Genres appearing in both users' top-N genre lists. */
export function sharedGenres(genresA: GenreStat[], genresB: GenreStat[]): string[] {
  return sharedGenresMulti([genresA, genresB]);
}
