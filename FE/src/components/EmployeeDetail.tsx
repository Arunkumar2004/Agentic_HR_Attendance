import { useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../store';
import { calcMins, computePie, fmtDateISO, fmtMins, fmtTime24, hours, shortLoc } from '../time';
import { Icon } from './icons';
import type { AttendanceRecord, EodReport, LeaveItem, User } from '../types';

function ProfItem({ k, v }: { k: string; v: string }): React.JSX.Element {
  return (
    <div className="prof-item">
      <small>{k}</small>
      <b>{v || '—'}</b>
    </div>
  );
}

/** Admin tracking panel: profile, hours stats, month-filtered logs, attendance pie. */
export default function EmployeeDetailModal({
  userId,
  onClose,
  onDeleted,
}: {
  userId: string;
  onClose: () => void;
  onDeleted: () => void;
}): React.JSX.Element {
  const { toast } = useToast();
  const [user, setUser] = useState<User | null>(null);
  const [att, setAtt] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveItem[]>([]);
  const [eods, setEods] = useState<EodReport[]>([]);
  const [month, setMonth] = useState('');
  const [fixDate, setFixDate] = useState('');
  const [fixIn, setFixIn] = useState('');
  const [fixOut, setFixOut] = useState('');

  async function reload(): Promise<void> {
    try {
      const a = await api.get<{ records: AttendanceRecord[] }>(`/attendance?userId=${userId}`);
      setAtt(a.records || []);
    } catch (e) {
      toast('' + (e as Error).message);
    }
  }

  /** "10:27 am" or "14:30" → "14:30" for the time input. */
  function toTimeInput(t: string | null): string {
    if (!t) return '';
    const p = t.trim().split(/[: ]/);
    let h = +p[0];
    const m = p[1] || '00';
    const ap = p[p.length - 1]?.toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    if (!Number.isFinite(h)) return '';
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0').slice(0, 2)}`;
  }

  /** Pick a date in the fix form: existing timings load in locked, only gaps stay editable. */
  function pickFixDate(d: string): void {
    setFixDate(d);
    const rec = att.find((r) => r.date === d);
    setFixIn(rec ? toTimeInput(rec.punchIn) : '');
    setFixOut(rec ? toTimeInput(rec.punchOut) : '');
  }
  const fixExisting = fixDate ? att.find((r) => r.date === fixDate) : undefined;
  const inLocked = !!fixExisting?.punchIn;
  const outLocked = !!fixExisting?.punchOut;

  /** Save back-office fix: fills only the missing times, or creates the record. */
  async function saveFix(): Promise<void> {
    if (!fixDate) {
      toast('Pick a date first');
      return;
    }
    if (!fixIn) {
      toast('Enter punch-in time');
      return;
    }
    try {
      const existing = att.find((r) => r.date === fixDate);
      if (existing) {
        const body: Record<string, string | null> = {};
        if (!existing.punchIn) body.punchIn = fixIn;
        if (!existing.punchOut && fixOut) body.punchOut = fixOut;
        if (!Object.keys(body).length) {
          toast('Both times already recorded — nothing to fill');
          return;
        }
        const d = await api.patch<{ message?: string }>(`/attendance/${existing.id}`, body);
        toast(d.message || 'Record updated');
      } else {
        const d = await api.post<{ message?: string }>('/attendance/manual', {
          userId,
          date: fixDate,
          punchIn: fixIn,
          punchOut: fixOut || undefined,
        });
        toast(d.message || 'Record added');
      }
      setFixDate('');
      setFixIn('');
      setFixOut('');
      await reload();
    } catch (e) {
      toast('' + (e as Error).message);
    }
  }

  async function delRecord(id: string, date: string): Promise<void> {
    if (!window.confirm(`Delete the record for ${date}?`)) return;
    try {
      const d = await api.del<{ message?: string }>(`/attendance/${id}`);
      toast(d.message || 'Record removed');
      await reload();
    } catch (e) {
      toast('' + (e as Error).message);
    }
  }

  useEffect(() => {
    let alive = true;
    Promise.all([
      api.get<{ user: User }>(`/users/${userId}`),
      api.get<{ records: AttendanceRecord[] }>(`/attendance?userId=${userId}`).catch(() => ({ records: [] as AttendanceRecord[] })),
      api.get<{ leaves: LeaveItem[] }>('/leaves').catch(() => ({ leaves: [] as LeaveItem[] })),
      api.get<{ reports: EodReport[] }>(`/eod?userId=${userId}`).catch(() => ({ reports: [] as EodReport[] })),
    ])
      .then(([u, a, l, e]) => {
        if (!alive) return;
        setUser(u.user);
        setAtt(a.records || []);
        setLeaves((l.leaves || []).filter((x) => x.userId === userId));
        setEods(e.reports || []);
      })
      .catch((e) => toast('⚠️ ' + (e as Error).message));
    return () => {
      alive = false;
    };
  }, [userId, toast]);

  const now = new Date();
  const pad = (n: number): string => String(n).padStart(2, '0');
  const pieKey = month || `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  const pie = computePie(att, leaves, pieKey, now);
  const pieTotal = pie.present + pie.leave + pie.absent;
  const pct = (n: number): number => (pieTotal ? Math.round((n / pieTotal) * 100) : 0);
  const gradient = `conic-gradient(#22c55e 0 ${pct(pie.present)}%, #f59e0b ${pct(pie.present)}% ${
    pct(pie.present) + pct(pie.leave)
  }%, #ef4444 ${pct(pie.present) + pct(pie.leave)}% 100%)`;

  const rows = att
    .filter((r) => !month || r.date.startsWith(month))
    .sort((a, b) => b.date.localeCompare(a.date));
  const present = rows.filter((r) => r.punchIn);
  const totalM = present.reduce((x, r) => x + calcMins(r), 0);
  const approved = leaves.filter((l) => l.status === 'approved').length;
  const pending = leaves.filter((l) => l.status === 'pending').length;

  async function remove(): Promise<void> {
    if (!user) return;
    if (!window.confirm(`Remove ${user.name} (${user.id})?\nTheir attendance + leaves will also be deleted.`)) return;
    try {
      await api.del(`/users/${user.id}`);
      toast(`🗑️ ${user.name} removed`);
      onDeleted();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  if (!user) {
    return (
      <div className="modal-back" onClick={onClose}>
        <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
          <p>Loading…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal modal-wide" onClick={(e) => e.stopPropagation()}>
        <h3>
          {user.name} • {user.id}
        </h3>
        <div className="prof-grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))' }}>
          <ProfItem k="Designation" v={user.designation} />
          <ProfItem k="Department" v={user.dept} />
          <ProfItem k="Email" v={user.email} />
          <ProfItem k="Phone" v={user.phone} />
          <ProfItem k="Joined" v={user.join} />
          <ProfItem k="Birthday" v={fmtDateISO(user.birthday)} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(130px,1fr))', gap: 10, margin: '12px 0' }}>
          <ProfItem k="Days Present" v={String(present.length)} />
          <ProfItem k="Total Hours" v={fmtMins(totalM)} />
          <ProfItem k="Avg / Day" v={present.length ? fmtMins(totalM / present.length) : '—'} />
          <ProfItem k="Leaves" v={`${approved} approved • ${pending} pending`} />
        </div>
        <h4>
          <Icon name="pie" size={15} /> Attendance pie{' '}
          <span style={{ fontWeight: 400, fontSize: 12, color: '#8a7a6d' }}>({pie.key} • Mon–Sat)</span>
        </h4>
        <div style={{ marginBottom: 4 }}>
          {pieTotal === 0 ? (
            <p style={{ fontSize: 13, color: '#8a7a6d' }}>No working days yet in this period.</p>
          ) : (
            <div style={{ display: 'flex', gap: 18, alignItems: 'center', flexWrap: 'wrap' }}>
              <div className="donut" style={{ background: gradient }}>
                <span>{pct(pie.present)}%</span>
              </div>
              <div className="pie-leg">
                <div>
                  <span className="dot" style={{ background: '#22c55e' }} />
                  Present: <b>{pie.present}</b> ({pct(pie.present)}%)
                </div>
                <div>
                  <span className="dot" style={{ background: '#f59e0b' }} />
                  On leave: <b>{pie.leave}</b> ({pct(pie.leave)}%)
                </div>
                <div>
                  <span className="dot" style={{ background: '#ef4444' }} />
                  Absent: <b>{pie.absent}</b> ({pct(pie.absent)}%)
                </div>
              </div>
            </div>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'end', marginBottom: 6 }}>
          <div className="field" style={{ margin: 0, maxWidth: 200 }}>
            <label>Filter by month</label>
            <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
          </div>
          <button
            className="btn btn-ghost btn-small"
            style={{ color: '#0a1320', borderColor: '#ddd' }}
            onClick={() => setMonth('')}
          >
            Show all
          </button>
        </div>
        <h4><Icon name="calendar" size={15} /> Day-wise attendance (hours per day)</h4>
        <div className="field" style={{ background: '#faf6f2', border: '1px solid #eee', borderRadius: 12, padding: 12 }}>
          <label style={{ fontWeight: 800, fontSize: 13 }}>Add / fix a record (admin back-office)</label>
          <p className="sub" style={{ color: '#8a7a6d', fontSize: 12, margin: '2px 0 8px' }}>
            Recorded times load in locked — only missing times can be entered.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'end' }}>
            <div style={{ minWidth: 140 }}>
              <label style={{ fontSize: 12 }}>Date</label>
              <input type="date" value={fixDate} onChange={(e) => pickFixDate(e.target.value)} style={{ width: '100%', padding: 10, borderRadius: 10, border: '1.5px solid #e2d5c8' }} />
            </div>
            <div>
              <label style={{ fontSize: 12 }}>In (HH:MM){inLocked ? ' · recorded' : ''}</label>
              <input type="time" value={fixIn} disabled={inLocked} title={inLocked ? 'Already recorded — kept as is' : ''} onChange={(e) => setFixIn(e.target.value)} style={{ padding: 10, borderRadius: 10, border: '1.5px solid #e2d5c8', opacity: inLocked ? 0.6 : 1 }} />
            </div>
            <div>
              <label style={{ fontSize: 12 }}>Out (HH:MM){outLocked ? ' · recorded' : ''}</label>
              <input type="time" value={fixOut} disabled={outLocked} title={outLocked ? 'Already recorded — kept as is' : ''} onChange={(e) => setFixOut(e.target.value)} style={{ padding: 10, borderRadius: 10, border: '1.5px solid #e2d5c8', opacity: outLocked ? 0.6 : 1 }} />
            </div>
            <button className="btn btn-primary btn-small" onClick={() => void saveFix()}>
              Save record
            </button>
          </div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>In</th>
                <th>Out</th>
                <th>Hours</th>
                <th>Location</th>
                <th className="sticky-act">Action</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className={r.editedByAdmin ? 'row-edited' : ''}>
                  <td>{r.date}</td>
                  <td>{fmtTime24(r.punchIn)}</td>
                  <td>{fmtTime24(r.punchOut)}</td>
                  <td>
                    <b>{hours(r)}</b>{' '}
                    {r.editedByAdmin ? (
                      <span className="badge b-edited" title="Time set by admin">
                        edited
                      </span>
                    ) : null}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${shortLoc(r.punchInLoc)}`}>
                      {shortLoc(r.punchInLoc)}
                    </a>
                  </td>
                  <td className="sticky-act" style={{ whiteSpace: 'nowrap' }}>
                    <button className="btn btn-ghost btn-small" onClick={() => pickFixDate(r.date)}>
                      Edit
                    </button>{' '}
                    <button className="btn btn-red btn-small" onClick={() => void delRecord(r.id, r.date)}>
                      Delete
                    </button>
                  </td>
                </tr>
              ))}
              {!rows.length && (
                <tr>
                  <td colSpan={6}>No records in this period.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <h4><Icon name="doc" size={15} /> Leave log</h4>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Type / Dates</th>
                <th>Reason</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {leaves.map((l) => (
                <tr key={l.id}>
                  <td>
                    {l.type}
                    <br />
                    <span style={{ fontSize: 11, color: '#8a97a8' }}>
                      {l.from} → {l.to}
                    </span>
                  </td>
                  <td style={{ fontSize: 12, maxWidth: 200 }}>{l.reason}</td>
                  <td>
                    <span className={`badge b-${l.status}`}>{l.status}</span>
                  </td>
                </tr>
              ))}
              {!leaves.length && (
                <tr>
                  <td colSpan={3}>No leave requests.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <h4><Icon name="pencil" size={15} /> EOD Reports</h4>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {eods.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{r.content}</td>
                </tr>
              ))}
              {!eods.length && (
                <tr>
                  <td colSpan={2}>No EOD reports submitted.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <br />
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primary" style={{ flex: 1 }} onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-red"
            style={{ flex: 1, borderColor: '#ef4444', color: '#b91c1c' }}
            onClick={() => void remove()}
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
