import type { AudioFeatureVector } from '@music-mixer/shared';
import { AUDIO_FEATURE_KEYS } from '@music-mixer/shared';
import { useState } from 'react';
import { AUDIO_FEATURE_INFO } from '../../constants/tasteTimeRanges';

interface FeatureRadarProps {
  vectorA: AudioFeatureVector;
  vectorB: AudioFeatureVector;
  midpoint: AudioFeatureVector;
  labels: Record<string, string>;
  showInfo?: boolean;
}

export function FeatureRadar({ vectorA, vectorB, midpoint, labels, showInfo = true }: FeatureRadarProps) {
  const [infoOpen, setInfoOpen] = useState(false);
  const size = 270;
  const center = size / 2;
  const radius = 97;
  const angleStep = (2 * Math.PI) / AUDIO_FEATURE_KEYS.length;

  function polarToCartesian(angle: number, r: number) {
    return {
      x: center + r * Math.sin(angle),
      y: center - r * Math.cos(angle),
    };
  }

  function buildPath(vector: AudioFeatureVector): string {
    return AUDIO_FEATURE_KEYS.map((key, i) => {
      const angle = i * angleStep;
      const r = vector[key] * radius;
      const { x, y } = polarToCartesian(angle, r);
      return `${i === 0 ? 'M' : 'L'} ${x} ${y}`;
    }).join(' ') + ' Z';
  }

  const gridLevels = [0.25, 0.5, 0.75, 1];

  return (
    <div className="relative flex flex-col items-center w-full h-full justify-center gap-2">
      {showInfo && (
        <>
          <button
            type="button"
            onClick={() => setInfoOpen((v) => !v)}
            className="absolute top-0 right-0 z-10 w-7 h-7 rounded-full bg-white/10 border border-white/15 text-xs text-white/70 hover:bg-white/15 transition-colors"
            aria-label="Explain taste dimensions"
            title="What do these dimensions mean?"
          >
            i
          </button>
          {infoOpen && (
            <div className="absolute top-9 right-0 z-20 w-64 p-3 rounded-xl bg-[#1a1028] border border-white/15 shadow-xl text-left">
              <p className="text-xs font-semibold text-white/80 mb-2">Collision Radar</p>
              <p className="text-[10px] text-white/55 mb-2 leading-snug">
                Pink = User A, purple = User B, dashed cyan = weighted midpoint blend.
              </p>
              <ul className="space-y-2 max-h-40 overflow-y-auto">
                {AUDIO_FEATURE_KEYS.map((key) => (
                  <li key={key} className="text-[10px] text-white/60 leading-snug">
                    <span className="text-white/80 font-medium">{AUDIO_FEATURE_INFO[key]?.title ?? labels[key]}:</span>{' '}
                    {AUDIO_FEATURE_INFO[key]?.description}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}

      <svg width={size} height={size} className="overflow-visible shrink-0">
        {gridLevels.map((level) => (
          <polygon
            key={level}
            points={AUDIO_FEATURE_KEYS.map((_, i) => {
              const { x, y } = polarToCartesian(i * angleStep, radius * level);
              return `${x},${y}`;
            }).join(' ')}
            fill="none"
            stroke="rgba(255,255,255,0.08)"
            strokeWidth="1"
          />
        ))}

        {AUDIO_FEATURE_KEYS.map((key, i) => {
          const { x, y } = polarToCartesian(i * angleStep, radius);
          const labelPos = polarToCartesian(i * angleStep, radius + 28);
          return (
            <g key={key}>
              <line x1={center} y1={center} x2={x} y2={y} stroke="rgba(255,255,255,0.06)" />
              <text
                x={labelPos.x}
                y={labelPos.y}
                textAnchor="middle"
                dominantBaseline="middle"
                className="fill-white/50 text-[9px] uppercase tracking-wider"
              >
                {labels[key]?.slice(0, 4) ?? key.slice(0, 4)}
              </text>
            </g>
          );
        })}

        <path d={buildPath(vectorA)} fill="rgba(255, 45, 106, 0.2)" stroke="#ff2d6a" strokeWidth="2" />
        <path d={buildPath(vectorB)} fill="rgba(139, 92, 246, 0.2)" stroke="#8b5cf6" strokeWidth="2" />
        <path d={buildPath(midpoint)} fill="rgba(34, 211, 238, 0.15)" stroke="#22d3ee" strokeWidth="2" strokeDasharray="4 4" />
      </svg>

      <div className="flex items-center justify-center gap-5 w-full max-w-[280px] rounded-lg bg-white/[0.04] border border-white/8 py-2 px-3 text-[10px] text-white/55 shrink-0">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-accent-pink rounded shrink-0" />
          User A
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-accent-purple rounded shrink-0" />
          User B
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 border-t border-dashed border-accent-cyan shrink-0" />
          Midpoint
        </span>
      </div>
    </div>
  );
}

export function FeatureBars({
  vectorA,
  vectorB,
  labels,
  compact = false,
}: {
  vectorA: AudioFeatureVector;
  vectorB: AudioFeatureVector;
  labels: Record<string, string>;
  compact?: boolean;
}) {
  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      {AUDIO_FEATURE_KEYS.map((key) => (
        <div key={key}>
          <div className={`flex justify-between text-white/50 mb-1 ${compact ? 'text-[11px]' : 'text-xs'}`}>
            <span>{labels[key] ?? key}</span>
            <span>{((vectorA[key] + vectorB[key]) / 2 * 100).toFixed(0)}% blend</span>
          </div>
          <div className={`rounded-full bg-white/5 overflow-hidden flex ${compact ? 'h-1.5' : 'h-2'}`}>
            <div className="h-full bg-accent-pink/70" style={{ width: `${vectorA[key] * 50}%` }} />
            <div className="h-full bg-accent-purple/70" style={{ width: `${vectorB[key] * 50}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}
