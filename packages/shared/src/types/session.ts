import type { AudioFeatureVector } from './audio';
import type { CollisionConfig, CollisionParticipant } from './social';

export interface UserProfile {
  id: string;
  displayName: string;
  avatarUrl: string;
  platform?: 'spotify';
}

export type CollisionStatus = 'waiting' | 'ready' | 'complete' | 'expired';

export interface CollisionSession {
  id: string;
  status: CollisionStatus;
  userA: UserProfile | null;
  userB: UserProfile | null;
  /** Up to 4 participants when multi-user or sandbox mode is active. */
  participants?: CollisionParticipant[];
  createdAt: string;
  shareUrl: string;
  config: CollisionConfig;
  friendId?: string;
  /** Times the user has regenerated the collision playlist. */
  regenerateCount?: number;
}

export interface UserTasteProfile {
  userId: string;
  displayName: string;
  vector: AudioFeatureVector;
  trackCount: number;
}
