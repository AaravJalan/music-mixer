import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import type { ListeningHabitsResponse, TasteTimeRange, UserProfile } from '@music-mixer/shared';
import { api } from '../api/client';
import { Card } from '../components/ui/Card';
import { GenrePie } from '../components/dashboard/GenrePie';
import { ListeningLineChart } from '../components/dashboard/ListeningLineChart';
import { GenreTrendChart } from '../components/dashboard/GenreTrendChart';

interface ListeningHabitsPageProps {
  user: UserProfile;
}

function formatHours(hours: number): string {
  if (hours >= 1000) return `${(hours / 1000).toFixed(1)}k`;
  return Math.round(hours).toLocaleString();
}

export function ListeningHabitsPage({ user }: ListeningHabitsPageProps) {
  const [data, setData] = useState<ListeningHabitsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api.getListeningHabits('long_term')
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
  }, []);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Listening Habits</h1>
          <p className="text-white/50 mt-1">{user.displayName}</p>
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
              <p className="text-2xl font-bold text-gradient mt-1">{formatHours(data.totalListeningHoursSinceTracking)}h</p>
              <p className="text-[11px] text-white/35 mt-0.5">
                tracked plays since {data.firstTrackedDate || 'tracking began'}
              </p>
            </Card>

            <Card className="py-4 px-5">
              <p className="text-[11px] uppercase tracking-wider text-white/40">Tracked By Cron</p>
              <p className="text-2xl font-bold text-gradient mt-1">{data.trackingCount}</p>
              <p className="text-[11px] text-white/35 mt-0.5">historical snapshots</p>
            </Card>

            <Card className="py-4 px-5">
              <p className="text-[11px] uppercase tracking-wider text-white/40">Genres</p>
              <p className="text-2xl font-bold text-gradient mt-1">{data.genreDistribution?.length || 0}</p>
              <p className="text-[11px] text-white/35 mt-0.5">represented in your mix</p>
            </Card>
          </div>

          <Card glow="purple">
            <h2 className="text-lg font-semibold mb-4">Genre Distribution</h2>
            <GenrePie slices={data.genreDistribution || []} />
          </Card>
          
          <Card glow="cyan">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Historical Genre Trends</h2>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                Backed by DynamoDB
              </span>
            </div>
            <GenreTrendChart trends={data.genreTrends || []} />
            <p className="text-[11px] text-white/35 mt-3 text-center">
              How your top genres evolved over {data.trackingCount || 0} tracking cycles.
            </p>
          </Card>

          <Card glow="pink">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Daily Listening Volume</h2>
              {!data.dailyIsEstimated && (data.dailyListening?.length ?? 0) > 0 ? (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/15 text-cyan-300 border border-cyan-400/30">
                  Cron tracked
                </span>
              ) : (
                <span
                  title="Needs at least 2 cron snapshots (every 3 days after your first track)"
                  className="text-[10px] px-2 py-0.5 rounded-full bg-white/10 text-white/50 border border-white/15"
                >
                  Collecting data
                </span>
              )}
            </div>
            {!data.dailyIsEstimated && (data.dailyListening?.length ?? 0) >= 2 ? (
              <>
                <ListeningLineChart points={data.dailyListening} />
                <p className="text-[11px] text-white/35 mt-3">
                  Hours from {data.dailyListening.length} cron snapshots (every 3 days).
                </p>
              </>
            ) : (
              <div className="rounded-xl border border-white/10 bg-white/[0.03] px-4 py-8 text-center">
                <p className="text-sm text-white/55">
                  Listening hours unlock after we have enough cron snapshots.
                </p>
                <p className="text-[11px] text-white/35 mt-2">
                  {data.trackingCount > 0
                    ? `Tracked ${data.trackingCount} so far — need 2+. Next cron runs every 3 days.`
                    : 'We just started tracking your account. Check back after the next snapshot.'}
                </p>
              </div>
            )}
          </Card>
        </motion.div>
      ) : null}
    </motion.div>
  );
}
