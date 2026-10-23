import { db } from '../db/database';
import { addDays, hmToMin, isWorkday, istToday, toMin } from './clock';
import { getRules } from './rules';

export type HrMode = 'ai' | 'fallback' | 'unconfigured';

export interface HrAnswer {
  answer: string;
  mode: HrMode;
}

interface Emp {
  id: string;
  name: string;
}

/** Compact live snapshot sent to the LLM as context (no AI needed to build it). */
function buildSnapshot(): string {
  const rules = getRules();
  const today = istToday();
  const emps = db.prepare("SELECT id,name FROM users WHERE role = 'employee' ORDER BY name").all() as unknown as Emp[];
  const todays = db.prepare('SELECT userId,punchIn FROM attendance WHERE date = ?').all(today) as unknown as {
    userId: string; punchIn: string | null;
  }[];
  const punched = new Set(todays.filter((r) => r.punchIn).map((r) => r.userId));
  const lateAfter = hmToMin(rules.workStart) + rules.graceMins;
  const lateToday = todays
    .filter((r) => r.punchIn && toMin(r.punchIn) > lateAfter)
    .map((r) => emps.find((e) => e.id === r.userId)?.name || r.userId);
  const onLeaveToday = emps
    .filter((e) => db.prepare("SELECT id FROM leaves WHERE userId = ? AND status='approved' AND \"from\" <= ? AND \"to\" >= ?").get(e.id, today, today))
    .map((e) => e.name);
  const absentToday = isWorkday(today)
    ? emps.filter((e) => !punched.has(e.id) && !onLeaveToday.includes(e.name)).map((e) => e.name)
    : [`(today ${today} is Sunday — weekly off)`];
  const pending = db.prepare("SELECT name,type,\"from\",\"to\" FROM leaves WHERE status='pending' ORDER BY appliedAt DESC").all() as unknown as {
    name: string; type: string; from: string; to: string;
  }[];
  // this-week late count per person
  const weekRows = db.prepare('SELECT userId,name,punchIn,date FROM attendance WHERE date >= ? AND punchIn IS NOT NULL').all(addDays(today, -6)) as unknown as {
    userId: string; name: string; punchIn: string; date: string;
  }[];
  const lateWeek: Record<string, number> = {};
  weekRows.forEach((r) => {
    if (toMin(r.punchIn) > lateAfter) lateWeek[r.name] = (lateWeek[r.name] || 0) + 1;
  });
  const month = today.slice(0, 7);
  const monthPunches = db.prepare("SELECT COUNT(*) c FROM attendance WHERE date LIKE ? AND punchIn IS NOT NULL").get(month + '%') as unknown as { c: number };
  const lines = [
    `Company rules: work starts ${rules.workStart} (+${rules.graceMins}m grace), checkout by ${rules.checkoutBy}, absence flagged after ${rules.absentCheckTime}. Workdays Mon-Sat.`,
    `Employees (${emps.length}): ${emps.map((e) => e.name).join(', ') || 'none'}.`,
    `Today ${today}: present ${punched.size}, late [${lateToday.join(', ') || 'none'}], on approved leave [${onLeaveToday.join(', ') || 'none'}], absent [${absentToday.join(', ') || 'none'}].`,
    `Late arrivals this week: ${Object.entries(lateWeek).map(([n, c]) => `${n} x${c}`).join(', ') || 'none'}.`,
    `Punches this month (${month}): ${monthPunches.c}.`,
    `Pending leaves (${pending.length}): ${pending.map((l) => `${l.name} (${l.type} ${l.from}→${l.to})`).join('; ') || 'none'}.`,
  ];
  return lines.join('\n');
}

