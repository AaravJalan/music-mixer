export const PARENT_GENRES = [
  // Asian / Regional Specifics
  { name: 'K-Pop', keywords: ['k-pop', 'korean pop', 'kpop'] },
  { name: 'Punjabi', keywords: ['punjabi', 'bhangra'] },
  { name: 'Tamil / Telugu', keywords: ['tamil', 'telugu', 'tollywood', 'kollywood'] },
  { name: 'Sufi / Ghazal', keywords: ['sufi', 'ghazal', 'qawwali'] },
  { name: 'Anime', keywords: ['anime', 'j-pop', 'j-rock', 'vocaloid'] },

  // Electronic Sub-genres
  { name: 'House', keywords: ['house'] },
  { name: 'Techno', keywords: ['techno'] },
  { name: 'Dubstep / Bass', keywords: ['dubstep', 'bass', 'riddim', 'brostep'] },
  { name: 'Trance', keywords: ['trance'] },
  { name: 'Drum and Bass', keywords: ['drum and bass', 'dnb'] },

  // Hip Hop Sub-genres
  { name: 'Trap', keywords: ['trap'] },
  { name: 'Drill', keywords: ['drill'] },

  // Pop / Rock / Indie Sub-genres
  { name: 'Indie Pop', keywords: ['indie pop', 'dream pop', 'bedroom pop'] },
  { name: 'Synthpop', keywords: ['synthpop', 'synth-pop'] },
  { name: 'Dance Pop', keywords: ['dance pop'] },
  { name: 'Indie Rock', keywords: ['indie rock'] },
  { name: 'Metal', keywords: ['metal', 'djent', 'core', 'screamo'] },
  { name: 'Punk', keywords: ['punk', 'emo', 'ska'] },
  { name: 'Soul', keywords: ['soul', 'neo soul', 'gospel'] },
  { name: 'Funk', keywords: ['funk'] },
  { name: 'Disco', keywords: ['disco'] },

  // --- BROAD CATCH-ALL BUCKETS (Must come last) ---
  { name: 'Bollywood', keywords: ['bollywood', 'desi', 'hindi', 'indian', 'filmi'] },
  { name: 'Electronic', keywords: ['edm', 'electro', 'dance', 'hardstyle'] },
  { name: 'Hip Hop', keywords: ['rap', 'hip hop', 'boom bap', 'grime'] },
  { name: 'R&B', keywords: ['r&b', 'rnb', 'rhythm and blues'] },
  { name: 'Rock', keywords: ['rock', 'grunge'] },
  { name: 'Alternative', keywords: ['alternative', 'shoegaze'] },
  { name: 'Indie', keywords: ['indie'] },
  { name: 'Pop', keywords: ['pop', 'boy band', 'girl group', 'idol'] },
  { name: 'Country', keywords: ['country', 'bluegrass', 'americana', 'outlaw'] },
  { name: 'Latin', keywords: ['latin', 'reggaeton', 'salsa', 'bachata', 'cumbia', 'bossa nova', 'mariachi', 'urbano'] },
  { name: 'Classical', keywords: ['classical', 'orchestra', 'symphony', 'baroque', 'romantic', 'choir'] },
  { name: 'Jazz', keywords: ['jazz', 'blues', 'swing', 'bebop', 'bop', 'dixieland'] },
  { name: 'Folk / Acoustic', keywords: ['folk', 'acoustic', 'singer-songwriter', 'unplugged'] },
  { name: 'Lo-Fi', keywords: ['lo-fi', 'lofi', 'chillhop', 'ambient', 'chill', 'drone'] },
];

export function mapToParentGenre(microGenre: string): string {
  if (!microGenre) return '';
  const normalized = microGenre.toLowerCase();

  for (const parent of PARENT_GENRES) {
    if (parent.keywords.some(keyword => normalized.includes(keyword))) {
      return parent.name;
    }
  }

  // Fallback: capitalize the micro-genre (e.g. 'reggae' -> 'Reggae')
  return microGenre.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}
