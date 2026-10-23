import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import { useToast } from '../store';
import { Icon } from './icons';

interface FeatureMeta {
  key: string;
  label: string;
  desc: string;
}

/** Admin → Settings: ON/OFF kill-switches for modules. OFF hides tabs and blocks APIs. */
export default function Settings({ onChanged }: { onChanged: () => void }): React.JSX.Element {
  const { toast } = useToast();
  const [meta, setMeta] = useState<FeatureMeta[]>([]);
  const [flags, setFlags] = useState<Record<string, number>>({});

  const load = useCallback(async () => {
    try {
      const d = await api.get<{ features: FeatureMeta[]; flags: Record<string, number> }>('/settings/features');
      setMeta(d.features || []);
      setFlags(d.flags || {});
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function flip(key: string, label: string): Promise<void> {
    const to = flags[key] ? 0 : 1;
    if (!to && !window.confirm(`Turn OFF "${label}"?\nEmployees will lose this section immediately.`)) return;
    try {
      const d = await api.patch<{ flags: Record<string, number>; message?: string }>('/settings/features', {
        key,
        enabled: !!to,
      });
      setFlags(d.flags || {});
      toast(`✅ ${label} ${to ? 'enabled' : 'disabled'}`);
      onChanged();
    } catch (e) {
      toast('⚠️ ' + (e as Error).message);
    }
  }

  return (
    <div className="card">
      <h3>
        <Icon name="sliders" size={18} /> Feature Settings
      </h3>
      <p className="desc">Switch modules on/off for everyone. OFF hides the section and blocks its use.</p>
      {!meta.length && <p>Loading…</p>}
      {meta.map((f) => {
        const on = !!flags[f.key];
        return (
          <div
            key={f.key}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              padding: '12px 0',
              borderBottom: '1px solid rgba(255,255,255,.07)',
            }}
          >
            <div>
              <b>{f.label}</b>
              <p className="desc" style={{ margin: '2px 0 0' }}>
                {f.desc}
              </p>
            </div>
            <button
              role="switch"
              aria-checked={on}
              onClick={() => void flip(f.key, f.label)}
              style={{
                minWidth: 64,
                borderRadius: 100,
                border: '1px solid var(--line)',
                padding: '6px 12px',
                fontWeight: 800,
                cursor: 'pointer',
                background: on ? 'var(--terra)' : 'transparent',
                color: on ? '#fff' : undefined,
              }}
            >
              {on ? 'ON' : 'OFF'}
            </button>
          </div>
        );
      })}
    </div>
  );
}
