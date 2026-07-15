export const PARENT_GENRES = [
  // Asian / Regional Specifics
  { name: 'K-Pop', keywords: ['k-pop', 'korean pop', 'kpop'] },
  { name: 'Tamil / Telugu', keywords: ['tamil', 'telugu', 'tollywood', 'kollywood'] },
  { name: 'Sufi / Ghazal', keywords: ['sufi', 'ghazal', 'qawwali'] },
  { name: 'Anime', keywords: ['anime', 'j-pop', 'j-rock', 'vocaloid'] },

  // Electronic Sub-genres
  { name: 'House', keywords: ['house'] },
  { name: 'Dubstep / Bass', keywords: ['dubstep', 'bass', 'riddim', 'brostep'] },

  { name: 'Drum and Bass', keywords: ['drum and bass', 'dnb'] },

  // Hip Hop Sub-genres
  { name: 'Drill', keywords: ['drill'] },

  // Pop / Rock / Indie Sub-genres
  { name: 'Metal', keywords: ['metal', 'djent', 'core', 'screamo'] },
  { name: 'Soul', keywords: ['soul', 'neo soul', 'gospel'] },
  { name: 'Funk', keywords: ['funk'] },
  { name: 'Disco', keywords: ['disco'] },

  // --- BROAD CATCH-ALL BUCKETS (Must come last) ---
  { name: 'Bollywood', keywords: ['bollywood', 'desi', 'hindi', 'indian', 'filmi', 'india', 'punjabi', 'bhangra'] },
  { name: 'Electronic', keywords: ['edm', 'electro', 'dance', 'hardstyle', 'techno', 'trance'] },
  { name: 'Hip Hop', keywords: ['rap', 'hip hop', 'hip-hop', 'boom bap', 'grime', 'trap'] },
  { name: 'R&B', keywords: ['r&b', 'rnb', 'rhythm and blues'] },
  { name: 'Rock', keywords: ['rock', 'grunge', 'punk', 'emo', 'ska'] },
  { name: 'Alternative', keywords: ['alternative', 'shoegaze'] },
  { name: 'Indie', keywords: ['indie', 'indie pop', 'dream pop', 'bedroom pop', 'indie rock'] },
  { name: 'Pop', keywords: ['pop', 'boy band', 'girl group', 'idol', 'dance pop', 'synthpop', 'synth-pop'] },
  { name: 'Country', keywords: ['country', 'bluegrass', 'americana', 'outlaw'] },
  { name: 'Latin', keywords: ['latin', 'reggaeton', 'salsa', 'bachata', 'cumbia', 'bossa nova', 'mariachi', 'urbano'] },
  { name: 'Classical', keywords: ['classical', 'orchestra', 'symphony', 'baroque', 'romantic', 'choir'] },
  { name: 'Jazz', keywords: ['jazz', 'blues', 'swing', 'bebop', 'bop', 'dixieland'] },
  { name: 'Folk / Acoustic', keywords: ['folk', 'acoustic', 'singer-songwriter', 'singer songwriter', 'unplugged'] },
  { name: 'Lo-Fi', keywords: ['lo-fi', 'lofi', 'chillhop', 'ambient', 'chill', 'drone'] },
  { name: 'World', keywords: ['world', 'global', 'afrobeat'] },
];

export function mapToParentGenre(microGenre: string): string;
export function mapToParentGenre(microGenre: string, strict: true): string | null;
export function mapToParentGenre(microGenre: string, strict?: boolean): string | null {
  if (!microGenre) return strict ? null : '';
  const normalized = microGenre.toLowerCase();

  for (const parent of PARENT_GENRES) {
    if (parent.keywords.some(keyword => normalized.includes(keyword))) {
      return parent.name;
    }
  }

  if (strict) return null;

  // Fallback: capitalize the micro-genre (e.g. 'reggae' -> 'Reggae')
  return microGenre.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export function isValidMicroGenre(microGenre: string): boolean {
  if (!microGenre) return false;
  const normalized = microGenre.toLowerCase();
  for (const parent of PARENT_GENRES) {
    if (parent.keywords.some(keyword => normalized.includes(keyword))) {
      return true;
    }
  }
  return false;
}
