import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '../auth';
import { getPendingCount, onPendingCount } from '../api/deletionRequests';
import { useOnTabReturn } from './ui';
import { Icon, Logo } from './icons';

const TITLES = [
  ['/dashboard', 'Dashboard'], ['/users', 'Users'], ['/deletion-requests', 'Deletion requests'], ['/blocked-words', 'Blocked words'],
  ['/admins', 'Admins'], ['/audit-log', 'Audit log'], ['/account', 'My account'],
];
export const initials = (s = '') => s.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('') || '?';

export default function Layout() {
  const { admin, isFull, signOut } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);   // close the mobile drawer after navigating
  const pending = usePendingDeletions(isFull);

  const link = ({ isActive }) => (isActive ? 'active' : undefined);
  const item = (to, icon, label, badge) => <NavLink to={to} className={link}><Icon name={icon} />{label}{badge}</NavLink>;
  const title = TITLES.find(([p]) => pathname.startsWith(p))?.[1] || 'Admin';
  const isDetail = /^\/users\/.+/.test(pathname);
  const role = isFull ? 'Full Admin' : 'Content Editor';

  return (
    <div className={`shell${open ? ' nav-open' : ''}`}>
      <aside className="sidebar" id="sidebar">
        <div className="brand"><Logo /><div>Satsang Spark<small>Admin Panel</small></div></div>
        <nav aria-label="Main">
          {item('/dashboard', 'dashboard', 'Dashboard')}
          {isFull && <>
            <div className="nav-label">People</div>
            {item('/users', 'users', 'Users')}
            {item('/deletion-requests', 'trash', 'Deletion requests', pending > 0 && <>
              <span className="nav-badge" aria-hidden="true">{pending}</span><span className="sr-only">, {pending} pending</span>
            </>)}
          </>}
          <div className="nav-label">Safety</div>
          {item('/blocked-words', 'ban', 'Blocked words')}
          {isFull && <>
            <div className="nav-label">Administration</div>
            {item('/admins', 'shield', 'Admins')}
            {item('/audit-log', 'list', 'Audit log')}
          </>}
          <div className="nav-label">You</div>
          {item('/account', 'user', 'My account')}
        </nav>
        <div className="side-foot">Version 1 · Milestone 1</div>
      </aside>
      <div className="scrim" onClick={() => setOpen(false)} />

      <div className="main">
        <header className="topbar">
          <button type="button" className="menu-btn" aria-label={open ? 'Close menu' : 'Open menu'} aria-expanded={open} aria-controls="sidebar" onClick={() => setOpen(!open)}>
            <Icon name={open ? 'close' : 'menu'} />
          </button>
          <div className="crumb">
            <span>Admin</span><span aria-hidden="true">/</span><b>{title}</b>
            {isDetail && <><span aria-hidden="true">/</span><b>Account</b></>}
          </div>
          <div className="top-right">
            <div className="who">
              <div className="who-text">
                <div className="who-name">{admin.name || admin.email}</div>
                <div className="role-pill">{role}</div>
              </div>
              <span className="avatar" aria-hidden="true">{initials(admin.name || admin.email)}</span>
            </div>
            <button type="button" className="btn-secondary" onClick={signOut}><Icon name="logout" size={16} />Log out</button>
          </div>
        </header>
        <main className="content"><Outlet /></main>
      </div>
    </div>
  );
}

// Pending deletion requests for the sidebar badge (Full Admins only). Loads on start and when the admin
// returns to the tab; the Deletion Requests page also pushes counts.pending after each of its loads.
function usePendingDeletions(enabled) {
  const [count, setCount] = useState(0);
  const live = useRef(true);
  const load = () => { if (enabled) getPendingCount().then((n) => { if (live.current) setCount(n); }).catch(() => { /* the badge is optional */ }); };
  useEffect(() => {
    live.current = true;
    if (!enabled) return undefined;
    load();
    const off = onPendingCount(setCount);
    return () => { live.current = false; off(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);
  useOnTabReturn(load);
  return count;
}
