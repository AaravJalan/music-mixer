import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { CollisionSession, UserProfile } from '@music-mixer/shared';
import { api } from '../api/client';
import { useCollision } from '../hooks/useCollision';
import { ShareLink } from '../components/collision/ShareLink';
import { WaitingRoom } from '../components/collision/WaitingRoom';
import { Results } from '../components/collision/Results';
import { CollisionSettings } from '../components/collision/CollisionSettings';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';

interface CollisionPageProps {
  user: UserProfile | null;
}

export function CollisionPage({ user }: CollisionPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const {
    collision, result, metrics, loading, running, error,
    settings, run, join, updateSettings,
  } = useCollision(id);

  const soloMode = collision?.config.mode === 'solo';

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error || !collision) {
    return (
      <Card className="max-w-md mx-auto text-center">
        <p className="text-white/60 mb-4">{error ?? 'Collision not found'}</p>
        <Button onClick={() => navigate('/')}>Go Home</Button>
      </Card>
    );
  }

  if (result || collision.status === 'complete') {
    if (!result) return <div className="text-center text-white/50">Loading results...</div>;
    return <Results result={result} metrics={metrics ?? undefined} onReset={() => navigate('/')} />;
  }

  if (!user) {
    return <LoginPrompt collisionId={id!} />;
  }

  const isUserA = collision.userA?.id === user.id;
  const isUserB = collision.userB?.id === user.id;
  const needsJoin = !soloMode && !isUserA && !isUserB && collision.status === 'waiting';

  if (needsJoin) {
    return <JoinPrompt collision={collision} onJoin={join} />;
  }

  if (isUserA && collision.status === 'waiting' && !soloMode) {
    return (
      <div className="space-y-6 max-w-lg mx-auto">
        <ShareLink shareUrl={collision.shareUrl} user={user} />
        <CollisionSettings
          userAName={user.displayName}
          userBName="Your Friend"
          userAWeight={settings.userAWeight}
          userBWeight={settings.userBWeight}
          playlistLength={settings.playlistLength}
          playlistLengthMode={settings.playlistLengthMode}
          playlistDurationMinutes={settings.playlistDurationMinutes}
          userATimeRange={settings.userATimeRange}
          userBTimeRange={settings.userBTimeRange}
          playlistGenerationMode={settings.playlistGenerationMode}
          onChange={updateSettings}
        />
      </div>
    );
  }

  if (collision.userA && (collision.userB || collision.status === 'ready')) {
    return (
      <WaitingRoom
        userA={collision.userA}
        userB={collision.userB}
        currentUser={user}
        onRun={run}
        running={running}
        soloMode={soloMode}
        userAWeight={settings.userAWeight}
        userBWeight={settings.userBWeight}
        playlistLength={settings.playlistLength}
        playlistLengthMode={settings.playlistLengthMode}
        playlistDurationMinutes={settings.playlistDurationMinutes}
        userATimeRange={settings.userATimeRange}
        userBTimeRange={settings.userBTimeRange}
        playlistGenerationMode={settings.playlistGenerationMode}
        compatibilityScore={null}
        onSettingsChange={updateSettings}
      />
    );
  }

  return null;
}

function LoginPrompt({ collisionId }: { collisionId: string }) {
  return (
    <Card glow="purple" className="max-w-md mx-auto text-center">
      <h2 className="text-xl font-bold mb-2">Join this collision</h2>
      <p className="text-white/60 mb-6">Log in with Spotify to collide your taste with a friend.</p>
      <Button variant="spotify" size="lg" onClick={() => api.login(`/collision/${collisionId}`)} className="w-full">
        Connect with Spotify
      </Button>
    </Card>
  );
}

function JoinPrompt({ collision, onJoin }: { collision: CollisionSession; onJoin: () => void }) {
  const [joining, setJoining] = useState(false);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="max-w-md mx-auto text-center">
      <Card glow="pink">
        {collision.userA && (
          <div className="flex justify-center mb-4">
            <Avatar user={collision.userA} size="lg" ring />
          </div>
        )}
        <h2 className="text-xl font-bold mb-2">{collision.userA?.displayName} invited you!</h2>
        <p className="text-white/60 mb-6">Join this taste collision and discover your musical compatibility.</p>
        <Button variant="primary" size="lg" onClick={async () => { setJoining(true); await onJoin(); setJoining(false); }} loading={joining} className="w-full">
          Join Collision
        </Button>
      </Card>
    </motion.div>
  );
}
