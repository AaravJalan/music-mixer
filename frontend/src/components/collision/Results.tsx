import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { CollisionResult, MetricsSnapshot, RecommendationTrack } from '@music-mixer/shared';
import { PLAYLIST_GENERATION_MODE_LABELS } from '@music-mixer/shared';
import { api } from '../../api/client';
import { Card } from '../ui/Card';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';
import { ScoreRing, getCompatibilityLabel } from './ScoreRing';
import { FeatureRadar, FeatureBars } from './FeatureRadar';
import { Playlist, SOURCE_COLORS, type TrackSource } from './Playlist';
import { GenreChart } from '../dashboard/GenreChart';
import { SharedArtistsList } from './SharedArtistsList';


interface ResultsProps {
  result: CollisionResult;
  metrics?: MetricsSnapshot;
  onReset: () => void;
  resetLabel?: string;
  /** Sandbox / custom flows that re-run generation outside the collision store. */
  onRegenerate?: () => Promise<CollisionResult>;
  canRegenerate?: boolean;
}

const DEFAULT_TRACK_DURATION_MS = 210_000;

function defaultExportName(result: CollisionResult): string {
  if (result.participants && result.participants.length > 2) {
    const names = result.participants.map((p) => p.user.displayName.split(' ')[0]);
    return `MusicMixer: ${names.join(' × ')}`;
  }
  return `MusicMixer: ${result.userA.displayName} × ${result.userB.displayName}`;
}

function formatPlaylistDuration(tracks: RecommendationTrack[]): string {
  const totalMs = tracks.reduce((sum, track) => sum + (track.durationMs ?? DEFAULT_TRACK_DURATION_MS), 0);
  const totalMinutes = Math.floor(totalMs / 60_000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours > 0) return `${hours}h ${minutes}m`;
  const seconds = Math.floor((totalMs % 60_000) / 1000);
  return seconds > 0 ? `${totalMinutes}m ${seconds}s` : `${totalMinutes}m`;
}

