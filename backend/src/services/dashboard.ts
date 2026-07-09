import type {
  DashboardResponse,
  DashboardTopArtist,
  DashboardTopTrack,
  TasteTimeRange,
} from '@music-mixer/shared';
import { buildDashboardInsights } from '../math/insights';
import { findSonicOutlier } from '../math/outlier';
import { estimateListeningHoursFromTopTracks, estimateTotalPlays } from '../math/listening';
import { getCachedDashboard, setCachedDashboard } from '../lib/cache';
import { buildUserTasteProfile } from '../spotify/taste';

const FEATURE_LABELS: Record<string, string> = {
  danceability: 'Danceability',
  energy: 'Energy',
  acousticness: 'Acousticness',
  valence: 'Valence',
  instrumentalness: 'Instrumentalness',
  liveness: 'Liveness',
};

const WRAPPED_LIMIT = 20;

function countTracksByArtist(tracks: import('../spotify/tracks').TopTrack[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const track of tracks) {
    for (const artistId of track.artistIds) {
      counts.set(artistId, (counts.get(artistId) ?? 0) + 1);
    }
  }
  return counts;
}

function trackPlayScore(rank: number, total: number): number {
  return Math.max(1, total - rank + 1);
}

function formatGenre(genre: string): string {
  return genre.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

export async function getDashboardAnalytics(
  sessionId: string,
  term: TasteTimeRange,
  userId?: string,
): Promise<DashboardResponse> {
  if (userId) {
    const cached = await getCachedDashboard(userId, term);
    if (cached) return cached;
  }

  const profile = await buildUserTasteProfile(sessionId, term, 20);
  const artistTrackCounts = countTracksByArtist(profile.tracks);
  const trackTotal = profile.tracks.length;

  const topArtists: DashboardTopArtist[] = profile.artists
    .slice(0, WRAPPED_LIMIT)
    .map((artist, i) => {
      const genres = profile.artistGenreMap.get(artist.id) ?? [];
      return {
        id: artist.id,
        name: artist.name,
        imageUrl: artist.imageUrl,
        rank: i + 1,
        primaryGenre: genres[0] ? formatGenre(genres[0]) : null,
        trackCount: artistTrackCounts.get(artist.id) ?? 0,
      };
    });

  const topTracks: DashboardTopTrack[] = profile.tracks
    .slice(0, WRAPPED_LIMIT)
    .map((track, i) => ({
      id: track.id,
      name: track.name,
      artist: track.artist,
      albumArtUrl: track.albumArtUrl,
      rank: i + 1,
      playScore: trackPlayScore(i + 1, trackTotal),
    }));

  const insights = buildDashboardInsights(
    term,
    profile.vector,
    profile.weightedGenres,
    profile.genres,
    profile.artists,
    profile.tracks,
    profile.artistGenreMap,
  );

  const sonicOutlier = findSonicOutlier(topTracks, profile.vector);
  const estimatedListeningHours = estimateListeningHoursFromTopTracks(profile.tracks, term);
  const estimatedTotalPlays = estimateTotalPlays(term, profile.tracks.length);

  const uniqueGenreCount = new Set(
    [...profile.artistGenreMap.values()].flat().map((g) => g.toLowerCase()),
  ).size;

  const tracksWithDuration = profile.tracks.filter((t) => (t.durationMs ?? 0) > 0);
  const avgTrackLengthMin = tracksWithDuration.length > 0
    ? Math.round(
      (tracksWithDuration.reduce((sum, t) => sum + (t.durationMs ?? 0), 0)
        / tracksWithDuration.length / 60_000) * 10,
    ) / 10
    : 0;



  const response: DashboardResponse = {
    term,
    tasteVector: profile.vector,
    topGenres: profile.genres,
    topArtists,
    topTracks,
    totalArtists: profile.totalArtists,
    totalTracks: profile.tracks.length,
    estimatedListeningHours,
    estimatedTotalPlays,
    uniqueGenreCount,
    avgTrackLengthMin,
    usedEstimatedFeatures: true,
    insights,
    sonicOutlier,
    featureLabels: FEATURE_LABELS,
    platform: 'spotify',
  };

  if (userId) {
    await setCachedDashboard(userId, term, response);
  }

  return response;
}
