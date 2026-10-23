import { useState } from 'react';
import { SessionProvider, ToastProvider, ThemeProvider, useSession } from './store';
import Topbar from './components/Topbar';
import { ChangePasswordModal, NotificationsModal } from './components/Modals';
import Login from './pages/Login';
import Employee from './pages/Employee';
import Admin from './pages/Admin';
import type { User } from './types';

function Shell(): React.JSX.Element {
  const { user, setUser } = useSession();
  const [forcePw, setForcePw] = useState(false);
  const [pwOpen, setPwOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);

  function handleLoggedIn(u: User): void {
    if (u.mustChangePass) {
      setForcePw(true);
      setPwOpen(true);
    }
  }

  function handlePwClose(changed: boolean): void {
    if (changed && user) {
      setUser({ ...user, mustChangePass: 0 });
      setForcePw(false);
      setPwOpen(false);
    } else if (!forcePw) {
      setPwOpen(false);
    }
  }

  return (
    <>
      <Topbar onOpenPw={() => setPwOpen(true)} onToggleNotifs={() => setNotifOpen((v) => !v)} />
      <div className="container">
        {!user && <Login onLoggedIn={handleLoggedIn} />}
        {user && user.role === 'employee' && <Employee key={user.id} />}
        {user && user.role === 'admin' && <Admin key={user.id} />}
      </div>
      {pwOpen && user && <ChangePasswordModal forced={forcePw} onClose={handlePwClose} />}
      {notifOpen && user && <NotificationsModal onClose={() => setNotifOpen(false)} />}
      <div className="footer">Elan1 Attendance • React + TypeScript • Backend + Excel storage</div>
    </>
  );
}

export default function App(): React.JSX.Element {
  return (
    <ToastProvider>
      <ThemeProvider>
        <SessionProvider>
          <Shell />
        </SessionProvider>
      </ThemeProvider>
    </ToastProvider>
  );
}
