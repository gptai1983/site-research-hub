import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

const TOKEN_KEY = 'hermes_auth_token';
const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/trpc';

export function getStoredToken(): string | null {
  try { return localStorage.getItem(TOKEN_KEY); } catch { return null; }
}

interface User {
  id: number;
  email: string;
  role: string;
}

interface AuthContextValue {
  token: string | null;
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  setupFirstUser: (email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside AuthProvider');
  return ctx;
}

async function tRpcCall(path: string, input: unknown) {
  const res = await fetch(`${API_URL}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error?.message || `Request failed (${res.status})`);
  return json.result?.data;
}

async function fetchMe(token: string): Promise<User | null> {
  try {
    const res = await fetch(`${API_URL}/auth.me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const json = await res.json();
    return json.result?.data || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(() => getStoredToken());
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (token) {
      fetchMe(token).then((u) => {
        if (u) { setUser(u); } else { try { localStorage.removeItem(TOKEN_KEY); } catch {} setToken(null); }
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
  }, [token]);

  const saveToken = useCallback((t: string, u: User) => {
    try { localStorage.setItem(TOKEN_KEY, t); } catch {}
    setToken(t);
    setUser(u);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await tRpcCall('auth.login', { email, password });
    saveToken(data.token, data.user);
  }, [saveToken]);

  const register = useCallback(async (email: string, password: string) => {
    const data = await tRpcCall('auth.register', { email, password });
    saveToken(data.token, data.user);
  }, [saveToken]);

  const setupFirstUser = useCallback(async (email: string, password: string) => {
    const data = await tRpcCall('auth.setupFirstUser', { email, password });
    saveToken(data.token, data.user);
  }, [saveToken]);

  const logout = useCallback(() => {
    try { localStorage.removeItem(TOKEN_KEY); } catch {}
    setToken(null);
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ token, user, loading, login, register, setupFirstUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
