import { useCallback, useEffect, useState } from 'react';
import { api, downloadFile, getToken } from '../api';
import { useToast } from '../store';
import { Icon } from './icons';
import type { EodReport, FeedbackItem, Policy } from '../types';

// ---------- Company policy library (admin uploads, everyone reads) ----------
export function PoliciesPanel({ isAdmin, refreshKey }: { isAdmin: boolean; refreshKey?: number }): React.JSX.Element {
  const { toast } = useToast();
  const [list, setList] = useState<Policy[]>([]);
  const [title, setTitle] = useState('');
  const [file, setFile] = useState<File | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ policies: Policy[] }>('/policies');
      setList(d.policies || []);
    } catch {
      setList([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  async function upload(): Promise<void> {
    if (!title.trim()) {
      toast('⚠️ Give the policy a title');
      return;
    }
    if (!file) {
      toast('⚠️ Choose a file (PDF / Word / Excel / text / image, max 10 MB)');
      return;
    }
    try {
      const fd = new FormData();
      fd.append('title', title.trim());
      fd.append('file', file);
      const res = await fetch('/api/policies', {
        method: 'POST',
        headers: { Authorization: 'Bearer ' + getToken() },
        body: fd,
      });
      const d = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) throw new Error(d.error || 'HTTP ' + res.status);
      toast('✅ ' + (d.message || 'Published'));
      setTitle('');
      setFile(null);
      await load();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  async function download(p: Policy): Promise<void> {
    try {
      await downloadFile(`/policies/${p.id}/download`, p.filename);
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  async function remove(id: string, t: string): Promise<void> {
    if (!window.confirm(`Delete policy "${t}"?`)) return;
    try {
      await api.del(`/policies/${id}`);
      toast('🗑️ Policy removed');
      await load();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  const kb = (n: number | null): string => (n == null ? '' : n > 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

  return (
    <div className="card">
      <h3><Icon name="folder" size={18} /> Company Policies</h3>
      <p className="desc">{isAdmin ? 'Upload once — every employee can read.' : 'Company rules shared by admin.'}</p>
      {isAdmin && (
        <div className="grid-2" style={{ gap: 10, marginBottom: 12 }}>
          <div className="field" style={{ margin: 0 }}>
            <label>Policy title *</label>
            <input placeholder="e.g. Leave Policy 2026" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field" style={{ margin: 0 }}>
            <label>File (PDF/Word/Excel/text/image, 10 MB) *</label>
            <input type="file" onChange={(e) => setFile(e.target.files?.[0] || null)} />
          </div>
          <div>
            <button className="btn btn-primary btn-small" onClick={() => void upload()}>
              Upload & Publish
            </button>
          </div>
        </div>
      )}
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Title</th>
              <th>File</th>
              <th>Published</th>
              <th className="sticky-act">Action</th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id}>
                <td>
                  <b>{p.title}</b>
                </td>
                <td style={{ fontSize: 12 }}>
                  {p.filename} {p.size != null && <span style={{ color: '#8a97a8' }}>({kb(p.size)})</span>}
                </td>
                <td style={{ fontSize: 12 }}>{new Date(p.created).toLocaleDateString('en-IN')}</td>
                <td style={{ whiteSpace: 'nowrap' }} className="sticky-act">
                  <button className="btn btn-ghost btn-small" onClick={() => void download(p)}>
                    Open
                  </button>{' '}
                  {isAdmin && (
                    <button className="btn btn-red btn-small" onClick={() => void remove(p.id, p.title)}>
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={4}>No policies published yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------- EOD report (employee writes today's report) ----------
export function EodPanel(): React.JSX.Element {
  const { toast } = useToast();
  const [text, setText] = useState('');
  const [history, setHistory] = useState<EodReport[]>([]);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ reports: EodReport[] }>('/eod');
      setHistory(d.reports || []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function save(): Promise<void> {
    if (text.trim().length < 3) {
      toast('⚠️ Write a few words about your day');
      return;
    }
    try {
      const d = await api.post<{ message?: string }>('/eod', { content: text.trim() });
      toast('✅ ' + (d.message || 'Saved'));
      setText('');
      await load();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  return (
    <>
      <div className="card">
        <h3><Icon name="pencil" size={18} /> Today's EOD Report</h3>
        <p className="desc">What did you finish today? Admin reads this every evening. Saving again updates today's report.</p>
        <div className="field">
          <label>Today's work</label>
          <textarea rows={5} placeholder="e.g. Finished homepage banner, fixed login bug, called 3 clients…" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => void save()}>
          Save EOD Report
        </button>
      </div>
      <div className="card">
        <h3>My Past Reports</h3>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Report</th>
              </tr>
            </thead>
            <tbody>
              {history.map((r) => (
                <tr key={r.id}>
                  <td style={{ whiteSpace: 'nowrap' }}>{r.date}</td>
                  <td style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{r.content}</td>
                </tr>
              ))}
              {!history.length && (
                <tr>
                  <td colSpan={2}>No reports yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------- Feedback to admin (direct = named, indirect = anonymous) ----------
export function FeedbackPanel(): React.JSX.Element {
  const { toast } = useToast();
  const [mode, setMode] = useState<'direct' | 'indirect'>('direct');
  const [text, setText] = useState('');
  const [mine, setMine] = useState<FeedbackItem[]>([]);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ feedback: FeedbackItem[] }>('/feedback/mine');
      setMine(d.feedback || []);
    } catch {
      setMine([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(): Promise<void> {
    if (text.trim().length < 3) {
      toast('⚠️ Write your feedback first');
      return;
    }
    try {
      const d = await api.post<{ message?: string }>('/feedback', { mode, text: text.trim() });
      toast('✅ ' + (d.message || 'Sent'));
      setText('');
      await load();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  return (
    <>
      <div className="card">
        <h3><Icon name="chat" size={18} /> Feedback to Admin</h3>
        <p className="desc">Suggestion, complaint or praise — choose how you send it.</p>
        <div className="tabs">
          <button className={mode === 'direct' ? 'active' : ''} onClick={() => setMode('direct')}>
            Direct (admin sees my name)
          </button>
          <button className={mode === 'indirect' ? 'active' : ''} onClick={() => setMode('indirect')}>
            Indirect (anonymous)
          </button>
        </div>
        {mode === 'indirect' && (
          <p className="desc" style={{ color: '#b45309' }}>
            Anonymous mode — admin will NOT know who sent this. It cannot be traced back to you.
          </p>
        )}
        <div className="field">
          <label>Your feedback</label>
          <textarea rows={4} placeholder="Write honestly…" value={text} onChange={(e) => setText(e.target.value)} />
        </div>
        <button className="btn btn-primary" style={{ width: '100%' }} onClick={() => void send()}>
          Send {mode === 'direct' ? 'Directly' : 'Anonymously'}
        </button>
      </div>
      <div className="card">
        <h3>My Direct Feedback</h3>
        <p className="desc">Anonymous ones are never listed (not even for you).</p>
        <div style={{ overflowX: 'auto' }}>
          <table>
            <thead>
              <tr>
                <th>Sent</th>
                <th>Feedback</th>
              </tr>
            </thead>
            <tbody>
              {mine.map((f) => (
                <tr key={f.id}>
                  <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(f.created).toLocaleDateString('en-IN')}</td>
                  <td style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{f.text}</td>
                </tr>
              ))}
              {!mine.length && (
                <tr>
                  <td colSpan={2}>No direct feedback sent.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

// ---------- Admin inbox: all feedback (direct named, indirect anonymous) ----------
export function AdminFeedback(): React.JSX.Element {
  const [list, setList] = useState<FeedbackItem[]>([]);

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ feedback: FeedbackItem[] }>('/feedback');
      setList(d.feedback || []);
    } catch {
      setList([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="card">
      <div className="toolbar">
        <div>
          <h3><Icon name="chat" size={18} /> Employee Feedback</h3>
          <p className="desc">Direct shows the name • Indirect stays anonymous (sender hidden).</p>
        </div>
        <button className="btn btn-ghost btn-small" onClick={() => void load()}>
          Refresh
        </button>
      </div>
      <div style={{ overflowX: 'auto' }}>
        <table>
          <thead>
            <tr>
              <th>Received</th>
              <th>From</th>
              <th>Feedback</th>
            </tr>
          </thead>
          <tbody>
            {list.map((f) => (
              <tr key={f.id}>
                <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{new Date(f.created).toLocaleString('en-IN')}</td>
                <td>
                  {f.mode === 'direct' ? (
                    <b>{f.name}</b>
                  ) : (
                    <span className="badge b-info"><Icon name="shield" size={12} /> Anonymous</span>
                  )}
                  <br />
                  <span style={{ fontSize: 11, color: '#8a97a8' }}>{f.mode}</span>
                </td>
                <td style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{f.text}</td>
              </tr>
            ))}
            {!list.length && (
              <tr>
                <td colSpan={3}>No feedback yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
