import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import type { UserProfile } from '@music-mixer/shared';
import { api } from '../api/client';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';

interface JoinPageProps {
  user: UserProfile | null;
}

export function JoinPage({ user }: JoinPageProps) {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [joining, setJoining] = useState(false);

  useEffect(() => {
    if (user && id) {
      handleJoinAsUser();
    }
  }, [user, id]);

  async function handleJoinAsUser() {
    if (!id || !user) return;
    setJoining(true);
    try {
      await api.joinCollision(id);
      navigate(`/collision/${id}`);
    } catch {
      navigate(`/collision/${id}`);
    } finally {
      setJoining(false);
    }
  }

  if (joining) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (user) return null;

  return (
    <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-md mx-auto">
      <Card glow="purple" className="text-center">
        <h2 className="text-2xl font-bold mb-2">You've been invited</h2>
        <p className="text-white/60 mb-6">
          Log in with Spotify to collide your music taste with a friend.
        </p>
        <Button variant="spotify" size="lg" onClick={() => api.login(`/join/${id}`)} className="w-full">
          Connect with Spotify
        </Button>
        <Button variant="ghost" size="sm" onClick={() => navigate('/')} className="mt-4">
          Go home
        </Button>
      </Card>
    </motion.div>
  );
}
