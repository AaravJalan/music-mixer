import type { AudioFeatureVector } from './audio';
import type { CollisionSession, UserProfile } from './session';
import type { CollisionConfig, CollisionMode, Friend, FriendInviteResponse, GenreStat } from './social';

export interface ApiError {
  error: string;
  code?: string;
}

export interface AuthMeResponse {
  authenticated: boolean;
  user: UserProfile | null;
}

export interface CreateCollisionRequest {
  mode?: CollisionMode;
  friendId?: string;
  userAWeight?: number;
  userBWeight?: number;
  playlistLength?: number;
  playlistLengthMode?: import('./social').PlaylistLengthMode;
  playlistDurationMinutes?: number;
}

export interface CreateCollisionResponse {
  collision: CollisionSession;
}

export interface GetCollisionResponse {
  collision: CollisionSession;
}

export interface JoinCollisionResponse {
  collision: CollisionSession;
}

export interface RunCollisionRequest {
  participantWeights?: number[];
  participantTimeRanges?: TasteTimeRange[];
  playlistGenerationMode?: import('./social').PlaylistGenerationMode;
  userAWeight?: number;
  userBWeight?: number;
  playlistLength?: number;
  playlistLengthMode?: import('./social').PlaylistLengthMode;
  playlistDurationMinutes?: number;
}

export interface CollisionParticipantResult {
  user: UserProfile;
  vector: AudioFeatureVector;
  genres: GenreStat[];
  weight: number;
  isGhost?: boolean;
  topArtists?: { id: string; name: string; imageUrl: string }[];
  /** Estimated listening hours for the selected time range. */
  estimatedListeningHours?: number;
  timeRange?: TasteTimeRange;
  totalTracks?: number;
}

export interface SharedArtist {
  id: string;
  name: string;
  imageUrl: string;
}

export interface RecommendationTrack {
  id: string;
  name: string;
  artist: string;
  albumArtUrl: string;
  previewUrl: string | null;
  durationMs?: number;
  /** Spotify artist IDs for deterministic identity matching (primary artist first). */
  artistIds?: string[];
  isCommon?: boolean;
  /** Which participant this track was sourced from (proportional share). Index into participants[]. */
  sourceParticipantIndex?: number;
}

export interface CollisionResult {
  collisionId: string;
  similarityScore: number;
  /** All participants (up to 4) with individual taste vectors. */
  participants: CollisionParticipantResult[];
  centroidVector: AudioFeatureVector;
  playlist: RecommendationTrack[];
  featureLabels: Record<string, string>;
  sharedGenres: string[];
  /** Artists appearing in every participant's top artists (up to 15). */
  sharedArtists?: SharedArtist[];
  /** Normalized influence weight per participant (sums to 100). */
  participantWeights: number[];
  usedEstimatedFeatures?: boolean;
  usedFallbackPlaylist?: boolean;
  playlistGenerationMode?: import('./social').PlaylistGenerationMode;
  /** Mode used after backend guardrail (<80% match forces equal_share). */
  effectivePlaylistGenerationMode?: import('./social').PlaylistGenerationMode;
  playlistGuardrailApplied?: boolean;
  exportedPlaylistUrl?: string;
  /** @deprecated Use participants[0] */
  userAVector: AudioFeatureVector;
  /** @deprecated Use participants[1] */
  userBVector: AudioFeatureVector;
  /** @deprecated Use centroidVector */
  midpointVector: AudioFeatureVector;
  /** @deprecated Use participants[0].user */
  userA: UserProfile;
  /** @deprecated Use participants[1].user */
  userB: UserProfile;
  /** @deprecated Use participants[0].genres */
  userAGenres: GenreStat[];
  /** @deprecated Use participants[1].genres */
  userBGenres: GenreStat[];
  /** @deprecated Use participantWeights — kept for 2-user UI */
  blendWeights: { userA: number; userB: number };
}

export type TasteTimeRange = 'short_term' | 'medium_term' | 'year_to_date' | 'long_term';

export interface DashboardTopArtist {
  id: string;
  name: string;
  imageUrl: string;
  rank: number;
  genres: string[];
  /** Tracks by this artist in the user's top tracks for the time range. */
  trackCount: number;
}

export interface DashboardTopTrack {
  id: string;
  name: string;
  artist: string;
  albumArtUrl: string;
  rank: number;
  /** Position-weighted presence in top tracks (higher = more listened). */
  playScore: number;
}

export interface DashboardInsights {
  nicheScore: number;
  moodConsistencyIndex: number;
  profileLabels: string[];
  dimensionLabels: Record<string, string>;
  headline: string;
  summaries: string[];
  listeningStyle: 'focused' | 'eclectic';
  avgPopularity?: number;
  avgTempo?: number;
  topReleaseEra?: string;
  topGenre: { name: string; percentage: number } | null;
}

