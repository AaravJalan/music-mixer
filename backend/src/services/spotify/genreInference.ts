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
  { pattern: /\bbollywood\b|\bhindi\b|\btamil\b|\btelugu\b|\bbhojpuri\b/, genres: ['bollywood', 'indian'] },
  { pattern: /\bindie\b/, genres: ['indie', 'alternative'] },
  { pattern: /\bfolk\b|\bsinger-songwriter\b/, genres: ['folk', 'acoustic'] },
  { pattern: /\brock\b|\bpunk\b|\bgrunge\b/, genres: ['rock', 'alternative'] },
  { pattern: /\bpop\b/, genres: ['pop'] },
  { pattern: /\bfunk\b|\bdisco\b/, genres: ['funk', 'dance'] },
];

/** Well-known artists → genres when API omits them. */
const KNOWN_ARTIST_GENRES: Record<string, string[]> = {
  'taylor swift': ['pop', 'country'],
  'coldplay': ['alternative', 'rock'],
  'ed sheeran': ['pop', 'folk'],
  'the weeknd': ['pop', 'r&b'],
  'drake': ['hip hop', 'rap'],
  'ariana grande': ['pop', 'r&b'],
  'billie eilish': ['pop', 'indie'],
  'eminem': ['rap', 'hip hop'],
  'beyoncé': ['pop', 'r&b'],
  'beyonce': ['pop', 'r&b'],
  'kendrick lamar': ['hip hop', 'rap'],
  'post malone': ['hip hop', 'pop'],
  'dua lipa': ['pop', 'dance'],
  'harry styles': ['pop', 'rock'],
  'olivia rodrigo': ['pop', 'indie pop'],
  'the beatles': ['rock', 'pop'],
  'queen': ['rock', 'classic rock'],
  'radiohead': ['alternative', 'rock'],
  'arctic monkeys': ['indie', 'rock'],
  'pritam': ['bollywood', 'indian'],
  'a.r. rahman': ['bollywood', 'indian'],
  'ar rahman': ['bollywood', 'indian'],
  'arijit singh': ['bollywood', 'indian'],
  'badshah': ['bollywood', 'hip hop'],
  'neha kakkar': ['bollywood', 'pop'],
  'shreya ghoshal': ['bollywood', 'indian'],
  'kk': ['bollywood', 'indian'],
  'sonu nigam': ['bollywood', 'indian'],
  'atif aslam': ['bollywood', 'pop'],
  'marshmello': ['edm', 'electronic'],
  'calvin harris': ['edm', 'electronic'],
  'david guetta': ['edm', 'electronic'],
  'skrillex': ['edm', 'electronic'],
  'metallica': ['metal', 'rock'],
  'linkin park': ['rock', 'alternative'],
  'imagine dragons': ['rock', 'pop'],
  'twenty one pilots': ['alternative', 'indie'],
  'kanye west': ['hip hop', 'rap'],
  'travis scott': ['hip hop', 'rap'],
  'playboi carti': ['hip hop', 'rap'],
  'bad bunny': ['latin', 'reggaeton'],
  'shakira': ['latin', 'pop'],
  'rihanna': ['pop', 'r&b'],
  'lady gaga': ['pop', 'dance'],
  'bruno mars': ['pop', 'funk'],
  'sza': ['r&b', 'soul'],
  'frank ocean': ['r&b', 'soul'],
  'tyler, the creator': ['hip hop', 'alternative'],
  'tyler the creator': ['hip hop', 'alternative'],
};

export function inferGenresFromText(...texts: (string | undefined)[]): string[] {
  const found = new Set<string>();
  const combined = texts.filter(Boolean).join(' ').toLowerCase();

  if (!combined.trim()) return [];

  const normalizedArtist = combined.trim();
  if (KNOWN_ARTIST_GENRES[normalizedArtist]) {
    for (const g of KNOWN_ARTIST_GENRES[normalizedArtist]) found.add(g);
  }

  for (const [name, genres] of Object.entries(KNOWN_ARTIST_GENRES)) {
    if (combined.includes(name)) {
      for (const g of genres) found.add(g);
    }
  }

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
