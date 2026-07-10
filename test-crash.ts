import { chunkInterleave } from './backend/src/spotify/build';
import { RecommendationTrack, PlaylistSeenState } from './backend/src/spotify/build'; // I need to mock these

// Mock RecommendationTrack
const pool = Array.from({ length: 50 }).map((_, i) => ({
  id: `track-${i}`,
  name: `Track ${i}`,
  artist: `Artist ${i}`,
  album: `Album ${i}`,
  durationMs: 200000,
  popularity: 50,
  albumImageUrl: '',
  sourceParticipantIndex: 0
})) as any[];

const pools = [pool, [...pool]]; // Exact same tracks

const state = {
  ids: new Set<string>(),
  seenTracks: new Set<string>()
};

const commonIds = new Set(pool.map(t => t.id));

try {
  const start = Date.now();
  const interleaved = chunkInterleave(pools, [60, 40], 15, state as any, commonIds);
  console.log("Success. Length:", interleaved.length, "Time:", Date.now() - start);
} catch (e) {
  console.error(e);
}
