import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useSession, useToast } from '../store';
import { calcMins, fmtDateISO, fmtMins, haversineM, hours, shortLoc, todayStr } from '../time';
import type { AttendanceRecord, GeoLoc, LeaveItem, OfficeInfo } from '../types';
import { Icon } from '../components/icons';
import { EodPanel, FeedbackPanel, PoliciesPanel } from '../components/Workspace';

const DEPTS = ['Engineering', 'Design', 'Sales', 'HR', 'Marketing', 'Support', 'General'];

type Tab = 'dash' | 'attend' | 'leave' | 'profile' | 'eod' | 'pol' | 'fb';

function capturePosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('no GPS'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 8000 });
  });
}

export default function Employee(): React.JSX.Element {
  const { user, setUser, notifs } = useSession();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('dash');
  const [att, setAtt] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveItem[]>([]);
  const [flags, setFlags] = useState<Record<string, number>>({});
  // Backend keys: eod / policies / feedback (default ON when unknown).
  const feat = (k: 'eod' | 'policies' | 'feedback'): boolean => (flags[k] ?? 1) === 1;
  const [office, setOffice] = useState<OfficeInfo | null>(null);
  const [geo, setGeo] = useState<GeoLoc | null>(null);
  const [geoMsg, setGeoMsg] = useState('Location: not captured yet. Click punch to allow GPS.');
  const [clock, setClock] = useState('');
  const [dateLine, setDateLine] = useState('');

  // hours filter
  const [hrsMode, setHrsMode] = useState('month');
  const [hrsFrom, setHrsFrom] = useState('');
  const [hrsTo, setHrsTo] = useState('');

  // leave form
  const [lvType, setLvType] = useState('Permission');
  const [lvFrom, setLvFrom] = useState('');
  const [lvTo, setLvTo] = useState('');
  const [lvReason, setLvReason] = useState('');

  // profile form
  const [myName, setMyName] = useState('');
  const [myPhone, setMyPhone] = useState('');
  const [myBirthday, setMyBirthday] = useState('');

  const load = useCallback(async () => {
    const [a, l, o, f] = await Promise.all([
      api.get<{ records: AttendanceRecord[] }>('/attendance').catch(() => ({ records: [] as AttendanceRecord[] })),
      api.get<{ leaves: LeaveItem[] }>('/leaves').catch(() => ({ leaves: [] as LeaveItem[] })),
      api.get<OfficeInfo>('/attendance/office').catch(() => null),
      api.get<{ flags: Record<string, number> }>('/settings/public').catch(() => ({ flags: {} as Record<string, number> })),
    ]);
    setAtt(a.records || []);
    setLeaves(l.leaves || []);
    if (o) setOffice(o);
    setFlags(f.flags || {});
  }, []);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (user) {
      setMyName(user.name || '');
      setMyPhone(user.phone && user.phone !== '—' ? user.phone : '');
      setMyBirthday(user.birthday || '');
    }
  }, [user]);

  useEffect(() => {
    const t = window.setInterval(() => {
      const d = new Date();
      setClock(d.toLocaleTimeString('en-IN', { hour12: true }));
      setDateLine(d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }));
    }, 1000);
    return () => window.clearInterval(t);
  }, []);

  if (!user) return <p>Loading…</p>;
  const t = todayStr();
  const rec = att.find((a) => a.date === t);
  const unread = notifs.filter((n) => !n.read).length;
  void unread;

  function fenceHint(loc: GeoLoc): { ok: boolean; text: string } | null {
    if (!office?.configured) return null;
    const d = haversineM(parseFloat(loc.lat), parseFloat(loc.lng), office.lat ?? 0, office.lng ?? 0);
    return d <= office.radiusM
      ? { ok: true, text: `Inside punch range (~${d}m from office)` }
      : { ok: false, text: `Outside range (~${d}m) — move within ${office.radiusM}m to punch` };
  }

  function Fence({ loc }: { loc: GeoLoc }): React.JSX.Element | null {
    const f = fenceHint(loc);
    if (!f) return null;
    return (
      <span>
        {' '}
        <span className="dot" style={{ background: f.ok ? '#22c55e' : '#ef4444' }} /> {f.text}
      </span>
    );
  }

  async function punch(type: 'in' | 'out'): Promise<void> {
    setGeoMsg('Fetching GPS location... allow permission.');
    let loc: GeoLoc;
    try {
      const p = await capturePosition();
      loc = {
        lat: p.coords.latitude.toFixed(6),
        lng: p.coords.longitude.toFixed(6),
        acc: Math.round(p.coords.accuracy) + 'm',
      };
    } catch {
      setGeo(null);
      setGeoMsg('GPS unavailable — punch needs live location. Please enable Location permission and try again.');
      toast('Enable GPS — punch needs your live location');
      return;
    }
    setGeo(loc);
    const f = fenceHint(loc);
    setGeoMsg(`${loc.lat}, ${loc.lng} • ±${loc.acc}${f ? ' • ' + f.text : ''}`);
    try {
      const d = await api.post<{ message?: string; workMins?: number; excel?: { updated?: boolean } }>('/attendance/punch', {
        type,
        location: loc,
      });
      if (type === 'in') toast(d.excel?.updated ? '🟢 Punched IN • Excel updated' : '🟢 Punched IN');
      else toast(`🔴 Punched OUT • Worked ${fmtMins(d.workMins || 0)}`);
      await load();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  async function applyLeave(): Promise<void> {
    if (!lvFrom || !lvTo || !lvReason.trim()) {
      toast('⚠️ Fill from, to & reason');
      return;
    }
    try {
      await api.post('/leaves', { type: lvType, from: lvFrom, to: lvTo, reason: lvReason.trim() });
      setLvReason('');
      toast('📨 Leave sent for admin approval');
      await load();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  async function saveInfo(): Promise<void> {
    const name = myName.trim();
    const phone = myPhone.trim();
    const birthday = myBirthday.trim();
    if (!name || name.length < 2) {
      toast('Enter your full name');
      return;
    }
    if (!phone) {
      toast('Enter your phone number');
      return;
    }
    if (birthday && !/^\d{4}-\d{2}-\d{2}$/.test(birthday)) {
      toast('Birthday must be a valid date');
      return;
    }
    try {
      const d = await api.patch<{ user: typeof user; excel?: { added?: boolean } }>('/users/me', { name, phone, birthday });
      if (d.user) setUser(d.user);
      toast('Details saved' + (d.excel?.added ? ' • added to Excel roster' : ''));
    } catch (e) {
      toast('' + (e as Error).message);
    }
  }

  // hours summary
  function rangeDates(): [string | null, string | null] {
    const today = new Date();
    const f = (d: Date): string => todayStr(d);
    if (hrsMode === 'week') {
      const d = new Date(today);
      d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
      return [f(d), todayStr()];
    }
    if (hrsMode === 'month') return [`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`, todayStr()];
    if (hrsMode === 'custom' && hrsFrom && hrsTo) return [hrsFrom, hrsTo];
    return [null, null];
  }
  const [rs, re] = rangeDates();
  const filt = att.filter((a) => (!rs || a.date >= rs) && (!re || a.date <= re));
  const totalM = filt.reduce((x, r) => x + calcMins(r), 0);
  const days = filt.filter((r) => r.punchIn).length;
  const incomplete = !user.phone || user.phone === '—';

  const nav = (id: Tab, icon: string, label: string): React.JSX.Element => (
    <button key={id} className={`nav-btn${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
      <Icon name={icon} size={15} /> {label}
    </button>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="profile-mini">
          <div className="avatar">{user.name[0]?.toUpperCase()}</div>
          <div>
            <strong>{user.name}</strong>
            <span>{user.designation || 'Employee'}</span>
          </div>
        </div>
        {nav('dash', 'grid', 'Dashboard')}
        {nav('attend', 'calendar', 'My Attendance')}
        {nav('leave', 'doc', 'Leaves')}
        {nav('profile', 'user', 'My Info')}
        {feat('eod') && nav('eod', 'pencil', 'EOD Report')}
        {feat('policies') && nav('pol', 'folder', 'Policies')}
        {feat('feedback') && nav('fb', 'chat', 'Feedback')}
      </aside>
      <div className="main">
        <div className="grid-stats">
          <div className="stat accent">
            <small>Today's Status</small>
            <h3>{rec ? (rec.punchOut ? 'Checked Out' : 'Present') : 'Absent'}</h3>
            <p>{rec ? `In: ${rec.punchIn || '—'} Out: ${rec.punchOut || '—'}` : 'Not punched in yet'}</p>
          </div>
          <div className="stat">
            <small>Present Days</small>
            <h3>{att.filter((a) => a.punchIn).length}</h3>
            <p>This month</p>
          </div>
          <div className="stat">
            <small>Leaves Taken</small>
            <h3>{leaves.filter((l) => l.status === 'approved').length}</h3>
            <p>Approved</p>
          </div>
          <div className="stat">
            <small>Pending Leaves</small>
            <h3>{leaves.filter((l) => l.status === 'pending').length}</h3>
            <p>Awaiting admin</p>
          </div>
        </div>

        {tab === 'dash' && (
          <>
            <div className="card">
              <h3> Punch In / Punch Out with Geotag</h3>
              <p className="desc">Your live GPS location is captured automatically for verification.</p>
              <div className="punch-box">
                <div className="clock">{clock || '--:--:--'}</div>
                <div className="date-line">{dateLine || '—'}</div>
                <div className="geo">
                  {geo ? (
                    <>
                      <Icon name="pin" size={14} /> <b>{geo.lat}, {geo.lng}</b> • ±{geo.acc}
                      <Fence loc={geo} />
                      <br />
                      <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${geo.lat},${geo.lng}`}>
                        View on Google Maps →
                      </a>
                    </>
                  ) : (
                    geoMsg
                  )}
                </div>
                <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
                  <button className="btn btn-primary" disabled={!!(rec && rec.punchIn)} onClick={() => void punch('in')}>
                    <span className="dot" style={{ background: '#22c55e' }} /> Punch In
                  </button>
                  <button className="btn btn-ghost" disabled={!(rec && rec.punchIn && !rec.punchOut)} onClick={() => void punch('out')}>
                    <span className="dot" style={{ background: '#ef4444' }} /> Punch Out
                  </button>
                </div>
              </div>
            </div>
            <div className="card">
              <h3>Recent activity</h3>
              <p className="desc">Your last 5 attendance records (only visible to you + admin).</p>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Punch In</th>
                      <th>Punch Out</th>
                      <th>Location</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {att.slice(0, 5).map((r) => (
                      <tr key={r.id}>
                        <td>{r.date}</td>
                        <td>{r.punchIn || '—'}</td>
                        <td>{r.punchOut || '—'}</td>
                        <td style={{ fontSize: 12 }}>
                          {shortLoc(r.punchInLoc)}
                          <br />
                          <a target="_blank" rel="noreferrer" href={`https://maps.google.com/?q=${shortLoc(r.punchInLoc)}`}>
                            map →
                          </a>
                        </td>
                        <td>
                          <span className={`badge ${r.punchIn ? 'b-present' : 'b-absent'}`}>
                            {r.punchIn ? (r.punchOut ? 'Done' : 'On duty') : 'Absent'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {!att.length && (
                      <tr>
                        <td colSpan={5}>No records yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === 'attend' && (
          <>
            <div className="card">
              <h3>Hours Summary</h3>
              <p className="desc">Total hours worked — customize by week, month or date range.</p>
              <div className="toolbar">
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select className="search" style={{ minWidth: 160 }} value={hrsMode} onChange={(e) => setHrsMode(e.target.value)}>
                    <option value="week">This Week</option>
                    <option value="month">This Month</option>
                    <option value="custom">Custom Range</option>
                    <option value="all">All Time</option>
                  </select>
                  {hrsMode === 'custom' && (
                    <>
                      <input type="date" className="search" style={{ minWidth: 150 }} value={hrsFrom} onChange={(e) => setHrsFrom(e.target.value)} />
                      <input type="date" className="search" style={{ minWidth: 150 }} value={hrsTo} onChange={(e) => setHrsTo(e.target.value)} />
                    </>
                  )}
                </div>
                <div>
                  <span className="badge b-info">{fmtMins(totalM)}</span>
                </div>
              </div>
              <div className="grid-stats" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 0 }}>
                <div className="stat">
                  <small>Total Hours</small>
                  <h3>{fmtMins(totalM)}</h3>
                  <p>{rs ? `${rs} → ${re} • ${filt.length} records` : `All time • ${filt.length} records`}</p>
                </div>
                <div className="stat">
                  <small>Days Worked</small>
                  <h3>{days}</h3>
                  <p>Punched days in range</p>
                </div>
                <div className="stat">
                  <small>Avg / Day</small>
                  <h3>{days ? fmtMins(totalM / days) : '—'}</h3>
                  <p>Average hours</p>
                </div>
              </div>
            </div>
            <div className="card">
              <h3> My Attendance History</h3>
              <p className="desc">Only your own records. Admin can see everyone's.</p>
              <div style={{ overflowX: 'auto' }}>
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>Punch In</th>
                      <th>Punch Out</th>
                      <th>Hours</th>
                      <th>Geotag</th>
                    </tr>
                  </thead>
                  <tbody>
                    {att.map((r) => (
                      <tr key={r.id}>
                        <td>{r.date}</td>
                        <td>{r.punchIn || '—'}</td>
                        <td>{r.punchOut || '—'}</td>
                        <td>
                          <b>{hours(r)}</b>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {shortLoc(r.punchInLoc)} → {shortLoc(r.punchOutLoc)}
                        </td>
                      </tr>
                    ))}
                    {!att.length && (
                      <tr>
                        <td colSpan={5}>No records</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </>
        )}

        {tab === 'leave' && (
          <div className="grid-2">
            <div className="card">
              <h3>Apply Leave</h3>
              <p className="desc">Request goes to admin for approval.</p>
              <div className="field">
                <label>Leave Type</label>
                <select value={lvType} onChange={(e) => setLvType(e.target.value)}>
                  <option>Permission</option>
                  <option>Sick</option>
                  <option>Unpaid</option>
                </select>
              </div>
              <div className="field">
                <label>From</label>
                <input type="date" value={lvFrom} onChange={(e) => setLvFrom(e.target.value)} />
              </div>
              <div className="field">
                <label>To</label>
                <input type="date" value={lvTo} onChange={(e) => setLvTo(e.target.value)} />
              </div>
              <div className="field">
                <label>Reason</label>
                <textarea rows={3} placeholder="Brief reason..." value={lvReason} onChange={(e) => setLvReason(e.target.value)} />
              </div>
              <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => void applyLeave()}>
                Submit Request
              </button>
            </div>
            <div className="card">
              <h3>My Leave Requests</h3>
              <p className="desc">Track approval status.</p>
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
                        <td style={{ fontSize: 12, maxWidth: 160 }}>
                          {l.reason}
                          {l.adminNote && (
                            <>
                              <br />
                              <i style={{ color: '#b9603f' }}>Admin: {l.adminNote}</i>
                            </>
                          )}
                        </td>
                        <td>
                          <span className={`badge b-${l.status}`}>{l.status}</span>
                        </td>
                      </tr>
                    ))}
                    {!leaves.length && (
                      <tr>
                        <td colSpan={3}>No leaves</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {tab === 'profile' && (
          <div className="card light">
            <div className="prof-head">
              <div className="prof-avatar">{user.name[0]?.toUpperCase()}</div>
              <div style={{ flex: 1 }}>
                <h2 style={{ fontSize: 24, marginBottom: 8 }}>{user.name}</h2>
                <span className="badge b-present">Active</span>
              </div>
              <div className="prof-id">
                ID
                <br />
                <b>{user.id}</b>
              </div>
            </div>
            <hr style={{ border: 0, borderTop: '1px solid #eee', margin: '16px 0' }} />
            <div className="prof-grid">
              <div className="prof-item"><small>Employee ID</small><b>{user.id}</b></div>
              <div className="prof-item"><small>Full Name</small><b>{user.name}</b></div>
              <div className="prof-item"><small>Designation</small><b>{user.designation || 'Employee'}</b></div>
              <div className="prof-item"><small>Department</small><b>{user.dept}</b></div>
              <div className="prof-item"><small>Email</small><b>{user.email}</b></div>
              <div className="prof-item"><small>Phone</small><b>{user.phone}</b></div>
              <div className="prof-item"><small>Date of Joining</small><b>{user.join}</b></div>
              <div className="prof-item"><small>Birthday</small><b>{fmtDateISO(user.birthday)}</b></div>
              <div className="prof-item"><small>Employment Status</small><b>Full-time • Active</b></div>
            </div>
            <hr style={{ border: 0, borderTop: '1px solid #eee', margin: '16px 0' }} />
            <h3 style={{ fontSize: 16, marginBottom: 4 }}>
              <Icon name="pencil" size={15} /> My Details{' '}
              <span style={{ fontWeight: 400, fontSize: 12, color: '#8a7a6d' }}>(fill and save — visible to admin)</span>
            </h3>
            {incomplete && (
              <p className="sub" style={{ color: '#b45309', fontSize: 13, marginBottom: 10 }}>
                <Icon name="info" size={14} /> Your profile is incomplete — please fill it below.
              </p>
            )}
            <div className="field">
              <label>Full Name *</label>
              <input placeholder="e.g. Sneha Rao" value={myName} onChange={(e) => setMyName(e.target.value)} />
            </div>
            <div className="field">
              <label>Phone Number *</label>
              <input placeholder="+91 ..." value={myPhone} onChange={(e) => setMyPhone(e.target.value)} />
            </div>
            <div className="field">
              <label>Birthday</label>
              <input type="date" value={myBirthday} max={todayStr()} onChange={(e) => setMyBirthday(e.target.value)} />
            </div>
            <p className="sub" style={{ color: '#8a7a6d', fontSize: 12, marginBottom: 10 }}>
              Designation & department are set by admin.
            </p>
            <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => void saveInfo()}>
              Save My Details
            </button>
          </div>
        )}

        {tab === 'eod' && feat('eod') && <EodPanel />}
        {tab === 'pol' && feat('policies') && <PoliciesPanel isAdmin={false} />}
        {tab === 'fb' && feat('feedback') && <FeedbackPanel />}
      </div>
    </div>
  );
}
