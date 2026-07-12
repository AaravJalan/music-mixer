import { Link } from 'react-router-dom';
import type { UserProfile } from '@music-mixer/shared';
import { Button } from '../ui/Button';
import { Avatar } from '../ui/Avatar';

interface HeaderProps {
  user: UserProfile | null;
  onLogout: () => void;
}

export function Header({ user, onLogout }: HeaderProps) {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 glass border-b border-white/5">
      <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
        <Link to="/" className="flex items-center gap-2">
          <span className="font-semibold text-lg">MusicMixer</span>
        </Link>

        {user ? (
          <div className="flex items-center gap-3">
            <Link to="/dashboard" className="text-sm text-white/50 hover:text-white hidden sm:inline">
              Dashboard
            </Link>
            <Avatar user={user} size="sm" />
            <span className="text-sm text-white/70 hidden sm:inline">{user.displayName}</span>
            <Button variant="ghost" size="sm" onClick={onLogout}>
              Log out
            </Button>
          </div>
        ) : (
          <span className="text-xs text-white/30">Taste Collision Engine</span>
        )}
      </div>
    </header>
  );
}
