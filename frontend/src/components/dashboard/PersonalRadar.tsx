import { useState } from 'react';
import type { AudioFeatureVector } from '@music-mixer/shared';
import { AUDIO_FEATURE_KEYS } from '@music-mixer/shared';
import {
  RADAR_RADIUS,
  RADAR_SIZE,
  buildRadarPath,
  polarToCartesian,
  radarAngleStep,
} from '../collision/radarUtils';
import { AUDIO_FEATURE_INFO } from '../../constants/tasteTimeRanges';

interface PersonalRadarProps {
  vector: AudioFeatureVector;
  labels: Record<string, string>;
  dimensionLabels?: Record<string, string>;
  accentColor?: string;
  fillColor?: string;
}

export function PersonalRadar({
  vector,
  labels,
  dimensionLabels,
  accentColor = '#8b5cf6',
  fillColor = 'rgba(139, 92, 246, 0.25)',
}: PersonalRadarProps) {
  const [showInfo, setShowInfo] = useState(false);
  const size = RADAR_SIZE;
  const center = size / 2;
  const radius = RADAR_RADIUS;
  const angleStep = radarAngleStep();
  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <div className="flex flex-col items-center relative">
      <button
        type="button"
        onClick={() => setShowInfo((v) => !v)}
        className="absolute top-0 right-0 w-7 h-7 rounded-full bg-white/10 border border-white/15 text-xs text-white/70 hover:bg-white/15 transition-colors"
        aria-label="Explain taste dimensions"
        title="What do these dimensions mean?"
      >
        i
      </button>

      {showInfo && (
        <div className="absolute top-9 right-0 z-20 w-64 p-3 rounded-xl bg-[#1a1028] border border-white/15 shadow-xl text-left">
          <p className="text-xs font-semibold text-white/80 mb-2">6D Taste Shape</p>
          <ul className="space-y-2 max-h-48 overflow-y-auto">
            {AUDIO_FEATURE_KEYS.map((key) => (
              <li key={key} className="text-[10px] text-white/60 leading-snug">
                <span className="text-white/80 font-medium">{AUDIO_FEATURE_INFO[key]?.title ?? labels[key]}:</span>{' '}
                {AUDIO_FEATURE_INFO[key]?.description}
              </li>
            ))}
          </ul>
        </div>
      )}

      <svg width={size} height={size} className="overflow-visible">
        {gridLevels.map((level) => (
          <polygon
            key={level}
            points={AUDIO_FEATURE_KEYS.map((_, i) => {
              const { x, y } = polarToCartesian(center, i * angleStep, radius * level);
              return `${x},${y}`;
            }).join(' ')}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
        ))}

        {AUDIO_FEATURE_KEYS.map((key, i) => {
          const { x, y } = polarToCartesian(center, i * angleStep, radius);
          const labelPos = polarToCartesian(center, i * angleStep, radius + 30);
          const value = (vector[key] * 100).toFixed(0);
          return (
            <g key={key}>
              <line x1={center} y1={center} x2={x} y2={y} stroke="rgba(255,255,255,0.06)" />
              <circle cx={x} cy={y} r={4} fill={accentColor} className="opacity-80" />
              <text
                x={labelPos.x}
                y={labelPos.y - 6}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-white/60 text-[9px] uppercase tracking-wider"
              >
                {labels[key]?.slice(0, 5) ?? key.slice(0, 5)}
              </text>
              <text
                x={labelPos.x}
                y={labelPos.y + 8}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-white/40 text-[8px]"
              >
                {value}%
              </text>
            </g>
          );
        })}

        <path
          d={buildRadarPath(vector, center, radius, angleStep)}
          fill={fillColor}
          stroke={accentColor}
          strokeWidth="2"
        />
      </svg>

      {dimensionLabels && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-4 w-full max-w-xs">
          {AUDIO_FEATURE_KEYS.map((key) => (
            <div key={key} className="text-[10px] text-white/45 truncate">
              <span className="text-white/60">{labels[key]?.split(' ')[0]}:</span>{' '}
              {dimensionLabels[key] ?? '—'}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
