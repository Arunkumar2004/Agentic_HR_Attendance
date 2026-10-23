import { useCallback, useEffect, useState } from 'react';
import { api, downloadFile } from '../api';
import { useSession, useToast } from '../store';
import { calcMins, fmtMins, fmtTime24, hours, monthKey, shortLoc, todayStr, weekRange } from '../time';
import type { AttendanceRecord, LeaveItem, User } from '../types';
import { AddLoginModal, EditEmployeeModal } from '../components/Modals';
import EmployeeDetailModal from '../components/EmployeeDetail';
import Agents from './Agents';
import HrAsk from './HrAsk';
import Settings from '../components/Settings';
import { Icon } from '../components/icons';
import { AdminFeedback, PoliciesPanel } from '../components/Workspace';

type Tab = 'over' | 'emp' | 'att' | 'leave' | 'agents' | 'hr' | 'pol' | 'fb' | 'settings';

export default function Admin(): React.JSX.Element {
  const { user } = useSession();
  const { toast } = useToast();
  const [tab, setTab] = useState<Tab>('over');
  const [users, setUsers] = useState<User[]>([]);
  const [att, setAtt] = useState<AttendanceRecord[]>([]);
  const [leaves, setLeaves] = useState<LeaveItem[]>([]);
  const [search, setSearch] = useState('');
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const [u, a, l] = await Promise.all([
      api.get<{ users: User[] }>('/users').catch(() => ({ users: [] as User[] })),
      api.get<{ records: AttendanceRecord[] }>('/attendance').catch(() => ({ records: [] as AttendanceRecord[] })),
      api.get<{ leaves: LeaveItem[] }>('/leaves').catch(() => ({ leaves: [] as LeaveItem[] })),
    ]);
    setUsers(u.users || []);
    setAtt(a.records || []);
    setLeaves(l.leaves || []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!user) return <p>Loading…</p>;
  const t = todayStr();
  const emps = users.filter((x) => x.role === 'employee');
  const pend = leaves.filter((l) => l.status === 'pending');

  const { from: wStart, to: wEnd } = weekRange();
  const mStart = monthKey() + '-01';
  const hrs = (id: string, from: string, to: string): number =>
    att.filter((r) => r.userId === id && r.punchIn && r.date >= from && r.date <= to).reduce((x, r) => x + calcMins(r), 0);

  const q = search.toLowerCase();
  const filtered = emps.filter(
    (u) => !q || (u.name + u.id + u.dept + (u.designation || '') + u.email + (u.phone || '')).toLowerCase().includes(q),
  );

  async function download(path: string, filename: string, label: string): Promise<void> {
    try {
      toast('⏳ Downloading ' + label + '...');
      await downloadFile(path, filename);
      toast('📥 ' + label + ' downloaded');
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  async function decideLeave(id: string, st: 'approved' | 'rejected'): Promise<void> {
    let note = '';
    if (st === 'rejected') {
      const n = window.prompt('Note for the employee (optional):');
      if (n === null) return;
      note = n;
    }
    try {
      await api.patch(`/leaves/${id}`, { status: st, note });
      toast(st === 'approved' ? '✅ Leave approved' : '❌ Leave rejected');
      await load();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  async function remove(id: string, name: string): Promise<void> {
    if (!window.confirm(`Remove ${name} (${id})?\nTheir attendance + leaves will also be deleted.`)) return;
    try {
      await api.del(`/users/${id}`);
      toast(`🗑️ ${name} removed`);
      await load();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  async function adminPunchOut(id: string, name: string): Promise<void> {
    if (!window.confirm(`Punch out ${name} (${id}) now?`)) return;
    try {
      const d = await api.post<{ message?: string }>('/attendance/admin-out', { userId: id });
      toast(d.message || 'Punched out');
      await load();
    } catch (e) {
      toast('' + (e as Error).message);
    }
  }

  const nav = (id: Tab, icon: string | null, label: React.ReactNode): React.JSX.Element => (
    <button key={id} className={`nav-btn${tab === id ? ' active' : ''}`} onClick={() => setTab(id)}>
      {icon && <Icon name={icon} size={15} />}{' '}{label}
    </button>
  );

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="profile-mini">
          <div className="avatar">A</div>
          <div>
            <strong>{user.name}</strong>
            <span>Administrator</span>
          </div>
        </div>
        {nav('over', 'home', 'Overview')}
        {nav('emp', 'users', 'All Employees')}
        {nav('att', 'list', 'Attendance Logs')}
        {nav(
          'leave',
          'doc',
          <>
            Leave Approvals <span className="badge b-pending" style={{ marginLeft: 6 }}>{pend.length}</span>
          </>,
        )}
        {nav('agents', 'cpu', 'Rules & Agents')}
        {nav('hr', 'spark', 'Ask HR')}
        {nav('pol', 'folder', 'Policies')}
        {nav('fb', 'chat', 'Feedback')}
        {nav('settings', 'sliders', 'Settings')}
      </aside>
      <div className="main">
        <div className="grid-stats">
          <div className="stat accent">
            <small>Total Employees</small>
            <h3>{emps.length}</h3>
            <p>Active workforce</p>
          </div>
          <div className="stat">
            <small>Present Today</small>
            <h3>{att.filter((a) => a.date === t && a.punchIn).length}</h3>
            <p>Punched in</p>
          </div>
          <div className="stat">
            <small>On Leave</small>
            <h3>{leaves.filter((l) => l.status === 'approved').length}</h3>
            <p>Approved & ongoing</p>
          </div>
          <div className="stat">
            <small>Pending Approvals</small>
            <h3>{pend.length}</h3>
            <p>Needs action</p>
          </div>
        </div>

        {tab === 'over' && (
          <div className="card">
            <div className="toolbar">
              <div>
                <h3>Today's Attendance — Everyone</h3>
                <p className="desc">Admin sees info of all employees.</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button
                  className="btn btn-ghost btn-small"
                  style={{ borderColor: '#ddd' }}
                  onClick={() => void download('/excel/today', 'Elan1 Attendance Today.xlsx', 'Today sheet')}
                >
                  <Icon name="sheet" size={14} /> Today's Sheet
                </button>
                <button
                  className="btn btn-ghost btn-small"
                  style={{ borderColor: '#ddd' }}
                  onClick={() => void download('/excel/download', 'Elan 1 Employee Attendance Track.xlsx', 'Full workbook')}
                >
                  <Icon name="download" size={14} /> Full Workbook
                </button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Punch In</th>
                    <th>Punch Out</th>
                    <th>Geotag</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {emps.map((e) => {
                    const r = att.find((a) => a.userId === e.id && a.date === t);
                    return (
                      <tr key={e.id}>
                        <td>
                          <b>{e.name}</b>
                          <br />
                          <span style={{ fontSize: 12, color: '#8a97a8' }}>
                            {e.id} • {e.designation || ''} • {e.dept}
                          </span>
                        </td>
                        <td>{r?.punchIn || '—'}</td>
                        <td>{r?.punchOut || '—'}</td>
                        <td style={{ fontSize: 12 }}>{r ? shortLoc(r.punchInLoc) : '—'}</td>
                        <td>
                          <span className={`badge ${r?.punchIn ? 'b-present' : 'b-absent'}`}>
                            {r?.punchIn ? (r.punchOut ? 'Done' : 'On duty') : 'Absent'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {!emps.length && (
                    <tr>
                      <td colSpan={5}>No employees</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'emp' && (
          <div className="card">
            <div className="toolbar">
              <div>
                <h3> All Employees</h3>
                <p className="desc">Search, view details, add / remove employees.</p>
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input className="search" placeholder="Search name / id / dept..." value={search} onChange={(e) => setSearch(e.target.value)} />
                <button className="btn btn-primary btn-small" onClick={() => setShowAdd(true)}>
                  <Icon name="plus" size={14} /> Add
                </button>
              </div>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Name</th>
                    <th>Designation</th>
                    <th>Dept</th>
                    <th>Hours W / M</th>
                    <th>Phone</th>
                    <th>Email</th>
                    <th className="sticky-act">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((e) => {
                    const w = hrs(e.id, wStart, wEnd);
                    const m = hrs(e.id, mStart, wEnd);
                    return (
                      <tr key={e.id}>
                        <td>{e.id}</td>
                        <td>
                          <button className="link-btn" title={`Open ${e.name}'s attendance chart`} onClick={() => setDetailId(e.id)}>
                            {e.name}
                          </button>
                        </td>
                        <td>{e.designation || '—'}</td>
                        <td>{e.dept}</td>
                        <td style={{ whiteSpace: 'nowrap' }} title={`Week: ${fmtMins(w)} • Month: ${fmtMins(m)}`}>
                          <b>{fmtMins(w)}</b> <span style={{ fontSize: 11, color: '#8a97a8' }}>W</span> /{' '}
                          <b>{fmtMins(m)}</b> <span style={{ fontSize: 11, color: '#8a97a8' }}>M</span>
                        </td>
                        <td style={{ fontSize: 12 }}>{e.phone || '—'}</td>
                        <td style={{ fontSize: 12 }}>{e.email}</td>
                        <td style={{ whiteSpace: 'nowrap' }} className="sticky-act">
                          <button className="btn btn-ghost btn-small" onClick={() => setDetailId(e.id)}>
                            View
                          </button>{' '}
                          <button className="btn btn-ghost btn-small" onClick={() => setEditUser(e)}>
                            Edit
                          </button>{' '}
                          <button className="btn btn-ghost btn-small" onClick={() => void adminPunchOut(e.id, e.name)} title="Punch out now (they forgot to check out)">
                            <Icon name="clock" size={13} /> Punch Out
                          </button>{' '}
                          <button className="btn btn-red btn-small" onClick={() => void remove(e.id, e.name)}>
                            Remove
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                  {!filtered.length && (
                    <tr>
                      <td colSpan={8}>No employees</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'att' && (
          <div className="card">
            <h3> Attendance Logs (All)</h3>
            <p className="desc">Complete geotagged punch history.</p>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Employee</th>
                    <th>In</th>
                    <th>Out</th>
                    <th>Hours</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {[...att].reverse().map((r) => (
                    <tr key={r.id} className={r.editedByAdmin ? 'row-edited' : ''}>
                      <td>{r.date}</td>
                      <td>{r.name}</td>
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
                          {shortLoc(r.punchInLoc)} →
                        </a>
                      </td>
                    </tr>
                  ))}
                  {!att.length && (
                    <tr>
                      <td colSpan={6}>No logs</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'leave' && (
          <div className="card">
            <h3> Leave Approvals</h3>
            <p className="desc">Approve or reject employee requests.</p>
            <div style={{ overflowX: 'auto' }}>
              <table>
                <thead>
                  <tr>
                    <th>Employee</th>
                    <th>Type</th>
                    <th>Dates</th>
                    <th>Reason</th>
                    <th>Status</th>
                    <th className="sticky-act">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {leaves.map((l) => (
                    <tr key={l.id}>
                      <td>
                        <b>{l.name}</b>
                      </td>
                      <td>{l.type}</td>
                      <td style={{ fontSize: 12 }}>
                        {l.from} → {l.to}
                      </td>
                      <td style={{ fontSize: 12, maxWidth: 200 }}>{l.reason}</td>
                      <td>
                        <span className={`badge b-${l.status}`}>{l.status}</span>
                      </td>
                      <td className="sticky-act" style={{ whiteSpace: 'nowrap' }}>
                        {l.status === 'pending' ? (
                          <>
                            <button className="btn btn-primary btn-small" onClick={() => void decideLeave(l.id, 'approved')}>
                              Approve
                            </button>{' '}
                            <button className="btn btn-red btn-small" onClick={() => void decideLeave(l.id, 'rejected')}>
                              Reject
                            </button>
                          </>
                        ) : (
                          '—'
                        )}
                      </td>
                    </tr>
                  ))}
                  {!leaves.length && (
                    <tr>
                      <td colSpan={6}>No requests</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {tab === 'agents' && <Agents onChanged={() => void load()} />}
        {tab === 'hr' && <HrAsk />}
        {tab === 'pol' && <PoliciesPanel isAdmin={true} />}
        {tab === 'fb' && <AdminFeedback />}
        {tab === 'settings' && <Settings onChanged={() => void load()} />}
      </div>

      {showAdd && <AddLoginModal onClose={() => setShowAdd(false)} onSaved={() => void load()} />}
      {editUser && <EditEmployeeModal user={editUser} onClose={() => setEditUser(null)} onSaved={() => void load()} />}
      {detailId && (
        <EmployeeDetailModal
          userId={detailId}
          onClose={() => setDetailId(null)}
          onDeleted={() => {
            setDetailId(null);
            void load();
          }}
        />
      )}
    </div>
  );
}
