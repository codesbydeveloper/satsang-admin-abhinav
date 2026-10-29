import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { useAuth } from '../auth';
import { EmptyRow, Err, fmt, PageHead, timeAgo, useAction } from '../components/ui';
import { Icon } from '../components/icons';
import { initials } from '../components/Layout';

const EMPTY = { email: '', name: '', role: 'content_editor', temporaryPassword: '' };

export default function Admins() {
  const { admin: me } = useAuth();
  const [list, setList] = useState(null);
  const [f, setF] = useState(EMPTY);
  const [created, setCreated] = useState('');
  const { busy, error, run } = useAction();
  const load = () => run(async () => setList((await adminApi.admins()).admins));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  const create = (e) => { e.preventDefault(); setCreated(''); run(async () => {
    await adminApi.createAdmin({ ...f, email: f.email.trim(), name: f.name.trim() });
    setCreated(f.email.trim()); setF(EMPTY); await load();
  }); };
  const patch = (a, body) => run(async () => { await adminApi.updateAdmin(a.id, body); await load(); });
  const toggle = (a) => { if (!a.isActive || window.confirm(`Deactivate ${a.email}? They will be signed out and cannot log in.`)) patch(a, { isActive: !a.isActive }); };
  const reset2fa = (a) => { if (window.confirm(`Reset two-factor for ${a.email}? They will set up a new authenticator at next login.`)) run(async () => { await adminApi.resetAdmin2fa(a.id); await load(); }); };
  const resetPw = (a) => { const pw = window.prompt(`New temporary password for ${a.email} (12+ characters):`); if (pw) run(async () => { await adminApi.resetAdminPassword(a.id, pw); await load(); }); };

  return (
    <div className="page">
      <PageHead title="Admins" subtitle="People who can sign in to this panel. Full Admins see everything; Content Editors see content and blocked words only." />
      <Err error={error} />
      <div className="card flush">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Admin</th><th>Role</th><th>Two-factor</th><th>Last login</th><th>Status</th><th className="right">Actions</th></tr></thead>
            <tbody>
              {!list && <EmptyRow cols={6} icon="shield">Loading admins…</EmptyRow>}
              {list && list.map((a) => (
                <tr key={a.id} className={a.isActive ? '' : 'off'}>
                  <td>
                    <div className="user-cell">
                      <span className="avatar" aria-hidden="true">{initials(a.name || a.email)}</span>
                      <div><div className="cell-main">{a.name || '—'}{a.id === me.id && <span className="tag">you</span>}</div><div className="cell-sub">{a.email}</div></div>
                    </div>
                  </td>
                  <td>
                    <select value={a.role} disabled={busy || a.id === me.id} onChange={(e) => patch(a, { role: e.target.value })} aria-label={`Role for ${a.email}`}>
                      <option value="full_admin">Full Admin</option><option value="content_editor">Content Editor</option>
                    </select>
                  </td>
                  <td>{a.totpEnabled ? <span className="pill ok dot-ok">On</span> : <span className="pill warn">Not set up</span>}</td>
                  <td title={fmt(a.lastLoginAt)}>{a.lastLoginAt ? timeAgo(a.lastLoginAt) : <span className="muted">Never</span>}</td>
                  <td>{a.isActive ? <span className="pill ok dot-ok">Active</span> : <span className="pill muted dot-off">Deactivated</span>}</td>
                  <td className="actions">
                    {a.id !== me.id && <button className={`link${a.isActive ? ' danger' : ''}`} onClick={() => toggle(a)}>{a.isActive ? 'Deactivate' : 'Activate'}</button>}
                    <button className="link" onClick={() => reset2fa(a)}>Reset 2FA</button>
                    <button className="link" onClick={() => resetPw(a)}>Reset password</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" id="add-admin">
        <div className="card-head"><div><h3>Add an admin</h3><p className="muted">They sign in with the temporary password, then set up their authenticator app.</p></div></div>
        <form onSubmit={create}>
          <div className="form-grid">
            <label>Email<input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} placeholder="name@example.org" required /></label>
            <label>Name<input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={100} placeholder="Full name" /></label>
            <label>Role
              <select value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
                <option value="content_editor">Content Editor (content + blocked words)</option>
                <option value="full_admin">Full Admin (everything)</option>
              </select>
            </label>
            <label>Temporary password<input type="password" value={f.temporaryPassword} onChange={(e) => setF({ ...f, temporaryPassword: e.target.value })} minLength={12} maxLength={72} required />
              <span className="hint">At least 12 characters. Share it through a safe channel.</span></label>
          </div>
          <div className="form-foot">
            <button disabled={busy}><Icon name="plus" size={16} />Create admin</button>
            {created && <span className="pill ok"><Icon name="check" size={13} />{created} added</span>}
          </div>
        </form>
      </div>
    </div>
  );
}
