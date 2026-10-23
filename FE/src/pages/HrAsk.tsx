import { useState } from 'react';
import { api } from '../api';
import { useToast } from '../store';
import { Icon } from '../components/icons';

interface Msg {
  from: 'you' | 'hr';
  text: string;
  mode?: string;
}

/** Admin → Ask HR: natural-language questions over live attendance data. */
export default function HrAsk(): React.JSX.Element {
  const { toast } = useToast();
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);

  const suggestions = ['Who was absent this week?', 'Late arrivals this week?', 'Month summary', 'Pending leaves?'];

  async function ask(text: string): Promise<void> {
    const question = text.trim();
    if (!question || busy) return;
    setBusy(true);
    setMsgs((m) => [...m, { from: 'you', text: question }]);
    setQ('');
    try {
      const d = await api.post<{ answer: string; mode: string }>('/hr/ask', { question });
      setMsgs((m) => [...m, { from: 'hr', text: d.answer, mode: d.mode }]);
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card">
      <h3><Icon name="spark" size={18} /> Ask HR Assistant</h3>
      <p className="desc">Ask in plain English about attendance. AI answers when connected, else honest rule-based answers.</p>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        {suggestions.map((s) => (
          <button key={s} className="btn btn-ghost btn-small" onClick={() => void ask(s)}>
            {s}
          </button>
        ))}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 10, maxHeight: 380, overflowY: 'auto' }}>
        {!msgs.length && <p className="desc">No questions yet — try a suggestion above.</p>}
        {msgs.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.from === 'you' ? 'flex-end' : 'flex-start',
              background: m.from === 'you' ? 'var(--terra)' : 'rgba(255,255,255,.06)',
              border: '1px solid var(--line)',
              color: m.from === 'you' ? '#fff' : undefined,
              borderRadius: 12,
              padding: '10px 14px',
              maxWidth: '85%',
              fontSize: 13,
              whiteSpace: 'pre-wrap',
              lineHeight: 1.6,
            }}
          >
            {m.text}
            {m.from === 'hr' && m.mode && (
              <div style={{ fontSize: 11, opacity: 0.7, marginTop: 4 }}>
                {m.mode === 'ai' ? 'AI answer' : m.mode === 'fallback' ? 'Rule-based answer' : 'AI not connected'}
              </div>
            )}
          </div>
        ))}
        {busy && <p className="desc">Thinking…</p>}
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        <input
          className="search"
          style={{ flex: 1 }}
          placeholder="e.g. Who was absent this week?"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && void ask(q)}
        />
        <button className="btn btn-primary" disabled={busy} onClick={() => void ask(q)}>
          Ask
        </button>
      </div>
    </div>
  );
}
