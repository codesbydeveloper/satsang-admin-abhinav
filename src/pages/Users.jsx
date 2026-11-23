import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { adminApi } from '../api';
import { createUser } from '../api/users';
import { useAuth } from '../auth';
import { AGE_GROUPS, ageGroupLabel } from '../ageGroups';
import { CLASS_STATUS_FILTERS, classStatusFromUrl, StudentChip, TO_VERIFY } from '../studentStatus';
import { EmptyRow, Err, fmt, fmtDate, isEmail, Modal, PageHead, Pager, RefreshButton, TypePill, useAction, useOnTabReturn, useToast } from '../components/ui';
import { Icon } from '../components/icons';

// The Users table (client 23 Nov 2026): one row per playable profile, grouped by account. The account row comes
// first, then its children (indented, "↳ child"). A row shown only because one of its children matched a filter
// comes back with matched: false and is greyed. Search, filters, sort and page live in the URL.

export const SORT_COLUMNS = [
  ['name', 'Name'], ['username', 'Username'], ['accountType', 'Account type'], ['country', 'Country'], ['dob', 'DOB'],
  ['ageGroup', 'Age group'], ['email', 'Email'], [null, 'Class status'], ['joined', 'Joined'],
];
const SORT_KEYS = SORT_COLUMNS.map(([k]) => k).filter(Boolean);
const defaultOrder = (sort) => (sort === 'joined' ? 'desc' : 'asc');
export const ACCOUNT_TYPES = [['', 'All'], ['adult', 'Adult'], ['parent', 'Parent'], ['child', 'Child']];
const FILTER_KEYS = ['q', 'country', 'ageGroup', 'accountType', 'classStatus', 'studentStatus'];

let regionNames;
try { regionNames = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { regionNames = null; }
/** "IN" → "India" (the code itself if the browser has no name for it). */
export const countryName = (code) => { if (!code) return null; try { return regionNames?.of(code) || code; } catch { return code; } };
/** A date of birth (YYYY-MM-DD) as "24 Oct 2017", the same in every time zone. */
export const fmtDob = (d) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d || '');
  if (!m) return null;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
};

const pageSize = 25;

