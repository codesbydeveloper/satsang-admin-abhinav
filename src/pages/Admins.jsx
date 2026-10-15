import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { useAuth } from '../auth';
import { Err, fmt, useAction } from '../components/ui';

export default function Admins() {
  const { admin: me } = useAuth();
  const [list, setList] = useState([]);
  const [f, setF] = useState({ email: '', name: '', role: 'content_editor', temporaryPassword: '' });
  const { busy, error, run } = useAction();
  const load = () => run(async () => setList((await adminApi.admins()).admins));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const create = (e) => { e.preventDefault(); run(async () => {
    await adminApi.createAdmin({ ...f, email: f.email.trim(), name: f.name.trim() });
    setF({ email: '', name: '', role: 'content_editor', temporaryPassword: '' }); await load();
  }); };
  const patch = (a, body) => run(async () => { await adminApi.updateAdmin(a.id, body); await load(); });
  const reset2fa = (a) => { if (window.confirm(`Reset two-factor for ${a.email}? They will set up a new authenticator at next login.`)) run(async () => { await adminApi.resetAdmin2fa(a.id); await load(); }); };
  const resetPw = (a) => { const pw = window.prompt(`New temporary password for ${a.email} (12+ characters):`); if (pw) run(async () => { await adminApi.resetAdminPassword(a.id, pw); await load(); }); };

  return (
    <>
      <h2>Admins</h2>
      <Err error={error} />
      <table>
        <thead><tr><th>Name / email</th><th>Role</th><th>2FA</th><th>Last login</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          {list.map((a) => (
            <tr key={a.id} className={a.isActive ? '' : 'off'}>
              <td>{a.name || '—'}<div className="muted">{a.email}</div></td>
              <td>
                <select value={a.role} disabled={busy || a.id === me.id} onChange={(e) => patch(a, { role: e.target.value })} aria-label={`Role for ${a.email}`}>
                  <option value="full_admin">Full Admin</option><option value="content_editor">Content Editor</option>
                </select>
              </td>
              <td>{a.totpEnabled ? 'On' : 'Not set up'}</td>
              <td>{fmt(a.lastLoginAt)}</td>
              <td>{a.isActive ? 'Active' : 'Deactivated'}</td>
              <td className="actions">
                {a.id !== me.id && <button className="link" onClick={() => patch(a, { isActive: !a.isActive })}>{a.isActive ? 'Deactivate' : 'Activate'}</button>}
                <button className="link" onClick={() => reset2fa(a)}>Reset 2FA</button>
                <button className="link" onClick={() => resetPw(a)}>Reset password</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <h3>Add an admin</h3>
      <form onSubmit={create} className="narrow">
        <label>Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></label>
        <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} /></label>
        <label>Role
          <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
            <option value="content_editor">Content Editor (content + blocked words)</option>
            <option value="full_admin">Full Admin (everything)</option>
          </select>
        </label>
        <label>Temporary password (12+ characters)<input type="password" value={f.temporaryPassword} onChange={(e) => setF({ ...f, temporaryPassword: e.target.value })} minLength={12} maxLength={72} required /></label>
        <button disabled={busy}>Create admin</button>
        <p className="muted">Share the temporary password through a safe channel. They set up their authenticator app at first login.</p>
      </form>
    </>
  );
}
