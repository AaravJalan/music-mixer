export interface GenreStat {
  genre: string;
  count: number;
  percentage: number;
}

export interface Friend {
  user: import('./session').UserProfile;
  addedAt: string;
  isGhost?: boolean;
}

export interface FriendInviteResponse {
  inviteUrl: string;
  code: string;
}

export type CollisionMode = 'link' | 'friend' | 'solo' | 'sandbox';

/** Midpoint = centroid genre bridge search; equal_share = proportional sourcing; common_only = shared tracks only. */
export type PlaylistGenerationMode = 'midpoint' | 'equal_share' | 'common_only';

export const PLAYLIST_GENERATION_MODE_LABELS: Record<PlaylistGenerationMode, string> = {
  midpoint: 'Midpoint Blend',
  equal_share: 'Proportional Share',
  common_only: 'Common Songs Only',
};

/** Size playlist by track count or total runtime. */
export type PlaylistLengthMode = 'tracks' | 'duration';

export const PLAYLIST_MATCH_THRESHOLD = 0.8;

export interface CollisionConfig {
  /** Per-participant influence weights (up to 4). */
  participantWeights: number[];
  /** Spotify time range per participant (4 weeks, 6 months, all time). */
  participantTimeRanges: import('./api').TasteTimeRange[];
  playlistLength: number;
  playlistLengthMode: PlaylistLengthMode;
  /** Target runtime when playlistLengthMode is `duration`. */
  playlistDurationMinutes: number;
  playlistGenerationMode: PlaylistGenerationMode;
  mode: CollisionMode;
  /** @deprecated Use participantWeights — kept for 2-user UI */
  userAWeight: number;
  /** @deprecated Use participantWeights — kept for 2-user UI */
  userBWeight: number;
}

export interface GhostProfile {
  id: string;
  displayName: string;
  tagline: string;
  avatarUrl: string;
  vector: import('./audio').AudioFeatureVector;
  genres: string[];
  tracks: { id: string; name: string; artist: string; albumArtUrl: string; popularity?: number; releaseDate?: string; durationMs?: number; artistIds?: string[] }[];
  /** Real Spotify artist IDs used as BFS seed nodes. */
  topArtists: { id: string; name: string; imageUrl?: string }[];
}

export interface CollisionParticipant {
  user: import('./session').UserProfile;
  weight: number;
  isGhost?: boolean;
}
