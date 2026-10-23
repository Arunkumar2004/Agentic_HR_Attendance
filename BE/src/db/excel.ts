// Elan1 Attendance — Excel read/write layer (exceljs)
import path from 'path';
import fs from 'fs';
import ExcelJS from 'exceljs';

export const EXCEL_PATH =
  process.env.EXCEL_PATH ||
  path.join(__dirname, '..', '..', '..', 'DB', 'Elan 1 Employee Attendance Track.xlsx');

export function monthSheetName(d = new Date()): string {
  const m = d.toLocaleString('en-US', { month: 'short' }); // Jan, Feb...
  const y = String(d.getFullYear()).slice(2); // 26
  return `${m}-${y}`;
}

async function loadWorkbook(): Promise<ExcelJS.Workbook> {
  const wb = new ExcelJS.Workbook();
  if (!fs.existsSync(EXCEL_PATH)) {
    throw new Error('Excel file not found at ' + EXCEL_PATH);
  }
  await wb.xlsx.readFile(EXCEL_PATH);
  return wb;
}

// Find the sheet for the current month (e.g. "Sep-26"), else fall back to first sheet.
function pickMonthSheet(wb: ExcelJS.Workbook, d = new Date()): ExcelJS.Worksheet | undefined {
  const target = monthSheetName(d).toLowerCase();
  const long = d.toLocaleString('en-US', { month: 'long' }).toLowerCase();
  let ws = wb.getWorksheet(monthSheetName(d));
  if (!ws) {
    ws = wb.worksheets.find((s) => {
      const n = String(s.name || '').toLowerCase();
      return n.includes(target.slice(0, 3)) || n.includes(long);
    });
  }
  return ws || wb.worksheets[0];
}

// Header row (row 2) holds day numbers 1..31. Find the column for `day`.
function findDayColumn(ws: ExcelJS.Worksheet, day: number): number {
  const headerRow = ws.getRow(2);
  for (let c = 1; c <= 40; c++) {
    const v = String(headerRow.getCell(c).value ?? '').trim();
    if (v === String(day)) return c;
  }
  // fallback: assume cols D.. = days 1..31 (A=S.No, B=Name, C=Designation)
  return 3 + Number(day);
}

function findEmployeeRow(ws: ExcelJS.Worksheet, name: string): number | null {
  const needle = String(name || '').trim().toLowerCase();
  let found: number | null = null;
  ws.eachRow((row, n) => {
    if (n <= 2) return;
    const cell = String(row.getCell(2).value ?? '').trim().toLowerCase();
    if (cell && cell === needle) found = n;
  });
  return found;
}

export interface ExcelResult {
  updated?: boolean;
  added?: boolean;
  note?: string;
  reason?: string;
  sheet?: string;
}

// Mark P for `name` in today's cell of the current month sheet.
export async function markPresent(name: string, dateObj = new Date()): Promise<ExcelResult> {
  try {
    const wb = await loadWorkbook();
    const ws = pickMonthSheet(wb, dateObj);
    if (!ws) return { updated: false, note: 'no sheet in workbook' };
    const row = findEmployeeRow(ws, name);
    if (!row) return { updated: false, note: 'employee row not found in Excel' };
    const col = findDayColumn(ws, dateObj.getDate());
    const cell = ws.getRow(row).getCell(col);
    cell.value = 'P';
    try {
      cell.font = { bold: true, color: { argb: 'FF0B7A3E' } };
    } catch {
      /* ignore */
    }
    await wb.xlsx.writeFile(EXCEL_PATH);
    return { updated: true, sheet: ws.name };
  } catch (e) {
    return { updated: false, note: (e as Error).message };
  }
}

// Append a new employee row (Name in col B, Designation in col C).
export async function appendEmployee(name: string, designation = 'Employee'): Promise<ExcelResult> {
  try {
    const wb = await loadWorkbook();
    const ws = wb.worksheets[0];
    if (!ws) return { added: false, reason: 'no sheet' };
    if (findEmployeeRow(ws, name)) return { added: false, reason: 'already exists' };
    const lastRow = ws.lastRow ? ws.lastRow.number : 2;
    const r = ws.getRow(lastRow + 1);
    r.getCell(1).value = lastRow - 1; // S.No
    r.getCell(2).value = name;
    r.getCell(3).value = designation;
    r.commit();
    await wb.xlsx.writeFile(EXCEL_PATH);
    return { added: true, sheet: ws.name };
  } catch (e) {
    return { added: false, reason: (e as Error).message };
  }
}

