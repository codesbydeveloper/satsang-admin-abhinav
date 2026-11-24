import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router-dom';
import { adminApi } from '../api';
import { useAuth } from '../auth';
import { AGE_GROUPS, ageGroupLabel } from '../ageGroups';
import { CLASS_STATUS_FILTERS, classStatusFromUrl, StudentChip, TO_VERIFY } from '../studentStatus';
import { EmptyRow, Err, fmt, fmtDate, PageHead, Pager, RefreshButton, TypePill, useAction, useOnTabReturn, useToast } from '../components/ui';
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
const FILTER_KEYS = ['q', 'country', 'ageGroup', 'accountType', 'classStatus', 'studentStatus', 'joinedSince'];
const validInstant = (s) => (s && !Number.isNaN(Date.parse(s)) ? s : '');

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
  // The dashboard's "New registrations today" card: accounts created since the start of today (its time zone).
  const joinedSince = validInstant(params.get('joinedSince'));
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

  const query = { q: applied, country, ageGroup, accountType, classStatus: classStatus === 'all' ? undefined : classStatus, studentStatus, joinedSince, sort, order, page, pageSize };
  const key = JSON.stringify(query);
  useEffect(() => { run(async () => {
    const r = await adminApi.users(query);
    setData(r);
    if (Array.isArray(r.countries)) setCountries(r.countries);
  }); /* eslint-disable-next-line */ }, [key, reload]);
  const refresh = () => setReload((n) => n + 1);   // same search, filters, sort and page
  useOnTabReturn(refresh);

  // Export to CSV (Full Admin): the current search, filters and sort, every page (the server ignores page/pageSize).
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState(null);
  const exportCsv = async () => {
    if (exporting) return;
    setExporting(true); setExportError(null);
    try {
      const { page: _p, pageSize: _s, ...filters } = query;
      const { blob, filename } = await adminApi.exportUsersCsv(filters);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.show('CSV downloaded');
    } catch (e) { setExportError(e); } finally { setExporting(false); }
  };

  const pages = data ? Math.max(1, Math.ceil(data.totalAccounts / pageSize)) : 1;
  const filtered = !!(applied || country || ageGroup || accountType || classStatus !== 'all' || studentStatus || joinedSince);
  // Clear is always shown; it does something when a search/filter is on, text is typed, or we are past page 1.
  const clearable = filtered || !!q.trim() || page > 1;
  const classValue = studentStatus === TO_VERIFY ? TO_VERIFY : classStatus;
  const classOptions = CLASS_STATUS_FILTERS.concat(studentStatus === TO_VERIFY ? [{ value: TO_VERIFY, label: 'To verify (pending + interested)' }] : []);
  const cols = SORT_COLUMNS.length + 1;
  const countryOptions = [...new Set([...countries, ...(country ? [country] : [])])];

  return (
    <div className="page">
      <PageHead title="Users" subtitle="Every playable profile, grouped by account: the account first, then its children. Open one to see details or correct an age group.">
        {isFull && (
          <button type="button" className="btn-secondary" onClick={exportCsv} disabled={exporting}
            title="Download every row that matches the current search, filters and sort (all pages)">
            {exporting && <span className="spinner" aria-hidden="true" />}{exporting ? 'Exporting…' : 'Export to CSV'}
          </button>
        )}
      </PageHead>
      {notice && <p className="notice success" role="status"><Icon name="check" size={16} />{notice}</p>}
      {exportError && <Err error={exportError} />}
      <div className="card flush">
        {/* Row 1: search. Row 2: four equal filters, then Refresh + Clear (all 40px, bottom-aligned). */}
        <form className="toolbar users-toolbar" onSubmit={(e) => { e.preventDefault(); update({ q: q.trim() }); }}>
          <div className="ut-search">
            <div className="search">
              <Icon name="search" size={16} />
              <input placeholder="Search name, username or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search name, username or email" />
            </div>
            <button disabled={busy}>Search</button>
          </div>
          <div className="ut-filters">
            <label className="ut-field"><span className="ut-label">Country</span>
              <select value={country} onChange={(e) => update({ country: e.target.value })} aria-label="Country">
                <option value="">All</option>
                {countryOptions.map((c) => <option key={c} value={c}>{countryName(c)}</option>)}
              </select>
            </label>
            <label className="ut-field"><span className="ut-label">Age group</span>
              <select value={ageGroup} onChange={(e) => update({ ageGroup: e.target.value })} aria-label="Age group">
                <option value="">All</option>
                {AGE_GROUPS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
              </select>
            </label>
            <label className="ut-field"><span className="ut-label">Account type</span>
              <select value={accountType} onChange={(e) => update({ accountType: e.target.value })} aria-label="Account type">
                {ACCOUNT_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="ut-field"><span className="ut-label">Class Status</span>
              <select value={classValue} onChange={(e) => setClass(e.target.value)} aria-label="Class Status">
                {classOptions.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
              </select>
            </label>
            <div className="ut-actions">
              <RefreshButton loading={busy && !!data} onClick={refresh} />
              <button type="button" className="btn-secondary" onClick={clear} disabled={!clearable}
                title="Clear the search and filters (keeps the sort)">Clear</button>
            </div>
          </div>
          {(joinedSince || (filtered && typeof data?.totalRows === 'number')) && (
            <div className="ut-status">
              {joinedSince && (
                <span className="pill info filter-chip">Joined since {fmt(joinedSince)}
                  <button type="button" className="chip-x" aria-label="Remove the joined since filter" onClick={() => update({ joinedSince: null })}>×</button>
                </span>
              )}
              {filtered && typeof data?.totalRows === 'number' && (
                <span className="muted match-count" role="status">{data.totalRows.toLocaleString()} matching {data.totalRows === 1 ? 'row' : 'rows'}</span>
              )}
            </div>
          )}
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
  // A parent account is the family header: it has no profile (no username) of its own.
  const parentHead = !child && r.accountType === 'parent';
  const parentLabel = <span className="muted parent-label">Parent account</span>;
  return (
    <tr className={`${child ? 'child-row' : 'account-row'}${parentHead ? ' family-head' : ''}${dim ? ' row-dim' : ''}`}
      data-testid={`user-row-${r.accountId}-${r.profileId ?? 'account'}`} title={dim ? 'Shown because a child profile matches' : undefined}>
      <td>
        {child
          ? <span className="child-name"><span className="child-mark" aria-label="child profile of the account above">↳ child</span>{r.name || null}</span>
          : (r.name ? <span className="cell-main">{r.name}</span> : (parentHead ? parentLabel : <Dash />))}
      </td>
      <td>{r.username ? <Link to={`/users/${r.accountId}`} className="cell-main gu">{r.username}</Link> : (parentHead ? parentLabel : <Dash />)}</td>
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
