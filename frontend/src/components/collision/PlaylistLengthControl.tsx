import { useEffect, useState } from 'react';
import type { PlaylistLengthMode } from '@music-mixer/shared';

interface PlaylistLengthControlProps {
  mode: PlaylistLengthMode;
  trackCount: number;
  durationMinutes: number;
  disabled?: boolean;
  onChange: (patch: {
    playlistLengthMode?: PlaylistLengthMode;
    playlistLength?: number;
    playlistDurationMinutes?: number;
  }) => void;
}

function parsePositiveInt(value: string): number | null {
  const n = Number.parseInt(value, 10);
  if (Number.isNaN(n) || n < 1) return null;
  return n;
}

export function PlaylistLengthControl({
  mode,
  trackCount,
  durationMinutes,
  disabled,
  onChange,
}: PlaylistLengthControlProps) {
  const [trackDraft, setTrackDraft] = useState(String(trackCount));
  const [durationDraft, setDurationDraft] = useState(String(durationMinutes));

  useEffect(() => {
    setTrackDraft(String(trackCount));
  }, [trackCount]);

  useEffect(() => {
    setDurationDraft(String(durationMinutes));
  }, [durationMinutes]);

  return (
    <div className="space-y-3">
      <span className="text-sm text-white/60 block">Playlist size</span>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ playlistLengthMode: 'tracks' })}
          className={[
            'px-3 py-2 rounded-lg border text-xs font-medium transition-colors',
            mode === 'tracks'
              ? 'bg-accent-cyan/20 border-accent-cyan/45 text-white'
              : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70',
          ].join(' ')}
        >
          Track count
        </button>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ playlistLengthMode: 'duration' })}
          className={[
            'px-3 py-2 rounded-lg border text-xs font-medium transition-colors',
            mode === 'duration'
              ? 'bg-accent-cyan/20 border-accent-cyan/45 text-white'
              : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70',
          ].join(' ')}
        >
          Total length
        </button>
      </div>

      {mode === 'tracks' ? (
        <label className="block">
          <span className="text-xs text-white/45 block mb-2">Number of tracks</span>
          <input
            type="number"
            min={1}
            value={trackDraft}
            disabled={disabled}
            onChange={(e) => setTrackDraft(e.target.value)}
            onBlur={() => {
              const n = parsePositiveInt(trackDraft);
              if (n !== null) onChange({ playlistLength: n });
              else setTrackDraft(String(trackCount));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm outline-none focus:border-accent-cyan/50"
          />
        </label>
      ) : (
        <label className="block">
          <span className="text-xs text-white/45 block mb-2">Target length (minutes)</span>
          <input
            type="number"
            min={1}
            value={durationDraft}
            disabled={disabled}
            onChange={(e) => setDurationDraft(e.target.value)}
            onBlur={() => {
              const n = parsePositiveInt(durationDraft);
              if (n !== null) onChange({ playlistDurationMinutes: n });
              else setDurationDraft(String(durationMinutes));
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            }}
            className="w-full px-3 py-2 rounded-lg bg-black/30 border border-white/10 text-sm outline-none focus:border-accent-cyan/50"
          />
          <p className="text-[10px] text-white/35 mt-2 leading-snug">
            Stops adding tracks the first time total runtime crosses this limit.
          </p>
        </label>
      )}
    </div>
  );
}
