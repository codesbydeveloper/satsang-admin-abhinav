import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { EmptyRow, Err, fmt, fmtDate, PageHead, Pager, RefreshButton, timeAgo, TypePill, useAction, useToast } from '../components/ui';
import { Icon } from '../components/icons';

// Referrals (contract 8.3, client rules 30 Oct 2026). Full Admin only: the settings (audited as
// referral_settings.updated) and the list of who referred whom (usernames only, never emails).
const STATUS = {
  waiting_for_first_quiz: ['Waiting for first quiz', 'warn'],
  qualified: ['Qualified', 'info'],
  credited: ['Credited', 'ok'],
  rejected: ['Rejected', 'muted'],
};
const TABS = [['all', 'All'], ['waiting_for_first_quiz', 'Waiting'], ['qualified', 'Qualified'], ['credited', 'Credited'], ['rejected', 'Rejected']];

export function StatusPill({ status }) {
  const [label, tone] = STATUS[status] || [status, 'muted'];
  return <span className={`pill ${tone}`}>{label}</span>;
}

const FIELDS = [
  ['newUserSparks', 'New user Sparks', 'Reserved for the new user as soon as they enter a code.', 0, 10000],
  ['referrerSparks', 'Referrer Sparks', 'For the friend who shared the code, after the new user’s first full quiz.', 0, 10000],
  ['windowHours', 'Window (hours)', 'How long after creating an account a code can still be entered.', 1, 8760],
];

export default function Referrals() {
  return (
    <div className="page">
      <PageHead title="Referrals" subtitle="Friends invite friends with a referral code. Sparks are reserved now and credited when the Sparks ledger launches (Milestone 2)." />
      <ReferralSettings />
      <ReferralList />
    </div>
  );
}

function ReferralSettings() {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);
  const { busy, error, run } = useAction();
  const toast = useToast();

  const fill = (s) => { setSaved(s); setForm({ ...s, unlimited: s.maxPerReferrer === null, maxPerReferrer: s.maxPerReferrer ?? '' }); };
  useEffect(() => { run(async () => fill((await adminApi.referralSettings()).settings)); /* eslint-disable-next-line */ }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const num = (v) => (v === '' || v === null ? NaN : Number(v));
  const valid = form && FIELDS.every(([k, , , min, max]) => Number.isInteger(num(form[k])) && num(form[k]) >= min && num(form[k]) <= max)
    && (form.unlimited || (Number.isInteger(num(form.maxPerReferrer)) && num(form.maxPerReferrer) >= 1));
  const body = form && {
    newUserSparks: num(form.newUserSparks), referrerSparks: num(form.referrerSparks), windowHours: num(form.windowHours),
    maxPerReferrer: form.unlimited ? null : num(form.maxPerReferrer),
  };
  const changed = saved && body && Object.keys(body).some((k) => body[k] !== saved[k]);

  const save = (e) => {
    e.preventDefault();
    if (!valid || !changed) return;
    run(async () => { fill((await adminApi.saveReferralSettings(body)).settings); toast.show('Referral settings saved'); });
  };

  return (
    <div className="card">
      <div className="card-head"><div><h3>Referral settings</h3>
        <p className="muted">Changes apply to codes entered from now on. Every change is recorded in the audit log.</p></div></div>
      {!form && !error && <p className="muted">Loading…</p>}
      {form && (
        <form onSubmit={save}>
          <div className="form-grid">
            {FIELDS.map(([k, label, hint, min, max]) => (
              <label key={k}>{label}
                <input type="number" inputMode="numeric" min={min} max={max} step={1} value={form[k]} onChange={set(k)} required />
                <span className="hint">{hint}</span>
              </label>
            ))}
            <div>
              <label>Max referrals per person
                <input type="number" inputMode="numeric" min={1} step={1} value={form.maxPerReferrer} onChange={set('maxPerReferrer')} disabled={form.unlimited} />
                <span className="hint">How many friends one code can bring in.</span>
              </label>
              <label className="inline check">
                <input type="checkbox" checked={form.unlimited} onChange={(e) => setForm({ ...form, unlimited: e.target.checked })} />
                Unlimited (until Loyadham decides on a limit)
              </label>
            </div>
          </div>
          <Err error={error} />
          <div className="row">
            <button disabled={busy || !valid || !changed}><Icon name="check" size={16} />Save settings</button>
            {changed && <button type="button" className="btn-secondary" onClick={() => fill(saved)} disabled={busy}>Undo changes</button>}
          </div>
        </form>
      )}
      {!form && <Err error={error} />}
      {toast.element}
    </div>
  );
}

function ReferralList() {
  const [q, setQ] = useState(''); const [applied, setApplied] = useState('');
  const [status, setStatus] = useState('all'); const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const { busy, error, run } = useAction();
  const pageSize = 25;
  const load = () => run(async () => setData(await adminApi.referrals({ q: applied, status, page, pageSize })));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [applied, status, page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const who = (p) => (p ? <><div className="cell-main">{p.username || <span className="muted">Parent account #{p.accountId}</span>}</div>
    <div className="cell-sub"><TypePill type={p.accountType} /></div></> : <span className="muted">Deleted account</span>);

  return (
    <div className="card flush">
      <div className="card-head" style={{ padding: '16px 20px 0' }}><div><h3>Referrals</h3>
        <p className="muted">Who used whose code. Usernames only: emails are never shown here.</p></div></div>
      <div className="toolbar">
        <form className="search" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(q.trim()); }}>
          <Icon name="search" size={16} />
          <input placeholder="Code or username" aria-label="Search referrals" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        <div className="segmented" role="group" aria-label="Status">
          {TABS.map(([k, l]) => <button key={k} type="button" aria-pressed={status === k} onClick={() => { setStatus(k); setPage(1); }}>{l}</button>)}
        </div>
        <RefreshButton loading={busy} onClick={load} />
      </div>
      {error && <div style={{ padding: '12px 20px 0' }}><Err error={error} /></div>}
      <div className="table-scroll">
        <table>
          <thead><tr><th>Code</th><th>Referrer</th><th>New user</th><th>Status</th><th>Sparks</th><th>Applied</th><th>Qualified</th></tr></thead>
          <tbody>
            {!data && !error && <EmptyRow cols={7} icon="list">Loading…</EmptyRow>}
            {data && data.rows.length === 0 && <EmptyRow cols={7} icon="list">No referrals{applied || status !== 'all' ? ' match these filters' : ' yet'}.</EmptyRow>}
            {data && data.rows.map((r) => (
              <tr key={r.id}>
                <td><code>{r.code}</code></td>
                <td>{who(r.referrer)}</td>
                <td>{who(r.referee)}</td>
                <td><StatusPill status={r.status} /></td>
                <td className="cell-sub">New user +{r.newUserSparks} ({r.newUserStatus})<br />Referrer +{r.referrerSparks}</td>
                <td title={fmt(r.createdAt)}><div className="cell-main">{timeAgo(r.createdAt)}</div><div className="cell-sub">{fmtDate(r.createdAt)}</div></td>
                <td className="cell-sub">{r.qualifiedAt ? fmtDate(r.qualifiedAt) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} pages={pages} total={data?.total} noun="referrals" onPage={setPage} />
    </div>
  );
}
