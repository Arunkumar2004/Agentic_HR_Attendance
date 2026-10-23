import { Request, Response, NextFunction } from 'express';
import { db } from '../db/database';

export const FEATURES = [
  { key: 'feedback', label: 'Feedback', desc: 'Employee feedback to admin (direct + anonymous).' },
  { key: 'eod', label: 'EOD Reports', desc: 'Daily end-of-day reports from employees.' },
  { key: 'policies', label: 'Company Policies', desc: 'Policy library uploads and reading.' },
  { key: 'hr', label: 'HR Assistant', desc: 'Ask-HR chat and answers.' },
  { key: 'monitor', label: 'Monitor Agent', desc: 'Late/absence/pattern checks and alerts.' },
] as const;

export type FeatureKey = (typeof FEATURES)[number]['key'];

/** Unknown keys default to enabled (safe for code paths without flags). */
export function isEnabled(key: string): boolean {
  try {
    const row = db.prepare('SELECT enabled FROM feature_flags WHERE key = ?').get(key) as unknown as
      | { enabled: number }
      | undefined;
    if (!row) return true;
    return row.enabled === 1;
  } catch {
    return true;
  }
}

export function allFlags(): Record<string, number> {
  const out: Record<string, number> = {};
  try {
    const rows = db.prepare('SELECT key,enabled FROM feature_flags').all() as unknown as { key: string; enabled: number }[];
    rows.forEach((r) => {
      out[r.key] = r.enabled;
    });
  } catch {
    /* ignore */
  }
  for (const f of FEATURES) {
    if (out[f.key] === undefined) out[f.key] = 1;
  }
  return out;
}

export function setFeature(key: string, enabled: boolean): void {
  if (!FEATURES.some((f) => f.key === key)) throw new Error('Unknown feature');
  db.prepare('INSERT INTO feature_flags (key,enabled) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET enabled=excluded.enabled').run(
    key, enabled ? 1 : 0,
  );
}

/** Blocks the route with 403 when the feature is switched off. */
export function requireFeature(key: FeatureKey, label: string) {
  return (_req: Request, res: Response, next: NextFunction): void => {
    if (!isEnabled(key)) {
      res.status(403).json({ error: `${label} is turned off by admin` });
      return;
    }
    next();
  };
}
