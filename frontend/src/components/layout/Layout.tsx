import { ReactNode } from 'react';
import type { UserProfile } from '@music-mixer/shared';
import { Header } from './Header';
import { MobileTopBar, SidePanel } from './SidePanel';

interface LayoutProps {
  children: ReactNode;
  user: UserProfile | null;
  onLogout: () => void;
}

export function Layout({ children, user, onLogout }: LayoutProps) {
  const authenticated = Boolean(user);

  return (
    <div className="min-h-screen bg-mesh">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 -left-32 w-96 h-96 bg-accent-pink/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 -right-32 w-96 h-96 bg-accent-purple/10 rounded-full blur-3xl" />
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-accent-cyan/5 rounded-full blur-3xl" />
      </div>

      {authenticated && user && <SidePanel user={user} onLogout={onLogout} />}
      {authenticated && user && <MobileTopBar user={user} onLogout={onLogout} />}

      <div className={authenticated ? 'md:pl-52' : ''}>
        {!authenticated && <Header user={user} onLogout={onLogout} />}
        <main
          className={[
            'relative px-6 max-w-6xl mx-auto',
            authenticated ? 'pt-20 pb-24 md:pt-8 md:pb-16' : 'pt-24 pb-16',
          ].join(' ')}
        >
          {children}
        </main>
      </div>


    </div>
  );
}
