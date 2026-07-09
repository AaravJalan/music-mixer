import { spotifyFetch } from './src/services/spotify/client';
import { loadJsonFile } from './src/services/session/persist';

async function run() {
  const sessions = loadJsonFile<Record<string, {accessToken: string}>>('sessions.json', {});
  const sessionId = Object.keys(sessions)[0];
  
  const map = await spotifyFetch(sessionId, '/artists/1wRPtKGflJrBx9BmLsSwlU');
  console.log(map);
}

run().catch(console.error);
