import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import type { Friend, UserProfile } from '@music-mixer/shared';
import { api } from '../api/client';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';

interface FriendsPageProps {
  user: UserProfile;
}

export function FriendsPage({ user }: FriendsPageProps) {
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<import('@music-mixer/shared').CollisionSession[]>([]);
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getFriends()
      .then((fr) => {
        setFriends(fr.friends);
        setPending(fr.pendingCollisions ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleCopy() {
    const url = inviteUrl || (await api.createFriendInvite()).inviteUrl;
    await navigator.clipboard.writeText(url);
    setInviteUrl(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const realFriends = friends.filter((f) => !f.isGhost);
  const defaultProfiles = friends.filter((f) => f.isGhost);

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-3xl font-bold text-gradient">Friends</h1>
        <p className="text-white/50 mt-1">Friends for {user.displayName}</p>
      </div>

      <Card>
        <h2 className="text-lg font-semibold mb-2">Invite a friend</h2>
        <p className="text-sm text-white/50 mb-4">
          Share a link so someone can add you as a friend on MusicMixer.
        </p>
        <Button variant="secondary" size="sm" onClick={handleCopy}>
          {copied ? 'Link copied' : 'Copy invite link'}
        </Button>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-4">Default profiles</h2>
        <p className="text-xs text-white/40 mb-4">Built-in taste profiles for testing collisions.</p>
        <div className="space-y-2">
          {defaultProfiles.map((f) => (
            <div key={f.user.id} className="flex items-center gap-3 p-2 rounded-lg bg-white/5">
              <Avatar user={f.user} size="sm" />
              <div>
                <p className="text-sm font-medium">{f.user.displayName}</p>
                <p className="text-[11px] text-white/40">Test profile</p>
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold mb-4">Your friends</h2>
        {realFriends.length === 0 ? (
          <p className="text-white/40 text-sm">No friends added yet. Share your invite link.</p>
        ) : (
          <div className="space-y-2">
            {realFriends.map((f) => (
              <div key={f.user.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-white/5">
                <Avatar user={f.user} size="sm" />
                <span className="text-sm">{f.user.displayName}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {pending.length > 0 && (
        <Card glow="pink">
          <h2 className="text-lg font-semibold mb-4">Pending invitations</h2>
          <div className="space-y-2">
            {pending.map((c) => (
              <a
                key={c.id}
                href={`/join/${c.id}`}
                className="flex items-center gap-3 p-3 rounded-xl hover:bg-white/5 transition-colors"
              >
                <Avatar user={c.userA!} size="sm" />
                <span className="text-sm">{c.userA?.displayName} invited you to a collision</span>
              </a>
            ))}
          </div>
        </Card>
      )}
    </motion.div>
  );
}
