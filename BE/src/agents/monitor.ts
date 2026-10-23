import { db } from '../db/database';
import { addDays, hmToMin, isWorkday, istHM, istToday, toMin, uid } from './clock';
import { getRules } from './rules';
import { emailAdmins, notifyAdmins, notifyAll, notifyUser } from './notify';

export type MonitorSource = 'tick' | 'punch' | 'manual';

export interface NewAlert {
  kind: string;
  userId: string | null;
  text: string;
}

interface Emp {
  id: string;
  name: string;
  email: string;
}

function employees(): Emp[] {
  return db.prepare("SELECT id,name,email FROM users WHERE role = 'employee' ORDER BY name").all() as unknown as Emp[];
}

function onLeave(userId: string, date: string): boolean {
  const r = db
    .prepare("SELECT id FROM leaves WHERE userId = ? AND status = 'approved' AND \"from\" <= ? AND \"to\" >= ?")
    .get(userId, date, date);
  return !!r;
}

/** Insert once per key; returns true if this is a NEW alert. */
function raise(key: string, kind: string, userId: string | null, text: string, tellUser: boolean): boolean {
  try {
    const info = db
      .prepare('INSERT OR IGNORE INTO monitor_alerts (id,alertKey,kind,userId,text,created) VALUES (?,?,?,?,?,?)')
      .run(uid('a'), key, kind, userId, text, Date.now()) as unknown as { changes: number };
    if (info.changes === 0) return false;
  } catch {
    return false;
  }
  notifyAdmins(text, kind);
  if (tellUser && userId) notifyUser(userId, text, kind);
  // Email channel obeys the Company Rules toggle (bell always fires).
  if (getRules().emailAlerts) void emailAdmins(`Elan1 monitor: ${kind}`, text);
  return true;
}

/**
 * Attendance Monitor Agent (rule-based, no AI needed).
 * - late arrival: punch-in after workStart + grace
 * - early checkout: punch-out more than earlyMins before checkoutBy
 * - missing checkout: punched in but never out (past days, or today after checkout)
 * - absence: no punch and no approved leave by absentCheckTime (workdays only)
 * - unusual pattern: 3+ late arrivals in the last 7 days
 */
export function runMonitor(source: MonitorSource): NewAlert[] {
  const rules = getRules();
  const out: NewAlert[] = [];
  const today = istToday();
  const hm = hmToMin(istHM());
  const lateAfter = hmToMin(rules.workStart) + rules.graceMins;
  const earlyBefore = hmToMin(rules.checkoutBy) - rules.earlyMins;

  const emps = employees();

  // 1+2. Today's punches: late + early checkout
  const todays = db.prepare('SELECT * FROM attendance WHERE date = ?').all(today) as unknown as {
    userId: string; name: string; punchIn: string | null; punchOut: string | null;
  }[];
  for (const r of todays) {
    if (r.punchIn && toMin(r.punchIn) > lateAfter) {
      const text = `<b>Late arrival:</b> ${r.name} punched in at ${r.punchIn} (start ${rules.workStart} + ${rules.graceMins}m grace).`;
      if (raise(`late:${today}:${r.userId}`, 'late', r.userId, text, true)) out.push({ kind: 'late', userId: r.userId, text });
    }
    if (r.punchOut && toMin(r.punchOut) < earlyBefore) {
      const text = `<b>Early checkout:</b> ${r.name} punched out at ${r.punchOut} (checkout ${rules.checkoutBy}).`;
      if (raise(`early:${today}:${r.userId}`, 'early', r.userId, text, true)) out.push({ kind: 'early', userId: r.userId, text });
    }
  }

  // 3. Missing checkout: past 7 days with in but no out; today only after checkout time
  for (let back = 0; back < 7; back++) {
    const ds = addDays(today, -back);
    if (back === 0 && hm < hmToMin(rules.checkoutBy) + 30) continue;
    const rows = db.prepare('SELECT userId,name FROM attendance WHERE date = ? AND punchIn IS NOT NULL AND punchOut IS NULL').all(ds) as unknown as {
      userId: string; name: string;
    }[];
    for (const r of rows) {
      const text = `<b>Missing checkout:</b> ${r.name} punched in on ${ds} but never punched out.`;
      if (raise(`missout:${ds}:${r.userId}`, 'missing-checkout', r.userId, text, true))
        out.push({ kind: 'missing-checkout', userId: r.userId, text });
    }
  }

  // 4. Absence (scheduled checks only, not on every punch)
  if (source !== 'punch' && isWorkday(today) && hm >= hmToMin(rules.absentCheckTime)) {
    const punched = new Set(
      (db.prepare('SELECT userId FROM attendance WHERE date = ? AND punchIn IS NOT NULL').all(today) as unknown as { userId: string }[]).map(
        (r) => r.userId,
      ),
    );
    for (const e of emps) {
      if (punched.has(e.id) || onLeave(e.id, today)) continue;
      const text = `<b>Absent${source === 'tick' ? ` (no punch by ${rules.absentCheckTime})` : ''}:</b> ${e.name} has no punch today and no approved leave.`;
      if (raise(`absent:${today}:${e.id}`, 'absent', e.id, text, false)) out.push({ kind: 'absent', userId: e.id, text });
    }
  }

  // 5. Unusual pattern: 3+ lates in last 7 days (per week key)
  const monday = addDays(today, -((new Date().getDay() + 6) % 7));
  for (const e of emps) {
    const week = db.prepare('SELECT punchIn FROM attendance WHERE userId = ? AND date >= ? AND date <= ?').all(e.id, addDays(today, -6), today) as unknown as {
      punchIn: string | null;
    }[];
    const lates = week.filter((r) => r.punchIn && toMin(r.punchIn) > lateAfter).length;
    if (lates >= 3) {
      const text = `<b>Pattern:</b> ${e.name} was late ${lates} times in the last 7 days.`;
      if (raise(`pattern:${monday}:${e.id}`, 'pattern', e.id, text, false)) out.push({ kind: 'pattern', userId: e.id, text });
    }
  }

  // 6. Birthdays: wish the whole team when a colleague's birthday is today.
  // Runs on scheduled checks (not on every punch); once per person per day.
  if (source !== 'punch') {
    const md = today.slice(5); // MM-DD
    const celebrants = (
      db.prepare("SELECT id,name,birthday FROM users WHERE role = 'employee'").all() as unknown as {
        id: string; name: string; birthday: string;
      }[]
    ).filter((e) => (e.birthday || '').slice(5) === md);
    for (const c of celebrants) {
      const text = `<b>Happy Birthday, ${c.name}!</b> Wish them in person today.`;
      try {
        const info = db
          .prepare('INSERT OR IGNORE INTO monitor_alerts (id,alertKey,kind,userId,text,created) VALUES (?,?,?,?,?,?)')
          .run(uid('a'), `bday:${today}:${c.id}`, 'birthday', c.id, text, Date.now()) as unknown as { changes: number };
        if (info.changes !== 0) {
          notifyAll(text, 'birthday');
          out.push({ kind: 'birthday', userId: c.id, text });
        }
      } catch {
        /* never break the monitor */
      }
    }
  }

  if (out.length) console.log(`[monitor:${source}] ${out.length} new alert(s)`);
  return out;
}

export interface StoredAlert {
  id: string;
  alertKey: string;
  kind: string;
  userId: string | null;
  text: string;
  created: number;
}

export function recentAlerts(limit = 50): StoredAlert[] {
  return db.prepare('SELECT * FROM monitor_alerts ORDER BY created DESC LIMIT ?').all(limit) as unknown as StoredAlert[];
}
