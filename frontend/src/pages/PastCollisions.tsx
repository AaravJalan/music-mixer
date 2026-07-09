import { useEffect, useState, type MouseEvent } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { CollisionHistoryEntry } from '@music-mixer/shared';
import { api } from '../api/client';
import { Card } from '../components/ui/Card';
import { getCompatibilityLabel } from '../components/collision/ScoreRing';

function entryKey(entry: CollisionHistoryEntry): string {
  return `${entry.id}-${entry.completedAt}`;
}

export function PastCollisionsPage() {
  const [collisions, setCollisions] = useState<CollisionHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  const [clearing, setClearing] = useState(false);

  useEffect(() => {
    api.getCollisionHistory()
      .then(({ collisions: c }) => setCollisions(c))
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(entry: CollisionHistoryEntry, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    const key = entryKey(entry);
    if (deletingKey === key) return;
    if (!window.confirm('Delete this collision from your history?')) return;

    setDeletingKey(key);
    try {
      await api.deleteCollisionHistory(entry.id, entry.completedAt);
      setCollisions((prev) => prev.filter((c) => entryKey(c) !== key));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to delete collision');
    } finally {
      setDeletingKey(null);
    }
  }

  async function handleClearAll() {
    if (clearing || collisions.length === 0) return;
    if (!window.confirm('Clear all past collisions? This cannot be undone.')) return;

    setClearing(true);
    try {
      await api.clearCollisionHistory();
      setCollisions([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to clear collisions');
    } finally {
      setClearing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-5xl">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-gradient">Past Collisions</h1>
          <p className="text-white/50 mt-1">Your recent taste collision sessions</p>
        </div>
        {collisions.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            disabled={clearing}
            className="shrink-0 mt-1 px-3 py-1.5 rounded-lg text-xs font-medium border border-red-500/25 text-red-300/90 hover:bg-red-500/10 hover:text-red-300 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {clearing ? 'Clearing…' : 'Clear all'}
          </button>
        )}
      </div>

      {collisions.length === 0 ? (
        <Card>
          <p className="text-white/50 text-sm">No completed collisions yet.</p>
          <Link to="/" className="text-sm text-accent-purple hover:underline mt-3 inline-block">
            Start a collision
          </Link>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
          {collisions.map((c, i) => {
            const key = entryKey(c);
            const scorePct = Math.round(c.similarityScore * 100);
            const label = getCompatibilityLabel(c.similarityScore);
            const isDeleting = deletingKey === key;

            return (
              <motion.div
                key={key}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.03 }}
                className="relative group"
              >
                <Link to={`/collisions/${c.id}`} className="block">
                  <Card className="!p-0 aspect-square overflow-hidden hover:bg-white/[0.06] transition-colors cursor-pointer h-full">
                    <div className="flex flex-col h-full p-4">
                      <div className="flex items-start justify-between gap-2 mb-auto">
                        <span className="text-[10px] uppercase tracking-wider text-white/35 font-medium">
                          {c.mode}
                        </span>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(c, e)}
                          disabled={isDeleting}
                          title="Delete collision"
                          aria-label="Delete collision"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-white/30 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all disabled:opacity-40"
                        >
                          {isDeleting ? (
                            <svg className="animate-spin h-3.5 w-3.5" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                          ) : (
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                            </svg>
                          )}
                        </button>
                      </div>

                      <div className="flex-1 flex flex-col items-center justify-center text-center min-h-0 py-2">
                        <p className="text-3xl font-bold text-accent-cyan leading-none">{scorePct}%</p>
                        <p className="text-[11px] text-accent-cyan/80 mt-1">{label}</p>
                      </div>

                      <div className="mt-auto min-w-0 text-center">
                        <p className="text-xs font-medium line-clamp-2 leading-snug">
                          {c.participantNames.join(' · ')}
                        </p>
                        <p className="text-[10px] text-white/35 mt-1.5">
                          {new Date(c.completedAt).toLocaleDateString()} · {c.playlistLength} tracks
                        </p>
                      </div>
                    </div>
                  </Card>
                </Link>
              </motion.div>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
