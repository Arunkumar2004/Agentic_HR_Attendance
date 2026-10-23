// Elan1 Attendance — SQLite layer (Node 22+ built-in node:sqlite)
import path from 'path';
import bcrypt from 'bcryptjs';
import { DatabaseSync } from 'node:sqlite';

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', '..', 'elan1.db');
export const db = new DatabaseSync(DB_PATH);

// Enable WAL for safer concurrent reads/writes
try {
  db.exec('PRAGMA journal_mode = WAL;');
} catch {
  /* ignore */
}

function initSchema(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT UNIQUE NOT NULL,
      pass TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'employee',
      dept TEXT DEFAULT 'General',
      designation TEXT DEFAULT 'Employee',
      phone TEXT DEFAULT '—',
      "join" TEXT,
      birthday TEXT DEFAULT '',
      tokenVersion INTEGER DEFAULT 0,
      mustChangePass INTEGER DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS attendance (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT,
      date TEXT NOT NULL,
      punchIn TEXT,
      punchInTS INTEGER,
      punchInLoc TEXT,
      punchOut TEXT,
      punchOutTS INTEGER,
      punchOutLoc TEXT,
      workMins INTEGER,
      editedByAdmin INTEGER DEFAULT 0,
      UNIQUE(userId, date)
    );
    CREATE TABLE IF NOT EXISTS leaves (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT,
      type TEXT DEFAULT 'Permission',
      "from" TEXT,
      "to" TEXT,
      reason TEXT,
      status TEXT DEFAULT 'pending',
      adminNote TEXT DEFAULT '',
      appliedAt INTEGER
    );
    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      text TEXT,
      time TEXT,
      read INTEGER DEFAULT 0,
      created INTEGER,
      kind TEXT DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_att_user_date ON attendance(userId, date);
    CREATE INDEX IF NOT EXISTS idx_leaves_user ON leaves(userId);
    CREATE INDEX IF NOT EXISTS idx_notif_user ON notifications(userId);
    CREATE TABLE IF NOT EXISTS company_rules (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      workStart TEXT DEFAULT '09:30',
      graceMins INTEGER DEFAULT 15,
      checkoutBy TEXT DEFAULT '18:30',
      earlyMins INTEGER DEFAULT 30,
      absentCheckTime TEXT DEFAULT '10:30',
      emailAlerts INTEGER DEFAULT 1,
      whatsappAlerts INTEGER DEFAULT 1
    );
    CREATE TABLE IF NOT EXISTS monitor_alerts (
      id TEXT PRIMARY KEY,
      alertKey TEXT UNIQUE,
      kind TEXT,
      userId TEXT,
      text TEXT,
      created INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_created ON monitor_alerts(created);
    CREATE TABLE IF NOT EXISTS policies (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      filename TEXT NOT NULL,
      mime TEXT,
      size INTEGER,
      createdBy TEXT,
      created INTEGER
    );
    CREATE TABLE IF NOT EXISTS eod_reports (
      id TEXT PRIMARY KEY,
      userId TEXT NOT NULL,
      name TEXT,
      date TEXT NOT NULL,
      content TEXT NOT NULL,
      created INTEGER,
      UNIQUE(userId, date)
    );
    CREATE INDEX IF NOT EXISTS idx_eod_user_date ON eod_reports(userId, date);
    CREATE TABLE IF NOT EXISTS wa_numbers (
      number TEXT PRIMARY KEY,
      label TEXT DEFAULT '',
      created INTEGER
    );
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      userId TEXT,
      name TEXT NOT NULL,
      mode TEXT NOT NULL DEFAULT 'direct',
      text TEXT NOT NULL,
      created INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_created ON feedback(created);
    CREATE TABLE IF NOT EXISTS feature_flags (
      key TEXT PRIMARY KEY,
      enabled INTEGER DEFAULT 1
    );
  `);
  // Migration for DBs created before mustChangePass existed
  try {
    db.exec('ALTER TABLE users ADD COLUMN mustChangePass INTEGER DEFAULT 0');
  } catch {
    /* column already exists */
  }
  // Migration for DBs created before emailAlerts existed
  try {
    db.exec('ALTER TABLE company_rules ADD COLUMN emailAlerts INTEGER DEFAULT 1');
  } catch {
    /* column already exists */
  }
  // Migration for DBs created before notification kinds existed
  try {
    db.exec("ALTER TABLE notifications ADD COLUMN kind TEXT DEFAULT ''");
  } catch {
    /* column already exists */
  }
  // Migration for the WhatsApp channel (toggle + recipient list)
  try {
    db.exec('ALTER TABLE company_rules ADD COLUMN whatsappAlerts INTEGER DEFAULT 1');
  } catch {
    /* column already exists */
  }
  // Migration for DBs created before birthdays existed
  try {
    db.exec("ALTER TABLE users ADD COLUMN birthday TEXT DEFAULT ''");
  } catch {
    /* column already exists */
  }
  // Migration for force-logout (session versioning)
  try {
    db.exec('ALTER TABLE users ADD COLUMN tokenVersion INTEGER DEFAULT 0');
  } catch {
    /* column already exists */
  }
  // Migration for admin-edit highlighting
  try {
    db.exec('ALTER TABLE attendance ADD COLUMN editedByAdmin INTEGER DEFAULT 0');
  } catch {
    /* column already exists */
  }
}

function istToday(): string {
  return new Date().toLocaleDateString('en-CA', { timeZone: process.env.TZ_OFFICE || 'Asia/Kolkata' });
}

function seedDefaults(): void {
  const today = istToday();
  const ensure = (
    id: string, name: string, email: string, plainPass: string,
    role: string, dept: string, desg: string, phone: string,
  ): void => {
    const exists = db.prepare('SELECT id FROM users WHERE id = ? OR email = ?').get(id, email);
    if (exists) return;
    const hash = bcrypt.hashSync(plainPass, 10);
    db.prepare(
      'INSERT INTO users (id,name,email,pass,role,dept,designation,phone,"join") VALUES (?,?,?,?,?,?,?,?,?)',
    ).run(id, name, email, hash, role, dept, desg, phone, today);
    console.log(`seeded ${role}: ${email}`);
  };

  // NOTE: demo employees removed — admin adds real staff from the dashboard.
  ensure('ADMIN-1', 'Admin', 'admin@elan1.com', process.env.ADMIN_PASS || 'admin123', 'admin', 'Admin', 'Administrator', '—');
}

// Best-effort: import roster names from the Excel file so SQLite + Excel stay in sync.
// Never throws — a missing/malformed Excel must not crash the server.
async function syncEmployeesFromExcel(): Promise<void> {
  let excelPath: string;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    excelPath = require('./excel').EXCEL_PATH as string;
  } catch {
    return;
  }
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require('fs') as typeof import('fs');
  if (!excelPath || !fs.existsSync(excelPath)) return;
  try {
    const ExcelJS = require('exceljs') as typeof import('exceljs');
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.readFile(excelPath);
    const ws = wb.worksheets[0];
    if (!ws) return;
    let added = 0;
    ws.eachRow((row, rowNumber) => {
      if (rowNumber <= 2) return; // skip title + header rows
      const name = String(row.getCell(2).value ?? '').trim(); // col B = Name
      const desg = String(row.getCell(3).value ?? 'Employee').trim() || 'Employee'; // col C
      if (!name || name.toLowerCase().includes('name') || name.length < 2) return;
      const email = name.split(' ')[0].toLowerCase().replace(/[^a-z0-9]/g, '') + '@elan1.com';
      const exists = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
      if (exists) return;
      const maxNum = (db.prepare("SELECT id FROM users WHERE role = 'employee'").all() as { id: string }[])
        .reduce((m, r) => {
          const n = parseInt(String(r.id).replace(/^ELN-?/, ''), 10);
          return !isNaN(n) && n > m ? n : m;
        }, 100);
      const id = 'ELN-' + (maxNum + 1 + added);
      const hash = bcrypt.hashSync('emp123', 10);
      const today = istToday();
      db.prepare('INSERT INTO users (id,name,email,pass,role,dept,designation,phone,"join") VALUES (?,?,?,?,?,?,?,?,?)')
        .run(id, name, email, hash, 'employee', 'General', desg, '—', today);
      added++;
    });
    if (added > 0) console.log(`synced ${added} employee(s) from Excel roster`);
  } catch (e) {
    console.log('Excel roster sync skipped:', (e as Error).message);
  }
}

export async function initDatabase(): Promise<void> {
  initSchema();
  seedDefaults();
  // Default company rules row (admin edits via Rules page)
  db.prepare(
    'INSERT OR IGNORE INTO company_rules (id,workStart,graceMins,checkoutBy,earlyMins,absentCheckTime) VALUES (1,?,?,?,?,?)',
  ).run('09:30', 15, '18:30', 30, '10:30');
  // Feature kill-switches (admin toggles in Settings; all ON by default).
  // Leaves stay always-on (core workflow).
  for (const key of ['feedback', 'eod', 'policies', 'hr', 'monitor']) {
    db.prepare('INSERT OR IGNORE INTO feature_flags (key,enabled) VALUES (?,1)').run(key);
  }
  await syncEmployeesFromExcel();
}
