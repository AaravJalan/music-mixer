import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate, useSearchParams } from 'react-router-dom';
import type { CollisionResult, Friend, MetricsSnapshot, SandboxCollisionRequest, UserProfile } from '@music-mixer/shared';
import { api } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Avatar } from '../components/ui/Avatar';
import { AuthErrorBanner } from '../components/auth/AuthErrorBanner';
import { SandboxPanel } from '../components/collision/SandboxPanel';
import { Results } from '../components/collision/Results';
import { ShareLink } from '../components/collision/ShareLink';

interface HomeProps {
  user: UserProfile | null;
}

export function Home({ user }: HomeProps) {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const authError = searchParams.get('auth_error');
  const [creating, setCreating] = useState(false);
  const [friends, setFriends] = useState<Friend[]>([]);
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [linkCollision, setLinkCollision] = useState<{ id: string; shareUrl: string } | null>(null);
  const [sandboxResult, setSandboxResult] = useState<{
    result: CollisionResult;
    metrics?: MetricsSnapshot;
  } | null>(null);
  const [sandboxParams, setSandboxParams] = useState<SandboxCollisionRequest | null>(null);
  const [showInfo, setShowInfo] = useState(false);

  useEffect(() => {
    if (authError) {
      const timer = setTimeout(() => {
        searchParams.delete('auth_error');
        setSearchParams(searchParams, { replace: true });
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [authError, searchParams, setSearchParams]);

  useEffect(() => {
    if (user) api.getFriends().then((r) => setFriends(r.friends)).catch(() => {});
  }, [user]);

  async function startFriendCollision(friendId: string) {
    if (!user) return;
    setCreating(true);
    try {
      const { collision } = await api.createCollision({ mode: 'friend', friendId });
      navigate(`/collision/${collision.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function startSoloCollision() {
    if (!user) return;
    setCreating(true);
    try {
      const { collision } = await api.createSoloCollision();
      navigate(`/collision/${collision.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function createLinkCollision() {
    if (!user) return;
    setCreating(true);
    try {
      const { collision } = await api.createCollision({ mode: 'link' });
      setLinkCollision({ id: collision.id, shareUrl: collision.shareUrl });
    } finally {
      setCreating(false);
    }
  }

  async function copyInviteLink() {
    const url = inviteUrl || (await api.createFriendInvite()).inviteUrl;
    await navigator.clipboard.writeText(url);
    setInviteUrl(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (sandboxResult) {
    return (
      <Results
        result={sandboxResult.result}
        metrics={sandboxResult.metrics}
        onReset={() => {
          setSandboxResult(null);
          setSandboxParams(null);
        }}
        onRegenerate={async () => {
          if (!sandboxParams) throw new Error('Sandbox parameters unavailable');
          const nextOffset = Math.floor(Math.random() * 21);
          const { result, metrics } = await api.runSandboxCollision({
            ...sandboxParams,
            randomOffset: nextOffset,
          });
          setSandboxResult({ result, metrics });
          return result;
        }}
      />
    );
  }

  if (!user) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[70vh]">
        <motion.div initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-2xl w-full">
          <h1 className="text-5xl sm:text-6xl font-bold mb-4">
            <span className="text-gradient">MusicMixer</span>
          </h1>
          <p className="text-xl text-white/60 mb-2">Spotify Taste Collision Engine</p>
          <p className="text-white/40 mb-8 max-w-md mx-auto">
            Blend Spotify taste profiles, explore your listening habits, and unlock your personal music dashboard.
          </p>
          {authError && <AuthErrorBanner errorCode={authError} />}
          <Button variant="spotify" size="lg" onClick={() => api.login('/')}>
            Connect with Spotify
          </Button>
        </motion.div>
      </div>
    );
  }

  if (linkCollision) {
    return (
      <div className="max-w-lg mx-auto">
        <ShareLink shareUrl={linkCollision.shareUrl} user={user} />
        <div className="text-center mt-6">
          <button
            type="button"
            onClick={() => navigate(`/collision/${linkCollision.id}`)}
            className="text-sm text-accent-purple hover:underline"
          >
            Go to collision room
          </button>
        </div>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl mx-auto">
      <div className="relative">
        <button
          type="button"
          onClick={() => setShowInfo((v) => !v)}
          className="absolute top-0 right-0 w-7 h-7 rounded-full bg-white/10 border border-white/15 text-xs text-white/70 hover:bg-white/15 transition-colors"
          aria-label="How taste collision works"
          title="How does taste collision work?"
        >
          i
        </button>
        {showInfo && (
          <div className="absolute top-9 right-0 z-20 w-72 p-3 rounded-xl bg-[#1a1028] border border-white/15 shadow-xl text-left">
            <p className="text-xs font-semibold text-white/80 mb-2">How Taste Collision Works</p>
            <ul className="space-y-2 text-[10px] text-white/60 leading-snug">
              <li>Blends Spotify listening profiles in six audio dimensions (danceability, energy, and more).</li>
              <li>Weighted sliders control how much each person shapes the shared playlist.</li>
              <li>Midpoint Blend finds common ground; Proportional Share splits slots below 80%; Common Songs Only uses your shared tracks.</li>
              <li>Playlists use artist + genre discovery so obscure personal tracks don&apos;t dominate the mix.</li>
            </ul>
          </div>
        )}
        <h1 className="text-3xl font-bold text-gradient pr-10">Taste Collision</h1>
        <p className="text-white/50 mt-1">Blend your taste with friends or invite anyone</p>
      </div>

      <Card>
        <h2 className="text-lg font-semibold mb-2">Collide with a friend</h2>
        <p className="text-xs text-white/40 mb-4">Pick someone from your friends list, including default test profiles.</p>
        <div className="space-y-1">
          {friends.map((f) => (
            <button
              key={f.user.id}
              type="button"
              onClick={() => startFriendCollision(f.user.id)}
              disabled={creating}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors text-left"
            >
              <Avatar user={f.user} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{f.user.displayName}</p>
                {f.isGhost && <p className="text-[11px] text-white/40">Default profile</p>}
              </div>
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-2">Invite anyone with a link</h2>
        <p className="text-xs text-white/40 mb-4">
          Create a collision link and share it. Anyone with Spotify can join.
        </p>
        <Button variant="primary" size="sm" onClick={createLinkCollision} loading={creating}>
          Create collision link
        </Button>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-2">Add a friend</h2>
        <p className="text-xs text-white/40 mb-4">
          Send a friend invite link so they appear in your friends list.
        </p>
        <Button variant="secondary" size="sm" onClick={copyInviteLink}>
          {copied ? 'Link copied' : 'Copy friend invite link'}
        </Button>
      </Card>

      <SandboxPanel
        user={user}
        onResult={(result, metrics, params) => {
          setSandboxParams(params);
          setSandboxResult({ result, metrics });
        }}
      />

      <Card>
        <h2 className="text-lg font-semibold mb-2">Solo test</h2>
        <p className="text-xs text-white/40 mb-4">
          Compare your recent listening against your longer-term taste.
        </p>
        <Button variant="ghost" size="sm" onClick={startSoloCollision} loading={creating}>
          Run solo collision
        </Button>
      </Card>
    </motion.div>
  );
}
