import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Admins from './pages/Admins';
import BlockedWords from './pages/BlockedWords';
import AuditLog from './pages/AuditLog';
import Account from './pages/Account';
import DeleteAccount from './pages/DeleteAccount';
import Dashboard from './pages/Dashboard';
import DeletionRequests from './pages/DeletionRequests';

export default function App() {
  const { admin, ready, isFull } = useAuth();
  const { pathname } = useLocation();
  // Public page for app users: no admin login, no admin menus.
  if (pathname === '/delete-account') return <DeleteAccount />;
  if (pathname === '/delete-account/confirmed') return <DeleteAccount confirmed />;
  if (!ready) return <p className="center muted">Loading…</p>;
  if (!admin) return <Login />;
  // Content Editors only see their dashboard and the blocked-words list (backend enforces this too).
  const home = '/dashboard';
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to={home} replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        {isFull && <>
          <Route path="/users" element={<Users />} />
          <Route path="/deletion-requests" element={<DeletionRequests />} />
          <Route path="/users/:id" element={<UserDetail />} />
          <Route path="/admins" element={<Admins />} />
          <Route path="/audit-log" element={<AuditLog />} />
        </>}
        <Route path="/blocked-words" element={<BlockedWords />} />
        <Route path="/account" element={<Account />} />
        <Route path="*" element={<Navigate to={home} replace />} />
      </Route>
    </Routes>
  );
}
