import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, tokens } from './api';
import { closeSocket, reauthSocket } from './socket';
import type { AuthResponse, Role, User } from './types';

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  signup: (input: SignupInput) => Promise<{ pendingApproval?: boolean; message?: string }>;
  logout: () => Promise<void>;
  /** Merges a saved profile back into the session without a refetch. */
  updateUser: (patch: Partial<User>) => void;
}

export interface SignupInput {
  email: string; name: string; password: string;
  role: Exclude<Role, 'ADMIN'>;   // ADMIN is not self-registerable
  department?: string; year?: number;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore a session from the persisted refresh token on first paint.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!tokens.refresh) { setLoading(false); return; }
      try {
        const data = await api.post<AuthResponse>('/auth/refresh', { refreshToken: tokens.refresh });
        tokens.set(data.accessToken, data.refreshToken);
        if (!cancelled) { setUser(data.user); reauthSocket(); }
      } catch {
        tokens.clear();
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<AuthResponse>('/auth/login', { email, password });
    tokens.set(data.accessToken, data.refreshToken);
    setUser(data.user);
    reauthSocket();
  }, []);

  const signup = useCallback(async (input: SignupInput) => {
    const data = await api.post<AuthResponse & { pendingApproval?: boolean; message?: string }>(
      '/auth/signup', input,
    );
    // Teachers land here: the account exists but cannot sign in yet.
    if (data.pendingApproval) return { pendingApproval: true, message: data.message };
    tokens.set(data.accessToken, data.refreshToken);
    setUser(data.user);
    reauthSocket();
    return {};
  }, []);

  const logout = useCallback(async () => {
    const refresh = tokens.refresh;
    if (refresh) await api.post('/auth/logout', { refreshToken: refresh }).catch(() => undefined);
    tokens.clear();
    closeSocket();
    setUser(null);
  }, []);

  const updateUser = useCallback((patch: Partial<User>) => {
    setUser((current) => (current ? { ...current, ...patch } : current));
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, signup, logout, updateUser }),
    [user, loading, login, signup, logout, updateUser],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
