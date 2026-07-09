import type { UserProfile } from '@music-mixer/shared';
import { Avatar } from '../ui/Avatar';
import { redistributeParticipantWeight } from '../../utils/participantWeights';

interface WeightParticipant {
  id: string;
  label: string;
  user?: UserProfile;
  avatarUrl?: string;
}

interface ParticipantWeightSlidersProps {
  participants: WeightParticipant[];
  weights: number[];
  onChange: (weights: number[]) => void;
  disabled?: boolean;
}

export function ParticipantWeightSliders({
  participants,
  weights,
  onChange,
  disabled,
}: ParticipantWeightSlidersProps) {
  if (participants.length < 2) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-sm text-white/60">Blend contribution</span>
        <span className="text-[10px] text-white/35">Must sum to 100%</span>
      </div>
      {participants.map((p, index) => (
        <div key={p.id} className="space-y-1">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              {p.user ? (
                <Avatar user={p.user} size="sm" />
              ) : p.avatarUrl ? (
                <img src={p.avatarUrl} alt="" className="w-8 h-8 rounded-lg object-cover" />
              ) : (
                <div className="w-8 h-8 rounded-lg bg-white/10" />
              )}
              <span className="text-xs text-white/75 truncate">{p.label}</span>
            </div>
            <span className="text-xs text-accent-cyan shrink-0">{weights[index] ?? 0}%</span>
          </div>
          <input
            type="range"
            min={1}
            max={99}
            value={weights[index] ?? 1}
            disabled={disabled}
            onChange={(e) =>
              onChange(redistributeParticipantWeight(weights, index, Number(e.target.value)))
            }
            className="w-full accent-accent-purple"
          />
        </div>
      ))}
    </div>
  );
}
