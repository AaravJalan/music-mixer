import fs from 'fs';
import path from 'path';
import { config } from 'dotenv';
config();

const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID;
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET;

if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Missing SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET in .env');
  process.exit(1);
}

// Minimal subset of ghostProfiles.ts to read EMBEDDED_GHOSTS
import { EMBEDDED_GHOSTS } from '../backend/src/services/sandbox/ghostProfiles';

async function getAccessToken(): Promise<string> {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`,
    },
    body: 'grant_type=client_credentials',
  });
  if (!res.ok) throw new Error(`Failed to get token: ${await res.text()}`);
  const data = await res.json();
  return data.access_token;
}

async function fetchArtistSearchTracks(artistName: string, token: string) {
  const res = await fetch(`https://api.spotify.com/v1/search?q=artist:${encodeURIComponent(artistName)}&type=track&limit=10`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    console.error(`Failed to fetch tracks for artist ${artistName}:`, await res.text());
    return [];
  }
  const data = await res.json();
  return data.tracks?.items || [];
}

async function hydrate() {
  const token = await getAccessToken();
  console.log('Obtained Client Credentials token.');
  const hydratedGhosts = [];

  for (const ghost of EMBEDDED_GHOSTS) {
    console.log(`Hydrating ghost: ${ghost.id} (${ghost.displayName})`);
    
    // Top artists
    const topArtists = ghost.topArtists;
    
    const hydratedTracks = [];
    const hydratedArtists = [];
    const seenIds = new Set();
    
    for (const artist of topArtists) {
      console.log(`  Fetching data for artist ${artist.name}...`);
      
      // Get real artist ID
      let realArtistId = artist.id;
      const artistRes = await fetch(`https://api.spotify.com/v1/search?q=artist:${encodeURIComponent(artist.name)}&type=artist&limit=1`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (artistRes.ok) {
        const artistData = await artistRes.json();
        const realArtist = artistData.artists?.items?.[0];
        if (realArtist) {
          realArtistId = realArtist.id;
          hydratedArtists.push({
            id: realArtistId,
            name: realArtist.name,
            imageUrl: realArtist.images?.[0]?.url || '',
          });
        } else {
          hydratedArtists.push(artist);
        }
      } else {
        hydratedArtists.push(artist);
      }

      // We only fetch tracks for the top 3 artists to hydrate the ghost tracks
      if (hydratedArtists.length <= 3) {
        const tracks = await fetchArtistSearchTracks(artist.name, token);
        for (const track of tracks) {
          if (!seenIds.has(track.id)) {
            seenIds.add(track.id);
            hydratedTracks.push({
              id: track.id,
              name: track.name,
              artist: track.artists.map((a: any) => a.name).join(', '),
              imageUrl: track.album?.images?.[0]?.url || '',
            });
          }
        }
      }
    }
    
    // Mix them up a bit
    const shuffled = hydratedTracks.sort(() => 0.5 - Math.random()).slice(0, 50);
    
    hydratedGhosts.push({
      ...ghost,
      topArtists: hydratedArtists,
      tracks: shuffled,
    });
  }
  
  const outPath = path.join(__dirname, '../backend/.data/ghost-profiles.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(hydratedGhosts, null, 2));
  console.log(`\nSuccess! Hydrated profiles written to ${outPath}`);
}

hydrate().catch(console.error);
