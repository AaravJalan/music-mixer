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
  glow: string;
}

export function StatBubbles({ data, periodLabel }: StatBubblesProps) {
  const bubbles: Bubble[] = [
    { label: 'Tracks analyzed', value: formatCount(data.totalTracks ?? 0), glow: 'from-accent-cyan/25 to-accent-cyan/5' },
    { label: 'Artists analyzed', value: formatCount(data.totalArtists ?? 0), glow: 'from-accent-pink/25 to-accent-pink/5' },
    { label: 'Top genre', value: data.insights.topGenre?.name ?? 'Mixed', glow: 'from-accent-purple/25 to-accent-purple/5' },
    { label: 'Niche factor', value: `${Math.round((data.insights.nicheScore ?? 0) * 100)}`, unit: '%', glow: 'from-accent-pink/25 to-accent-purple/5' },
    { label: 'Unique genres', value: formatCount(data.uniqueGenreCount ?? 0), glow: 'from-accent-purple/25 to-accent-pink/5' },
    { label: 'Avg song length', value: (data.avgTrackLengthMin ?? 0).toFixed(1), unit: 'min', glow: 'from-accent-cyan/25 to-accent-purple/5' },
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
            className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${bubble.glow} p-4 flex flex-col justify-between min-h-[92px]`}
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
