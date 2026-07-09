import type { GenreTrendPoint } from '@music-mixer/shared';

interface GenreTrendChartProps {
  trends: GenreTrendPoint[];
}

const W = 640;
const H = 240;
const PAD = { top: 20, right: 24, bottom: 28, left: 32 };

// A nice palette for different genres
const COLORS = [
  '#ff2d6a', // accent-pink
  '#8b5cf6', // accent-purple
  '#22d3ee', // accent-cyan
  '#1db954', // accent-green
  '#f59e0b', // amber
  '#ec4899', // pink-500
];

export function GenreTrendChart({ trends }: GenreTrendChartProps) {
  if (trends.length < 2) {
    return (
      <div className="flex flex-col items-center justify-center h-48">
        <p className="text-white/40 text-sm text-center max-w-xs">
          Not enough historical data to show trends yet. Check back after a few days of tracking!
        </p>
      </div>
    );
  }

  // Find the top N genres across all time to plot
  const allGenres = new Set<string>();
  trends.forEach((t) => Object.keys(t.percentages).forEach((g) => allGenres.add(g)));
  
  // Sort genres by their highest peak so we only plot the most significant ones
  const genrePeaks = Array.from(allGenres).map(genre => {
    const max = Math.max(...trends.map(t => t.percentages[genre] || 0));
    return { genre, max };
  }).sort((a, b) => b.max - a.max);

  // Plot top 5 genres
  const plotGenres = genrePeaks.slice(0, 5).map(g => g.genre);

  const maxPercentage = Math.max(
    20, // minimum scale
    ...genrePeaks.slice(0, 5).map(g => g.max)
  );
  
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;

  const x = (i: number) => PAD.left + (i / (trends.length - 1)) * plotW;
  const y = (pct: number) => PAD.top + plotH - (pct / maxPercentage) * plotH;

  const gridLines = [0, 0.25, 0.5, 0.75, 1];
  
  return (
    <div className="space-y-4">
      {/* Legend */}
      <div className="flex flex-wrap gap-3 px-4 justify-center">
        {plotGenres.map((genre, idx) => (
          <div key={genre} className="flex items-center gap-1.5 text-xs text-white/70">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[idx % COLORS.length] }} />
            {genre}
          </div>
        ))}
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" preserveAspectRatio="none">
        {/* Grid */}
        {gridLines.map((g) => {
          const gy = PAD.top + plotH - g * plotH;
          return (
            <g key={g}>
              <line x1={PAD.left} y1={gy} x2={W - PAD.right} y2={gy} stroke="rgba(255,255,255,0.07)" strokeWidth={1} />
              <text x={4} y={gy + 3} fill="rgba(255,255,255,0.35)" fontSize={10}>
                {(g * maxPercentage).toFixed(0)}%
              </text>
            </g>
          );
        })}

        {/* Lines */}
        {plotGenres.map((genre, idx) => {
          const path = trends
            .map((t, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(t.percentages[genre] || 0).toFixed(1)}`)
            .join(' ');

          return (
            <path
              key={genre}
              d={path}
              fill="none"
              stroke={COLORS[idx % COLORS.length]}
              strokeWidth={2.5}
              strokeLinejoin="round"
              strokeLinecap="round"
              className="transition-all duration-500 ease-out"
            />
          );
        })}

        {/* X-Axis labels (dates) */}
        {trends.map((t, i) => {
          // Show max 5 dates on x-axis
          const tickEvery = Math.ceil(trends.length / 5);
          if (i % tickEvery !== 0 && i !== trends.length - 1) return null;
          
          return (
            <text key={t.date} x={x(i)} y={H - 4} fill="rgba(255,255,255,0.35)" fontSize={10} textAnchor="middle">
              {t.date.slice(5)} {/* MM-DD */}
            </text>
          );
        })}
      </svg>
    </div>
  );
}
