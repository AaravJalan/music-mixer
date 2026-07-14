import type { AudioFeatureDimension } from '../constants/audioFeatures';

export interface AudioFeatureVector {
  danceability: number;
  energy: number;
  acousticness: number;
  valence: number;
  instrumentalness: number;
  liveness: number;
}

export interface TrackFeature extends AudioFeatureVector {
  id: string;
  name: string;
  artist: string;
  albumArtUrl: string;
}

export type FeatureTuple = readonly [
  number, // danceability
  number, // energy
  number, // acousticness
  number, // valence
  number, // instrumentalness
  number, // liveness
];

export const AUDIO_FEATURE_KEYS: readonly AudioFeatureDimension[] = [
  'danceability',
  'energy',
  'acousticness',
  'valence',
  'instrumentalness',
  'liveness',
] as const;

export function vectorToTuple(v: AudioFeatureVector): FeatureTuple {
  return [
    v.danceability,
    v.energy,
    v.acousticness,
    v.valence,
    v.instrumentalness,
    v.liveness,
  ];
}

export function tupleToVector(t: FeatureTuple): AudioFeatureVector {
  return {
    danceability: t[0],
    energy: t[1],
    acousticness: t[2],
    valence: t[3],
    instrumentalness: t[4],
    liveness: t[5],
  };
}
