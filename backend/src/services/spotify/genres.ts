import type { GenreStat } from '@music-mixer/shared';
import { buildUserTasteProfile } from './vectorEngine';

export async function fetchTopGenres(sessionId: string, limit = 10): Promise<{
  genres: GenreStat[];
  totalArtists: number;
}> {
  const profile = await buildUserTasteProfile(sessionId, 'medium_term', limit);
  return { genres: profile.genres, totalArtists: profile.totalArtists };
}
