import { fetchTopTracks } from './src/services/spotify/tracks';
import { loadJsonFile } from './src/services/session/persist';

async function run() {
  const sessions = loadJsonFile<Record<string, {accessToken: string}>>('sessions.json', {});
  const sessionId = Object.keys(sessions)[0];
  
  const tracks = await fetchTopTracks(sessionId, 'long_term');
  console.log(JSON.stringify(tracks[0], null, 2));
}

run().catch(console.error);
