import { spotifyFetch } from './client';
import type { SpotifyTrackItem } from '../engine/build';
import type { RecommendationTrack } from '@music-mixer/shared';
import pLimit from 'p-limit';

interface SpotifySearchResponse {
  tracks?: {
    items: SpotifyTrackItem[];
  };
}

/**
 * Resolves a list of track names & artists (usually from Last.fm) into
 * actual playable Spotify `RecommendationTrack` objects.
 * 
 * Uses a concurrency limit of 5 to avoid tripping Spotify rate limits while
 * still resolving the batch extremely quickly.
 */
export async function resolveLastfmToSpotify(
  sessionId: string,
  tracks: { name: string; artist: { name: string } }[],
  cap: number = 20
): Promise<RecommendationTrack[]> {
  const toResolve = tracks.slice(0, cap);
  if (toResolve.length === 0) return [];

  // Limit concurrent Spotify requests to 5 to avoid HTTP 429
  const limit = pLimit(5);

  const promises = toResolve.map((t) =>
    limit(async () => {
      try {
        // Strip out non-alphanumeric chars that might confuse Spotify search
        const safeTrackName = t.name.replace(/[^a-zA-Z0-9\s]/g, '');
        const safeArtistName = t.artist.name.replace(/[^a-zA-Z0-9\s]/g, '');
        
        // Use Spotify's exact field match syntax
        const query = `track:${safeTrackName} artist:${safeArtistName}`;

        const data = await spotifyFetch<SpotifySearchResponse>(sessionId, '/v1/search', {
          q: query,
          type: 'track',
          limit: '1',
        });

        const firstResult = data.tracks?.items?.[0];
        if (!firstResult) return null;

        return {
          id: firstResult.id,
          name: firstResult.name,
          artist: firstResult.artists.map((a) => a.name).join(', '),
          albumArtUrl: firstResult.album.images[0]?.url ?? '',
          previewUrl: firstResult.preview_url,
          durationMs: firstResult.duration_ms,
          artistIds: firstResult.artists.map((a) => a.id).filter((id): id is string => !!id),
          guardrailApplied: false,
        } as RecommendationTrack;
      } catch (err) {
        // Ignore individual 404s/400s (e.g. unsearchable text)
        return null;
      }
    })
  );

  const results = await Promise.all(promises);
  return results.filter((r: RecommendationTrack | null): r is RecommendationTrack => r !== null);
}
