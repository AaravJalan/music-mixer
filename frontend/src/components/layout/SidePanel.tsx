import { Link, useLocation } from 'react-router-dom';
import type { UserProfile } from '@music-mixer/shared';
import { Avatar } from '../ui/Avatar';
import { Button } from '../ui/Button';

interface SidePanelProps {
  user: UserProfile;
  onLogout: () => void;
}

const NAV_ITEMS = [
  { id: 'dashboard', to: '/dashboard', label: 'Dashboard', isActive: (path: string) => path.startsWith('/dashboard') },
  { id: 'habits', to: '/habits', label: 'Listening Habits', isActive: (path: string) => path.startsWith('/habits') },
  {
    id: 'collision',
    to: '/',
    label: 'Taste Collision',
    isActive: (path: string) =>
      path === '/' || path.startsWith('/collision/') || path.startsWith('/join'),
  },
  { id: 'friends', to: '/friends', label: 'Friends', isActive: (path: string) => path.startsWith('/friends') },
  {
    id: 'history',
    to: '/collisions',
    label: 'Past Collisions',
    isActive: (path: string) => path.startsWith('/collisions'),
  },
] as const;

function navClass(active: boolean): string {
  return [
    'block px-3 py-2.5 rounded-lg text-sm font-medium transition-colors',
    active
      ? 'bg-accent-purple/20 text-white border border-accent-purple/30'
      : 'text-white/55 hover:bg-white/5 hover:text-white border border-transparent',
  ].join(' ');
}

export function SidePanel({ user, onLogout }: SidePanelProps) {
  const { pathname } = useLocation();

  return (
    <aside className="hidden md:flex flex-col w-52 shrink-0 fixed left-0 top-0 bottom-0 z-40 glass border-r border-white/10">
      <div className="p-5 border-b border-white/5">
        <p className="font-semibold text-sm">MusicMixer</p>
        <p className="text-[10px] text-white/35 uppercase tracking-wider mt-0.5">Spotify</p>
      </div>

      <nav className="flex-1 p-3 space-y-1">
        {NAV_ITEMS.map((item) => (
          <Link key={item.id} to={item.to} className={navClass(item.isActive(pathname))}>
            {item.label}
          </Link>
        ))}
      </nav>

      <div className="p-4 border-t border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 px-1">
          <Avatar user={user} size="sm" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium truncate">{user.displayName}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" onClick={onLogout} className="w-full justify-center">
          Log out
        </Button>
      </div>
    </aside>
  );
}

export function MobileNav() {
  const { pathname } = useLocation();

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 glass border-t border-white/10 pb-safe">
      <div className="flex overflow-x-auto no-scrollbar">
        {NAV_ITEMS.map((item) => {
          const active = item.isActive(pathname);
          return (
            <Link
              key={item.id}
              to={item.to}
              className={[
                'flex-shrink-0 px-5 py-3 text-[11px] text-center font-medium transition-colors whitespace-nowrap',
                active ? 'text-accent-purple' : 'text-white/45',
              ].join(' ')}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

interface MobileTopBarProps {
  user: UserProfile;
  onLogout: () => void;
}

export function MobileTopBar({ user, onLogout }: MobileTopBarProps) {
  return (
    <header className="md:hidden fixed top-0 left-0 right-0 z-40 glass border-b border-white/5 px-4 py-3 flex items-center justify-between">
      <span className="font-semibold text-sm">MusicMixer</span>
      <div className="flex items-center gap-3">
        <Avatar user={user} size="sm" />
        <Button variant="ghost" size="sm" onClick={onLogout} className="!px-2 !py-1 text-[10px] h-auto">
          Log out
        </Button>
      </div>
    </header>
  );
}
