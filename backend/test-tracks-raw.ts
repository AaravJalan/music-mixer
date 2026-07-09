import { spotifyFetch } from './src/services/spotify/client';
import { loadJsonFile } from './src/services/session/persist';

async function run() {
  const sessions = loadJsonFile<Record<string, {accessToken: string}>>('sessions.json', {});
  const sessionId = Object.keys(sessions)[0];
  
  const tracks = await spotifyFetch<any>(sessionId, '/me/top/tracks?limit=1');
  console.log(JSON.stringify(tracks.items[0], null, 2));
}

run().catch(console.error);
