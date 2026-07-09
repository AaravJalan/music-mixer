import type { GenreDistributionSlice } from '@music-mixer/shared';

interface GenrePieProps {
  slices: GenreDistributionSlice[];
}

const COLORS = [
  '#ec4899', '#a855f7', '#22d3ee', '#4ade80',
  '#f59e0b', '#38bdf8', '#f472b6', '#818cf8', '#94a3b8',
];

const RADIUS = 80;
const CENTER = 100;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export function GenrePie({ slices }: GenrePieProps) {
  if (slices.length === 0) {
    return <p className="text-white/40 text-sm">No genre data available yet.</p>;
  }

  const total = slices.reduce((sum, s) => sum + s.percentage, 0) || 1;

  let offset = 0;
  const segments = slices.map((slice, i) => {
    const fraction = slice.percentage / total;
    const dash = fraction * CIRCUMFERENCE;
    const seg = {
      color: COLORS[i % COLORS.length],
      dash,
      gap: CIRCUMFERENCE - dash,
      rotation: (offset / total) * 360,
      slice,
    };
    offset += slice.percentage;
    return seg;
  });

  return (
    <div className="flex flex-col sm:flex-row items-center gap-6">
      <svg viewBox="0 0 200 200" className="w-44 h-44 shrink-0 -rotate-90">
        <circle cx={CENTER} cy={CENTER} r={RADIUS} fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth={26} />
        {segments.map((seg) => (
          <circle
            key={seg.slice.genre}
            cx={CENTER}
            cy={CENTER}
            r={RADIUS}
            fill="none"
            stroke={seg.color}
            strokeWidth={26}
            strokeDasharray={`${seg.dash} ${seg.gap}`}
            strokeDashoffset={-((seg.rotation / 360) * CIRCUMFERENCE)}
          />
        ))}
      </svg>

      <ul className="flex-1 w-full space-y-1.5 min-w-0">
        {segments.map((seg) => (
          <li key={seg.slice.genre} className="flex items-center gap-2 text-sm">
            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className="text-white/70 truncate flex-1">{seg.slice.genre}</span>
            <span className="text-white/40 tabular-nums">{seg.slice.percentage}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
