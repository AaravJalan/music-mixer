import { motion } from 'framer-motion';
import type { DashboardResponse } from '@music-mixer/shared';

interface StatBubblesProps {
  data: DashboardResponse;
  periodLabel: string;
}

function formatCount(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return n.toString();
}

interface Bubble {
  label: string;
  value: string;
  unit?: string;
  glow: [string, string];
}

export function StatBubbles({ data, periodLabel }: StatBubblesProps) {
  const bubbles: Bubble[] = [
    { label: 'Tracks analyzed', value: formatCount(data.totalTracks ?? 0), glow: ['rgba(34, 211, 238, 0.25)', 'rgba(34, 211, 238, 0.05)'] },
    { label: 'Artists analyzed', value: formatCount(data.totalArtists ?? 0), glow: ['rgba(255, 45, 106, 0.25)', 'rgba(255, 45, 106, 0.05)'] },
    { label: 'Top genre', value: data.insights.topGenre?.name ?? 'Mixed', glow: ['rgba(139, 92, 246, 0.25)', 'rgba(139, 92, 246, 0.05)'] },
    { label: 'Niche factor', value: `${Math.round((data.insights.nicheScore ?? 0) * 100)}`, unit: '%', glow: ['rgba(255, 45, 106, 0.25)', 'rgba(139, 92, 246, 0.05)'] },
    { label: 'Unique genres', value: formatCount(data.uniqueGenreCount ?? 0), glow: ['rgba(139, 92, 246, 0.25)', 'rgba(255, 45, 106, 0.05)'] },
    { label: 'Avg song length', value: (data.avgTrackLengthMin ?? 0).toFixed(1), unit: 'min', glow: ['rgba(34, 211, 238, 0.25)', 'rgba(139, 92, 246, 0.05)'] },
  ];

  return (
    <div>
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold text-white/70">By the numbers</h2>
        <span className="text-[10px] text-white/30">{periodLabel} · estimated from Spotify data</span>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
        {bubbles.map((bubble, i) => (
          <motion.div
            key={bubble.label}
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: i * 0.04 }}
            className={`relative overflow-hidden rounded-2xl border border-white/10 p-4 flex flex-col justify-between min-h-[92px]`}
            style={{ backgroundImage: `linear-gradient(to bottom right, ${bubble.glow[0]}, ${bubble.glow[1]})` }}
          >
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold text-white leading-none">{bubble.value}</span>
              {bubble.unit && <span className="text-[11px] text-white/50">{bubble.unit}</span>}
            </div>
            <span className="text-[11px] text-white/55 mt-2">{bubble.label}</span>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
