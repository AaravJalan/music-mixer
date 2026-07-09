import { useEffect, useState } from 'react';
import type { GhostProfile, CollisionResult, MetricsSnapshot, SandboxCollisionRequest, UserProfile, PlaylistLengthMode, PlaylistGenerationMode } from '@music-mixer/shared';
import { PLAYLIST_GENERATION_MODE_LABELS } from '@music-mixer/shared';
import { api } from '../../api/client';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { ParticipantWeightSliders } from './ParticipantWeightSliders';
import { PlaylistLengthControl } from './PlaylistLengthControl';
import { evenParticipantWeights } from '../../utils/participantWeights';

const MAX_GHOSTS = 3;

interface SandboxPanelProps {
  user: UserProfile;
  onResult: (result: CollisionResult, metrics: MetricsSnapshot | undefined, params: SandboxCollisionRequest) => void;
}

export function SandboxPanel({ user, onResult }: SandboxPanelProps) {
  const [ghosts, setGhosts] = useState<GhostProfile[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [weights, setWeights] = useState<number[]>([50, 50]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [playlistLength, setPlaylistLength] = useState(15);
  const [playlistLengthMode, setPlaylistLengthMode] = useState<PlaylistLengthMode>('tracks');
  const [playlistDurationMinutes, setPlaylistDurationMinutes] = useState(60);
  const [generationMode, setGenerationMode] = useState<PlaylistGenerationMode>('midpoint');
  const [expanded, setExpanded] = useState(false);

  const GENERATION_MODES: { id: PlaylistGenerationMode; hint: string }[] = [
    { id: 'midpoint', hint: 'Bridge tracks between all tastes' },
    { id: 'equal_share', hint: 'Proportional chunks from each person' },
    { id: 'common_only', hint: 'Only songs everyone already shares' },
  ];

  const participantCount = 1 + selected.length;

  useEffect(() => {
    api.getGhostProfiles()
      .then(({ ghosts: g }) => setGhosts(g))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    setWeights(evenParticipantWeights(participantCount));
  }, [participantCount]);

  function toggleGhost(id: string) {
    setSelected((prev) => {
      if (prev.includes(id)) return prev.filter((g) => g !== id);
      if (prev.length >= MAX_GHOSTS) return prev;
      return [...prev, id];
    });
  }

  const selectedGhosts = selected
    .map((id) => ghosts.find((g) => g.id === id))
    .filter((g): g is GhostProfile => !!g);

  const weightParticipants = [
    { id: user.id, label: 'You', user },
    ...selectedGhosts.map((g) => ({
      id: g.id,
      label: g.displayName,
      avatarUrl: g.avatarUrl,
    })),
  ];

  async function handleRun() {
    if (selected.length === 0) return;
    setRunning(true);
    setError(null);
    try {
      const params: SandboxCollisionRequest = {
        ghostIds: selected,
        playlistLength,
        playlistLengthMode,
        playlistDurationMinutes,
        participantWeights: weights,
        playlistGenerationMode: generationMode,
      };
      const { result, metrics } = await api.runSandboxCollision(params);
      onResult(result, metrics, params);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Sandbox collision failed');
    } finally {
      setRunning(false);
    }
  }

  if (loading) return null;

  return (
    <Card className="text-left">
      <button
        type="button"
        onClick={() => setExpanded((e) => !e)}
        className="w-full flex items-center justify-between text-left"
      >
        <div>
          <h3 className="text-lg font-semibold">Sandbox test</h3>
          <p className="text-xs text-white/40 mt-1">
            Up to 4 participants — set each person&apos;s blend contribution
          </p>
        </div>
        <span className="text-white/40 text-sm">{expanded ? '−' : '+'}</span>
      </button>

      {expanded && (
        <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
          {error && (
            <p className="text-sm text-red-300">{error}</p>
          )}

          <div className="grid sm:grid-cols-3 gap-3">
            {ghosts.map((ghost) => {
              const active = selected.includes(ghost.id);
              return (
                <button
                  key={ghost.id}
                  type="button"
                  onClick={() => toggleGhost(ghost.id)}
                  className={[
                    'text-left p-3 rounded-xl border transition-all',
                    active
                      ? 'bg-accent-purple/15 border-accent-purple/40'
                      : 'bg-white/5 border-white/10 hover:border-white/20',
                  ].join(' ')}
                >
                  <img src={ghost.avatarUrl} alt="" className="w-10 h-10 rounded-lg mb-2 bg-white/5" />
                  <p className="text-sm font-medium">{ghost.displayName}</p>
                  <p className="text-[11px] text-white/40">{ghost.tagline}</p>
                </button>
              );
            })}
          </div>

          {selected.length > 0 && (
            <ParticipantWeightSliders
              participants={weightParticipants}
              weights={weights}
              onChange={setWeights}
              disabled={running}
            />
          )}

          <div>
            <span className="text-sm text-white/60 block mb-2">Playlist Generation Mode</span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {GENERATION_MODES.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  disabled={running}
                  onClick={() => setGenerationMode(m.id)}
                  className={[
                    'px-3 py-2.5 rounded-lg border text-left transition-colors',
                    generationMode === m.id
                      ? 'bg-accent-purple/25 border-accent-purple/50 text-white'
                      : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70',
                  ].join(' ')}
                >
                  <span className="text-xs font-semibold block">{PLAYLIST_GENERATION_MODE_LABELS[m.id]}</span>
                  <span className="text-[10px] text-white/45 mt-0.5 block">{m.hint}</span>
                </button>
              ))}
            </div>
          </div>

          <PlaylistLengthControl
            mode={playlistLengthMode}
            trackCount={playlistLength}
            durationMinutes={playlistDurationMinutes}
            disabled={running}
            onChange={(patch) => {
              if (patch.playlistLengthMode !== undefined) setPlaylistLengthMode(patch.playlistLengthMode);
              if (patch.playlistLength !== undefined) setPlaylistLength(patch.playlistLength);
              if (patch.playlistDurationMinutes !== undefined) setPlaylistDurationMinutes(patch.playlistDurationMinutes);
            }}
          />

          <Button
            variant="secondary"
            size="sm"
            className="w-full"
            disabled={selected.length === 0}
            loading={running}
            onClick={handleRun}
          >
            Run {participantCount}-person sandbox collision
          </Button>
        </div>
      )}
    </Card>
  );
}
