import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { adminApi } from '../api';
import { createUser } from '../api/users';
import { useAuth } from '../auth';
import { EmptyRow, Err, fmt, fmtDate, isEmail, Modal, PageHead, Pager, RefreshButton, TypePill, useAction, useOnTabReturn, useToast, YesNo } from '../components/ui';
import { Icon } from '../components/icons';
import { initials } from '../components/Layout';

export default function Users() {
  const { isFull } = useAuth();
  const [q, setQ] = useState(''); const [applied, setApplied] = useState(''); const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);
  const [data, setData] = useState(null);
  const { busy, error, run } = useAction();
  const toast = useToast();
  const notice = useLocation().state?.notice;   // e.g. set by the user page after a delete
  const pageSize = 25;

  useEffect(() => { run(async () => setData(await adminApi.users({ q: applied, page, pageSize }))); /* eslint-disable-next-line */ }, [applied, page, reload]);
  const refresh = () => setReload((n) => n + 1);   // same search and page
  useOnTabReturn(refresh);

  const pages = data ? Math.max(1, Math.ceil(data.totalAccounts / pageSize)) : 1;
  const clear = () => { setQ(''); setPage(1); setApplied(''); };
  return (
    <div className="page">
      <PageHead title="Users" subtitle="Every app account and its playable profiles. Open one to see details or correct an age group.">
        {isFull && <button type="button" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add user</button>}
      </PageHead>
      {notice && <p className="notice success" role="status"><Icon name="check" size={16} />{notice}</p>}
      <div className="card flush">
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(q.trim()); }}>
          <div className="search">
            <Icon name="search" size={16} />
            <input placeholder="Search username or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search username or email" />
          </div>
          <button disabled={busy}>Search</button>
          <RefreshButton loading={busy && !!data} onClick={refresh} />
          {applied && <button type="button" className="btn-secondary" onClick={clear}>Clear</button>}
        </form>
        {error && <div style={{ padding: '12px 20px 0' }}><Err error={error} /></div>}
        <div className="table-scroll">
          <table>
            <thead><tr><th>User</th><th>Email</th><th>Type</th><th>Age group</th><th>Email status</th><th>Joined</th><th><span className="sr-only">Actions</span></th></tr></thead>
            <tbody>
              {!data && !error && <EmptyRow cols={7} icon="users">Loading users…</EmptyRow>}
              {data && data.rows.length === 0 && <EmptyRow cols={7}>{applied ? `No users match “${applied}”.` : 'No users yet.'}</EmptyRow>}
              {data && data.rows.map((r) => {
                const name = r.username || (r.accountType === 'parent' ? '(parent account)' : '—');
                return (
                  <tr key={`${r.accountId}-${r.profileId ?? 'x'}`}>
                    <td>
                      <div className="user-cell">
                        <span className="avatar" aria-hidden="true">{r.username ? initials(r.username) : <Icon name="user" size={15} />}</span>
                        <div><Link to={`/users/${r.accountId}`} className="cell-main gu">{name}</Link>{r.isChild && <span className="tag">child</span>}</div>
                      </div>
                    </td>
                    <td className="cell-sub">{r.email}</td>
                    <td><TypePill type={r.isChild ? 'child' : r.accountType} /></td>
                    <td>{r.ageGroup || <span className="muted">—</span>}{r.ageGroupOverridden && <span className="tag">override</span>}</td>
                    <td><YesNo value={r.emailVerified} /></td>
                    <td title={fmt(r.createdAt)}>{fmtDate(r.createdAt)}</td>
                    <td className="actions"><Link className="btn-small" to={`/users/${r.accountId}`} aria-label={`View ${r.username || r.email}`}>View</Link></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <Pager page={page} pages={pages} total={data?.totalAccounts} noun="accounts" onPage={setPage} />
      </div>
      {adding && <AddUserModal onClose={() => setAdding(false)} onCreated={() => { setAdding(false); toast.show('User created'); refresh(); }} />}
      {toast.element}
    </div>
  );
}

const PHONE = /^\+?[0-9 ()\-]{7,20}$/;   // same rule as the backend
function checkPassword(p) {
  if (p.length < 8) return 'Use at least 8 characters';
  if (p.length > 72) return 'Use at most 72 characters';
  if (!/[A-Za-z]/.test(p) || !/\d/.test(p)) return 'Include at least one letter and one number';
  return '';
}

function AddUserModal({ onClose, onCreated }) {
  const [f, setF] = useState({ email: '', password: '', accountType: '', language: 'en', mode: 'satsang', phone: '', emailVerified: false });
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState({});
  const [server, setServer] = useState({});   // field -> message from the server
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => { const v = e.target.type === 'checkbox' ? e.target.checked : e.target.value; setF((x) => ({ ...x, [k]: v })); setServer((s) => ({ ...s, [k]: undefined })); };
  const blur = (k) => () => setTouched((t) => ({ ...t, [k]: true }));

  const local = {
    email: !f.email.trim() ? 'Enter an email' : !isEmail(f.email) ? 'Enter a valid email' : '',
    password: !f.password ? 'Enter a password' : checkPassword(f.password),
    accountType: f.accountType ? '' : 'Choose an account type',
    phone: f.phone.trim() && !PHONE.test(f.phone.trim()) ? 'Enter a valid phone number' : '',
  };
  const valid = !Object.values(local).some(Boolean);
  const msg = (k) => server[k] || (touched[k] ? local[k] : '');
  const fieldError = (k) => msg(k) && <span className="field-error" id={`${k}-err`}>{msg(k)}</span>;
  const described = (k) => (msg(k) ? `${k}-err` : undefined);

  const submit = async (e) => {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true); setFormError(null);
    try {
      await createUser({ email: f.email.trim(), password: f.password, accountType: f.accountType, language: f.language, mode: f.mode,
        phone: f.phone.trim() || null, emailVerified: f.emailVerified });
      onCreated();
    } catch (err) {
      setBusy(false);
      if (err.status === 409 && err.code === 'EMAIL_TAKEN') { setServer({ email: 'An account with this email already exists' }); return; }
      if (err.status === 400 && err.details?.length) {
        const byField = {};
        err.details.forEach((d) => { if (d.field in f && !byField[d.field]) byField[d.field] = d.message; });
        setServer(byField);
        if (Object.keys(byField).length) return;
      }
      setFormError(err);
    }
  };

  return (
    <Modal title="Add user" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label>Email
          <input type="email" value={f.email} onChange={set('email')} onBlur={blur('email')} autoComplete="off" required aria-invalid={!!msg('email')} aria-describedby={described('email')} />
          {fieldError('email')}
        </label>
        <label>Password
          <span className="pw-field">
            <input type={show ? 'text' : 'password'} value={f.password} onChange={set('password')} onBlur={blur('password')} autoComplete="new-password" required aria-invalid={!!msg('password')} aria-describedby={described('password') || 'pw-hint'} />
            <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
              <Icon name={show ? 'eye-off' : 'eye'} size={18} />
            </button>
          </span>
          {fieldError('password') || <span className="hint" id="pw-hint">At least 8 characters, with a letter and a number.</span>}
        </label>

        <fieldset className="choice" aria-describedby={described('accountType')}>
          <legend>Account type</legend>
          <div className="row">
            <label className="inline"><input type="radio" name="accountType" value="adult" checked={f.accountType === 'adult'} onChange={set('accountType')} onBlur={blur('accountType')} required />Adult</label>
            <label className="inline"><input type="radio" name="accountType" value="parent" checked={f.accountType === 'parent'} onChange={set('accountType')} onBlur={blur('accountType')} />Parent</label>
          </div>
          {fieldError('accountType')}
        </fieldset>

        <div className="form-grid">
          <label>Language
            <select value={f.language} onChange={set('language')}><option value="en">English</option><option value="gu">Gujarati</option></select>
            {fieldError('language')}
          </label>
          <label>Mode
            <select value={f.mode} onChange={set('mode')}><option value="sanatan">Sanatan</option><option value="satsang">Satsang</option></select>
            {fieldError('mode')}
          </label>
        </div>
        <label>Phone <span className="muted">(optional)</span>
          <input type="tel" value={f.phone} onChange={set('phone')} onBlur={blur('phone')} autoComplete="off" aria-invalid={!!msg('phone')} aria-describedby={described('phone')} />
          {fieldError('phone')}
        </label>
        <label className="inline check"><input type="checkbox" checked={f.emailVerified} onChange={set('emailVerified')} />Mark email as verified</label>
        <p className="info-note"><Icon name="child" size={16} />Child profiles can only be added by the parent in the app.</p>
        <Err error={formError} />
        <div className="modal-foot">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button disabled={!valid || busy}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? 'Creating…' : 'Create user'}</button>
        </div>
      </form>
    </Modal>
  );
}
