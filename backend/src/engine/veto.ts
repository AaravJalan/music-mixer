/** Regional genre buckets prone to language barriers (non-English). */
export const LANGUAGE_VETO_BUCKETS: Record<string, string[]> = {
  hindi: ['bollywood', 'desi pop', 'filmi', 'punjabi', 'indian', 'tamil', 'telugu', 'sufi', 'ghazal'],
  spanish: ['latin', 'reggaeton', 'urbano', 'latin pop', 'salsa'],
  french: ['french pop', 'french hip hop', 'chanson'],
  latin: ['latin', 'latin rock', 'latin hip hop'],
  korean: ['k-pop', 'k-r&b', 'k-hip hop', 'kpop'],
  chinese: ['mandopop', 'cantopop', 'c-pop'],
};

const ALL_REGIONAL_PATTERNS = Object.values(LANGUAGE_VETO_BUCKETS).flat();

const DOMINANCE_THRESHOLD = 0.5;

function normalizeGenre(genre: string): string {
  return genre.toLowerCase().trim();
}

function matchesRegionalBucket(genre: string, bucketKey?: string): boolean {
  const key = normalizeGenre(genre);
  if (bucketKey) {
    const patterns = LANGUAGE_VETO_BUCKETS[bucketKey] ?? [];
    return patterns.some((p) => key.includes(p) || p.includes(key));
  }
  return ALL_REGIONAL_PATTERNS.some((p) => key.includes(p) || p.includes(key));
}

function bucketScores(genres: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  if (genres.length === 0) return counts;

  for (const genre of genres) {
    const key = normalizeGenre(genre);
    for (const [bucket, patterns] of Object.entries(LANGUAGE_VETO_BUCKETS)) {
      if (patterns.some((p) => key.includes(p) || p.includes(key))) {
        counts.set(bucket, (counts.get(bucket) ?? 0) + 1);
      }
    }
  }

  const total = genres.length;
  const scores = new Map<string, number>();
  for (const [bucket, count] of counts) {
    scores.set(bucket, count / total);
  }
  return scores;
}

function fallbackGenres(genres: string[]): string[] {
  return genres.filter((g) => !matchesRegionalBucket(g));
}

function filterOutBucket(genres: string[], bucketKey: string): string[] {
  const patterns = LANGUAGE_VETO_BUCKETS[bucketKey] ?? [];
  return genres.filter((g) => {
    const key = normalizeGenre(g);
    return !patterns.some((p) => key.includes(p) || p.includes(key));
  });
}

/**
 * Veto regional search genres for participant A when others have zero presence
 * in A's dominant regional bucket and A has non-regional fallbacks.
 */
function applyVetoToParticipantGenres(
  genresA: string[],
  otherGenrePools: string[][],
): string[] {
  if (genresA.length === 0 || otherGenrePools.length === 0) return genresA;

  const scoresA = bucketScores(genresA);
  let dominantBucket: string | null = null;
  let dominantScore = 0;

  for (const [bucket, score] of scoresA) {
    if (score >= DOMINANCE_THRESHOLD && score > dominantScore) {
      dominantBucket = bucket;
      dominantScore = score;
    }
  }

  if (!dominantBucket) return genresA;

  const othersShareBucket = otherGenrePools.some((pool) => {
    const scores = bucketScores(pool);
    return (scores.get(dominantBucket!) ?? 0) > 0;
  });

  if (othersShareBucket) return genresA;

  const fallbacks = fallbackGenres(genresA);
  if (fallbacks.length === 0) {
    console.info(
      `[linguisticVeto] No fallback for ${dominantBucket} — keeping regional genres to avoid empty playlist`,
    );
    return genresA;
  }

  const filtered = filterOutBucket(genresA, dominantBucket);
  console.info(
    `[linguisticVeto] Vetoed ${dominantBucket} bucket for exclusive listener — ` +
    `using ${filtered.length} genre(s): ${filtered.join(', ')}`,
  );
  return filtered.length > 0 ? filtered : fallbacks;
}

/** Apply linguistic veto across all participant genre pools before search. */
export function applyLinguisticVetoToPools(genrePools: string[][]): string[][] {
  return genrePools.map((pool, index) => {
    const others = genrePools.filter((_, i) => i !== index);
    return applyVetoToParticipantGenres(pool, others);
  });
}
