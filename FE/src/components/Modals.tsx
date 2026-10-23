import { useState } from 'react';
import { api } from '../api';
import { useSession, useToast } from '../store';
import { Icon } from './icons';
import type { User } from '../types';

function Modal({ children, wide, onBackdrop }: { children: React.ReactNode; wide?: boolean; onBackdrop?: () => void }): React.JSX.Element {
  return (
    <div className="modal-back" onClick={onBackdrop}>
      <div className={`modal${wide ? ' modal-wide' : ''}`} onClick={(e) => e.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function Buttons({ onCancel, onSubmit, submitLabel }: { onCancel?: () => void; onSubmit: () => void; submitLabel: string }): React.JSX.Element {
  return (
    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
      {onCancel && (
        <button className="btn btn-ghost btn-small" style={{ flex: 1, color: '#0a1320', borderColor: '#ddd' }} onClick={onCancel}>
          Cancel
        </button>
      )}
      <button className="btn btn-primary btn-small" style={{ flex: 2 }} onClick={onSubmit}>
        {submitLabel}
      </button>
    </div>
  );
}

// ---------- Change password (forced on first login with temp password) ----------
export function ChangePasswordModal({ forced, onClose }: { forced: boolean; onClose: (changed: boolean) => void }): React.JSX.Element {
  const { toast } = useToast();
  const { setUser } = useSession();
  const [cur, setCur] = useState('');
  const [nw, setNw] = useState('');
  const [nw2, setNw2] = useState('');

  async function submit(): Promise<void> {
    if (!cur || !nw || !nw2) {
      toast('Fill all three fields');
      return;
    }
    if (nw.length < 6) {
      toast('New password must be at least 6 characters');
      return;
    }
    if (nw !== nw2) {
      toast('New passwords do not match');
      return;
    }
    try {
      const d = await api.patch<{ message?: string; token?: string; user?: User }>('/auth/change-password', { current: cur, next: nw });
      // Server rotated our session: store the fresh token so we stay logged in.
      if (d.token && d.user) {
        localStorage.setItem('elan1_token', d.token);
        localStorage.setItem('elan1_user', JSON.stringify(d.user));
        setUser(d.user);
      }
      toast(d.message || 'Password changed');
      onClose(true);
    } catch (e) {
      toast('' + (e as Error).message);
    }
  }

  return (
    <Modal onBackdrop={forced ? undefined : () => onClose(false)}>
      <h3><Icon name="key" size={18} /> Change Password</h3>
      {forced && (
        <p className="sub" style={{ color: '#b45309', fontSize: 13, marginBottom: 12 }}>
          You are using a temporary password — please set your own to continue.
        </p>
      )}
      <div className="field">
        <label>Current Password</label>
        <input type="password" placeholder="••••••••" value={cur} onChange={(e) => setCur(e.target.value)} />
      </div>
      <div className="field">
        <label>New Password (min 6 characters)</label>
        <input type="password" placeholder="••••••••" value={nw} onChange={(e) => setNw(e.target.value)} />
      </div>
      <div className="field">
        <label>Confirm New Password</label>
        <input type="password" placeholder="••••••••" value={nw2} onChange={(e) => setNw2(e.target.value)} />
      </div>
      <Buttons onCancel={forced ? undefined : () => onClose(false)} onSubmit={() => void submit()} submitLabel="Save Password" />
    </Modal>
  );
}

// ---------- Admin creates a login (email + temp password only) ----------
export function AddLoginModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }): React.JSX.Element {
  const { toast } = useToast();
  const [email, setEmail] = useState('');
  const [pass, setPass] = useState('');

  async function submit(): Promise<void> {
    const em = email.trim().toLowerCase();
    if (!em || !em.includes('@')) {
      toast('⚠️ Enter a valid email');
      return;
    }
    try {
      const d = await api.post<{ message?: string }>('/users', { email: em, password: pass.trim() || undefined });
      toast(`✅ ${d.message || em + ' added'}`);
      onClose();
      onSaved();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  return (
    <Modal onBackdrop={onClose}>
      <h3><Icon name="plus" size={18} /> Add Employee Login</h3>
      <p className="sub" style={{ color: '#6b7686', fontSize: 13, marginBottom: 12 }}>
        Only email + temporary password. The employee fills name, phone & designation themselves (blank password ={' '}
        <b>emp123</b>).
      </p>
      <div className="field">
        <label>Email *</label>
        <input type="email" placeholder="name@elan1.com" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div className="field">
        <label>Temporary Password</label>
        <input placeholder="min 6 chars, blank = emp123" value={pass} onChange={(e) => setPass(e.target.value)} />
      </div>
      <Buttons onCancel={onClose} onSubmit={() => void submit()} submitLabel="Create Login" />
    </Modal>
  );
}

// ---------- Admin edits employee (designation / department live here) ----------
const DEPTS = ['Engineering', 'Design', 'Sales', 'HR', 'Marketing', 'Support', 'General'];

export function EditEmployeeModal({
  user,
  onClose,
  onSaved,
}: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}): React.JSX.Element {
  const { toast } = useToast();
  const [name, setName] = useState(user.name || '');
  const [phone, setPhone] = useState(user.phone && user.phone !== '—' ? user.phone : '');
  const [desig, setDesig] = useState(user.designation && user.designation !== 'Employee' ? user.designation : '');
  const [dept, setDept] = useState(user.dept || 'General');
  const [tempPass, setTempPass] = useState('');
  const [birthday, setBirthday] = useState(user.birthday || '');

  async function submit(): Promise<void> {
    const body: Record<string, string> = {};
    if (name.trim()) body.name = name.trim();
    body.phone = phone.trim();
    if (desig.trim()) body.designation = desig.trim();
    if (dept) body.dept = dept;
    if (tempPass.trim()) body.password = tempPass.trim();
    if (birthday) body.birthday = birthday;
    try {
      const d = await api.patch<{ message?: string }>(`/users/${user.id}`, body);
      toast('✅ ' + (d.message || 'Employee updated'));
      onClose();
      onSaved();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  return (
    <Modal onBackdrop={onClose}>
      <h3><Icon name="pencil" size={18} /> Edit Employee</h3>
      <p className="sub" style={{ color: '#6b7686', fontSize: 13, marginBottom: 12 }}>
        {user.name} • {user.id} — designation & department (admin only).
      </p>
      <div className="field">
        <label>Full Name</label>
        <input placeholder="e.g. Sneha Rao" value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label>Phone Number</label>
        <input placeholder="+91 ..." value={phone} onChange={(e) => setPhone(e.target.value)} />
      </div>
      <div className="field">
        <label>Birthday</label>
        <input type="date" value={birthday} onChange={(e) => setBirthday(e.target.value)} />
      </div>
      <div className="grid-2" style={{ gap: 10 }}>
        <div className="field">
          <label>Designation *</label>
          <input placeholder="e.g. Frontend Developer" value={desig} onChange={(e) => setDesig(e.target.value)} />
        </div>
        <div className="field">
          <label>Department</label>
          <select value={dept} onChange={(e) => setDept(e.target.value)}>
            {DEPTS.map((d) => (
              <option key={d}>{d}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="field">
        <label>Reset Password (temporary — employee must change on login)</label>
        <input placeholder="blank = keep current (min 6 chars)" value={tempPass} onChange={(e) => setTempPass(e.target.value)} />
      </div>
      <Buttons onCancel={onClose} onSubmit={() => void submit()} submitLabel="Save" />
    </Modal>
  );
}

// ---------- Private notifications, grouped by category ----------
interface Category {
  key: string;
  label: string;
}

const CATEGORIES: (Category & { icon: string })[] = [
  { key: 'leave', label: 'Leaves', icon: 'send' },
  { key: 'monitor', label: 'Attendance Monitor', icon: 'alert' },
  { key: 'birthday', label: 'Birthdays', icon: 'gift' },
  { key: 'feedback', label: 'Feedback', icon: 'chat' },
  { key: 'password', label: 'Password', icon: 'key' },
  { key: 'eod', label: 'EOD Reports', icon: 'pencil' },
  { key: 'other', label: 'Other', icon: 'info' },
];

function notifCategory(n: { kind?: string; text: string }): string {
  const k = (n.kind || '').toLowerCase();
  if (k === 'leave') return 'leave';
  if (k === 'birthday') return 'birthday';
  if (k === 'feedback') return 'feedback';
  if (k === 'password') return 'password';
  if (k === 'eod') return 'eod';
  if (k === 'late' || k === 'early' || k === 'missing-checkout' || k === 'absent' || k === 'pattern') return 'monitor';
  // Fallback for older rows saved before categories existed:
  const t = n.text || '';
  if (/birthday/i.test(t)) return 'birthday';
  if (/📨|✅|❌|leave/i.test(t)) return 'leave';
  if (/⏰|🚫|❓|📈|🏃|late|absent|checkout|pattern/i.test(t)) return 'monitor';
  if (/💬|feedback|anonymous/i.test(t)) return 'feedback';
  if (/🔑|password|reset/i.test(t)) return 'password';
  if (/📝|EOD|report/i.test(t)) return 'eod';
  return 'other';
}

export function NotificationsModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const { notifs, markAllRead } = useSession();
  const { toast } = useToast();
  const [filter, setFilter] = useState<string>('all');

  async function allRead(): Promise<void> {
    try {
      await markAllRead();
      toast('✅ All notifications marked read');
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  const countFor = (key: string): { total: number; unread: number } => {
    const items = key === 'all' ? notifs : notifs.filter((n) => notifCategory(n) === key);
    return { total: items.length, unread: items.filter((n) => !n.read).length };
  };
  const shown = CATEGORIES.filter((c) => filter === 'all' || c.key === filter);

  return (
    <Modal onBackdrop={onClose}>
      <h3><Icon name="bell" size={18} /> My Notifications</h3>
      <p className="sub" style={{ color: '#6b7686', fontSize: 13, marginBottom: 10 }}>
        Private — only you can see these. Tap a type to filter.
      </p>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 8, marginBottom: 4 }}>
        {[{ key: 'all', label: 'All' }, ...CATEGORIES].map((c) => {
          const { total, unread } = countFor(c.key);
          const active = filter === c.key;
          return (
            <button
              key={c.key}
              onClick={() => setFilter(c.key)}
              className={`btn btn-small ${active ? 'btn-primary' : 'btn-ghost'}`}
              style={active ? { whiteSpace: 'nowrap' } : { whiteSpace: 'nowrap', color: '#0a1320', borderColor: '#ddd' }}
            >
              {c.key === 'all' ? 'All' : (<><Icon name={'icon' in c ? (c.icon as string) : 'info'} size={13} /> {c.label}</>)} ({total}{unread ? ` • ${unread} new` : ''})
            </button>
          );
        })}
      </div>
      <div>
        {shown.map((c) => {
          const items = notifs.filter((n) => notifCategory(n) === c.key);
          if (!items.length) return null;
          const unread = items.filter((n) => !n.read).length;
          return (
            <div key={c.key} style={{ marginBottom: 12 }}>
              <h4 style={{ margin: '10px 0 6px', fontSize: 14 }}>
                <Icon name={c.icon} size={14} /> {c.label} <span style={{ fontWeight: 400, fontSize: 12, color: '#8a7a6d' }}>({items.length}{unread ? ` • ${unread} new` : ''})</span>
              </h4>
              {items.map((x) => (
                <div key={x.id} className={`notif-item ${x.read ? '' : 'notif-unread'}`}>
                  <span dangerouslySetInnerHTML={{ __html: x.text }} />
                  <small>
                    {x.time || ''}
                    {x.read ? ' • read' : ' • new'}
                  </small>
                </div>
              ))}
            </div>
          );
        })}
        {!notifs.length && <p style={{ color: '#6b7686', fontSize: 13 }}>No notifications yet.</p>}
        {filter !== 'all' && !notifs.filter((n) => notifCategory(n) === filter).length && (
          <p style={{ color: '#6b7686', fontSize: 13 }}>Nothing in this category.</p>
        )}
      </div>
      <br />
      <div style={{ display: 'flex', gap: 8 }}>
        <button className="btn btn-primary btn-small" style={{ flex: 1 }} onClick={() => void allRead()}>
          Mark all read
        </button>
        <button
          className="btn btn-ghost btn-small"
          style={{ flex: 1, color: '#0a1320', borderColor: '#ddd' }}
          onClick={onClose}
        >
          Close
        </button>
      </div>
    </Modal>
  );
}
