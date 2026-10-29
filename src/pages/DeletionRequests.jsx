import { useEffect, useRef, useState } from 'react';
import { approveRequest, getRequestById, getRequests, PAGE_SIZE, publishPendingCount, rejectRequest } from '../api/deletionRequests';
import { Drawer, EmptyRow, fmt, Modal, PageHead, Pager, RefreshButton, TypePill, timeAgo, useOnTabReturn, useToast } from '../components/ui';
import { Icon } from '../components/icons';

const SOURCE = { app: 'In the app', web: 'Web page' };
const STATUS = { pending: ['Pending', 'warn'], completed: ['Completed', 'ok'], rejected: ['Rejected', 'err'] };
const TABS = [['pending', 'Pending'], ['completed', 'Completed'], ['rejected', 'Rejected'], ['all', 'All']];
const NOT_VERIFIED = 'Email not verified yet';
const COLS = 8;

// 401 is handled by the api client (logs out to the login screen).
const ERRORS = { 403: "You don't have permission", 404: 'Request not found', 409: 'This request was already handled' };
export const errorText = (e) => ERRORS[e?.status] || e?.message || 'Something went wrong';
// Parent accounts have no profile of their own, and completed requests no longer have the account.
export const displayName = (r) => r.username || `(${r.accountType === 'parent' ? 'parent' : 'adult'} account)`;

const StatusPill = ({ status }) => { const [label, tone] = STATUS[status] || [status, 'muted']; return <span className={`pill ${tone}`}>{label}</span>; };
const Verified = ({ value }) => (value == null ? <span className="muted">—</span> : (
  <span className={`verified ${value ? 'yes' : 'no'}`} title={value ? 'Email verified' : NOT_VERIFIED}>
    <Icon name={value ? 'check' : 'close'} size={16} /><span className="sr-only">{value ? 'Yes' : 'No'}</span>
  </span>
));
const childrenText = (n) => `${n} child profile${n === 1 ? '' : 's'}`;

