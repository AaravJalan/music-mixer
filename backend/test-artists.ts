import { fetchArtistsBatch } from './src/services/spotify/vectorEngine';
import { loadJsonFile } from './src/services/session/persist';

async function run() {
  const sessions = loadJsonFile<Record<string, {accessToken: string}>>('sessions.json', {});
  const sessionId = Object.keys(sessions)[0];
  if (!sessionId) {
    console.log('No session found');
    return;
  }
  
  const map = await fetchArtistsBatch(sessionId, ['1wRPtKGflJrBx9BmLsSwlU']);
  console.log(JSON.stringify(Array.from(map.entries()), null, 2));
}

run().catch(console.error);
