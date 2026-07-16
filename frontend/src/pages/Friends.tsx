import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import type { Friend, UserProfile } from '@music-mixer/shared';
import { api } from '../api/client';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Avatar } from '../components/ui/Avatar';

interface FriendsPageProps {
  user: UserProfile;
}

export function FriendsPage({ user }: FriendsPageProps) {
  const navigate = useNavigate();
  const [friends, setFriends] = useState<Friend[]>([]);
  const [pending, setPending] = useState<import('@music-mixer/shared').CollisionSession[]>([]);
  const [inviteUrl, setInviteUrl] = useState('');
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    api.getFriends()
      .then((fr) => {
        setFriends(fr.friends);
        setPending(fr.pendingCollisions ?? []);
      })
      .finally(() => setLoading(false));
  }, []);

  async function handleCollide(friendId: string) {
    if (creating) return;
    setCreating(true);
    try {
      const { collision } = await api.createCollision({ mode: 'friend', friendId });
      navigate(`/collision/${collision.id}`);
    } catch (err) {
      console.error(err);
      setCreating(false);
    }
  }

  async function handleRemoveFriend(friendId: string) {
    if (!confirm('Are you sure you want to remove this friend?')) return;
    try {
      await api.removeFriend(friendId);
      setFriends(friends.filter((f) => f.user.id !== friendId));
    } catch (err) {
      console.error(err);
    }
  }

  async function handleCopy() {
    let url = inviteUrl;
    if (!url) {
      const { code } = await api.createFriendInvite();
      url = `${window.location.origin}/friends/add/${code}`;
    }
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
              <div key={f.user.id} className="group flex items-center justify-between p-2 rounded-lg hover:bg-white/5 transition-colors">
                <button 
                  type="button" 
                  onClick={() => handleCollide(f.user.id)}
                  disabled={creating}
                  className="flex items-center gap-3 flex-1 text-left"
                >
                  <Avatar user={f.user} size="sm" />
                  <span className="text-sm font-medium">{f.user.displayName}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleRemoveFriend(f.user.id)}
                  title="Remove friend"
                  className="opacity-0 group-hover:opacity-100 p-2 text-white/40 hover:text-red-400 hover:bg-white/10 rounded-md transition-all"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                </button>
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
