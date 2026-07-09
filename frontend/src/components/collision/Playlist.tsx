import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RecommendationTrack } from '@music-mixer/shared';

/** Per-participant source colors (index-aligned with participants[]). */
export const SOURCE_COLORS = ['#ec4899', '#a855f7', '#22d3ee', '#4ade80'];

export interface TrackSource {
  name: string;
  color: string;
}

interface PlaylistProps {
  tracks: RecommendationTrack[];
  /** When set, only this many tracks show until "Show more" opens the full list. */
  initialVisible?: number;
  /** Participant names for source color-coding (proportional share). */
  sources?: TrackSource[];
}

function TrackRow({
  track,
  index,
  compact = false,
  sources,
}: {
  track: RecommendationTrack;
  index: number;
  compact?: boolean;
  sources?: TrackSource[];
}) {
  const source =
    track.sourceParticipantIndex != null && sources
      ? sources[track.sourceParticipantIndex]
      : undefined;

  return (
    <div
      className={[
        'flex items-center gap-3 px-2.5 rounded-xl hover:bg-white/5 transition-colors group',
        compact ? 'py-2' : 'p-2.5',
      ].join(' ')}
    >
      <span className="text-white/30 text-xs w-5 text-right font-mono shrink-0">{index + 1}</span>
      <div className="relative shrink-0">
        <img
          src={track.albumArtUrl}
          alt={track.name}
          className="w-10 h-10 rounded-lg object-cover shadow-lg group-hover:scale-105 transition-transform"
        />
        {source && (
          <span
            title={`From ${source.name}`}
            className="absolute -top-1 -left-1 w-3 h-3 rounded-full border-2 border-[#12121a]"
            style={{ backgroundColor: source.color }}
          />
        )}
      </div>
      <div className="flex-1 min-w-0 flex items-center gap-2">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate flex items-center gap-1.5">
            {track.name}
            {track.isCommon && (
              <span title="Shared favorite" className="text-accent-cyan shrink-0 flex">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11.049 2.927c.3-.921 1.603-.921 1.902 0l1.519 4.674a1 1 0 00.95.69h4.915c.969 0 1.371 1.24.588 1.81l-3.976 2.888a1 1 0 00-.363 1.118l1.518 4.674c.3.922-.755 1.688-1.538 1.118l-3.976-2.888a1 1 0 00-1.176 0l-3.976 2.888c-.783.57-1.838-.197-1.538-1.118l1.518-4.674a1 1 0 00-.363-1.118l-3.976-2.888c-.784-.57-.38-1.81.588-1.81h4.914a1 1 0 00.951-.69l1.519-4.674z" />
                </svg>
              </span>
            )}
          </p>
          <p className="text-xs text-white/50 truncate">{track.artist}</p>
        </div>
      </div>
      <a
        href={`https://open.spotify.com/track/${track.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0"
        aria-label={`Open ${track.name} in Spotify`}
      >
        <div className="w-7 h-7 rounded-full bg-accent-green flex items-center justify-center">
          <svg className="w-3.5 h-3.5 text-black ml-0.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        </div>
      </a>
    </div>
  );
}

export function Playlist({ tracks, initialVisible = 12, sources }: PlaylistProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const capped = initialVisible != null;
  const visibleTracks = capped ? tracks.slice(0, initialVisible) : tracks;
  const hiddenCount = initialVisible != null ? Math.max(0, tracks.length - initialVisible) : 0;
  const hasSources =
    sources != null && tracks.some((t) => t.sourceParticipantIndex != null);

  return (
    <>
      {hasSources && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mb-2 px-1 text-[11px] text-white/50">
          {sources!.map((s) => (
            <span key={s.name} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
              {s.name}
            </span>
          ))}
        </div>
      )}
      <div className="space-y-1">
        {visibleTracks.map((track, i) => (
          <motion.div
            key={track.id}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.03 }}
          >
            <TrackRow track={track} index={i} sources={sources} />
          </motion.div>
        ))}
      </div>

      {capped && hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setModalOpen(true)}
          className="w-full mt-3 py-2 text-xs text-accent-cyan hover:text-accent-cyan/80 border border-white/10 rounded-lg hover:bg-white/5 transition-colors"
        >
          Show more ({hiddenCount} more)
        </button>
      )}

      <AnimatePresence>
        {modalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
            onClick={() => setModalOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.96, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.96, y: 12 }}
              className="w-full max-w-lg max-h-[80vh] flex flex-col rounded-2xl border border-white/10 bg-[#12121a] shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-white/10 shrink-0">
                <h4 className="text-base font-semibold">Full Playlist</h4>
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="w-8 h-8 rounded-full hover:bg-white/10 flex items-center justify-center text-white/60 hover:text-white transition-colors"
                  aria-label="Close playlist"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="overflow-y-auto flex-1 px-2 py-3 space-y-0.5">
                {tracks.map((track, i) => (
                  <TrackRow key={track.id} track={track} index={i} compact sources={sources} />
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
