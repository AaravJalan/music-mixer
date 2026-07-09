import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';

export function FriendAddPage() {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'login'>('loading');
  const [friendName, setFriendName] = useState('');

  useEffect(() => {
    api.getMe().then(({ authenticated }) => {
      if (!authenticated) {
        setStatus('login');
        return;
      }
      if (!code) {
        setStatus('error');
        return;
      }
      api.acceptFriendInvite(code)
        .then(({ friend }) => {
          setFriendName(friend.displayName);
          setStatus('success');
        })
        .catch(() => setStatus('error'));
    });
  }, [code]);

  if (status === 'login') {
    return (
      <Card className="max-w-md mx-auto text-center">
        <h2 className="text-xl font-bold mb-2">Friend Invite</h2>
        <p className="text-white/60 mb-4">Log in to accept this friend invite.</p>
        <Button variant="spotify" onClick={() => api.login(`/friends/add/${code}`)}>
          Connect with Spotify
        </Button>
      </Card>
    );
  }

  if (status === 'loading') {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <Card className="max-w-md mx-auto text-center" glow={status === 'success' ? 'purple' : undefined}>
      {status === 'success' ? (
        <>
          <div className="text-4xl mb-4">🤝</div>
          <h2 className="text-xl font-bold mb-2">You're now friends with {friendName}!</h2>
          <Button onClick={() => navigate('/dashboard')} className="mt-4">
            Go to Dashboard
          </Button>
        </>
      ) : (
        <>
          <h2 className="text-xl font-bold mb-2">Invite expired or invalid</h2>
          <Button variant="ghost" onClick={() => navigate('/')}>Go home</Button>
        </>
      )}
    </Card>
  );
}