export function Results({
  result: initialResult,
  metrics,
  onReset,
  resetLabel = 'Start a new collision',
  onRegenerate,
  canRegenerate = true,
}: ResultsProps) {
  const [result, setResult] = useState(initialResult);
  const [exporting, setExporting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [playlistUrl, setPlaylistUrl] = useState(result.exportedPlaylistUrl ?? '');
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [exportName, setExportName] = useState(() => defaultExportName(initialResult));

  useEffect(() => {
    setResult(initialResult);
    setPlaylistUrl(initialResult.exportedPlaylistUrl ?? '');
    setExportName(defaultExportName(initialResult));
  }, [initialResult]);

  const label = getCompatibilityLabel(result.similarityScore);
  const participants = result.participants ?? [];
  const trackSources: TrackSource[] = participants.map((p, i) => ({
    name: p.user.displayName,
    color: SOURCE_COLORS[i % SOURCE_COLORS.length],
  }));
  const multiMode = participants.length > 2;
  const twoPerson = participants.length === 2;
  const centroid = result.centroidVector ?? result.midpointVector;
  const showRegenerate = canRegenerate && (onRegenerate != null || !result.collisionId.startsWith('sandbox-'));

  async function handleExport(name?: string) {
    setExporting(true);
    try {
      const trimmed = name?.trim();
      const { playlistUrl: url } = await api.exportPlaylist(
        result.collisionId,
        trimmed || defaultExportName(result),
      );
      setPlaylistUrl(url);
      setExportModalOpen(false);
      window.open(url, '_blank');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Export failed. Try logging out and back in for playlist permissions.');
    } finally {
      setExporting(false);
    }
  }

  function openExportFlow() {
    if (playlistUrl) {
      window.open(playlistUrl, '_blank');
      return;
    }
    setExportName(defaultExportName(result));
    setExportModalOpen(true);
  }

  async function handleRegenerate() {
    if (regenerating) return;
    setRegenerating(true);
    try {
      let updated: CollisionResult;
      if (onRegenerate) {
        updated = await onRegenerate();
      } else {
        const { result: regen } = await api.regeneratePlaylist(result.collisionId);
        updated = regen;
      }
      setResult(updated);
      setPlaylistUrl('');
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Failed to regenerate playlist');
    } finally {
      setRegenerating(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-8">
      <div className="text-center">
        <h2 className="text-4xl font-bold text-gradient mb-2">Taste Collision Complete</h2>
        <div className="flex items-center justify-center gap-3 mt-4 flex-wrap">
          {multiMode ? (
            participants.map((p) => (
              <div key={p.user.id} className="flex flex-col items-center gap-1">
                <Avatar user={p.user} size="md" />
                <span className="text-[10px] text-white/40">{p.weight}%</span>
              </div>
            ))
          ) : (
            <>
              <Avatar user={result.userA} size="md" />
              <span className="text-white/40 text-sm">
                {result.blendWeights.userA}/{result.blendWeights.userB} blend
              </span>
              <Avatar user={result.userB} size="md" />
            </>
          )}
        </div>
        {multiMode && (
          <p className="text-xs text-accent-cyan mt-3">
            {participants.length}-person weighted centroid · avg pairwise similarity
          </p>
        )}
      </div>

      <div className="grid lg:grid-cols-2 gap-6 items-stretch">
        <Card glow="purple" className="min-w-0 flex flex-col h-full">
          <div className="flex items-start justify-between gap-3 mb-4 shrink-0">
            <div className="min-w-0">
              <h3 className="text-lg font-semibold">Collision Playlist</h3>
              <p className="text-xs text-white/45 mt-1">
                {result.playlist.length} tracks · {formatPlaylistDuration(result.playlist)}
                {result.usedFallbackPlaylist && ' · curated'}
                {result.effectivePlaylistGenerationMode && (
                  <span>
                    {' · '}
                    {result.playlistGuardrailApplied
                      ? 'Equal Share'
                      : PLAYLIST_GENERATION_MODE_LABELS[result.effectivePlaylistGenerationMode]}
                    {result.playlistGuardrailApplied ? ' (auto)' : ''}
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {showRegenerate && (
                <button
                  type="button"
                  onClick={handleRegenerate}
                  disabled={regenerating || exporting}
                  title="Regenerate playlist"
                  aria-label="Regenerate playlist"
                  className="w-9 h-9 rounded-full border border-white/15 hover:bg-white/10 flex items-center justify-center text-white/70 hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  {regenerating ? (
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  ) : (
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
                    </svg>
                  )}
                </button>
              )}
              <Button variant="spotify" size="sm" onClick={openExportFlow} loading={exporting} disabled={regenerating}>
                {playlistUrl ? 'Open in Spotify' : 'Export to Spotify'}
              </Button>
            </div>
          </div>
          {regenerating && (
            <p className="text-xs text-accent-cyan mb-3 -mt-2">Regenerating...</p>
          )}
          <Playlist tracks={result.playlist} initialVisible={12} sources={trackSources} />
        </Card>

        <div className="flex flex-col gap-4 min-w-0 h-full">
          <Card glow="pink" className="flex flex-col items-center justify-center py-4 px-4 shrink-0">
            <ScoreRing score={result.similarityScore} label={label} size="default" />
            {result.usedEstimatedFeatures && (
              <p className="text-accent-cyan text-[10px] mt-3 max-w-[220px] text-center">
                Genre-based estimates used
              </p>
            )}
          </Card>

          <Card className="flex-1 min-h-[360px] flex flex-col py-4">
            <h3 className="text-lg font-semibold mb-2 shrink-0">Taste Radar</h3>
            <div className="flex-1 flex items-center justify-center min-h-0 px-2">
              <FeatureRadar
                vectorA={result.userAVector}
                vectorB={result.userBVector}
                midpoint={centroid}
                labels={result.featureLabels}
              />
            </div>
          </Card>

          <Card className="flex-1 min-h-[220px] flex flex-col py-4 px-4">
            <h3 className="text-base font-semibold mb-3 shrink-0">Feature Blend</h3>
            <div className="flex-1 flex flex-col justify-center">
              <FeatureBars
                vectorA={result.userAVector}
                vectorB={result.userBVector}
                labels={result.featureLabels}
              />
            </div>
          </Card>
        </div>
      </div>


      {result.sharedGenres.length > 0 && (
        <Card glow="purple">
          <h3 className="text-lg font-semibold mb-2">Shared Genres</h3>
          <p className="text-sm text-white/50 mb-4">Genres you both listen to most</p>
          <div className="flex flex-wrap gap-2">
            {result.sharedGenres.map((g) => (
              <span key={g} className="px-3 py-1 rounded-full bg-accent-cyan/10 text-accent-cyan text-sm border border-accent-cyan/20">
                {g}
              </span>
            ))}
          </div>
        </Card>
      )}

      <div className={`grid gap-6 ${multiMode ? 'lg:grid-cols-2 xl:grid-cols-4' : 'lg:grid-cols-2'}`}>
        {multiMode ? (
          participants.map((p) => (
            <Card key={p.user.id}>
              <GenreChart
                genres={p.genres}
                title={`${p.user.displayName}'s genres`}
                highlight={result.sharedGenres}
              />
            </Card>
          ))
        ) : (
          <>
            <Card>
              <GenreChart genres={result.userAGenres} title={`${result.userA.displayName}'s genres`} highlight={result.sharedGenres} />
            </Card>
            <Card>
              <GenreChart genres={result.userBGenres} title={`${result.userB.displayName}'s genres`} highlight={result.sharedGenres} />
            </Card>
          </>
        )}
      </div>

      {twoPerson && (
        <Card>
          <h3 className="text-lg font-semibold mb-1">Common Top Artists</h3>
          <p className="text-sm text-white/45 mb-4">Up to 15 artists on both charts</p>
          <SharedArtistsList artists={result.sharedArtists ?? []} />
        </Card>
      )}

      {metrics && (
        <Card className="text-center">
          <div className="flex justify-center gap-8 text-sm">
            <div>
              <p className="text-2xl font-bold text-accent-cyan">{metrics.recommendationLatencyMs.toFixed(0)}ms</p>
              <p className="text-white/40">Latency</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-accent-purple">{(metrics.cacheHitRate * 100).toFixed(0)}%</p>
              <p className="text-white/40">Cache hits</p>
            </div>
          </div>
        </Card>
      )}

      <div className="text-center">
        <button type="button" onClick={onReset} className="text-white/50 hover:text-white text-sm underline">
          {resetLabel}
        </button>
      </div>

      <AnimatePresence>
        {exportModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => !exporting && setExportModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="w-full max-w-md rounded-2xl border border-white/10 bg-[#12121a] shadow-2xl p-5"
              onClick={(e) => e.stopPropagation()}
            >
              <h4 className="text-base font-semibold mb-1">Export to Spotify</h4>
              <p className="text-xs text-white/45 mb-4">Choose a name for your playlist.</p>
              <label className="block mb-4">
                <span className="text-xs text-white/50 block mb-2">Playlist name</span>
                <input
                  type="text"
                  value={exportName}
                  disabled={exporting}
                  onChange={(e) => setExportName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && exportName.trim()) {
                      void handleExport(exportName);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm outline-none focus:border-accent-cyan/50"
                  autoFocus
                />
              </label>
              <div className="flex justify-end gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setExportModalOpen(false)}
                  disabled={exporting}
                >
                  Cancel
                </Button>
                <Button
                  variant="spotify"
                  size="sm"
                  onClick={() => handleExport(exportName)}
                  loading={exporting}
                  disabled={!exportName.trim()}
                >
                  Export
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
