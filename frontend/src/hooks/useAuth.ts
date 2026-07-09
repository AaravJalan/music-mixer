import { useState, useEffect, useCallback } from 'react';
import type { UserProfile } from '@music-mixer/shared';
import { api } from '../api/client';

export function useAuth() {
  const [user, setUser] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const { user: u } = await api.getMe();
      setUser(u);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const logout = async () => {
    await api.logout();
    setUser(null);
  };

  return { user, loading, refresh, logout };
}
