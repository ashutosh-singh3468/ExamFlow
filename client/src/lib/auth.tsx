import { useQueryClient } from '@tanstack/react-query';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { http } from './api';
import type { User } from './types';

interface AuthState {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const Ctx = createContext<AuthState | null>(null);
export const useAuth = () => useContext(Ctx)!;

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  const refresh = useCallback(async () => {
    try {
      const { user } = await http.get<{ user: User }>('/auth/me');
      setUser(user);
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const onUnauthorized = () => setUser(null);
    window.addEventListener('ef:unauthorized', onUnauthorized);
    return () => window.removeEventListener('ef:unauthorized', onUnauthorized);
  }, [refresh]);

  const login = async (email: string, password: string) => {
    const { user } = await http.post<{ user: User }>('/auth/login', { email, password });
    qc.clear();
    setUser(user);
    return user;
  };

  const logout = async () => {
    try {
      await http.post('/auth/logout');
    } finally {
      qc.clear();
      setUser(null);
    }
  };

  return <Ctx.Provider value={{ user, loading, login, logout, refresh }}>{children}</Ctx.Provider>;
}
