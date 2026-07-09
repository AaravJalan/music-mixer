import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { ListeningHabitsResponse, TasteTimeRange, UserProfile } from '@music-mixer/shared';
import { api } from '../api/client';
import { Card } from '../components/ui/Card';
import { GenrePie } from '../components/dashboard/GenrePie';
import { ListeningLineChart } from '../components/dashboard/ListeningLineChart';
import { TASTE_TIME_RANGE_OPTIONS } from '../constants/tasteTimeRanges';

interface ListeningHabitsPageProps {
  user: UserProfile;
}

function formatHours(hours: number): string {
  if (hours >= 1000) return `${(hours / 1000).toFixed(1)}k`;
  return Math.round(hours).toLocaleString();
}

export function ListeningHabitsPage({ user }: ListeningHabitsPageProps) {
  const [term, setTerm] = useState<TasteTimeRange>('medium_term');
  const [data, setData] = useState<ListeningHabitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getListeningHabits(term)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load listening habits');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [term]);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Listening Habits</h1>
          <p className="text-white/50 mt-1">{user.displayName}</p>
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 flex-wrap">
          {TASTE_TIME_RANGE_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTerm(t.value)}
              className={[
                'px-4 py-2 rounded-lg text-sm transition-all',
                term === t.value
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/5',
              ].join(' ')}
            >
              {t.label.replace('the ', '')}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          {error}
        </div>
      )}

      {loading && !data ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-white/40">Crunching your listening history</p>
        </div>
      ) : data ? (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: loading ? 0.5 : 1, y: 0 }}
          className="space-y-6"
        >
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            <Card className="py-4 px-5">
              <p className="text-[11px] uppercase tracking-wider text-white/40">Total Listening</p>
              <p className="text-2xl font-bold text-gradient mt-1">{formatHours(data.totalListeningHours)}h</p>
              <p className="text-[11px] text-white/35 mt-0.5">since account inception</p>
            </Card>
            <Card className="py-4 px-5">
              <p className="text-[11px] uppercase tracking-wider text-white/40">Tracks Analyzed</p>
              <p className="text-2xl font-bold text-gradient mt-1">{data.totalTracks.toLocaleString()}</p>
              <p className="text-[11px] text-white/35 mt-0.5">across your library</p>
            </Card>
            <Card className="py-4 px-5 col-span-2 sm:col-span-1">
              <p className="text-[11px] uppercase tracking-wider text-white/40">Genres</p>
              <p className="text-2xl font-bold text-gradient mt-1">{data.genreDistribution.length}</p>
              <p className="text-[11px] text-white/35 mt-0.5">represented in your mix</p>
            </Card>
          </div>

          <Card glow="purple">
            <h2 className="text-lg font-semibold mb-4">Genre Distribution</h2>
            <GenrePie slices={data.genreDistribution} />
          </Card>

          <Card glow="pink">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Daily Listening Volume</h2>
              {data.dailyIsEstimated && (
                <span
                  title="Modeled estimate until per-day play tracking is live"
                  className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-400/30"
                >
                  Estimated
                </span>
              )}
            </div>
            <ListeningLineChart points={data.dailyListening} />
            <p className="text-[11px] text-white/35 mt-3">
              Hours per day over the last {data.dailyListening.length} days.
            </p>
          </Card>
        </motion.div>
      ) : null}
    </motion.div>
  );
}
