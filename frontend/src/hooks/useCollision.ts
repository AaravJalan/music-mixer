import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  CollisionSession,
  CollisionResult,
  MetricsSnapshot,
  PlaylistGenerationMode,
  PlaylistLengthMode,
  TasteTimeRange,
} from '@music-mixer/shared';
import { PLAYLIST_MATCH_THRESHOLD } from '@music-mixer/shared';
import { api } from '../api/client';

const DEFAULT_SETTINGS = {
  userAWeight: 50,
  userBWeight: 50,
  playlistLength: 15,
  playlistLengthMode: 'tracks' as PlaylistLengthMode,
  playlistDurationMinutes: 60,
  userATimeRange: 'medium_term' as TasteTimeRange,
  userBTimeRange: 'medium_term' as TasteTimeRange,
  playlistGenerationMode: 'midpoint' as PlaylistGenerationMode,
};

export function useCollision(id: string | undefined) {
  const [collision, setCollision] = useState<CollisionSession | null>(null);
  const [result, setResult] = useState<CollisionResult | null>(null);
  const [metrics, setMetrics] = useState<MetricsSnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);

  const settingsInitializedFor = useRef<string | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    settingsInitializedFor.current = null;
    setSettings(DEFAULT_SETTINGS);
  }, [id]);

  const persistSettings = useCallback((collisionId: string, next: typeof DEFAULT_SETTINGS) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      api.updateCollisionConfig(collisionId, {
        userAWeight: next.userAWeight,
        userBWeight: next.userBWeight,
        playlistLength: next.playlistLength,
        playlistLengthMode: next.playlistLengthMode,
        playlistDurationMinutes: next.playlistDurationMinutes,
        participantWeights: [next.userAWeight, next.userBWeight],
        participantTimeRanges: [next.userATimeRange, next.userBTimeRange],
        playlistGenerationMode: next.playlistGenerationMode,
      }).catch(() => {});
    }, 400);
  }, []);

  const refresh = useCallback(async () => {
    if (!id) return;
    try {
      const { collision: c } = await api.getCollision(id);
      setCollision(c);

      if (settingsInitializedFor.current !== id) {
        settingsInitializedFor.current = id;
        const ranges = c.config.participantTimeRanges ?? ['medium_term', 'medium_term'];
        setSettings({
          userAWeight: c.config.userAWeight,
          userBWeight: c.config.userBWeight,
          playlistLength: c.config.playlistLength,
          playlistLengthMode: c.config.playlistLengthMode ?? 'tracks',
          playlistDurationMinutes: c.config.playlistDurationMinutes ?? 60,
          userATimeRange: ranges[0] ?? 'medium_term',
          userBTimeRange: ranges[1] ?? 'medium_term',
          playlistGenerationMode: c.config.playlistGenerationMode ?? 'midpoint',
        });
      }

      if (c.status === 'complete') {
        const { result: r } = await api.getResult(id);
        setResult(r);
        if (r.similarityScore < PLAYLIST_MATCH_THRESHOLD) {
          setSettings((prev) =>
            prev.playlistGenerationMode === 'midpoint'
              ? { ...prev, playlistGenerationMode: 'equal_share' }
              : prev,
          );
        } else if (r.effectivePlaylistGenerationMode) {
          setSettings((prev) => ({
            ...prev,
            playlistGenerationMode: r.effectivePlaylistGenerationMode!,
          }));
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 3000);
    return () => {
      clearInterval(interval);
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [refresh]);

  const run = async () => {
    if (!id) return;
    setRunning(true);
    try {
      const current = settingsRef.current;
      const { result: r, metrics: m } = await api.runCollision(id, {
        userAWeight: current.userAWeight,
        userBWeight: current.userBWeight,
        playlistLength: current.playlistLength,
        playlistLengthMode: current.playlistLengthMode,
        playlistDurationMinutes: current.playlistDurationMinutes,
        participantWeights: [current.userAWeight, current.userBWeight],
        participantTimeRanges: [current.userATimeRange, current.userBTimeRange],
        playlistGenerationMode: current.playlistGenerationMode,
      });
      setResult(r);
      setMetrics(m);
      if (r.similarityScore < PLAYLIST_MATCH_THRESHOLD) {
        setSettings((prev) =>
          prev.playlistGenerationMode === 'midpoint'
            ? { ...prev, playlistGenerationMode: 'equal_share' }
            : prev,
        );
      }
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Collision failed');
    } finally {
      setRunning(false);
    }
  };

  const join = async () => {
    if (!id) return;
    try {
      const { collision: c } = await api.joinCollision(id);
      setCollision(c);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to join');
    }
  };

  const updateSettings = useCallback((patch: Partial<typeof DEFAULT_SETTINGS>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      if (id) persistSettings(id, next);
      return next;
    });
  }, [id, persistSettings]);

  return { collision, result, metrics, loading, running, error, settings, refresh, run, join, updateSettings };
}
