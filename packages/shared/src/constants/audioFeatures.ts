/** The six Spotify audio feature dimensions used as our taste vector basis. */
export const AUDIO_FEATURE_DIMENSIONS = [
  'danceability',
  'energy',
  'acousticness',
  'valence',
  'instrumentalness',
  'liveness',
] as const;

export type AudioFeatureDimension = (typeof AUDIO_FEATURE_DIMENSIONS)[number];

export const VECTOR_DIMENSION = AUDIO_FEATURE_DIMENSIONS.length;
