import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth';

export default function Layout() {
  const { admin, isFull, signOut } = useAuth();
  const link = ({ isActive }) => (isActive ? 'active' : undefined);
  return (
    <div className="shell">
      <aside>
        <h1>Satsang Spark<small>Admin Panel</small></h1>
        <nav>
          {isFull && <NavLink to="/users" className={link}>Users</NavLink>}
          <NavLink to="/blocked-words" className={link}>Blocked words</NavLink>
          {isFull && <NavLink to="/admins" className={link}>Admins</NavLink>}
          {isFull && <NavLink to="/audit-log" className={link}>Audit log</NavLink>}
          <NavLink to="/account" className={link}>My account</NavLink>
        </nav>
        <div className="who">
          <div>{admin.name || admin.email}</div>
          <div className="muted">{isFull ? 'Full Admin' : 'Content Editor'}</div>
          <button className="link" onClick={signOut}>Log out</button>
        </div>
      </aside>
      <main><Outlet /></main>
    </div>
  );
}
