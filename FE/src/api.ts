import type { User } from './types';

const TOKEN_KEY = 'elan1_token';
const USER_KEY = 'elan1_user';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let unauthorizedHandler: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

export function getToken(): string {
  return localStorage.getItem(TOKEN_KEY) || '';
}

export function getStoredUser(): User | null {
  try {
    return JSON.parse(localStorage.getItem(USER_KEY) || 'null') as User | null;
  } catch {
    return null;
  }
}

export function setSession(token: string, user: User | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
  if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
  else localStorage.removeItem(USER_KEY);
}

export function clearSession(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {};
  if (init?.body !== undefined) headers['Content-Type'] = 'application/json';
  const tok = getToken();
  if (tok) headers.Authorization = 'Bearer ' + tok;
  const res = await fetch('/api' + path, { ...init, headers });
  if (res.status === 401 && path !== '/auth/login') {
    unauthorizedHandler?.();
    throw new ApiError(401, 'Session expired — login again');
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string } & Record<string, unknown>;
  if (!res.ok) throw new ApiError(res.status, data.error || 'HTTP ' + res.status);
  return data as T;
}

export const api = {
  get: <T>(path: string): Promise<T> => request<T>(path),
  post: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) }),
  patch: <T>(path: string, body?: unknown): Promise<T> =>
    request<T>(path, { method: 'PATCH', body: body === undefined ? undefined : JSON.stringify(body) }),
  del: <T>(path: string): Promise<T> => request<T>(path, { method: 'DELETE' }),
};

export async function downloadFile(path: string, filename: string): Promise<void> {
  const headers: Record<string, string> = {};
  const tok = getToken();
  if (tok) headers.Authorization = 'Bearer ' + tok;
  const res = await fetch('/api' + path, { headers });
  if (res.status === 401) {
    unauthorizedHandler?.();
    throw new ApiError(401, 'Session expired — login again');
  }
  if (!res.ok) {
    const t = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(t.error || 'HTTP ' + res.status);
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
