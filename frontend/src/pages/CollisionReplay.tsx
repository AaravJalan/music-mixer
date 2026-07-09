import { useEffect, useState, useCallback } from 'react';
import { Link, useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { CollisionHistorySnapshot, CollisionResult, PlaylistGenerationMode, PlaylistLengthMode, TasteTimeRange } from '@music-mixer/shared';
import { PLAYLIST_MATCH_THRESHOLD } from '@music-mixer/shared';
import { api } from '../api/client';
import { Results } from '../components/collision/Results';
import { CollisionSettings } from '../components/collision/CollisionSettings';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export function CollisionReplayPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [snapshot, setSnapshot] = useState<CollisionHistorySnapshot | null>(null);
  const [result, setResult] = useState<CollisionResult | null>(null);
  const [settings, setSettings] = useState({
    userAWeight: 50,
    userBWeight: 50,
    playlistLength: 15,
    playlistLengthMode: 'tracks' as PlaylistLengthMode,
    playlistDurationMinutes: 60,
    userATimeRange: 'medium_term' as TasteTimeRange,
    userBTimeRange: 'medium_term' as TasteTimeRange,
    playlistGenerationMode: 'midpoint' as PlaylistGenerationMode,
  });
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    api.getCollisionSnapshot(id)
      .then(({ snapshot: s }) => {
        setSnapshot(s);
        setResult(s.result);
        setSettings({
          userAWeight: s.config.userAWeight,
          userBWeight: s.config.userBWeight,
          playlistLength: s.config.playlistLength,
          playlistLengthMode: s.config.playlistLengthMode ?? 'tracks',
          playlistDurationMinutes: s.config.playlistDurationMinutes ?? 60,
          userATimeRange: s.config.participantTimeRanges?.[0] ?? 'medium_term',
          userBTimeRange: s.config.participantTimeRanges?.[1] ?? 'medium_term',
          playlistGenerationMode:
            s.config.playlistGenerationMode === 'common_only'
              ? 'common_only'
              : s.result.similarityScore < PLAYLIST_MATCH_THRESHOLD
                ? 'equal_share'
                : (s.config.playlistGenerationMode ?? 'midpoint'),
        });
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false));
  }, [id]);

  const updateSettings = useCallback((patch: Partial<typeof settings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  async function handleRerun() {
    if (!id) return;
    setRunning(true);
    setError(null);
    try {
      const { result: r } = await api.rerunCollision(id, {
        userAWeight: settings.userAWeight,
        userBWeight: settings.userBWeight,
        playlistLength: settings.playlistLength,
        playlistLengthMode: settings.playlistLengthMode,
        playlistDurationMinutes: settings.playlistDurationMinutes,
        participantWeights: [settings.userAWeight, settings.userBWeight],
        participantTimeRanges: [settings.userATimeRange, settings.userBTimeRange],
        playlistGenerationMode: settings.playlistGenerationMode,
      });
      setResult(r);
      if (r.similarityScore < PLAYLIST_MATCH_THRESHOLD) {
        setSettings((prev) =>
          prev.playlistGenerationMode === 'midpoint'
            ? { ...prev, playlistGenerationMode: 'equal_share' }
            : prev,
        );
      }
      if (snapshot) {
        setSnapshot({
          ...snapshot,
          result: r,
          config: {
            ...snapshot.config,
            userAWeight: settings.userAWeight,
            userBWeight: settings.userBWeight,
            playlistLength: settings.playlistLength,
            playlistLengthMode: settings.playlistLengthMode,
            playlistDurationMinutes: settings.playlistDurationMinutes,
            participantWeights: [settings.userAWeight, settings.userBWeight],
            participantTimeRanges: [settings.userATimeRange, settings.userBTimeRange],
            playlistGenerationMode: settings.playlistGenerationMode,
          },
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Re-run failed');
    } finally {
      setRunning(false);
    }
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error && !snapshot) {
    return (
      <Card className="max-w-md mx-auto text-center">
        <p className="text-white/60 mb-4">{error}</p>
        <Link to="/collisions" className="text-sm text-accent-purple hover:underline">
          Back to past collisions
        </Link>
      </Card>
    );
  }

  if (!snapshot || !result) return null;

  const names = snapshot.participants.map((p) => p.displayName);
  const nameA = names[0] ?? 'User A';
  const nameB = names[1] ?? 'User B';

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <Link to="/collisions" className="text-xs text-white/40 hover:text-white/60">
            Past Collisions
          </Link>
          <h1 className="text-2xl font-bold text-gradient mt-1">Collision Replay</h1>
          <p className="text-sm text-white/50 mt-1">
            {new Date(snapshot.entry.completedAt).toLocaleString()} · {snapshot.entry.mode}
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-sm text-red-300">
          {error}
        </div>
      )}

      <CollisionSettings
        userAName={nameA}
        userBName={nameB}
        userAWeight={settings.userAWeight}
        userBWeight={settings.userBWeight}
        playlistLength={settings.playlistLength}
        playlistLengthMode={settings.playlistLengthMode}
        playlistDurationMinutes={settings.playlistDurationMinutes}
        userATimeRange={settings.userATimeRange}
        userBTimeRange={settings.userBTimeRange}
        playlistGenerationMode={settings.playlistGenerationMode}
        compatibilityScore={result?.similarityScore ?? null}
        onChange={updateSettings}
        disabled={running}
      />

      <div className="text-center">
        <Button variant="primary" size="lg" onClick={handleRerun} loading={running}>
          Re-run collision
        </Button>
        <p className="text-xs text-white/35 mt-2">
          Adjust blend, time windows, and playlist size, then re-run
        </p>
      </div>

      <Results
        result={result}
        onReset={() => navigate('/collisions')}
        resetLabel="Back to past collisions"
        canRegenerate={false}
      />
    </motion.div>
  );
}
