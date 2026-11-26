import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { EmptyRow, Err, fmt, fmtDate, Modal, PageHead, Pager, RefreshButton, timeAgo, useAction, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { FEEDBACK_CATEGORIES } from '../home';

// App feedback (Full Admin; backend /admin/feedback, audited feedback.resolved / feedback.reopened). Shows the
// profile's username only, never the email or date of birth.
const TABS = [['all', 'All'], ['open', 'Open'], ['resolved', 'Resolved']];

export function CategoryPill({ category }) {
  const [label, tone] = FEEDBACK_CATEGORIES[category] || [category, 'muted'];
  return <span className={`pill ${tone}`}>{label}</span>;
}

export default function Feedback() {
  const [q, setQ] = useState(''); const [applied, setApplied] = useState('');
  const [status, setStatus] = useState('open'); const [category, setCategory] = useState('all'); const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [resolving, setResolving] = useState(null);
  const { busy, error, run } = useAction();
  const reopen = useAction();
  const toast = useToast();
  const pageSize = 25;
  const load = () => run(async () => setData(await adminApi.feedback({ q: applied, status, category, page, pageSize })));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [applied, status, category, page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const done = (msg) => { setResolving(null); toast.show(msg); load(); };
  const openAgain = (f) => reopen.run(async () => { await adminApi.updateFeedback(f.id, 'open'); done(`Feedback #${f.id} is open again`); });

  return (
    <div className="page">
      <PageHead title="Feedback" subtitle={`What players send from the app (bug, idea or other). Usernames only: emails and dates of birth are never shown here.${data ? ` ${data.openCount} open.` : ''}`} />
      <div className="card flush">
        <div className="toolbar">
          <form className="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(q.trim()); }}>
            <Icon name="search" size={16} />
            <input placeholder="Message, username or #id" aria-label="Search feedback" value={q} onChange={(e) => setQ(e.target.value)} />
          </form>
          <div className="segmented" role="group" aria-label="Status">
            {TABS.map(([k, l]) => <button key={k} type="button" aria-pressed={status === k} onClick={() => { setStatus(k); setPage(1); }}>{l}</button>)}
          </div>
          <label className="inline">Category
            <select value={category} onChange={(e) => { setCategory(e.target.value); setPage(1); }} aria-label="Category">
              <option value="all">All</option>
              {Object.entries(FEEDBACK_CATEGORIES).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
            </select>
          </label>
          <RefreshButton loading={busy} onClick={load} />
        </div>
        {(error || reopen.error) && <div style={{ padding: '12px 20px 0' }}><Err error={error || reopen.error} /></div>}
        <div className="table-scroll">
          <table aria-label="Feedback">
            <thead><tr><th>#</th><th>Category</th><th>Profile</th><th>Message</th><th>Date</th><th>Status</th><th className="num">Action</th></tr></thead>
            <tbody>
              {!data && !error && <EmptyRow cols={7} icon="message">Loading…</EmptyRow>}
              {data && data.items.length === 0 && <EmptyRow cols={7} icon="message">No feedback{applied || status !== 'all' || category !== 'all' ? ' matches these filters' : ' yet'}.</EmptyRow>}
              {data && data.items.map((f) => (
                <tr key={f.id}>
                  <td className="cell-sub">#{f.id}</td>
                  <td><CategoryPill category={f.category} /></td>
                  <td><div className="cell-main">{f.username}</div>{f.isChild && <div className="cell-sub"><span className="pill warn">Child</span></div>}</td>
                  <td className="feedback-msg"><div>{f.message}</div>
                    {(f.appVersion || f.device) && <div className="cell-sub">{[f.appVersion && `App ${f.appVersion}`, f.device].filter(Boolean).join(' · ')}</div>}
                    {f.adminNote && <div className="cell-sub">Note: {f.adminNote}</div>}</td>
                  <td title={fmt(f.createdAt)}><div className="cell-main">{timeAgo(f.createdAt)}</div><div className="cell-sub">{fmtDate(f.createdAt)}</div></td>
                  <td>{f.status === 'resolved'
                    ? <span className="pill ok" title={f.resolvedAt ? `Resolved ${fmt(f.resolvedAt)}` : undefined}>Resolved</span>
                    : <span className="pill warn">Open</span>}</td>
                  <td className="num">{f.status === 'resolved'
                    ? <button type="button" className="link" disabled={reopen.busy} onClick={() => openAgain(f)}>Open again</button>
                    : <button type="button" className="btn-secondary" onClick={() => setResolving(f)}><Icon name="check" size={16} />Mark resolved</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} pages={pages} total={data?.total} noun="messages" onPage={setPage} />
      </div>
      {resolving && <ResolveDialog item={resolving} onClose={() => setResolving(null)} onDone={done} />}
      {toast.element}
    </div>
  );
}

function ResolveDialog({ item, onClose, onDone }) {
  const [note, setNote] = useState(item.adminNote || '');
  const { busy, error, run } = useAction();
  const submit = (e) => {
    e.preventDefault();
    run(async () => { await adminApi.updateFeedback(item.id, 'resolved', note.trim() || null); onDone(`Feedback #${item.id} marked resolved`); });
  };
  return (
    <Modal title={`Mark feedback #${item.id} resolved?`} onClose={() => { if (!busy) onClose(); }}>
      <form onSubmit={submit}>
        <blockquote className="quote">{item.message}</blockquote>
        <label>Note for other admins (optional)
          <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: fixed in app 1.0.4" />
          <span className="hint">The player is not told. Recorded in the audit log.</span>
        </label>
        <Err error={error} />
        <div className="modal-foot">
          <button type="button" className="btn-secondary" onClick={onClose} disabled={busy}>Cancel</button>
          <button disabled={busy}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? 'Saving…' : 'Mark resolved'}</button>
        </div>
      </form>
    </Modal>
  );
}
