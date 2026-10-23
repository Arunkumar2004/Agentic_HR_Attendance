import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../store';
import { Icon } from '../components/icons';

export interface CompanyRules {
  workStart: string;
  graceMins: number;
  checkoutBy: string;
  earlyMins: number;
  absentCheckTime: string;
  emailAlerts: number;
}

export interface StoredAlert {
  id: string;
  alertKey: string;
  kind: string;
  userId: string | null;
  text: string;
  created: number;
}

export interface AgentStatus {
  monitor: { running: boolean; every: string };
  notifications: { bell: boolean; email: boolean; emailReason?: string };
  hr: { connected: boolean; model: string | null };
}

const KIND_LABEL: Record<string, string> = {
  late: 'Late arrival',
  early: 'Early checkout',
  'missing-checkout': 'Missing checkout',
  absent: 'Absent',
  pattern: 'Pattern',
};

/** Admin → Rules & Agents: timings the Monitor/Notification agents obey, live status, alerts feed. */
export default function Agents({ onChanged }: { onChanged: () => void }): React.JSX.Element {
  const { toast } = useToast();
  const [rules, setRules] = useState<CompanyRules | null>(null);
  const [alerts, setAlerts] = useState<StoredAlert[]>([]);
  const [status, setStatus] = useState<AgentStatus | null>(null);

  const load = useCallback(async () => {
    const [r, a, s] = await Promise.all([
      api.get<{ rules: CompanyRules }>('/rules').catch(() => null),
      api.get<{ alerts: StoredAlert[] }>('/monitor/alerts?limit=30').catch(() => ({ alerts: [] as StoredAlert[] })),
      api.get<{ status: AgentStatus }>('/monitor/status').catch(() => null),
    ]);
    if (r) setRules(r.rules);
    setAlerts(a.alerts || []);
    if (s) setStatus(s.status);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(): Promise<void> {
    if (!rules) return;
    try {
      const d = await api.patch<{ rules: CompanyRules; message?: string }>('/rules', rules);
      setRules(d.rules);
      toast('✅ ' + (d.message || 'Rules saved'));
      onChanged();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  async function runNow(): Promise<void> {
    try {
      const d = await api.post<{ alerts: unknown[]; message?: string }>('/monitor/run');
      toast(d.message ? `🔍 ${d.message}` : '🔍 Checked');
      await load();
      onChanged();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  function set<K extends keyof CompanyRules>(k: K, v: CompanyRules[K]): void {
    if (rules) setRules({ ...rules, [k]: v });
  }

  return (
    <>
      <div className="card">
        <h3><Icon name="cpu" size={18} /> Agent Status</h3>
        <p className="desc">What each agent is doing right now.</p>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 10 }}>
          <div className="prof-item">
            <small>1 · Monitor Agent</small>
            <b>
              {status ? (
                status.monitor.running ? (
                  <><Icon name="check" size={14} /> Running ({status.monitor.every})</>
                ) : (
                  'Paused'
                )
              ) : (
                '…'
              )}
            </b>
          </div>
          <div className="prof-item">
            <small>2 · Notification Agent</small>
            <b>
              {status ? (
                <>
                  <Icon name="bell" size={14} /> Bell on • <Icon name="mail" size={14} /> Email{' '}
                  {status.notifications.email ? 'connected' : 'off — ' + (status.notifications.emailReason || 'no SMTP')}
                </>
              ) : (
                '…'
              )}
            </b>
          </div>
          <div className="prof-item">
            <small>3 · HR Assistant</small>
            <b>
              {status ? (
                status.hr.connected ? (
                  <><Icon name="check" size={14} /> AI connected ({status.hr.model})</>
                ) : (
                  <><Icon name="info" size={14} /> Rule answers only — no AI key</>
                )
              ) : (
                '…'
              )}
            </b>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="toolbar">
          <div>
            <h3><Icon name="sliders" size={18} /> Company Rules (notification timing)</h3>
            <p className="desc">Agents obey these timings. Times are IST, 24-hour.</p>
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-ghost btn-small" onClick={() => void runNow()}>
              <Icon name="search" size={14} /> Check now
            </button>
            <button className="btn btn-primary btn-small" onClick={() => void save()}>
              Save Rules
            </button>
          </div>
        </div>
        {!rules ? (
          <p>Loading…</p>
        ) : (
          <div className="grid-2" style={{ gap: 10 }}>
            <div className="field">
              <label>Work starts at</label>
              <input type="time" value={rules.workStart} onChange={(e) => set('workStart', e.target.value)} />
            </div>
            <div className="field">
              <label>Late grace (minutes)</label>
              <input type="number" min={0} max={600} value={rules.graceMins} onChange={(e) => set('graceMins', Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Checkout by</label>
              <input type="time" value={rules.checkoutBy} onChange={(e) => set('checkoutBy', e.target.value)} />
            </div>
            <div className="field">
              <label>Early-checkout margin (minutes)</label>
              <input type="number" min={0} max={600} value={rules.earlyMins} onChange={(e) => set('earlyMins', Number(e.target.value))} />
            </div>
            <div className="field">
              <label>Flag absent if no punch by (daily check)</label>
              <input type="time" value={rules.absentCheckTime} onChange={(e) => set('absentCheckTime', e.target.value)} />
            </div>
            <div className="field">
              <label>Alert channels</label>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="badge b-present"><Icon name="bell" size={12} /> Bell — always on</span>
                <button
                  className={`btn btn-small ${rules.emailAlerts ? 'btn-primary' : 'btn-ghost'}`}
                  onClick={() => set('emailAlerts', rules.emailAlerts ? 0 : 1)}
                  title="Also email admins on every alert (needs SMTP in BE/.env)"
                >
                  <Icon name="mail" size={14} /> Email {rules.emailAlerts ? 'ON' : 'OFF'}
                </button>
              </div>
              <p className="desc" style={{ margin: '6px 0 0' }}>
                Bell notifications always fire. Email needs SMTP set on the server — status shown above.
              </p>
            </div>
            <div className="field">
              <label>&nbsp;</label>
              <p className="desc" style={{ margin: 0 }}>
                Late/early fire right after each punch. Absence + missing checkouts run every 5 min and on “Check now”.
              </p>
            </div>
          </div>
        )}
      </div>

      <div className="card">
        <h3><Icon name="alert" size={18} /> Monitor Alerts Feed</h3>
        <p className="desc">Latest flags raised by the Monitor Agent (also sent to bell + email when configured).</p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Type</th>
                <th>Alert</th>
              </tr>
            </thead>
            <tbody>
              {alerts.map((a) => (
                <tr key={a.id}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(a.created).toLocaleString('en-IN')}</td>
                  <td>
                    <span className="badge b-info">{KIND_LABEL[a.kind] || a.kind}</span>
                  </td>
                  <td style={{ fontSize: 13 }} dangerouslySetInnerHTML={{ __html: a.text }} />
                </tr>
              ))}
              {!alerts.length && (
                <tr>
                  <td colSpan={3}>No alerts yet — all clear</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
