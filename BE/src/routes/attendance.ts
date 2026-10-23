import { Router, Request, Response, NextFunction } from 'express';
import { db } from '../db/database';
import * as excel from '../db/excel';
import { runMonitor } from '../agents/monitor';
import { isEnabled } from '../agents/features';
import { authRequired, adminOnly } from '../middleware/auth';
import { AttendanceRow, AuthedRequest } from '../types';
import { toMin } from '../agents/clock';

const router = Router();

type AsyncHandler = (req: Request, res: Response, next: NextFunction) => Promise<void>;
const ah =
  (fn: AsyncHandler) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

// All attendance timestamps use India time (server runs on UTC).
const TZ = process.env.TZ_OFFICE || 'Asia/Kolkata';
const todayStr = (): string => new Date().toLocaleDateString('en-CA', { timeZone: TZ }); // YYYY-MM-DD in IST
const nowTime = (): string =>
  new Date().toLocaleTimeString('en-IN', { timeZone: TZ, hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
const uid = (): string => 'x' + Math.random().toString(36).slice(2, 9);

// ---- Office geofence: punch allowed only within RADIUS_M metres of office ----
const OFFICE_LAT = parseFloat(process.env.OFFICE_LAT || '');
const OFFICE_LNG = parseFloat(process.env.OFFICE_LNG || '');
const RADIUS_M = parseInt(process.env.OFFICE_RADIUS_M || '100', 10);
const officeConfigured = Number.isFinite(OFFICE_LAT) && Number.isFinite(OFFICE_LNG);
if (!officeConfigured) console.log('OFFICE_LAT/LNG not set — geofence disabled until configured');

function distanceM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number): number => (d * Math.PI) / 180;
  const a =
    Math.sin(toRad(lat2 - lat1) / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(toRad(lng2 - lng1) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// GET /api/attendance/office — fence info so the app can show distance hint
router.get('/office', authRequired, (_req: Request, res: Response) => {
  res.json({
    configured: officeConfigured,
    lat: officeConfigured ? OFFICE_LAT : null,
    lng: officeConfigured ? OFFICE_LNG : null,
    radiusM: RADIUS_M,
  });
});

interface PunchLocation {
  lat?: unknown;
  lng?: unknown;
  acc?: unknown;
  note?: unknown;
}

// POST /api/attendance/punch  { type: 'in' | 'out', location: {lat,lng,acc,note} }
router.post(
  '/punch',
  authRequired,
  ah(async (req: Request, res: Response) => {
    const me = (req as AuthedRequest).user!;
    const { type, location } = (req.body || {}) as { type?: unknown; location?: PunchLocation };
    const loc = location || {};
    const lat = parseFloat(String(loc.lat ?? ''));
    const lng = parseFloat(String(loc.lng ?? ''));
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      res.status(400).json({ error: 'Location required — please enable GPS and try again' });
      return;
    }
    let dist: number | null = null;
    if (officeConfigured) {
      dist = Math.round(distanceM(lat, lng, OFFICE_LAT, OFFICE_LNG));
      if (dist > RADIUS_M) {
        res.status(400).json({
          error: `Outside office range — you are ~${dist}m away (allowed ${RADIUS_M}m). Please punch from office.`,
          distanceM: dist,
          radiusM: RADIUS_M,
        });
        return;
      }
    }
    const locJson = JSON.stringify({
      lat: loc.lat || '',
      lng: loc.lng || '',
      acc: loc.acc || '',
      note: loc.note || '',
    });

    const date = todayStr();
    let rec = db.prepare('SELECT * FROM attendance WHERE userId = ? AND date = ?').get(me.id, date) as unknown as
      | AttendanceRow
      | undefined;

    if (type === 'in') {
      if (rec && rec.punchIn) {
        res.status(400).json({ error: 'Already punched in today' });
        return;
      }
      const ts = Date.now();
      if (!rec) {
        db.prepare(
          'INSERT INTO attendance (id,userId,name,date,punchIn,punchInTS,punchInLoc,punchOut,punchOutTS,punchOutLoc,workMins) VALUES (?,?,?,?,?,?,?,?,?,?,?)',
        ).run(uid(), me.id, me.name, date, nowTime(), ts, locJson, null, null, null, null);
      } else {
        db.prepare('UPDATE attendance SET punchIn = ?, punchInTS = ?, punchInLoc = ? WHERE id = ?').run(nowTime(), ts, locJson, rec.id);
      }
      rec = db.prepare('SELECT * FROM attendance WHERE userId = ? AND date = ?').get(me.id, date) as unknown as AttendanceRow;
      const excelNote = await excel.markPresent(me.name, new Date()).catch(() => ({ updated: false, note: 'excel write failed' }));
      try {
        if (isEnabled('monitor')) runMonitor('punch'); // Monitor Agent: instant late-arrival check (never blocks punch)
      } catch {
        /* monitor must never break punching */
      }
      res.status(201).json({ message: 'Punched IN with geotag', record: rec, excel: excelNote, distanceM: dist });
      return;
    }

    if (type === 'out') {
      if (!rec || !rec.punchIn) {
        res.status(400).json({ error: 'Punch in first' });
        return;
      }
      if (rec.punchOut) {
        res.status(400).json({ error: 'Already punched out' });
        return;
      }
      const ts = Date.now();
      const workMins = rec.punchInTS ? Math.max(1, Math.round((ts - rec.punchInTS) / 60000)) : null;
      db.prepare('UPDATE attendance SET punchOut = ?, punchOutTS = ?, punchOutLoc = ?, workMins = ? WHERE id = ?').run(
        nowTime(), ts, locJson, workMins, rec.id,
      );
      rec = db.prepare('SELECT * FROM attendance WHERE userId = ? AND date = ?').get(me.id, date) as unknown as AttendanceRow;
      try {
        if (isEnabled('monitor')) runMonitor('punch'); // Monitor Agent: instant early-checkout check
      } catch {
        /* monitor must never break punching */
      }
      res.json({ message: 'Punched OUT with geotag', record: rec, workMins, distanceM: dist });
      return;
    }

    res.status(400).json({ error: "Type must be 'in' or 'out'" });
  }),
);

// GET /api/attendance  — admin: all | employee: own. ?userId= filters for admin.
router.get('/', authRequired, (req: Request, res: Response) => {
  const me = (req as AuthedRequest).user!;
  const userId = typeof req.query.userId === 'string' ? req.query.userId : undefined;

  if (me.role === 'admin' && userId) {
    const rows = db.prepare('SELECT * FROM attendance WHERE userId = ? ORDER BY date DESC').all(userId);
    res.json({ records: rows });
    return;
  }
  if (me.role === 'admin') {
    const rows = db.prepare('SELECT * FROM attendance ORDER BY date DESC').all();
    res.json({ records: rows });
    return;
  }
  if (me.role === 'employee' && userId && userId !== me.id) {
    res.status(403).json({ error: 'You can only view your own attendance' });
    return;
  }

  const rows = db.prepare('SELECT * FROM attendance WHERE userId = ? ORDER BY date DESC').all(me.id);
  const today = db.prepare('SELECT * FROM attendance WHERE userId = ? AND date = ?').get(me.id, todayStr());
  res.json({ records: rows, today: today || null });
});

// ---- Admin back-office: fix past records (forgotten punches, wrong times) ----

function cleanTime(v: unknown): string | null {
  if (v === undefined || v === null || String(v).trim() === '') return null;
  const s = String(v).trim();
  const m = toMin(s);
  if (!Number.isFinite(m) || m < 0 || m >= 24 * 60) return undefined as unknown as null;
  return s;
}

function minsBetween(pin: string | null, pout: string | null): number | null {
  if (!pin || !pout) return null;
  const d = toMin(pout) - toMin(pin);
  return Math.max(1, Math.round(d));
}

// POST /api/attendance/manual — admin adds a past record { userId, date, punchIn, punchOut? }
router.post(
  '/manual',
  authRequired,
  adminOnly,
  ah(async (req: Request, res: Response) => {
    const { userId, date, punchIn, punchOut } = (req.body || {}) as {
      userId?: unknown; date?: unknown; punchIn?: unknown; punchOut?: unknown;
    };
    if (!userId || !date || !/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
      res.status(400).json({ error: 'Employee and valid date (YYYY-MM-DD) required' });
      return;
    }
    const emp = db.prepare('SELECT id,name FROM users WHERE id = ? AND role = ?').get(String(userId), 'employee') as unknown as
      | { id: string; name: string }
      | undefined;
    if (!emp) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    const pin = cleanTime(punchIn);
    const pout = cleanTime(punchOut);
    if (pin === undefined || pout === undefined) {
      res.status(400).json({ error: 'Times must be valid (HH:MM)' });
      return;
    }
    if (!pin) {
      res.status(400).json({ error: 'Punch-in time required' });
      return;
    }
    const dup = db.prepare('SELECT id FROM attendance WHERE userId = ? AND date = ?').get(emp.id, String(date));
    if (dup) {
      res.status(409).json({ error: 'A record already exists for this date — edit it instead' });
      return;
    }
    const id = uid();
    db.prepare(
      'INSERT INTO attendance (id,userId,name,date,punchIn,punchInTS,punchInLoc,punchOut,punchOutTS,punchOutLoc,workMins,editedByAdmin) VALUES (?,?,?,?,?,?,?,?,?,?,?,1)',
    ).run(id, emp.id, emp.name, String(date), pin, Date.now(), JSON.stringify({ note: 'manual by admin' }), pout, pout ? Date.now() : null, pout ? JSON.stringify({ note: 'manual by admin' }) : null, minsBetween(pin, pout));
    const rec = db.prepare('SELECT * FROM attendance WHERE id = ?').get(id);
    const parts = String(date).split('-').map(Number);
    await excel.markPresent(emp.name, new Date(parts[0], parts[1] - 1, parts[2])).catch(() => undefined);
    res.status(201).json({ record: rec, message: `Record added for ${emp.name} on ${date}` });
  }),
);

// PATCH /api/attendance/:id — admin corrects a record { punchIn?, punchOut?, date? }
router.patch(
  '/:id',
  authRequired,
  adminOnly,
  ah(async (req: Request, res: Response) => {
    const rec = db.prepare('SELECT * FROM attendance WHERE id = ?').get(req.params.id) as unknown as AttendanceRow | undefined;
    if (!rec) {
      res.status(404).json({ error: 'Record not found' });
      return;
    }
    const { punchIn, punchOut, date } = (req.body || {}) as { punchIn?: unknown; punchOut?: unknown; date?: unknown };
    const updates: Record<string, string | number | null> = {};
    if (punchIn !== undefined) {
      const v = cleanTime(punchIn);
      if (v === undefined) {
        res.status(400).json({ error: 'Punch-in must be valid (HH:MM) or empty' });
        return;
      }
      updates.punchIn = v;
    }
    if (punchOut !== undefined) {
      const v = cleanTime(punchOut);
      if (v === undefined) {
        res.status(400).json({ error: 'Punch-out must be valid (HH:MM) or empty' });
        return;
      }
      updates.punchOut = v;
    }
    if (date !== undefined) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(date))) {
        res.status(400).json({ error: 'Date must be YYYY-MM-DD' });
        return;
      }
      if (String(date) !== rec.date) {
        const clash = db.prepare('SELECT id FROM attendance WHERE userId = ? AND date = ?').get(rec.userId, String(date));
        if (clash) {
          res.status(409).json({ error: 'Another record already uses this date' });
          return;
        }
        updates.date = String(date);
      }
    }
    const keys = Object.keys(updates);
    if (!keys.length) {
      res.status(400).json({ error: 'Nothing to update' });
      return;
    }
    const pin = (updates.punchIn !== undefined ? updates.punchIn : rec.punchIn) as string | null;
    const pout = (updates.punchOut !== undefined ? updates.punchOut : rec.punchOut) as string | null;
    updates.workMins = minsBetween(pin, pout);
    updates.editedByAdmin = 1;
    db.prepare(`UPDATE attendance SET ${keys.concat('workMins', 'editedByAdmin').map((k) => `${k} = ?`).join(', ')} WHERE id = ?`).run(
      ...keys.concat('workMins', 'editedByAdmin').map((k) => updates[k]),
      req.params.id,
    );
    const fresh = db.prepare('SELECT * FROM attendance WHERE id = ?').get(req.params.id);
    res.json({ record: fresh, message: 'Record updated' });
  }),
);

