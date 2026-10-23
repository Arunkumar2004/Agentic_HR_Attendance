import { db } from '../db/database';

export interface CompanyRules {
  workStart: string; // "09:30" 24h
  graceMins: number;
  checkoutBy: string; // "18:30" 24h
  earlyMins: number;
  absentCheckTime: string; // "10:30" 24h
  emailAlerts: number; // 1 = monitor also emails admins (needs SMTP), 0 = bell only
}

const FALLBACK: CompanyRules = {
  workStart: '09:30', graceMins: 15, checkoutBy: '18:30', earlyMins: 30, absentCheckTime: '10:30', emailAlerts: 1,
};

export function getRules(): CompanyRules {
  try {
    const row = db
      .prepare('SELECT workStart,graceMins,checkoutBy,earlyMins,absentCheckTime,emailAlerts FROM company_rules WHERE id = 1')
      .get() as unknown as CompanyRules | undefined;
    return { ...FALLBACK, ...(row || {}) };
  } catch {
    return FALLBACK;
  }
}

function badHM(v: unknown): boolean {
  return typeof v !== 'string' || !/^\d{2}:\d{2}$/.test(v) || +v.slice(0, 2) > 23 || +v.slice(3) > 59;
}

export function updateRules(patch: Partial<CompanyRules>): CompanyRules {
  const cur = getRules();
  const next: CompanyRules = {
    workStart: patch.workStart !== undefined ? String(patch.workStart) : cur.workStart,
    graceMins: patch.graceMins !== undefined ? Number(patch.graceMins) : cur.graceMins,
    checkoutBy: patch.checkoutBy !== undefined ? String(patch.checkoutBy) : cur.checkoutBy,
    earlyMins: patch.earlyMins !== undefined ? Number(patch.earlyMins) : cur.earlyMins,
    absentCheckTime: patch.absentCheckTime !== undefined ? String(patch.absentCheckTime) : cur.absentCheckTime,
    emailAlerts: patch.emailAlerts !== undefined ? (Number(patch.emailAlerts) ? 1 : 0) : cur.emailAlerts,
  };
  if (badHM(next.workStart) || badHM(next.checkoutBy) || badHM(next.absentCheckTime)) {
    throw new Error('Times must be HH:MM (24h)');
  }
  for (const k of ['graceMins', 'earlyMins'] as const) {
    if (!Number.isFinite(next[k]) || next[k] < 0 || next[k] > 600) throw new Error(`${k} must be 0–600`);
  }
  db.prepare('UPDATE company_rules SET workStart=?,graceMins=?,checkoutBy=?,earlyMins=?,absentCheckTime=?,emailAlerts=? WHERE id=1').run(
    next.workStart, next.graceMins, next.checkoutBy, next.earlyMins, next.absentCheckTime, next.emailAlerts,
  );
  return next;
}
