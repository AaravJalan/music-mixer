import { useLayoutEffect, useMemo, useRef, useState } from 'react';
import type { GenreStat } from '@music-mixer/shared';

interface GenreCloudProps {
  genres: GenreStat[];
}

interface PackedBubble {
  genre: string;
  percentage: number;
  r: number;
  x: number;
  y: number;
}

function formatGenre(genre: string): string {
  return genre.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function bubbleDiameter(percentage: number): number {
  const min = 68;
  const max = 148;
  const scale = Math.sqrt(Math.max(percentage, 1) / 100);
  return Math.round(min + (max - min) * scale);
}

function labelFontSize(diameter: number): number {
  return Math.max(8, Math.min(16, diameter * 0.105));
}

function percentFontSize(diameter: number): number {
  return Math.max(7, Math.min(12, diameter * 0.085));
}

function hasOverlap(x: number, y: number, r: number, placed: PackedBubble[]): boolean {
  for (const p of placed) {
    const dx = x - p.x;
    const dy = y - p.y;
    const minDist = r + p.r - 0.25;
    if (dx * dx + dy * dy < minDist * minDist) return true;
  }
  return false;
}

/** Greedy circle pack — largest at center, others placed tangent to the cluster. */
function packBubbles(genres: GenreStat[]): PackedBubble[] {
  const items = genres
    .map((g) => ({
      genre: g.genre,
      percentage: g.percentage,
      r: bubbleDiameter(g.percentage) / 2,
    }))
    .sort((a, b) => b.r - a.r);

  const placed: PackedBubble[] = [];

  for (const item of items) {
    if (placed.length === 0) {
      placed.push({ ...item, x: 0, y: 0 });
      continue;
    }

    let best: { x: number; y: number; score: number } | null = null;

    for (const anchor of placed) {
      const orbit = item.r + anchor.r;
      for (let step = 0; step < 36; step++) {
        const angle = (step / 36) * Math.PI * 2;
        const x = anchor.x + orbit * Math.cos(angle);
        const y = anchor.y + orbit * Math.sin(angle);

        if (!hasOverlap(x, y, item.r, placed)) {
          // Standard circular packing algorithm
          const score = Math.hypot(x, y);
          if (!best || score < best.score) {
            best = { x, y, score };
          }
        }
      }
    }

    if (!best) {
      const rightEdge = Math.max(...placed.map((p) => p.x + p.r));
      best = { x: rightEdge + item.r, y: 0, score: Infinity };
    }

    placed.push({ ...item, x: best.x, y: best.y });
  }

  return placed;
}

function layoutBounds(bubbles: PackedBubble[], padding = 6) {
  const minX = Math.min(...bubbles.map((b) => b.x - b.r)) - padding;
  const maxX = Math.max(...bubbles.map((b) => b.x + b.r)) + padding;
  const minY = Math.min(...bubbles.map((b) => b.y - b.r)) - padding;
  const maxY = Math.max(...bubbles.map((b) => b.y + b.r)) + padding;
  return { minX, minY, width: maxX - minX, height: maxY - minY };
}

const HUES = [
  'bg-accent-pink/25 border-accent-pink/50 text-pink-100',
  'bg-accent-purple/25 border-accent-purple/50 text-purple-100',
  'bg-accent-cyan/25 border-accent-cyan/50 text-cyan-100',
  'bg-amber-500/20 border-amber-400/45 text-amber-100',
  'bg-emerald-500/20 border-emerald-400/45 text-emerald-100',
];

export function GenreCloud({ genres }: GenreCloudProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  const packed = useMemo(() => packBubbles(genres), [genres]);
  const bounds = useMemo(() => layoutBounds(packed), [packed]);

  useLayoutEffect(() => {
    const el = containerRef.current;
    if (!el || bounds.width <= 0 || bounds.height <= 0) return;

    const updateScale = () => {
      const { width, height } = el.getBoundingClientRect();
      const padding = 12;
      const fit = Math.min(
        (width - padding) / bounds.width,
        (height - padding) / bounds.height,
      );
      setScale(Math.min(Math.max(fit, 0.75), 2.8));
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, [bounds.width, bounds.height]);

  if (genres.length === 0) {
    return <p className="text-white/40 text-sm">No genre data for this period yet.</p>;
  }

  return (
    <div
      ref={containerRef}
      className="w-full aspect-square sm:aspect-square flex items-center justify-center py-1 max-h-[500px]"
    >
      <div
        className="relative shrink-0"
        style={{
          width: bounds.width,
          height: bounds.height,
          transform: `scale(${scale})`,
          transformOrigin: 'center center',
        }}
      >
        {packed.map((bubble, i) => {
          const diameter = bubble.r * 2;
          const nameSize = labelFontSize(diameter);
          const pctSize = percentFontSize(diameter);
          const left = bubble.x - bubble.r - bounds.minX;
          const top = bubble.y - bubble.r - bounds.minY;

          return (
            <div
              key={bubble.genre}
              className={[
                'absolute rounded-full border flex flex-col items-center justify-center text-center',
                'transition-transform hover:scale-[1.06] hover:z-10 shadow-lg',
                HUES[i % HUES.length],
              ].join(' ')}
              style={{
                left,
                top,
                width: diameter,
                height: diameter,
              }}
              title={`${bubble.percentage}% of your taste`}
            >
              <span
                className="font-semibold leading-tight px-1 line-clamp-2"
                style={{ fontSize: nameSize }}
              >
                {formatGenre(bubble.genre)}
              </span>
              <span
                className="opacity-70"
                style={{ fontSize: pctSize, marginTop: diameter * 0.04 }}
              >
                {bubble.percentage}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