// DELETE /api/attendance/:id — admin removes a wrong record
router.delete('/:id', authRequired, adminOnly, (req: Request, res: Response) => {
  const rec = db.prepare('SELECT * FROM attendance WHERE id = ?').get(req.params.id) as unknown as AttendanceRow | undefined;
  if (!rec) {
    res.status(404).json({ error: 'Record not found' });
    return;
  }
  db.prepare('DELETE FROM attendance WHERE id = ?').run(req.params.id);
  res.json({ message: `Record for ${rec.date} removed` });
});

// POST /api/attendance/admin-out — admin punches OUT an employee who forgot
// to check out (sets today's open punch-out to right now, IST).
router.post(
  '/admin-out',
  authRequired,
  adminOnly,
  ah(async (req: Request, res: Response) => {
    const { userId } = (req.body || {}) as { userId?: unknown };
    if (!userId) {
      res.status(400).json({ error: 'Employee required' });
      return;
    }
    const emp = db.prepare('SELECT id,name FROM users WHERE id = ? AND role = ?').get(String(userId), 'employee') as unknown as
      | { id: string; name: string }
      | undefined;
    if (!emp) {
      res.status(404).json({ error: 'Employee not found' });
      return;
    }
    const date = todayStr();
    const rec = db.prepare('SELECT * FROM attendance WHERE userId = ? AND date = ?').get(emp.id, date) as unknown as
      | AttendanceRow
      | undefined;
    if (!rec || !rec.punchIn) {
      res.status(400).json({ error: `${emp.name} has not punched in today` });
      return;
    }
    if (rec.punchOut) {
      res.status(400).json({ error: `${emp.name} already punched out at ${rec.punchOut}` });
      return;
    }
    const ts = Date.now();
    const workMins = rec.punchInTS ? Math.max(1, Math.round((ts - rec.punchInTS) / 60000)) : null;
    db.prepare('UPDATE attendance SET punchOut = ?, punchOutTS = ?, punchOutLoc = ?, workMins = ?, editedByAdmin = 1 WHERE id = ?').run(
      nowTime(), ts, JSON.stringify({ note: 'punched out by admin' }), workMins, rec.id,
    );
    try {
      if (isEnabled('monitor')) runMonitor('punch');
    } catch {
      /* monitor must never break punch-out */
    }
    const fresh = db.prepare('SELECT * FROM attendance WHERE id = ?').get(rec.id);
    res.json({ record: fresh, message: `${emp.name} punched out at ${nowTime()}` });
  }),
);

export default router;
