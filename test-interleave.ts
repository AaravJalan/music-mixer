import { chunkInterleave } from './backend/src/spotify/build';

const pool0 = [
  { id: '1', name: 'A' },
  { id: '2', name: 'B' },
  { id: '3', name: 'C' }
];
const pool1 = [
  { id: '1', name: 'A' },
  { id: '2', name: 'B' },
  { id: '4', name: 'D' }
];

const state = {
  ids: new Set<string>(),
  seenTracks: new Set<string>()
};

const result = chunkInterleave([pool0, pool1] as any, [60, 40], 5, state as any);
console.log(result);
