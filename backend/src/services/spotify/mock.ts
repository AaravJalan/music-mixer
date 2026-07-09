import type { AudioFeatureVector, TrackFeature } from '@music-mixer/shared';
import type { RecommendationTrack } from '@music-mixer/shared';
import { audioFeatureCache } from '../cache/audioFeatures';

function seededRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateFeatures(seed: number): Omit<TrackFeature, 'id' | 'name' | 'artist' | 'albumArtUrl'> {
  const rand = seededRandom(seed);
  return {
    danceability: rand(),
    energy: rand(),
    acousticness: rand(),
    valence: rand(),
    instrumentalness: rand() * 0.5,
    liveness: rand() * 0.3,
  };
}

const MOCK_TRACKS: Record<string, { name: string; artist: string; albumArtUrl: string }> = {
  'track-001': { name: 'Blinding Lights', artist: 'The Weeknd', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36' },
  'track-002': { name: 'Levitating', artist: 'Dua Lipa', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273bd26ede1ae69327010e62746' },
  'track-003': { name: 'good 4 u', artist: 'Olivia Rodrigo', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd89802b5' },
  'track-004': { name: 'Heat Waves', artist: 'Glass Animals', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b27346f5e0d4ab173e3aee94f4b' },
  'track-005': { name: 'As It Was', artist: 'Harry Styles', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b2732e8ed49e5027cba64b1f605' },
  'track-006': { name: 'Stay', artist: 'The Kid LAROI', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273bb54dde68cd23e2a268ae6f' },
  'track-007': { name: 'Peaches', artist: 'Justin Bieber', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273786279906bb8f2f2e50e2c1' },
  'track-008': { name: 'Montero', artist: 'Lil Nas X', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273be841ba4bc24340152e3a05' },
  'track-009': { name: 'drivers license', artist: 'Olivia Rodrigo', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd89802b5' },
  'track-010': { name: 'Save Your Tears', artist: 'The Weeknd', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36' },
  'track-011': { name: 'Kiss Me More', artist: 'Doja Cat', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273bb54dde68cd23e2a268ae6f' },
  'track-012': { name: 'Positions', artist: 'Ariana Grande', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273bb54dde68cd23e2a268ae6f' },
  'track-013': { name: 'Circles', artist: 'Post Malone', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36' },
  'track-014': { name: 'Watermelon Sugar', artist: 'Harry Styles', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b2732e8ed49e5027cba64b1f605' },
  'track-015': { name: 'Dynamite', artist: 'BTS', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b27346f5e0d4ab173e3aee94f4b' },
  'track-016': { name: 'Intentions', artist: 'Justin Bieber', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273786279906bb8f2f2f2e50e2c1' },
  'track-017': { name: 'Mood', artist: '24kGoldn', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273be841ba4bc24340152e3a05' },
  'track-018': { name: 'Willow', artist: 'Taylor Swift', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273bb54dde68cd23e2a268ae6f' },
  'track-019': { name: 'Therefore I Am', artist: 'Billie Eilish', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b2732e8ed49e5027cba64b1f605' },
  'track-020': { name: 'Savage', artist: 'Megan Thee Stallion', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b27346f5e0d4ab173e3aee94f4b' },
};

const USER_TRACK_MAP: Record<string, string[]> = {
  'user-a': ['track-001', 'track-002', 'track-003', 'track-004', 'track-005', 'track-006', 'track-007', 'track-008'],
  'user-b': ['track-009', 'track-010', 'track-011', 'track-012', 'track-013', 'track-014', 'track-015', 'track-016'],
  default: ['track-001', 'track-004', 'track-007', 'track-010', 'track-013', 'track-016', 'track-019', 'track-020'],
};

const RECOMMENDATION_POOL: RecommendationTrack[] = [
  { id: 'rec-001', name: 'Midnight City', artist: 'M83', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36', previewUrl: null },
  { id: 'rec-002', name: 'Electric Feel', artist: 'MGMT', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273bd26ede1ae69327010e62746', previewUrl: null },
  { id: 'rec-003', name: 'Redbone', artist: 'Childish Gambino', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd89802b5', previewUrl: null },
  { id: 'rec-004', name: 'Feel Good Inc.', artist: 'Gorillaz', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b27346f5e0d4ab173e3aee94f4b', previewUrl: null },
  { id: 'rec-005', name: 'Starboy', artist: 'The Weeknd', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b2732e8ed49e5027cba64b1f605', previewUrl: null },
  { id: 'rec-006', name: 'Get Lucky', artist: 'Daft Punk', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273bb54dde68cd23e2a268ae6f', previewUrl: null },
  { id: 'rec-007', name: 'Titanium', artist: 'David Guetta', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273786279906bb8f2f2f2e50e2c1', previewUrl: null },
  { id: 'rec-008', name: 'Clarity', artist: 'Zedd', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273be841ba4bc24340152e3a05', previewUrl: null },
  { id: 'rec-009', name: 'Adventure of a Lifetime', artist: 'Coldplay', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b2738863bc11d2aa12b54f5aeb36', previewUrl: null },
  { id: 'rec-010', name: 'Uptown Funk', artist: 'Bruno Mars', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273bd26ede1ae69327010e62746', previewUrl: null },
  { id: 'rec-011', name: 'Can\'t Stop the Feeling!', artist: 'Justin Timberlake', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b273a91c10fe9472d9bd89802b5', previewUrl: null },
  { id: 'rec-012', name: 'Happy', artist: 'Pharrell Williams', albumArtUrl: 'https://i.scdn.co/image/ab67616d0000b27346f5e0d4ab173e3aee94f4b', previewUrl: null },
];

export async function fetchTopTracksForUser(userId: string): Promise<{ id: string; name: string; artist: string }[]> {
  await delay(80);
  const ids = USER_TRACK_MAP[userId] ?? USER_TRACK_MAP.default;
  return ids.map((id) => {
    const meta = MOCK_TRACKS[id];
    return { id, name: meta.name, artist: meta.artist };
  });
}

export async function fetchAudioFeatures(trackIds: string[]): Promise<TrackFeature[]> {
  await delay(50);

  const { cached, missing } = audioFeatureCache.getMany(trackIds);
  const fetched: TrackFeature[] = [];

  for (const id of missing) {
    const meta = MOCK_TRACKS[id];
    if (!meta) continue;
    const seed = id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0);
    const features = generateFeatures(seed);
    const feature: TrackFeature = { id, ...meta, ...features };
    audioFeatureCache.set(id, feature);
    fetched.push(feature);
  }

  const resultMap = new Map<string, TrackFeature>();
  for (const f of [...cached, ...fetched]) resultMap.set(f.id, f);
  return trackIds.map((id) => resultMap.get(id)).filter((f): f is TrackFeature => f !== undefined);
}

export async function getRecommendations(_midpoint: AudioFeatureVector): Promise<RecommendationTrack[]> {
  await delay(120);
  return RECOMMENDATION_POOL.slice(0, 10);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