export default function Users() {
  const { isFull } = useAuth();
  const [params, setParams] = useSearchParams();
  const [reload, setReload] = useState(0);
  const [adding, setAdding] = useState(false);
  const [data, setData] = useState(null);
  const [countries, setCountries] = useState([]);
  const { busy, error, run } = useAction();
  const toast = useToast();
  const notice = useLocation().state?.notice;   // e.g. set by the user page after a delete

  // ---- URL state ----
  const applied = params.get('q') || '';
  const country = params.get('country') || '';
  const ageGroup = AGE_GROUPS.some((g) => g.key === params.get('ageGroup')) ? params.get('ageGroup') : '';
  const accountType = ACCOUNT_TYPES.some(([v]) => v && v === params.get('accountType')) ? params.get('accountType') : '';
  // Old links (?studentStatus=…, e.g. the dashboard card) still work: one status maps to its Class Status;
  // the dashboard's "pending + interested" stays as its own option.
  const { classStatus, studentStatus } = classStatusFromUrl(params.get('classStatus'), params.get('studentStatus'));
  const sort = SORT_KEYS.includes(params.get('sort')) ? params.get('sort') : 'joined';
  const order = ['asc', 'desc'].includes(params.get('order')) ? params.get('order') : defaultOrder(sort);
  const page = Math.max(1, Number.parseInt(params.get('page'), 10) || 1);
  const [q, setQ] = useState(applied);
  useEffect(() => setQ(applied), [applied]);

  // Sets URL values ('' / null removes one). Anything but a page change goes back to page 1.
  const update = (changes) => setParams((p) => {
    const n = new URLSearchParams(p);
    for (const [k, v] of Object.entries(changes)) { if (v === '' || v == null) n.delete(k); else n.set(k, String(v)); }
    if (!('page' in changes)) n.delete('page');
    if ('classStatus' in changes) n.delete('studentStatus');
    return n;
  }, { replace: true });
  const setClass = (v) => (v === TO_VERIFY ? update({ classStatus: null, studentStatus: TO_VERIFY }) : update({ classStatus: v === 'all' ? null : v }));
  const sortBy = (key) => update(key === sort ? { sort: key, order: order === 'asc' ? 'desc' : 'asc' } : { sort: key, order: defaultOrder(key) });
  const clear = () => { setQ(''); setParams((p) => { const n = new URLSearchParams(p); [...FILTER_KEYS, 'page'].forEach((k) => n.delete(k)); return n; }, { replace: true }); };

  const query = { q: applied, country, ageGroup, accountType, classStatus: classStatus === 'all' ? undefined : classStatus, studentStatus, sort, order, page, pageSize };
  const key = JSON.stringify(query);
  useEffect(() => { run(async () => {
    const r = await adminApi.users(query);
    setData(r);
    if (Array.isArray(r.countries)) setCountries(r.countries);
  }); /* eslint-disable-next-line */ }, [key, reload]);
  const refresh = () => setReload((n) => n + 1);   // same search, filters, sort and page
  useOnTabReturn(refresh);

  const pages = data ? Math.max(1, Math.ceil(data.totalAccounts / pageSize)) : 1;
  const filtered = !!(applied || country || ageGroup || accountType || classStatus !== 'all' || studentStatus);
  const classValue = studentStatus === TO_VERIFY ? TO_VERIFY : classStatus;
  const classOptions = CLASS_STATUS_FILTERS.concat(studentStatus === TO_VERIFY ? [{ value: TO_VERIFY, label: 'To verify (pending + interested)' }] : []);
  const cols = SORT_COLUMNS.length + 1;
  const countryOptions = [...new Set([...countries, ...(country ? [country] : [])])];

  return (
    <div className="page">
      <PageHead title="Users" subtitle="Every playable profile, grouped by account: the account first, then its children. Open one to see details or correct an age group.">
        {isFull && <button type="button" onClick={() => setAdding(true)}><Icon name="plus" size={16} />Add user</button>}
      </PageHead>
      {notice && <p className="notice success" role="status"><Icon name="check" size={16} />{notice}</p>}
      <div className="card flush">
        <form className="toolbar users-toolbar" onSubmit={(e) => { e.preventDefault(); update({ q: q.trim() }); }}>
          <div className="search">
            <Icon name="search" size={16} />
            <input placeholder="Search name, username or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search name, username or email" />
          </div>
          <button disabled={busy}>Search</button>
          <label className="inline">Country
            <select value={country} onChange={(e) => update({ country: e.target.value })} aria-label="Country">
              <option value="">All</option>
              {countryOptions.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
            </select>
          </label>
          <label className="inline">Age group
            <select value={ageGroup} onChange={(e) => update({ ageGroup: e.target.value })} aria-label="Age group">
              <option value="">All</option>
              {AGE_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
            </select>
          </label>
          <label className="inline">Account type
            <select value={accountType} onChange={(e) => update({ accountType: e.target.value })} aria-label="Account type">
              {ACCOUNT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
          <label className="inline">Class Status
            <select value={classValue} onChange={(e) => setClass(e.target.value)} aria-label="Class Status">
              {classOptions.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
            </select>
          </label>
          <RefreshButton loading={busy && !!data} onClick={refresh} />
          {filtered && <button type="button" className="btn-secondary" onClick={clear}>Clear</button>}
        </form>
        {error && <div style={{ padding: '12px 20px 0' }}><Err error={error} /></div>}
        <div className="table-scroll">
          <table className="users-table">
            <thead>
              <tr>
                {SORT_COLUMNS.map(([k, label]) => (k ? (
                  <th key={k} aria-sort={sort === k ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
                    <button type="button" className="th-sort" onClick={() => sortBy(k)}>
                      {label}<span className="sort-arrow" aria-hidden="true">{sort === k ? (order === 'asc' ? '▲' : '▼') : ''}</span>
                    </button>
                  </th>
                ) : <th key={label}>{label}</th>))}
                <th><span className="sr-only">View</span></th>
              </tr>
            </thead>
            <tbody>
              {!data && !error && <EmptyRow cols={cols} icon="users">Loading users…</EmptyRow>}
              {data && data.rows.length === 0 && <EmptyRow cols={cols}>{filtered ? 'No users match these filters.' : 'No users yet.'}</EmptyRow>}
              {data && data.rows.map((r) => <UserRow key={`${r.accountId}-${r.profileId ?? 'account'}`} r={r} />)}
            </tbody>
          </table>
        </div>
        <Pager page={page} pages={pages} total={data?.totalAccounts} noun="accounts" onPage={(p) => update({ page: p > 1 ? p : null })} />
      </div>
      {adding && <AddUserModal onClose={() => setAdding(false)} onCreated={() => { setAdding(false); toast.show('User created'); refresh(); }} />}
      {toast.element}
    </div>
  );
}

const Dash = () => <span className="muted">—</span>;

function UserRow({ r }) {
  const child = r.isChild || r.accountType === 'child';
  const dim = r.matched === false;   // shown only as the parent of a matching child
  const type = child ? 'child' : r.accountType;
  const age = ageGroupLabel(r.ageGroupKey) || r.ageGroup;
  const who = r.username || r.name || r.email;
  return (
    <tr className={`${child ? 'child-row' : 'account-row'}${dim ? ' row-dim' : ''}`} data-testid={`user-row-${r.accountId}-${r.profileId ?? 'account'}`}
      title={dim ? 'Shown because a child profile matches' : undefined}>
      <td>
        {child
          ? <span className="child-name"><span className="child-mark" aria-label="child profile of the account above">↳ child</span>{r.name || null}</span>
          : (r.name ? <span className="cell-main">{r.name}</span> : <Dash />)}
      </td>
      <td>{r.username ? <Link to={`/users/${r.accountId}`} className="cell-main gu">{r.username}</Link> : <Dash />}</td>
      <td><TypePill type={type} /></td>
      <td>{r.country ? <span title={r.country}>{countryName(r.country)}</span> : <Dash />}</td>
      <td>{fmtDob(r.dob) || <Dash />}</td>
      <td>{age || <Dash />}{r.ageGroupOverridden && <span className="tag">override</span>}</td>
      <td className="cell-email">
        {child || r.isParentEmail
          ? <><span className="email-label">Parent email</span><span className="muted">{r.email}</span></>
          : r.email}
      </td>
      <td>{r.profileId ? <StudentChip status={r.studentStatus} /> : <Dash />}</td>
      <td title={fmt(r.joined || r.createdAt)}>{fmtDate(r.joined || r.createdAt)}</td>
      <td className="actions"><Link className="btn-small" to={`/users/${r.accountId}`} aria-label={`View ${who}`}>View</Link></td>
    </tr>
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
