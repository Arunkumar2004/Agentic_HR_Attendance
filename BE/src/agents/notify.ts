import nodemailer, { Transporter } from 'nodemailer';
import { db } from '../db/database';
import { uid } from './clock';

function mailer(): Transporter | null {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) return null;
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === '1',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS || '' },
  });
}

export function emailConfigured(): boolean {
  return mailer() !== null;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Bell (in-app) notification for one user, tagged with a category kind. */
export function notifyUser(userId: string, text: string, kind = ''): void {
  try {
    db.prepare('INSERT INTO notifications (id,userId,text,time,read,created,kind) VALUES (?,?,?,?,0,?,?)').run(
      uid(), userId, text, new Date().toLocaleString('en-IN', { timeZone: process.env.TZ_OFFICE || 'Asia/Kolkata' }), Date.now(), kind,
    );
  } catch {
    // Fallback for DBs where the kind column migration hasn't run yet.
    db.prepare('INSERT INTO notifications (id,userId,text,time,read,created) VALUES (?,?,?,?,0,?)').run(
      uid(), userId, text, new Date().toLocaleString('en-IN', { timeZone: process.env.TZ_OFFICE || 'Asia/Kolkata' }), Date.now(),
    );
  }
}

/** Bell notification for every admin. Returns admin ids. */
export function notifyAdmins(text: string, kind = ''): string[] {
  const admins = db.prepare("SELECT id FROM users WHERE role = 'admin'").all() as unknown as { id: string }[];
  admins.forEach((a) => notifyUser(a.id, text, kind));
  return admins.map((a) => a.id);
}

/** Bell notification for every user (admins + employees). */
export function notifyAll(text: string, kind = ''): void {
  const ids = db.prepare('SELECT id FROM users').all() as unknown as { id: string }[];
  ids.forEach((u) => notifyUser(u.id, text, kind));
}

export interface EmailResult {
  sent: boolean;
  reason?: string;
}

/** Email channel — works once SMTP_* is set in .env; otherwise reports why not. */
export async function sendEmail(to: string, subject: string, html: string): Promise<EmailResult> {
  const t = mailer();
  if (!t) return { sent: false, reason: 'SMTP not configured (set SMTP_HOST/USER/PASS in BE/.env)' };
  if (!to || !to.includes('@')) return { sent: false, reason: 'no recipient email' };
  await t.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to,
    subject,
    text: stripHtml(html),
    html,
  });
  return { sent: true };
}

/** Email every admin (best-effort, never throws). */
export async function emailAdmins(subject: string, html: string): Promise<EmailResult> {
  try {
    const admins = db.prepare("SELECT email FROM users WHERE role = 'admin'").all() as unknown as { email: string }[];
    const to = admins.map((a) => a.email).filter((e) => e.includes('@'));
    if (!to.length) return { sent: false, reason: 'no admin emails' };
    return await sendEmail(to.join(','), subject, html);
  } catch (e) {
    return { sent: false, reason: (e as Error).message };
  }
}

export interface AgentStatus {
  monitor: { running: boolean; every: string };
  notifications: { bell: boolean; email: boolean; emailReason?: string };
  hr: { connected: boolean; model: string | null };
}

export function agentStatus(): AgentStatus {
  const mail = mailer() !== null;
  return {
    monitor: { running: true, every: '5 min + after every punch' },
    notifications: {
      bell: true,
      email: mail,
      ...(mail ? {} : { emailReason: 'SMTP not configured — add SMTP_* to BE/.env' }),
    },
    hr: { connected: !!process.env.LLM_API_KEY, model: process.env.LLM_MODEL || 'gpt-4o-mini' },
  };
}