// Build a "Today" workbook (used by GET /api/excel/today) from live SQLite data.
export async function buildTodayWorkbook(): Promise<Buffer> {
  const out = new ExcelJS.Workbook();
  const ws = out.addWorksheet('Today');
  ws.addRow(['ID', 'Name', 'Date', 'Punch In', 'Punch Out', 'Hours (mins)', 'Status']);
  try {
    // Lazy require avoids a db/excel import cycle at module load.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { db } = require('./database') as typeof import('./database');
    const today = new Date();
    const ds = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
    const users = db.prepare("SELECT * FROM users WHERE role = 'employee' ORDER BY name").all() as {
      id: string; name: string;
    }[];
    const att = db.prepare('SELECT * FROM attendance WHERE date = ?').all(ds) as {
      userId: string; punchIn: string | null; punchOut: string | null; workMins: number | null;
    }[];
    const byUser = new Map(att.map((a) => [a.userId, a]));
    users.forEach((u) => {
      const r = byUser.get(u.id);
      ws.addRow([u.id, u.name, ds, (r && r.punchIn) || '—', (r && r.punchOut) || '—', (r && r.workMins) || 0, r && r.punchIn ? 'P' : 'A']);
    });
  } catch (e) {
    ws.addRow(['—', 'No data', (e as Error).message || '', '', '', '', '']);
  }
  const buf = await out.xlsx.writeBuffer();
  return Buffer.from(buf as unknown as Uint8Array);
}

// Build the FULL workbook from live SQLite data (roster + all attendance + leaves).
// Used when no physical Excel file exists — so Full Workbook never 500s.
export async function buildFullWorkbook(): Promise<Buffer> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { db } = require('./database') as typeof import('./database');
  const out = new ExcelJS.Workbook();

  const roster = out.addWorksheet('Roster');
  roster.addRow(['ID', 'Name', 'Email', 'Designation', 'Department', 'Phone', 'Joined']);
  const users = db.prepare("SELECT * FROM users WHERE role = 'employee' ORDER BY name").all() as {
    id: string; name: string; email: string; designation: string; dept: string; phone: string; join: string;
  }[];
  users.forEach((u) => roster.addRow([u.id, u.name, u.email, u.designation, u.dept, u.phone, u.join]));

  const att = out.addWorksheet('Attendance');
  att.addRow(['Date', 'ID', 'Name', 'Punch In', 'Punch Out', 'Hours (mins)', 'Location In', 'Location Out']);
  const rows = db.prepare('SELECT * FROM attendance ORDER BY date DESC').all() as {
    date: string; userId: string; name: string; punchIn: string | null; punchOut: string | null;
    workMins: number | null; punchInLoc: string | null; punchOutLoc: string | null;
  }[];
  const loc = (s: string | null): string => {
    try {
      const o = JSON.parse(String(s || '')) as { lat?: string; lng?: string };
      return o && o.lat ? `${o.lat},${o.lng}` : '';
    } catch {
      return '';
    }
  };
  rows.forEach((r) =>
    att.addRow([r.date, r.userId, r.name, r.punchIn || '', r.punchOut || '', r.workMins || 0, loc(r.punchInLoc), loc(r.punchOutLoc)]),
  );

  const lv = out.addWorksheet('Leaves');
  lv.addRow(['Employee', 'Type', 'From', 'To', 'Reason', 'Status', 'Admin Note']);
  const leaves = db.prepare('SELECT * FROM leaves ORDER BY appliedAt DESC').all() as {
    name: string; type: string; from: string; to: string; reason: string; status: string; adminNote: string;
  }[];
  leaves.forEach((l) => lv.addRow([l.name, l.type, l.from, l.to, l.reason, l.status, l.adminNote || '']));

  const buf = await out.xlsx.writeBuffer();
  return Buffer.from(buf as unknown as Uint8Array);
}
