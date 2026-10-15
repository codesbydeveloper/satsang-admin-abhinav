import { Navigate, Route, Routes } from 'react-router-dom';
import { useAuth } from './auth';
import Layout from './components/Layout';
import Login from './pages/Login';
import Users from './pages/Users';
import UserDetail from './pages/UserDetail';
import Admins from './pages/Admins';
import BlockedWords from './pages/BlockedWords';
import AuditLog from './pages/AuditLog';
import Account from './pages/Account';

export default function App() {
  const { admin, ready, isFull } = useAuth();
  if (!ready) return <p className="center muted">Loading…</p>;
  if (!admin) return <Login />;
  // Content Editors only see the blocked-words list (backend enforces this too).
  const home = isFull ? '/users' : '/blocked-words';
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Navigate to={home} replace />} />
        {isFull && <>
          <Route path="/users" element={<Users />} />
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
