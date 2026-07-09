import { useEffect } from 'react';
import { Card } from '../ui/Card';
import type { PlaylistGenerationMode, PlaylistLengthMode, TasteTimeRange } from '@music-mixer/shared';
import { PLAYLIST_GENERATION_MODE_LABELS, PLAYLIST_MATCH_THRESHOLD } from '@music-mixer/shared';
import { TASTE_TIME_RANGE_OPTIONS } from '../../constants/tasteTimeRanges';
import { PlaylistLengthControl } from './PlaylistLengthControl';

interface CollisionSettingsProps {
  userAName: string;
  userBName: string;
  userAWeight: number;
  userBWeight: number;
  playlistLength: number;
  playlistLengthMode: PlaylistLengthMode;
  playlistDurationMinutes: number;
  userATimeRange: TasteTimeRange;
  userBTimeRange: TasteTimeRange;
  playlistGenerationMode: PlaylistGenerationMode;
  /** When set and below threshold, Midpoint is disabled. */
  compatibilityScore?: number | null;
  onChange: (patch: {
    userAWeight?: number;
    userBWeight?: number;
    playlistLength?: number;
    playlistLengthMode?: PlaylistLengthMode;
    playlistDurationMinutes?: number;
    userATimeRange?: TasteTimeRange;
    userBTimeRange?: TasteTimeRange;
    playlistGenerationMode?: PlaylistGenerationMode;
  }) => void;
  disabled?: boolean;
}

function TimeRangeRow({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: TasteTimeRange;
  onChange: (term: TasteTimeRange) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <span className="text-[11px] text-white/45 min-w-0 truncate" title={label}>{label}</span>
      <div className="flex gap-0.5 flex-wrap justify-end">
        {TASTE_TIME_RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            className={[
              'px-1.5 py-0.5 rounded text-[9px] font-medium border transition-colors',
              value === opt.value
                ? 'bg-accent-purple/30 border-accent-purple/50 text-white'
                : 'bg-white/5 border-white/10 text-white/40 hover:text-white/65',
            ].join(' ')}
            title={opt.label}
          >
            {opt.short}
          </button>
        ))}
      </div>
    </div>
  );
}

export function CollisionSettings({
  userAName,
  userBName,
  userAWeight,
  userBWeight,
  playlistLength,
  playlistLengthMode,
  playlistDurationMinutes,
  userATimeRange,
  userBTimeRange,
  playlistGenerationMode,
  compatibilityScore,
  onChange,
  disabled,
}: CollisionSettingsProps) {
  const midpointDisabled = compatibilityScore != null && compatibilityScore < PLAYLIST_MATCH_THRESHOLD;
  const effectiveMode =
    midpointDisabled && playlistGenerationMode === 'midpoint'
      ? 'equal_share'
      : playlistGenerationMode;

  useEffect(() => {
    if (midpointDisabled && playlistGenerationMode === 'midpoint') {
      onChange({ playlistGenerationMode: 'equal_share' });
    }
  }, [midpointDisabled, playlistGenerationMode, onChange]);

  function handleWeightA(value: number) {
    const a = Math.min(99, Math.max(1, value));
    onChange({ userAWeight: a, userBWeight: 100 - a });
  }

  return (
    <Card className="max-w-lg mx-auto text-left">
      <h3 className="text-lg font-semibold mb-4">Collision Settings</h3>

      <div className="space-y-3 mb-5 pb-5 border-b border-white/10">
        <TimeRangeRow
          label={userAName}
          value={userATimeRange}
          onChange={(userATimeRange) => onChange({ userATimeRange })}
          disabled={disabled}
        />
        <TimeRangeRow
          label={userBName}
          value={userBTimeRange}
          onChange={(userBTimeRange) => onChange({ userBTimeRange })}
          disabled={disabled}
        />
      </div>

      <div className="mb-6">
        <div className="flex justify-between text-sm mb-2">
          <span className="text-accent-pink">{userAName}</span>
          <span className="text-accent-purple">{userBName}</span>
        </div>
        <input
          type="range"
          min={1}
          max={99}
          value={userAWeight}
          disabled={disabled}
          onChange={(e) => handleWeightA(Number(e.target.value))}
          className="w-full accent-accent-purple"
        />
        <div className="flex justify-between text-xs text-white/50 mt-1">
          <span>{userAWeight}%</span>
          <span>Blend ratio</span>
          <span>{userBWeight}%</span>
        </div>
      </div>

      <div className="mb-6">
        <span className="text-sm text-white/60 block mb-2">Playlist Generation Mode</span>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <button
            type="button"
            disabled={disabled || midpointDisabled}
            onClick={() => onChange({ playlistGenerationMode: 'midpoint' })}
            className={[
              'px-3 py-2.5 rounded-lg border text-left transition-colors',
              effectiveMode === 'midpoint'
                ? 'bg-accent-purple/25 border-accent-purple/50 text-white'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70',
              midpointDisabled ? 'opacity-40 cursor-not-allowed' : '',
            ].join(' ')}
          >
            <span className="text-xs font-semibold block">{PLAYLIST_GENERATION_MODE_LABELS.midpoint}</span>
            <span className="text-[10px] text-white/45 mt-0.5 block">Bridge tracks between both tastes</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ playlistGenerationMode: 'equal_share' })}
            className={[
              'px-3 py-2.5 rounded-lg border text-left transition-colors',
              effectiveMode === 'equal_share'
                ? 'bg-accent-cyan/20 border-accent-cyan/45 text-white'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70',
            ].join(' ')}
          >
            <span className="text-xs font-semibold block">{PLAYLIST_GENERATION_MODE_LABELS.equal_share}</span>
            <span className="text-[10px] text-white/45 mt-0.5 block">Proportional chunks from each user</span>
          </button>
          <button
            type="button"
            disabled={disabled}
            onClick={() => onChange({ playlistGenerationMode: 'common_only' })}
            className={[
              'px-3 py-2.5 rounded-lg border text-left transition-colors',
              effectiveMode === 'common_only'
                ? 'bg-amber-500/15 border-amber-400/40 text-white'
                : 'bg-white/5 border-white/10 text-white/50 hover:text-white/70',
            ].join(' ')}
          >
            <span className="text-xs font-semibold block">{PLAYLIST_GENERATION_MODE_LABELS.common_only}</span>
            <span className="text-[10px] text-white/45 mt-0.5 block">Only songs you both already share</span>
          </button>
        </div>
        {midpointDisabled && (
          <p className="text-[10px] text-amber-300/80 mt-2 leading-snug">
            Midpoint blend disabled for matches under 80% to ensure playlist quality.
          </p>
        )}
      </div>

      <PlaylistLengthControl
        mode={playlistLengthMode}
        trackCount={playlistLength}
        durationMinutes={playlistDurationMinutes}
        disabled={disabled}
        onChange={onChange}
      />
    </Card>
  );
}
