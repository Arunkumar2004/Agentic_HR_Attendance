import type { AttendanceRecord, LeaveItem } from './types';

export function todayStr(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function monthKey(d = new Date()): string {
  const p = (n: number): string => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}`;
}

/** "1995-03-12" → "12 Mar 1995" ('' → '—'). */
export function fmtDateISO(ds: string | null | undefined): string {
  if (!ds) return '—';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ds.trim());
  if (!m) return ds;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const mi = +m[2] - 1;
  if (mi < 0 || mi > 11) return ds;
  return `${+m[3]} ${months[mi]} ${m[1]}`;
}

/** Minutes between punchIn/punchOut strings (handles 12h + 24h formats). */
export function calcMins(r: AttendanceRecord): number {
  if (r.workMins != null) return r.workMins;
  if (r.punchIn && r.punchOut) {
    try {
      const toMin = (t: string): number => {
        const p = t.split(/[: ]/);
        let h = +p[0];
        const m = +p[1] || 0;
        const ap = p[p.length - 1]?.toLowerCase();
        if (ap === 'pm' && h < 12) h += 12;
        if (ap === 'am' && h === 12) h = 0;
        return h * 60 + m;
      };
      return Math.round(Math.max(toMin(r.punchOut) - toMin(r.punchIn), 1));
    } catch {
      return 480;
    }
  }
  return 0;
}

export function fmtMins(m: number): string {
  m = Math.round(m);
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}

export function hours(r: AttendanceRecord): string {
  if (!r.punchIn) return '—';
  if (!r.punchOut) return 'on duty';
  return fmtMins(calcMins(r));
}

/** Any punch string ("10:27:33 am", "14:30") → 24h "HH:MM" for uniform display. */
export function fmtTime24(t: string | null | undefined): string {
  if (!t) return '—';
  const p = String(t).trim().split(/[: ]/);
  let h = +p[0];
  const m = String(+p[1] || 0).padStart(2, '0');
  const ap = p[p.length - 1]?.toLowerCase();
  if (ap === 'pm' && h < 12) h += 12;
  if (ap === 'am' && h === 12) h = 0;
  if (!Number.isFinite(h)) return String(t);
  return `${String(h).padStart(2, '0')}:${m}`;
}

export function shortLoc(l: string | null | undefined): string {
  try {
    if (typeof l === 'string') {
      const o = JSON.parse(l) as { lat?: string; lng?: string };
      return o && o.lat ? `${o.lat},${o.lng}` : '—';
    }
  } catch {
    return '—';
  }
  return '—';
}

/** Great-circle distance in metres. */
export function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}

/** Monday of the current week through today (local dates, YYYY-MM-DD). */
export function weekRange(now: Date = new Date()): { from: string; to: string } {
  const mon = new Date(now);
  mon.setDate(now.getDate() - ((now.getDay() + 6) % 7));
  return { from: todayStr(mon), to: todayStr(now) };
}

export interface PieData {
  key: string;
  present: number;
  leave: number;
  absent: number;
}

/**
 * Present / On-leave / Absent working days (Mon–Sat, Sundays excluded)
 * for a YYYY-MM month key.
 */
export function computePie(
  att: AttendanceRecord[],
  leaves: LeaveItem[],
  key: string,
  today: Date = new Date(),
): PieData {
  const p = (n: number): string => String(n).padStart(2, '0');
  const [Y, M] = key.split('-').map(Number);
  const dim = new Date(Y, M, 0).getDate();
  const lastDay = Y === today.getFullYear() && M === today.getMonth() + 1 ? today.getDate() : dim;
  const ds = (day: number): string => `${key}-${p(day)}`;
  const isWork = (y: number, m: number, dd: number): boolean => new Date(y, m - 1, dd).getDay() !== 0;

  let work = 0;
  for (let dd = 1; dd <= lastDay; dd++) if (isWork(Y, M, dd)) work++;

  const presentSet = new Set(att.filter((r) => r.punchIn && r.date.startsWith(key)).map((r) => r.date));
  let leave = 0;
  let guard = 0;
  leaves
    .filter((l) => l.status === 'approved' && l.to >= ds(1) && l.from <= ds(lastDay))
    .forEach((l) => {
      let dt = l.from < ds(1) ? ds(1) : l.from;
      const end = l.to > ds(lastDay) ? ds(lastDay) : l.to;
      while (dt <= end && guard++ < 500) {
        const [y, m, dd] = dt.split('-').map(Number);
        if (isWork(y, m, dd) && !presentSet.has(dt)) leave++;
        const nx = new Date(y, m - 1, dd + 1);
        dt = `${nx.getFullYear()}-${p(nx.getMonth() + 1)}-${p(nx.getDate())}`;
      }
    });

  let present = 0;
  presentSet.forEach((dt) => {
    const [y, m, dd] = dt.split('-').map(Number);
    if (isWork(y, m, dd)) present++;
  });
  const absent = Math.max(0, work - present - leave);
  return { key, present, leave, absent };
}
