import type { AudioFeatureVector } from '@music-mixer/shared';
import { AUDIO_FEATURE_KEYS } from '@music-mixer/shared';

export const RADAR_SIZE = 280;
export const RADAR_RADIUS = 100;

export function polarToCartesian(
  center: number,
  angle: number,
  r: number,
): { x: number; y: number } {
  return {
    x: center + r * Math.sin(angle),
    y: center - r * Math.cos(angle),
  };
}

export function buildRadarPath(
  vector: AudioFeatureVector,
  center: number,
  radius: number,
  angleStep: number,
): string {
  return (
    AUDIO_FEATURE_KEYS.map((key, i) => {
      const angle = i * angleStep;
      const r = vector[key] * radius;
      const { x, y } = polarToCartesian(center, angle, r);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ') + ' Z'
  );
}

export function radarAngleStep(): number {
  return (2 * Math.PI) / AUDIO_FEATURE_KEYS.length;
}
