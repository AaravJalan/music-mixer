import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { DashboardResponse, TasteTimeRange, UserProfile } from '@music-mixer/shared';
import { api } from '../api/client';
import { GenreCloud } from '../components/dashboard/GenreCloud';
import { PersonalRadar } from '../components/dashboard/PersonalRadar';
import { ListeningStory } from '../components/dashboard/ListeningStory';
import { TopArtistsList, TopTracksList } from '../components/dashboard/WrappedList';
import { StatBubbles } from '../components/dashboard/StatBubbles';
import { Card } from '../components/ui/Card';
import { TASTE_TIME_RANGE_OPTIONS } from '../constants/tasteTimeRanges';

interface DashboardProps {
  user: UserProfile;
}

const TERM_OPTIONS = TASTE_TIME_RANGE_OPTIONS.map((o) => ({
  value: o.value,
  label: o.label,
  hint: o.value === 'short_term'
    ? 'Current listening'
    : o.value === 'medium_term'
      ? 'Recent habits'
      : o.value === 'year_to_date'
        ? 'Calendar year so far'
        : 'Long-term taste',
}));

export function Dashboard({ user }: DashboardProps) {
  const [term, setTerm] = useState<TasteTimeRange>('medium_term');
  const [cache, setCache] = useState<Partial<Record<TasteTimeRange, DashboardResponse>>>({});
  const [loading, setLoading] = useState(true);
  const [termLoading, setTermLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const data = cache[term] ?? null;
  const activeTerm = TERM_OPTIONS.find((t) => t.value === term);

  useEffect(() => {
    // Background prefetch for all other terms + listening habits
    const timer = setTimeout(async () => {
      const allTerms: TasteTimeRange[] = ['short_term', 'medium_term', 'year_to_date', 'long_term'];
      for (const t of allTerms) {
        if (!cache[t]) {
          try {
            const data = await api.getDashboard(t);
            setCache(prev => ({ ...prev, [t]: data }));
          } catch {
            // ignore prefetch errors
          }
        }
      }
      try {
        await api.getListeningHabits('medium_term');
      } catch {}
    }, 2000);

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (cache[term]) {
      setLoading(false);
      setTermLoading(false);
      return;
    }

    let cancelled = false;
    setTermLoading(true);
    if (Object.keys(cache).length === 0) setLoading(true);

    const timer = setTimeout(() => {
      api.getDashboard(term)
        .then((dash) => {
          if (cancelled || dash.term !== term) return;
          setCache((prev) => ({ ...prev, [term]: dash }));
          setError(null);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load dashboard');
        })
        .finally(() => {
          if (!cancelled) {
            setLoading(false);
            setTermLoading(false);
          }
        });
    }, 400);

    return () => { 
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [term]);

  function handleTermChange(next: TasteTimeRange) {
    if (next === term) return;
    setTerm(next);
    if (!cache[next]) setTermLoading(true);
  }

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
        <p className="text-xs text-white/40">Loading your Spotify stats</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Dashboard</h1>
          <p className="text-white/50 mt-1">{user.displayName}</p>
        </div>

        <div className="flex gap-1 p-1 rounded-xl bg-white/5 border border-white/10 self-center sm:self-auto w-full sm:w-fit">
          {TERM_OPTIONS.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => handleTermChange(t.value)}
              className={[
                'flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm transition-all text-center',
                term === t.value
                  ? 'bg-white/10 text-white font-medium'
                  : 'text-white/40 hover:text-white/80 hover:bg-white/5',
              ].join(' ')}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {activeTerm && (
        <p className="text-xs text-white/35 -mt-2">
          {activeTerm.hint}
          {data?.cachedAt && (
            <span className="ml-2 text-white/25">· cached daily</span>
          )}
        </p>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          {error}
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={term}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: termLoading ? 0.5 : 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.2 }}
          className="space-y-6"
        >
          {data && (
            <div className="p-4 rounded-2xl bg-gradient-habit border border-white/10">
              <p className="text-lg font-semibold text-gradient">{data.insights.headline}</p>
              <p className="text-xs text-white/40 mt-1">
                {data.insights.listeningStyle === 'focused' ? 'Focused listener' : 'Genre explorer'}
                {' · '}
                {activeTerm?.label}
              </p>
            </div>
          )}

          {data && <StatBubbles data={data} periodLabel={activeTerm?.label ?? '6 months'} />}

          <div className="grid lg:grid-cols-2 gap-6">
            <Card glow="purple" className="min-w-0">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Genre Cloud</h2>
                <span className="text-xs text-white/35">{activeTerm?.label}</span>
              </div>
              <GenreCloud genres={data?.topGenres ?? []} />
            </Card>

            <Card glow="purple" className="px-2 sm:px-6 min-w-0">
              <div className="flex items-center justify-between mb-2 px-4 sm:px-0">
                <h2 className="text-lg font-semibold">6D Taste Shape</h2>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-accent-purple/20 text-accent-purple">
                  {activeTerm?.label}
                </span>
              </div>
              {data && (
                <>
                  <PersonalRadar
                    vector={data.tasteVector}
                    labels={data.featureLabels}
                    dimensionLabels={data.insights.dimensionLabels}
                  />
                  <div className="flex flex-wrap gap-2 mt-4 justify-center">
                    {data.insights.profileLabels.map((label) => (
                      <span
                        key={label}
                        className="text-xs px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/70"
                      >
                        {label}
                      </span>
                    ))}
                  </div>
                </>
              )}
            </Card>
          </div>

          {data?.sonicOutlier && (
            <Card glow="pink">
              <div className="flex items-start gap-4">
                {data.sonicOutlier.track.albumArtUrl ? (
                  <img
                    src={data.sonicOutlier.track.albumArtUrl}
                    alt=""
                    className="w-16 h-16 rounded-lg object-cover shrink-0"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-lg bg-accent-pink/20 flex items-center justify-center text-sm font-semibold text-white/60 shrink-0">
                    {data.sonicOutlier.track.name.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs uppercase tracking-wider text-accent-pink mb-1">Sonic Outlier</p>
                  <h2 className="text-lg font-semibold">{data.sonicOutlier.headline}</h2>
                  <p className="text-sm text-white/60 mt-2 leading-relaxed">{data.sonicOutlier.explanation}</p>
                </div>
              </div>
            </Card>
          )}

          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="px-2 sm:px-6">
              <h2 className="text-lg font-semibold mb-1 px-2 sm:px-0">Your Artists</h2>
              <p className="text-[11px] text-white/35 mb-4 px-2 sm:px-0">Top {activeTerm?.label ?? '6 months'}</p>
              {termLoading && !data ? (
                <div className="flex justify-center py-12">
                  <div className="w-6 h-6 border-2 border-accent-pink border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <TopArtistsList artists={data?.topArtists ?? []} />
              )}
            </Card>

            <Card className="px-2 sm:px-6">
              <h2 className="text-lg font-semibold mb-1 px-2 sm:px-0">Your Tracks</h2>
              <p className="text-[11px] text-white/35 mb-4 px-2 sm:px-0">Most played · {activeTerm?.label ?? '6 months'}</p>
              {termLoading && !data ? (
                <div className="flex justify-center py-12">
                  <div className="w-6 h-6 border-2 border-accent-cyan border-t-transparent rounded-full animate-spin" />
                </div>
              ) : (
                <TopTracksList tracks={data?.topTracks ?? []} />
              )}
            </Card>
          </div>

          {data && (
            <Card>
              <h2 className="text-lg font-semibold mb-4">Listening Story</h2>
              <ListeningStory
                insights={data.insights}
              />
            </Card>
          )}
        </motion.div>
      </AnimatePresence>
    </motion.div>
  );
}