/** Honest rule-based answers for common questions — works with no AI key. */
function fallback(question: string): string | null {
  const q = question.toLowerCase();
  const rules = getRules();
  const today = istToday();
  const emps = db.prepare("SELECT id,name FROM users WHERE role = 'employee' ORDER BY name").all() as unknown as Emp[];
  const lateAfter = hmToMin(rules.workStart) + rules.graceMins;

  if (q.includes('absent')) {
    const todays = new Set(
      (db.prepare('SELECT userId FROM attendance WHERE date = ? AND punchIn IS NOT NULL').all(today) as unknown as { userId: string }[]).map((r) => r.userId),
    );
    const names = emps
      .filter(
        (e) =>
          !todays.has(e.id) &&
          !db.prepare("SELECT id FROM leaves WHERE userId = ? AND status='approved' AND \"from\" <= ? AND \"to\" >= ?").get(e.id, today, today),
      )
      .map((e) => e.name);
    if (!isWorkday(today)) return `Today (${today}) is Sunday — weekly off, no absentees counted.`;
    return names.length ? `Absent today (${today}): ${names.join(', ')}.` : `Nobody is absent today (${today}) — everyone punched in or is on approved leave.`;
  }
  if (q.includes('late')) {
    const rows = db.prepare('SELECT name,punchIn,date FROM attendance WHERE date >= ? AND punchIn IS NOT NULL ORDER BY date DESC').all(addDays(today, -6)) as unknown as {
      name: string; punchIn: string; date: string;
    }[];
    const late = rows.filter((r) => toMin(r.punchIn) > lateAfter);
    if (!late.length) return `No late arrivals in the last 7 days (start ${rules.workStart} + ${rules.graceMins}m grace).`;
    return `Late arrivals (last 7 days):\n` + late.map((r) => `• ${r.name} — ${r.date} at ${r.punchIn}`).join('\n');
  }
  if (q.includes('summary') || q.includes('month')) {
    const month = today.slice(0, 7);
    const c = db.prepare("SELECT COUNT(*) c FROM attendance WHERE date LIKE ? AND punchIn IS NOT NULL").get(month + '%') as unknown as { c: number };
    const appr = db.prepare("SELECT COUNT(*) c FROM leaves WHERE status='approved'").get() as unknown as { c: number };
    const pend = db.prepare("SELECT COUNT(*) c FROM leaves WHERE status='pending'").get() as unknown as { c: number };
    return `${month} so far: ${c.c} punches from ${emps.length} employees, ${appr.c} approved leaves, ${pend.c} pending approvals.`;
  }
  if (q.includes('leave') || q.includes('pending')) {
    const rows = db.prepare("SELECT name,type,\"from\",\"to\" FROM leaves WHERE status='pending' ORDER BY appliedAt DESC").all() as unknown as {
      name: string; type: string; from: string; to: string;
    }[];
    if (!rows.length) return 'No pending leave requests.';
    return 'Pending leaves:\n' + rows.map((l) => `• ${l.name} — ${l.type}, ${l.from} → ${l.to}`).join('\n');
  }
  return null;
}

/**
 * HR Assistant Agent.
 * With LLM_API_KEY set → free-form answers via an OpenAI-compatible chat API.
 * Without it → rule-based answers for common questions, else an honest notice.
 */
export async function askHR(question: string): Promise<HrAnswer> {
  const q = String(question || '').trim();
  if (!q) return { answer: 'Ask me something, e.g. "Who was absent this week?"', mode: 'fallback' };

  const key = process.env.LLM_API_KEY;
  if (!key) {
    const fb = fallback(q);
    if (fb) return { answer: fb + '\n\n(rule-based answer — connect the AI key for free-form questions)', mode: 'fallback' };
    return {
      answer:
        'AI brain is not connected yet — add LLM_API_KEY (plus optional LLM_BASE_URL / LLM_MODEL) on the server for free-form HR questions.\nRight now I can answer: absentees, late arrivals, month summary, pending leaves.',
      mode: 'unconfigured',
    };
  }

  const base = (process.env.LLM_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
  const model = process.env.LLM_MODEL || 'gpt-4o-mini';
  const snapshot = buildSnapshot();
  try {
    const res = await fetch(base + '/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content:
              'You are an HR assistant for a small company. Answer using ONLY the live attendance data provided. Be short and factual. If the answer is not in the data, say so.',
          },
          { role: 'user', content: `Question: ${q}\n\nLive data:\n${snapshot}` },
        ],
      }),
    });
    if (!res.ok) {
      const err = (await res.text()).slice(0, 300);
      const fb = fallback(q);
      return { answer: `AI error (${res.status}): ${err}` + (fb ? `\n\nFallback answer:\n${fb}` : ''), mode: 'fallback' };
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    const text = j.choices?.[0]?.message?.content?.trim() || 'The AI returned no answer.';
    return { answer: text, mode: 'ai' };
  } catch (e) {
    const fb = fallback(q);
    return { answer: `AI unreachable: ${(e as Error).message}` + (fb ? `\n\nFallback answer:\n${fb}` : ''), mode: 'fallback' };
  }
}
