import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { api, clearSession, getStoredUser, setSession, setUnauthorizedHandler } from './api';
import type { NotificationItem, Role, User } from './types';

// ---------- Toast ----------
interface ToastCtx {
  toast: (msg: string) => void;
}
const ToastContext = createContext<ToastCtx>({ toast: () => undefined });
export const useToast = (): ToastCtx => useContext(ToastContext);

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [msg, setMsg] = useState('');
  const [visible, setVisible] = useState(false);
  const timer = useRef<number | undefined>(undefined);

  const toast = useCallback((m: string) => {
    // Professional minimal toasts: strip leading emoji, keep the words.
    setMsg(String(m).replace(/^(\p{Extended_Pictographic}\uFE0F?\s*|[\u2600-\u27BF]\uFE0F?\s*)+/u, ''));
    setVisible(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setVisible(false), 2600);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div id="toast" className={visible ? 'show' : ''}>
        {msg}
      </div>
    </ToastContext.Provider>
  );
}

// ---------- Theme ----------
export type Theme = 'dark' | 'light';
interface ThemeCtx {
  theme: Theme;
  toggle: () => void;
}
const ThemeContext = createContext<ThemeCtx>({ theme: 'dark', toggle: () => undefined });
export const useTheme = (): ThemeCtx => useContext(ThemeContext);

export function ThemeProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [theme, setTheme] = useState<Theme>(() => (localStorage.getItem('elan1_theme') === 'light' ? 'light' : 'dark'));
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('elan1_theme', theme);
  }, [theme]);
  const toggle = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), []);
  return <ThemeContext.Provider value={{ theme, toggle }}>{children}</ThemeContext.Provider>;
}

// ---------- Session ----------
interface LoginResponse {
  token: string;
  user: User;
}
interface SessionCtx {
  user: User | null;
  login: (email: string, password: string, role: Role) => Promise<User>;
  logout: () => void;
  setUser: (u: User) => void;
  notifs: NotificationItem[];
  refreshNotifs: () => Promise<void>;
  markAllRead: () => Promise<void>;
}
const SessionContext = createContext<SessionCtx>({
  user: null,
  login: () => Promise.reject(new Error('no provider')),
  logout: () => undefined,
  setUser: () => undefined,
  notifs: [],
  refreshNotifs: () => Promise.resolve(),
  markAllRead: () => Promise.resolve(),
});
export const useSession = (): SessionCtx => useContext(SessionContext);

export function SessionProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [user, setUserState] = useState<User | null>(() => getStoredUser());
  const [notifs, setNotifs] = useState<NotificationItem[]>([]);

  const logout = useCallback(() => {
    clearSession();
    setUserState(null);
    setNotifs([]);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    return () => setUnauthorizedHandler(null);
  }, [logout]);

  const refreshNotifs = useCallback(async () => {
    try {
      const d = await api.get<{ notifications: NotificationItem[] }>('/notifications');
      setNotifs(d.notifications || []);
    } catch {
      setNotifs([]);
    }
  }, []);

  const login = useCallback(
    async (email: string, password: string, role: Role): Promise<User> => {
      const d = await api.post<LoginResponse>('/auth/login', { email, password, role });
      setSession(d.token, d.user);
      setUserState(d.user);
      return d.user;
    },
    [],
  );

  const setUser = useCallback((u: User) => {
    setUserState(u);
    const tok = localStorage.getItem('elan1_token') || '';
    setSession(tok, u);
  }, []);

  const markAllRead = useCallback(async () => {
    await api.patch('/notifications/read-all');
    await refreshNotifs();
  }, [refreshNotifs]);

  useEffect(() => {
    if (user) void refreshNotifs();
  }, [user, refreshNotifs]);

  return (
    <SessionContext.Provider value={{ user, login, logout, setUser, notifs, refreshNotifs, markAllRead }}>
      {children}
    </SessionContext.Provider>
  );
}
