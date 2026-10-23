// IST clock helpers shared by the agents.
const TZ = (): string => process.env.TZ_OFFICE || 'Asia/Kolkata';

export const istToday = (): string =>
  new Date().toLocaleDateString('en-CA', { timeZone: TZ() });

/** Current IST time as 24h "HH:MM". */
export function istHM(d = new Date()): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: TZ(), hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

/** Parse "09:30", "09:30:00", "9:30 am", "10:15:30 pm" → minutes since midnight. */
export function toMin(t: string): number {
  const p = String(t).trim().split(/[: ]/);
  let h = +p[0];
  const m = +p[1] || 0;
  const ap = p[p.length - 1]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  return h * 60 + m;
}

export function hmToMin(hm: string): number {
  const [h, m] = String(hm).split(':').map(Number);
  return h * 60 + m;
}

/** Working day = Mon–Sat (Sundays off). */
export function isWorkday(ds: string): boolean {
  const [y, m, d] = ds.split('-').map(Number);
  return new Date(y, m - 1, d).getDay() !== 0;
}

export function addDays(ds: string, n: number): string {
  const [y, m, d] = ds.split('-').map(Number);
  const dt = new Date(y, m - 1, d + n);
  const p = (x: number): string => String(x).padStart(2, '0');
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

export function uid(prefix = 'x'): string {
  return prefix + Math.random().toString(36).slice(2, 9);
}

/**
 * Validate a birthday string. Returns normalized YYYY-MM-DD, '' when cleared,
 * or null when invalid (bad format, impossible date, or a future date).
 */
export function validBirthday(v: unknown): string | null {
  const s = String(v ?? '').trim();
  if (!s) return '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  if (y < 1900 || s > istToday()) return null;
  return s;
}
