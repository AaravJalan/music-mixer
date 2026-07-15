/** Lexical genre inference when Spotify returns empty genres (Feb 2026 API). */

const TEXT_RULES: Array<{ pattern: RegExp; genres: string[] }> = [
  { pattern: /\blo-?fi\b|\bchillhop\b|\bchill\b/, genres: ['lo-fi', 'indie'] },
  { pattern: /\bacoustic\b|\bunplugged\b/, genres: ['acoustic', 'folk'] },
  { pattern: /\bremix\b|\bedm\b|\belectro\b|\bhouse\b|\btechno\b/, genres: ['electronic', 'edm'] },
  { pattern: /\bmetal\b|\bmetalcore\b|\bdeathcore\b/, genres: ['metal', 'rock'] },
  { pattern: /\bhip[\s-]?hop\b|\brap\b|\bdrill\b|\btrap\b/, genres: ['hip hop', 'rap'] },
  { pattern: /\br&b\b|\bsoul\b|\bneo[\s-]?soul\b/, genres: ['r&b', 'soul'] },
  { pattern: /\bjazz\b|\bblues\b/, genres: ['jazz', 'blues'] },
  { pattern: /\bclassical\b|\borchestra\b|\bsymphony\b/, genres: ['classical'] },
  { pattern: /\bcountry\b|\bbluegrass\b/, genres: ['country', 'folk'] },
  { pattern: /\blatin\b|\breggaeton\b|\bsalsa\b|\bbachata\b/, genres: ['latin'] },
  { pattern: /\bk[\s-]?pop\b|\bj[\s-]?pop\b/, genres: ['k-pop', 'pop'] },
  { pattern: /\bbollywood\b|\bhindi\b|\btamil\b|\btelugu\b|\bbhojpuri\b/, genres: ['bollywood'] },
  { pattern: /\bindie\b/, genres: ['indie', 'alternative'] },
  { pattern: /\bfolk\b|\bsinger-songwriter\b/, genres: ['folk', 'acoustic'] },
  { pattern: /\brock\b|\bpunk\b|\bgrunge\b/, genres: ['rock', 'alternative'] },
  { pattern: /\bpop\b/, genres: ['pop'] },
  { pattern: /\bfunk\b|\bdisco\b/, genres: ['funk', 'dance'] },
];

export function inferGenresFromText(...texts: (string | undefined)[]): string[] {
  const found = new Set<string>();
  const combined = texts.filter(Boolean).join(' ').toLowerCase();

  if (!combined.trim()) return [];



  for (const rule of TEXT_RULES) {
    if (rule.pattern.test(combined)) {
      for (const g of rule.genres) found.add(g);
    }
  }

  return [...found];
}

export function inferGenresFromArtistName(name: string): string[] {
  return inferGenresFromText(name);
}
