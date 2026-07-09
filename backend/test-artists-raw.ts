import { spotifyFetch } from './src/services/spotify/client';
import { loadJsonFile } from './src/services/session/persist';

async function run() {
  const sessions = loadJsonFile<Record<string, {accessToken: string}>>('sessions.json', {});
  const sessionId = Object.keys(sessions)[0];
  
  const artists = await spotifyFetch<any>(sessionId, '/me/top/artists?limit=1');
  console.log(JSON.stringify(artists.items[0], null, 2));
}

run().catch(console.error);
