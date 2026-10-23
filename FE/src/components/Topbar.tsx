import { useSession, useTheme } from '../store';
import { Icon } from './icons';

export default function Topbar({ onOpenPw, onToggleNotifs }: { onOpenPw: () => void; onToggleNotifs: () => void }): React.JSX.Element {
  const { user, logout } = useSession();
  const { theme, toggle } = useTheme();
  const { notifs } = useSession();
  const unread = notifs.filter((n) => !n.read).length;

  return (
    <header className="topbar">
      <div className="brand">
        <h1>
          Elan<span>1</span>
          <small>Attendance App</small>
        </h1>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span id="topUser" style={{ fontSize: 13, color: '#9fb0c5', marginRight: 4 }}>
          {user ? `${user.name} • ${user.designation || user.role}` : ''}
        </span>
        <button className="btn btn-ghost btn-small" onClick={toggle} title="Switch dark / light mode">
          {theme === 'light' ? <Icon name="sun" size={15} /> : <Icon name="moon" size={15} />}
        </button>
        {user && (
          <button className="btn btn-ghost btn-small" onClick={onOpenPw}>
            <Icon name="key" size={14} /> Password
          </button>
        )}
        {user && (
          <button className="btn btn-ghost btn-small" onClick={onToggleNotifs} style={{ position: 'relative' }}>
            <Icon name="bell" size={14} /> <span className={`badge b-pending ${unread === 0 ? 'hidden' : ''}`} style={{ marginLeft: 4 }}>{unread}</span>
          </button>
        )}
        {user && (
          <button className="btn btn-ghost btn-small" onClick={logout}>
            <Icon name="logout" size={14} /> Logout
          </button>
        )}
      </div>
    </header>
  );
}
