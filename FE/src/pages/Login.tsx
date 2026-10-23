import { useState } from 'react';
import { useSession, useToast } from '../store';
import { Icon } from '../components/icons';
import type { Role, User } from '../types';

export default function Login({ onLoggedIn }: { onLoggedIn: (u: User) => void }): React.JSX.Element {
  const { login } = useSession();
  const { toast } = useToast();
  const [role, setRole] = useState<Role>('employee');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [forgotOpen, setForgotOpen] = useState(false);

  async function submit(): Promise<void> {
    const em = email.trim().toLowerCase();
    if (!em || !password.trim()) {
      toast('⚠️ Enter email & password');
      return;
    }
    try {
      const u = await login(em, password.trim(), role);
      toast(`✅ Welcome, ${u.name}!`);
      onLoggedIn(u);
    } catch (e) {
      toast('❌ ' + (e as Error).message);
    }
  }

  return (
    <section id="loginView">
      <div className="login-wrap">
        <div className="hero">
          <span className="pill">Elan1 • Workforce</span>
          <h2>
            Attendance made <em>simple</em>, accurate & geotagged.
          </h2>
          <p>
            Punch in / out with live GPS location, track your history, apply for leave and get admin approval — all in
            one place. Admins get full visibility of every employee.
          </p>
          <div className="feat">
            <div>
              <b>Geotagged Punch</b>
              <br />
              GPS lat/long captured on every punch.
            </div>
            <div>
              <b>Role-wise Access</b>
              <br />
              Admin sees all • Employee sees only self.
            </div>
            <div>
              <b>Leave Workflow</b>
              <br />
              Apply → Pending → Approved / Rejected.
            </div>
            <div>
              <b>Live Dashboard</b>
              <br />
              Present, absent, leaves at a glance.
            </div>
          </div>
        </div>
        <div className="login-card">
          <h3>Welcome back </h3>
          <p className="sub">Login to your Elan1 account</p>
          <div className="tabs">
            <button className={role === 'employee' ? 'active' : ''} onClick={() => setRole('employee')}>
              Employee Login
            </button>
            <button className={role === 'admin' ? 'active' : ''} onClick={() => setRole('admin')}>
              Admin Login
            </button>
          </div>
          <div className="field">
            <label>Email</label>
            <input type="email" placeholder="e.g. rahul@elan1.com" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="field">
            <label>Password</label>
            <input
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void submit()}
            />
          </div>
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => void submit()}>
            Login →
          </button>
          <p style={{ textAlign: 'center', marginTop: 10, fontSize: 13 }}>
            <button
              className="link-btn"
              style={{ color: 'var(--terra-dark)' }}
              onClick={() => setForgotOpen(true)}
            >
              Forgot password?
            </button>
          </p>
        </div>
      </div>
      {forgotOpen && <ForgotModal email={email} onClose={() => setForgotOpen(false)} />}
    </section>
  );
}

function ForgotModal({ email: prefill, onClose }: { email: string; onClose: () => void }): React.JSX.Element {
  const { toast } = useToast();
  const [email, setEmail] = useState(prefill);

  async function submit(): Promise<void> {
    const em = email.trim().toLowerCase();
    if (!em || !em.includes('@')) {
      toast('⚠️ Enter your email');
      return;
    }
    try {
      // Public endpoint — note: no SITE gate on this copy, app login only.
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: em }),
      });
      const d = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status);
      toast('✅ ' + (d.message || 'Admin has been notified.'));
      onClose();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          <Icon name="key" size={18} /> Forgot Password?
        </h3>
        <p className="sub" style={{ color: '#6b7686', fontSize: 13, marginBottom: 12 }}>
          Enter your login email — the admin will be notified and will set a temporary password for you.
        </p>
        <div className="field">
          <label>Email</label>
          <input type="email" placeholder="you@elan1.ai" value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
          <button className="btn btn-ghost btn-small" style={{ flex: 1, color: '#0a1320', borderColor: '#ddd' }} onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary btn-small" style={{ flex: 2 }} onClick={() => void submit()}>
            Notify Admin
          </button>
        </div>
      </div>
    </div>
  );
}