export default function DeletionRequests() {
  const [status, setStatus] = useState('pending');
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [source, setSource] = useState('all');
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);        // skeleton rows (first load, new tab / filter / page)
  const [refreshing, setRefreshing] = useState(false); // Refresh button / back to the tab: keep the rows, spin the icon
  const [failed, setFailed] = useState(false);
  const [viewing, setViewing] = useState(null);        // { row, details }
  const [popup, setPopup] = useState(null);            // { kind: 'approve' | 'reject', request }
  const toast = useToast();
  const latest = useRef(0);
  const filters = useRef();
  filters.current = { status, q, source, page };

  const load = (silent) => {
    const ticket = ++latest.current;   // only the newest answer is shown when filters change quickly
    if (silent) setRefreshing(true); else setLoading(true);
    return getRequests({ ...filters.current, pageSize: PAGE_SIZE })
      .then((d) => {
        if (ticket !== latest.current) return;
        const pages = Math.max(1, Math.ceil(d.total / PAGE_SIZE));
        if (filters.current.page > pages) { setPage(pages); return; }   // e.g. the last row of the last page was handled
        setData(d); setFailed(false); publishPendingCount(d.counts.pending);
      })
      .catch((e) => { if (ticket === latest.current) { setFailed(true); if (e.status !== 401) toast.show(errorText(e), 'error'); } })
      .finally(() => { if (ticket === latest.current) { setLoading(false); setRefreshing(false); } });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(false); }, [status, q, source, page]);
  const refresh = () => load(true);
  useOnTabReturn(refresh);

  const loadDetails = (id) => getRequestById(id)
    .then((details) => setViewing((v) => (v?.row.id === id ? { row: details.request, details } : v)))
    .catch((e) => { if (e.status !== 401) toast.show(errorText(e), 'error'); });
  const open = (row) => { setViewing({ row, details: null }); loadDetails(row.id); };

  // Approve / reject, then reload the list, tab counts, sidebar badge and the open panel.
  const decide = (request, call, done) => call().then(
    () => { setPopup(null); toast.show(done); refresh(); if (viewing?.row.id === request.id) loadDetails(request.id); },
    (e) => {
      if (e.status === 401) return;
      toast.show(errorText(e), 'error');
      if (e.status === 404 || e.status === 409) { setPopup(null); refresh(); if (viewing?.row.id === request.id) loadDetails(request.id); }
    });

  const actions = (r, { view = true } = {}) => (
    <>
      {view && <button type="button" className="link" onClick={() => open(r)} aria-label={`View ${displayName(r)}`}>View</button>}
      {r.status === 'pending' && <>
        <span className="tip-wrap" title={r.emailVerified ? undefined : NOT_VERIFIED}>
          <button type="button" className="ok-btn btn-sm" disabled={!r.emailVerified} aria-describedby={r.emailVerified ? undefined : `nv-${r.id}`}
            onClick={() => setPopup({ kind: 'approve', request: r })}>Approve</button>
          {!r.emailVerified && <span id={`nv-${r.id}`} className="sr-only">{NOT_VERIFIED}</span>}
        </span>
        <button type="button" className="danger-outline btn-sm" onClick={() => setPopup({ kind: 'reject', request: r })}>Reject</button>
      </>}
    </>
  );

  const counts = data?.counts;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  return (
    <div className="page">
      <PageHead title="Deletion requests" subtitle="Accounts whose owners asked for deletion, from the app or the public delete-account page." />

      <div className="card flush">
        <div className="tabs" role="group" aria-label="Status">
          {TABS.map(([key, label]) => (
            <button key={key} type="button" aria-pressed={status === key} onClick={() => { setStatus(key); setPage(1); }}>
              {label}
              {counts && <span className={`count${key === 'pending' ? '' : ' muted'}`}>{counts[key]}</span>}
            </button>
          ))}
        </div>
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setQ(search.trim()); }}>
          <div className="search">
            <Icon name="search" size={16} />
            <input type="search" aria-label="Search by username or email" placeholder="Search username or email" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <button disabled={loading}>Search</button>
          <RefreshButton loading={refreshing} onClick={refresh} />
          <label className="inline">Source
            <select value={source} onChange={(e) => { setSource(e.target.value); setPage(1); }}>
              <option value="all">All</option><option value="app">In the app</option><option value="web">Web page</option>
            </select>
          </label>
        </form>
        <div className="table-scroll">
          <table>
            <thead><tr>
              <th>Username</th><th>Account type</th><th>Child profiles</th><th>Requested from</th>
              <th>Requested</th><th>Email verified</th><th>Status</th><th className="right">Actions</th>
            </tr></thead>
            <tbody aria-busy={loading || refreshing}>
              {loading && Array.from({ length: 5 }, (_, i) => (
                <tr key={`s${i}`} className="skel-row" aria-hidden="true">{Array.from({ length: COLS }, (__, j) => <td key={j}><span className="skeleton skel-line" /></td>)}</tr>
              ))}
              {!loading && !data && failed && <EmptyRow cols={COLS} icon="alert">Could not load deletion requests. Try Refresh.</EmptyRow>}
              {!loading && data && data.rows.length === 0 && <EmptyRow cols={COLS} icon="trash">No deletion requests</EmptyRow>}
              {!loading && data && data.rows.map((r) => (
                <tr key={r.id}>
                  <td className={r.username ? 'cell-main gu' : 'cell-main muted'}>{displayName(r)}{r.email && <div className="cell-sub">{r.email}</div>}</td>
                  <td><TypePill type={r.accountType} /></td>
                  <td>{r.childProfiles ?? 0}</td>
                  <td className="cell-sub">{SOURCE[r.source] || r.source}</td>
                  <td title={fmt(r.requestedAt)}>{timeAgo(r.requestedAt)}</td>
                  <td><Verified value={r.emailVerified} /></td>
                  <td><StatusPill status={r.status} /></td>
                  <td className="actions"><div className="row-actions">{actions(r)}</div></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {data && data.total > 0 && <Pager page={page} pages={pages} total={data.total} noun={data.total === 1 ? 'request' : 'requests'} onPage={setPage} />}
      </div>

      {viewing && (
        <Drawer title="Deletion request" onClose={() => setViewing(null)}
          footer={viewing.row.status === 'pending' ? <div className="row-actions">{actions(viewing.row, { view: false })}</div> : null}>
          <RequestDetails r={viewing.row} details={viewing.details} />
        </Drawer>
      )}
      {popup?.kind === 'approve' && <ApproveModal request={popup.request} onClose={() => setPopup(null)}
        onSubmit={(note) => decide(popup.request, () => approveRequest(popup.request.id, { note }), 'Account deleted')} />}
      {popup?.kind === 'reject' && <RejectModal request={popup.request} onClose={() => setPopup(null)}
        onSubmit={(reason) => decide(popup.request, () => rejectRequest(popup.request.id, reason), 'Request rejected')} />}
      {toast.element}
    </div>
  );
}

function RequestDetails({ r, details }) {
  const children = details?.profiles.filter((p) => p.isChild) ?? null;
  return (
    <>
      <div className="drawer-title">
        <span className={r.username ? 'cell-main gu' : 'cell-main muted'}>{displayName(r)}</span>
        <StatusPill status={r.status} />
      </div>
      <dl className="facts single">
        <div><dt>Account type</dt><dd><TypePill type={r.accountType} /></dd></div>
        <div><dt>Email</dt><dd>{r.email || <span className="muted">— (account deleted)</span>}</dd></div>
        <div><dt>Requested from</dt><dd>{SOURCE[r.source] || r.source}</dd></div>
        <div><dt>Requested</dt><dd>{fmt(r.requestedAt)}</dd></div>
        {r.emailVerified != null && <div><dt>Email verified</dt><dd><Verified value={r.emailVerified} /> {r.emailVerified ? 'Yes' : 'No'}</dd></div>}
        {r.status !== 'pending' && <>
          <div><dt>Handled by</dt><dd>{r.decidedBy?.name || '—'}</dd></div>
          <div><dt>Handled</dt><dd>{fmt(r.decidedAt)}</dd></div>
          {r.status === 'rejected' && <div><dt>Reject reason</dt><dd>{r.decisionNote || '—'}</dd></div>}
          {r.status === 'completed' && <>
            <div><dt>Profiles deleted</dt><dd>{r.profilesDeleted ?? '—'}</dd></div>
            {r.decisionNote && <div><dt>Note</dt><dd>{r.decisionNote}</dd></div>}
          </>}
        </>}
      </dl>
      {r.status !== 'completed' && <>
        <h4 className="drawer-section">{r.status === 'pending' ? 'Child profiles that will also be deleted' : 'Child profiles'}</h4>
        {children === null ? <p className="muted">Loading…</p>
          : children.length === 0 ? <p className="muted">None. This account has no child profiles.</p>
            : <ul className="child-list">{children.map((c) => (
              <li key={c.id}><Icon name="child" size={16} /><span className="gu">{c.username}</span><span className="pill muted">{c.ageGroup}</span></li>
            ))}</ul>}
      </>}
    </>
  );
}

// onSubmit returns a promise; the parent closes the popup on success.
function useSubmit(onSubmit) {
  const [busy, setBusy] = useState(false);
  const live = useRef(true);
  useEffect(() => () => { live.current = false; }, []);
  return [busy, (arg) => { setBusy(true); onSubmit(arg).finally(() => { if (live.current) setBusy(false); }); }];
}

function ApproveModal({ request, onClose, onSubmit }) {
  const [typed, setTyped] = useState('');
  const [note, setNote] = useState('');
  const [busy, submit] = useSubmit(onSubmit);
  const n = request.childProfiles ?? 0;
  const target = request.username || request.email;   // parent accounts have no username: type the email
  const what = request.username ? 'username' : 'email';
  const matches = typed.trim() === target;
  return (
    <Modal title="Permanently delete this account?" tone="danger" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (matches && !busy) submit(note); }}>
        <p>This will delete <strong className="gu">{target}</strong>{n > 0 && <> and its {childrenText(n)}</>}, including progress, Sparks, Dress Up items, saved Shangars and leaderboard entries. <strong>This cannot be undone.</strong></p>
        <label>Type the {what} to confirm
          <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={target} autoComplete="off" spellCheck={false} className="gu" />
        </label>
        <label>Note (optional)
          <textarea rows={2} maxLength={200} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="modal-foot">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="danger-btn" disabled={!matches || busy}>{busy ? 'Deleting…' : 'Delete permanently'}</button>
        </div>
      </form>
    </Modal>
  );
}

function RejectModal({ request, onClose, onSubmit }) {
  const [reason, setReason] = useState('');
  const [busy, submit] = useSubmit(onSubmit);
  const ok = reason.trim().length >= 3;
  return (
    <Modal title="Reject deletion request" onClose={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); if (ok && !busy) submit(reason); }}>
        <p className="muted">The account <strong className="gu">{displayName(request)}</strong> stays as it is. The owner can ask again later.</p>
        <label>Reason
          <textarea rows={4} maxLength={200} value={reason} onChange={(e) => setReason(e.target.value)} required aria-describedby="reason-hint" />
        </label>
        <span className="hint" id="reason-hint" style={{ margin: '-10px 0 14px' }}>At least 3 characters.</span>
        <div className="modal-foot">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="danger-btn" disabled={!ok || busy}>{busy ? 'Rejecting…' : 'Reject'}</button>
        </div>
      </form>
    </Modal>
  );
}
