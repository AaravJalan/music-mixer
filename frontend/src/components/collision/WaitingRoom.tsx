import { motion } from 'framer-motion';
import type { UserProfile, PlaylistLengthMode } from '@music-mixer/shared';
import { Avatar } from '../ui/Avatar';
import { CollisionSettings } from './CollisionSettings';

interface WaitingRoomProps {
  userA: UserProfile;
  userB: UserProfile | null;
  currentUser: UserProfile;
  onRun: () => void;
  running: boolean;
  soloMode?: boolean;
  userAWeight: number;
  userBWeight: number;
  playlistLength: number;
  playlistLengthMode: PlaylistLengthMode;
  playlistDurationMinutes: number;
  userATimeRange: import('@music-mixer/shared').TasteTimeRange;
  userBTimeRange: import('@music-mixer/shared').TasteTimeRange;
  playlistGenerationMode: import('@music-mixer/shared').PlaylistGenerationMode;
  compatibilityScore?: number | null;
  onSettingsChange: (patch: {
    userAWeight?: number;
    userBWeight?: number;
    playlistLength?: number;
    playlistLengthMode?: PlaylistLengthMode;
    playlistDurationMinutes?: number;
    userATimeRange?: import('@music-mixer/shared').TasteTimeRange;
    userBTimeRange?: import('@music-mixer/shared').TasteTimeRange;
    playlistGenerationMode?: import('@music-mixer/shared').PlaylistGenerationMode;
  }) => void;
}

export function WaitingRoom({
  userA,
  userB,
  currentUser,
  onRun,
  running,
  soloMode,
  userAWeight,
  userBWeight,
  playlistLength,
  playlistLengthMode,
  playlistDurationMinutes,
  userATimeRange,
  userBTimeRange,
  playlistGenerationMode,
  compatibilityScore,
  onSettingsChange,
}: WaitingRoomProps) {
  const bothPresent = !!userA && !!userB;
  const isHost = currentUser.id === userA?.id || soloMode;

  return (
    <div className="max-w-2xl mx-auto text-center space-y-8">
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className="flex items-center justify-center gap-8"
      >
        <div className="flex flex-col items-center gap-2">
          <Avatar user={userA} size="xl" ring />
          <span className="text-sm font-medium">{userA.displayName}</span>
          <span className="text-xs text-accent-pink">{soloMode ? 'Long view' : 'User A'}</span>
        </div>

        <div className="relative">
          <motion.div
            animate={{ rotate: 360 }}
            transition={{ duration: 8, repeat: Infinity, ease: 'linear' }}
            className="w-20 h-20 rounded-full border-2 border-dashed border-accent-purple/40 flex items-center justify-center"
          >
            <span className="text-xs font-semibold text-accent-purple uppercase tracking-wider">Mix</span>
          </motion.div>
          {bothPresent && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 w-6 h-6 bg-accent-green rounded-full flex items-center justify-center text-[10px] font-bold"
            >
              OK
            </motion.div>
          )}
        </div>

        <div className="flex flex-col items-center gap-2">
          {userB ? (
            <>
              <Avatar user={userB} size="xl" ring />
              <span className="text-sm font-medium">{userB.displayName}</span>
              <span className="text-xs text-accent-purple">{soloMode ? 'Recent view' : 'User B'}</span>
            </>
          ) : (
            <>
              <div className="w-24 h-24 rounded-full border-2 border-dashed border-white/20 flex items-center justify-center">
                <span className="text-white/30 text-3xl">?</span>
              </div>
              <span className="text-sm text-white/40">Waiting...</span>
            </>
          )}
        </div>
      </motion.div>

      {bothPresent && (
        <CollisionSettings
          userAName={soloMode ? 'Long view' : userA.displayName}
          userBName={soloMode ? 'Recent view' : (userB?.displayName ?? 'B')}
          userAWeight={userAWeight}
          userBWeight={userBWeight}
          playlistLength={playlistLength}
          playlistLengthMode={playlistLengthMode}
          playlistDurationMinutes={playlistDurationMinutes}
          userATimeRange={userATimeRange}
          userBTimeRange={userBTimeRange}
          playlistGenerationMode={playlistGenerationMode}
          compatibilityScore={compatibilityScore}
          onChange={onSettingsChange}
          disabled={running}
        />
      )}

      {bothPresent && isHost && (
        <motion.button
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          type="button"
          onClick={onRun}
          disabled={running}
          className="px-8 py-4 rounded-full bg-gradient-to-r from-accent-pink via-accent-purple to-accent-cyan text-white font-semibold text-lg hover:opacity-90 transition-opacity disabled:opacity-50 shadow-lg shadow-accent-purple/30"
        >
          {running ? 'Colliding tastes...' : 'Collide tastes'}
        </motion.button>
      )}

      {bothPresent && !isHost && (
        <p className="text-white/50">Waiting for {userA.displayName} to start the collision...</p>
      )}
    </div>
  );
}