export interface SonicOutlierInsight {
  track: DashboardTopTrack;
  deviationScore: number;
  outlierVector: AudioFeatureVector;
  baselineVector: AudioFeatureVector;
  headline: string;
  explanation: string;
  dimensionDeltas: Record<string, number>;
}

export interface DashboardResponse {
  term: TasteTimeRange;
  tasteVector: AudioFeatureVector;
  topGenres: GenreStat[];
  topArtists: DashboardTopArtist[];
  topTracks: DashboardTopTrack[];
  totalArtists: number;
  totalTracks: number;
  /** Rank-weighted estimate of listening time for this period. */
  estimatedListeningHours: number;
  /** Modeled total song plays across analyzed tracks for this period. */
  estimatedTotalPlays: number;
  /** Distinct genres represented across the user's taste for this period. */
  uniqueGenreCount: number;
  /** Average length of analyzed tracks, in minutes. */
  avgTrackLengthMin: number;
  usedEstimatedFeatures: true;
  insights: DashboardInsights;
  sonicOutlier: SonicOutlierInsight | null;
  featureLabels: Record<string, string>;
  platform: 'spotify';
  cachedAt?: string;
}

export interface GenreDistributionSlice {
  genre: string;
  /** Share of the analyzed track history, 0–100. */
  percentage: number;
  trackCount: number;
}

export interface DailyListeningPoint {
  /** ISO calendar date, yyyy-mm-dd. */
  date: string;
  hours: number;
}

export interface GenreTrendPoint {
  date: string;
  percentages: Record<string, number>;
}

/** Listening Habits: genre distribution (pie) + accumulated volume / daily hours (line). */
export interface ListeningHabitsResponse {
  term: TasteTimeRange;
  /** Genre share across the user's analyzed track history (top genres + "Other"). */
  genreDistribution: GenreDistributionSlice[];
  totalTracks: number;
  /** Accumulated listening time modeled from account inception (long-term). */
  totalListeningMs: number;
  totalListeningHours: number;
  /** Daily listening hours for the line graph — empty until enough DynamoDB cron snapshots exist. */
  dailyListening: DailyListeningPoint[];
  /** True until trackingCount reaches the chart threshold (cron-backed series). */
  dailyIsEstimated: boolean;
  
  // Historical tracking fields from DynamoDB Cron
  totalListeningHoursSinceTracking: number;
  trackingCount: number;
  firstTrackedDate: string | null;
  genreTrends: GenreTrendPoint[];
  daysUntilNextCron: number;
  
  platform: 'spotify';
  cachedAt?: string;
}

export interface FriendsListResponse {
  friends: Friend[];
}

export interface ExportPlaylistRequest {
  collisionId: string;
  name?: string;
  public?: boolean;
}

export interface ExportPlaylistResponse {
  playlistUrl: string;
  playlistId: string;
}

export interface GhostProfilesResponse {
  ghosts: import('./social').GhostProfile[];
}

export interface SandboxCollisionRequest {
  ghostIds: string[];
  participantWeights?: number[];
  playlistLength?: number;
  playlistLengthMode?: import('./social').PlaylistLengthMode;
  playlistDurationMinutes?: number;
  playlistGenerationMode?: import('./social').PlaylistGenerationMode;
  randomOffset?: number;
}

export interface RegeneratePlaylistResponse {
  result: CollisionResult;
  metrics: MetricsSnapshot;
  regenerateCount?: number;
}

export interface SandboxCollisionResponse {
  result: CollisionResult;
  metrics: MetricsSnapshot;
}

export interface CollisionHistoryEntry {
  id: string;
  completedAt: string;
  mode: CollisionMode;
  participantNames: string[];
  similarityScore: number;
  playlistLength: number;
}

export interface CollisionHistoryResponse {
  collisions: CollisionHistoryEntry[];
}

export interface CollisionHistoryParticipant {
  userId: string;
  displayName: string;
  isGhost: boolean;
}

export interface CollisionHistorySnapshot {
  entry: CollisionHistoryEntry;
  result: CollisionResult;
  config: CollisionConfig;
  participants: CollisionHistoryParticipant[];
}

export interface CollisionHistoryDetailResponse {
  snapshot: CollisionHistorySnapshot;
}

export interface RerunCollisionRequest {
  userAWeight?: number;
  userBWeight?: number;
  participantWeights?: number[];
  participantTimeRanges?: TasteTimeRange[];
  playlistGenerationMode?: import('./social').PlaylistGenerationMode;
  playlistLength?: number;
  playlistLengthMode?: import('./social').PlaylistLengthMode;
  playlistDurationMinutes?: number;
}

export interface RerunCollisionResponse {
  result: CollisionResult;
  metrics: MetricsSnapshot;
}

export interface MetricsSnapshot {
  recommendationLatencyMs: number;
  cacheHitRate: number;
  cacheHits: number;
  cacheMisses: number;
  totalRequests: number;
}
