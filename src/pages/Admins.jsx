import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { useAuth } from '../auth';
import { EmptyRow, Err, fmt, isEmail, Modal, PageHead, timeAgo, toDate, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { initials } from '../components/Layout';
import DevicesList from '../components/DevicesList';

// Full Admin only (the route and menu are hidden for Content Editors; the backend answers 403 too).
// New admins are invited by email: they choose their own password on /accept-invite. Nobody types a password for them.

export const ROLE_LABEL = { full_admin: 'Full Admin', content_editor: 'Content Editor' };
const otherRole = (r) => (r === 'full_admin' ? 'content_editor' : 'full_admin');
// Older backends sent only isActive; treat that as active / inactive.
const statusOf = (a) => a.status || (a.isActive ? 'active' : 'inactive');
// 409 FULL_ADMIN_LIMIT: show the server's message (it names the limit); a fallback only if it sent none.
const limitError = (e) => (e?.code === 'FULL_ADMIN_LIMIT' && /^Request failed/.test(e.message)
  ? new Error('The Full Admin limit is reached. Make someone a Content Editor or deactivate a Full Admin first.') : e);
const when = (d) => toDate(d).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' });

export function StatusBadge({ admin, now = Date.now() }) {
  const s = statusOf(admin);
  if (s === 'active') return <span className="pill ok dot-ok">Active</span>;
  if (s === 'inactive') return <span className="pill muted dot-off">Inactive</span>;
  if (!admin.inviteExpiresAt) return <span className="pill warn">Invited</span>;
  const expired = toDate(admin.inviteExpiresAt).getTime() <= now;
  return <span className={`pill ${expired ? 'err' : 'warn'}`} title={fmt(admin.inviteExpiresAt)}>
    {expired ? 'Invite expired' : 'Invited'} – {expired ? 'expired' : 'expires'} {when(admin.inviteExpiresAt)}
  </span>;
}

export default function Admins() {
  const { admin: me } = useAuth();
  const [list, setList] = useState(null);
  const [error, setError] = useState(null);
  const [busyId, setBusyId] = useState(null);
  const [inviting, setInviting] = useState(false);
  const [confirm, setConfirm] = useState(null);   // { kind: 'cancel' | 'role' | 'deactivate', admin }
  const [devicesOf, setDevicesOf] = useState(null);   // admin whose trusted devices are open
  const [limit, setLimit] = useState(null);           // { max, used } Full Admins (active + invited)
  const toast = useToast();

  const load = async () => {
    try { const r = await adminApi.admins(); setList(r.admins); setLimit(r.fullAdminLimit || null); } catch (e) { setError(e); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  // Runs one row action; the server's message (e.g. LAST_FULL_ADMIN) is shown as is.
  const act = async (a, fn, done) => {
    setBusyId(a.id); setError(null);
    try { await fn(); toast.show(done); await load(); return true; } catch (e) { setError(limitError(e)); return false; } finally { setBusyId(null); }
  };
  const resend = (a) => act(a, () => adminApi.resendInvite(a.id), `New invite sent to ${a.email}`);
  const reactivate = (a) => act(a, () => adminApi.updateAdmin(a.id, { active: true }), `${a.email} can log in again`);
  const resetPw = (a) => {
    const pw = window.prompt(`Emergency only: new password for ${a.email} (12+ characters). They will be logged out.`);
    if (pw) act(a, () => adminApi.resetAdminPassword(a.id, pw), `Password reset for ${a.email}`);
  };

  return (
    <div className="page">
      <PageHead title="Admins" subtitle="People who can sign in to this panel. Full Admins see everything; Content Editors see content and blocked words only.">
        {limit && <span className={`pill ${limit.used >= limit.max ? 'warn' : 'muted'}`} data-testid="full-admin-limit"
          title="Active and invited Full Admins count; deactivated ones do not.">Full Admins: {limit.used}/{limit.max}</span>}
        <button type="button" onClick={() => setInviting(true)}><Icon name="plus" size={16} />Add admin</button>
      </PageHead>
      <Err error={error} />
      <div className="card flush">
        <div className="table-scroll">
          <table>
            <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th><th className="right">Actions</th></tr></thead>
            <tbody>
              {!list && <EmptyRow cols={6} icon="shield">Loading admins…</EmptyRow>}
              {list && list.map((a) => {
                const s = statusOf(a); const self = a.id === me.id; const busy = busyId === a.id;
                return (
                  <tr key={a.id} className={s === 'inactive' ? 'off' : ''} data-testid={`admin-${a.id}`}>
                    <td>
                      <div className="user-cell">
                        <span className="avatar" aria-hidden="true">{initials(a.name || a.email)}</span>
                        <div className="cell-main">{a.name || '—'}{self && <span className="tag">you</span>}</div>
                      </div>
                    </td>
                    <td>{a.email}</td>
                    <td><span className={`pill ${a.role === 'full_admin' ? 'brand' : 'muted'}`}>{ROLE_LABEL[a.role] || a.role}</span></td>
                    <td><StatusBadge admin={a} /></td>
                    <td title={fmt(a.lastLoginAt)}>{a.lastLoginAt ? timeAgo(a.lastLoginAt) : <span className="muted">Never</span>}</td>
                    <td className="actions">
                      {s === 'invited' && <>
                        <button className="link" disabled={busy} onClick={() => resend(a)}>Resend invite</button>
                        <button className="link danger" disabled={busy} onClick={() => setConfirm({ kind: 'cancel', admin: a })}>Cancel invite</button>
                      </>}
                      {s === 'active' && !self && <>
                        <button className="link" disabled={busy} onClick={() => setConfirm({ kind: 'role', admin: a })}>Change role</button>
                        <button className="link danger" disabled={busy} onClick={() => setConfirm({ kind: 'deactivate', admin: a })}>Deactivate</button>
                      </>}
                      {s === 'inactive' && <button className="link" disabled={busy} onClick={() => reactivate(a)}>Reactivate</button>}
                      {s !== 'invited' && !self && <button className="link" disabled={busy} onClick={() => resetPw(a)}>Reset password</button>}
                      {s !== 'invited' && !self && <button className="link" disabled={busy} onClick={() => setDevicesOf(a)}>Devices</button>}
                      {self && <span className="muted" title="You can't change your own role or deactivate yourself.">Your account</span>}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {inviting && <InviteModal onClose={() => setInviting(false)} onSent={(email) => { setInviting(false); toast.show(`Invite sent to ${email}`); load(); }} />}
      {confirm && <ConfirmModal {...confirm} onClose={() => setConfirm(null)} onDone={(msg) => { setConfirm(null); toast.show(msg); load(); }} />}
      {devicesOf && (
        <Modal title={`Trusted devices – ${devicesOf.name || devicesOf.email}`} onClose={() => setDevicesOf(null)}>
          <DevicesList load={() => adminApi.adminDevices(devicesOf.id)} remove={(id) => adminApi.removeAdminDevice(devicesOf.id, id)}
            onRemoved={() => toast.show(`Device removed for ${devicesOf.email}`)} />
          <div className="modal-foot"><button type="button" className="btn-secondary" onClick={() => setDevicesOf(null)}>Close</button></div>
        </Modal>
      )}
      {toast.element}
    </div>
  );
}

function InviteModal({ onClose, onSent }) {
  const [f, setF] = useState({ name: '', email: '', role: 'content_editor' });
  const [emailError, setEmailError] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { setF((x) => ({ ...x, [k]: e.target.value })); if (k === 'email') setEmailError(''); };
  const valid = f.name.trim() && isEmail(f.email);

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setError(null);
    const email = f.email.trim();
    try {
      await adminApi.createAdmin({ name: f.name.trim(), email, role: f.role });
      onSent(email);
    } catch (err) {
      setBusy(false);
      if (err.code === 'ADMIN_EXISTS') setEmailError('An admin with this email already exists.');
      else if (err.code === 'EMAIL_FAILED') setError(new Error("We couldn't send the invite email. Nothing was saved. Please try again."));
      else setError(limitError(err));
    }
  };

  return (
    <Modal title="Add admin" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label>Name<input value={f.name} onChange={set('name')} maxLength={100} placeholder="Full name" required /></label>
        <label>Email
          <input type="email" value={f.email} onChange={set('email')} placeholder="name@example.org" autoComplete="off" required aria-invalid={!!emailError} aria-describedby={emailError ? 'invite-email-err' : undefined} />
          {emailError && <span className="field-error" id="invite-email-err">{emailError}</span>}
        </label>
        <label>Role
          <select value={f.role} onChange={set('role')}>
            <option value="content_editor">Content Editor (content + blocked words)</option>
            <option value="full_admin">Full Admin (everything)</option>
          </select>
        </label>
        <p className="info-note"><Icon name="mail" size={16} />We email them a link to choose their own password. The link works for 48 hours.</p>
        <Err error={error} />
        <div className="modal-foot">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button disabled={!valid || busy}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? 'Sending…' : 'Send invite'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ConfirmModal({ kind, admin: a, onClose, onDone }) {
  const [role, setRole] = useState(otherRole(a.role));
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const who = a.name || a.email;
  const cfg = {
    cancel: { title: 'Cancel invite?', button: 'Cancel invite', danger: true, done: `Invite for ${a.email} cancelled`,
      body: <p>The invite link for <b>{a.email}</b> stops working and they are removed from the list. You can invite them again later.</p>,
      call: () => adminApi.cancelInvite(a.id) },
    deactivate: { title: `Deactivate ${who}?`, button: 'Deactivate', danger: true, done: `${a.email} deactivated`,
      body: <p><b>{a.email}</b> is logged out at once and cannot log in until reactivated.</p>,
      call: () => adminApi.updateAdmin(a.id, { active: false }) },
    role: { title: `Change role for ${who}`, button: 'Change role', done: `${a.email} is now ${ROLE_LABEL[role]}`,
      body: <>
        <label>New role
          <select value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="full_admin">Full Admin</option><option value="content_editor">Content Editor</option>
          </select>
        </label>
        <p className="muted">They are logged out and sign in again with the new role.</p>
      </>,
      call: () => adminApi.updateAdmin(a.id, { role }) },
  }[kind];

  const go = async () => {
    setBusy(true); setError(null);
    try { await cfg.call(); onDone(cfg.done); } catch (e) { setBusy(false); setError(limitError(e)); }
  };
  return (
    <Modal title={cfg.title} tone={cfg.danger ? 'danger' : undefined} onClose={onClose}>
      {cfg.body}
      <Err error={error} />
      <div className="modal-foot">
        <button type="button" className="btn-secondary" onClick={onClose}>{kind === 'cancel' ? 'Keep invite' : 'Cancel'}</button>
        <button type="button" className={cfg.danger ? 'danger-btn' : ''} disabled={busy || (kind === 'role' && role === a.role)} onClick={go}>
          {busy ? 'Saving…' : cfg.button}
        </button>
      </div>
    </Modal>
  );
}
