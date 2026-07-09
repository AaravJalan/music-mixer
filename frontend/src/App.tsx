import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Layout } from './components/layout/Layout';
import { Home } from './pages/Home';
import { CollisionPage } from './pages/Collision';
import { JoinPage } from './pages/Join';
import { Dashboard } from './pages/Dashboard';
import { ListeningHabitsPage } from './pages/ListeningHabits';
import { FriendsPage } from './pages/Friends';
import { PastCollisionsPage } from './pages/PastCollisions';
import { CollisionReplayPage } from './pages/CollisionReplay';
import { FriendAddPage } from './pages/FriendAdd';
import { useAuth } from './hooks/useAuth';

export function App() {
  const { user, loading, logout } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-mesh flex items-center justify-center">
        <div className="w-10 h-10 border-2 border-accent-purple border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <BrowserRouter>
      <Layout user={user} onLogout={logout}>
        <Routes>
          <Route path="/" element={<Home user={user} />} />
          <Route path="/dashboard" element={user ? <Dashboard user={user} /> : <Home user={user} />} />
          <Route path="/habits" element={user ? <ListeningHabitsPage user={user} /> : <Home user={user} />} />
          <Route path="/friends" element={user ? <FriendsPage user={user} /> : <Home user={user} />} />
          <Route path="/collisions/:id" element={user ? <CollisionReplayPage /> : <Home user={user} />} />
          <Route path="/collisions" element={user ? <PastCollisionsPage /> : <Home user={user} />} />
          <Route path="/collision/:id" element={<CollisionPage user={user} />} />
          <Route path="/join/:id" element={<JoinPage user={user} />} />
          <Route path="/friends/add/:code" element={<FriendAddPage />} />
        </Routes>
      </Layout>
    </BrowserRouter>
  );
}
