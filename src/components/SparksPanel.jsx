import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { EmptyRow, Err, fmt, fmtDate, Modal, Pager, useAction } from './ui';
import { Icon } from './icons';
import { insufficientMessage, MAX_ADJUST, newAdjustId, signed, SPARKS_STATUS, sparksTypeLabel } from '../sparks';

// Sparks of ONE playable profile (an adult's own profile or one child): balance, lifetime totals, pending and the
// ledger history. Full Admins can add or deduct Sparks with a reason (backend chunk 2.1, audited sparks.adjusted).
const HISTORY_PAGE = 10;

export const errorText = (e) => (e ? insufficientMessage(e) || e.message || String(e) : null);

export function SparksStatus({ status }) {
  const [label, tone] = SPARKS_STATUS[status] || [status, 'muted'];
  return <span className={`pill ${tone}`}>{label}</span>;
}

export default function SparksPanel({ profile, canAdjust, adminName = () => null, onToast = () => {} }) {
  const [balance, setBalance] = useState(null);
  const [history, setHistory] = useState(null);
  const [page, setPage] = useState(1);
  const [reload, setReload] = useState(0);
  const [adjusting, setAdjusting] = useState(false);
  const bal = useAction();
  const hist = useAction();

  useEffect(() => { bal.run(async () => setBalance(await adminApi.profileSparks(profile.id))); /* eslint-disable-next-line */ }, [profile.id, reload]);
  useEffect(() => { hist.run(async () => setHistory(await adminApi.sparksHistory(profile.id, { page, pageSize: HISTORY_PAGE }))); /* eslint-disable-next-line */ }, [profile.id, page, reload]);
  const refresh = () => { setPage(1); setReload((n) => n + 1); };

  const pages = history ? Math.max(1, Math.ceil((history.total || 0) / HISTORY_PAGE)) : 1;
  const n = (v) => (balance ? Number(v || 0).toLocaleString() : '…');
  const who = (t) => {
    if (t.type !== 'admin_adjust' && !t.reversedReason) return <span className="muted">—</span>;
    const by = t.createdBy != null ? (adminName(t.createdBy) || `Admin #${t.createdBy}`) : null;
    return (
      <div className="sparks-who">
        {by && <div className="cell-main">{by}</div>}
        {t.note && <div className="cell-sub">{t.note}</div>}
        {t.reversedReason && <div className="cell-sub">Reversed{t.reversedBy != null ? ` by ${adminName(t.reversedBy) || `Admin #${t.reversedBy}`}` : ''}: {t.reversedReason}</div>}
      </div>
    );
  };

  return (
    <div className="sparks" role="group" aria-label={`Sparks for ${profile.username}`}>
      <div className="student-head">
        <h5><Icon name="spark" size={15} /> Sparks</h5>
        {canAdjust && (
          <button type="button" className="btn-sm" onClick={() => setAdjusting(true)} disabled={!balance}
            aria-label={`Adjust Sparks for ${profile.username}`}>Adjust Sparks</button>
        )}
      </div>
      <dl className="facts sparks-facts">
        <div><dt>Balance</dt><dd className="sparks-balance">{n(balance?.balance)}</dd></div>
        <div><dt>Lifetime earned</dt><dd>{n(balance?.lifetimeEarned)}</dd></div>
        <div><dt>Lifetime spent</dt><dd>{n(balance?.lifetimeSpent)}</dd></div>
        <div><dt>Pending</dt><dd>{n(balance?.pending)}</dd></div>
      </dl>
      <Err error={bal.error} />

      <div className="sparks-history">
        <h6>Sparks history{history ? ` (${(history.total || 0).toLocaleString()})` : ''}</h6>
        <div className="table-scroll">
          <table className="compact" aria-label={`Sparks history for ${profile.username}`}>
            <thead><tr><th>Type</th><th className="num">Amount</th><th>Status</th><th>Date</th><th>Admin / reason</th></tr></thead>
            <tbody>
              {!history && !hist.error && <EmptyRow cols={5} icon="list">Loading…</EmptyRow>}
              {history && history.items.length === 0 && <EmptyRow cols={5} icon="list">No Sparks yet.</EmptyRow>}
              {history && history.items.map((t) => (
                <tr key={t.id} className={t.status === 'reversed' ? 'row-dim' : undefined}>
                  <td>{sparksTypeLabel(t.type)}</td>
                  <td className={`num ${t.amount < 0 ? 'neg' : 'pos'}`}>{signed(t.amount)}</td>
                  <td><SparksStatus status={t.status} /></td>
                  <td title={fmt(t.createdAt)}>{fmtDate(t.createdAt)}</td>
                  <td>{who(t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {hist.error && <Err error={hist.error} />}
        {history && pages > 1 && <Pager page={page} pages={pages} total={history.total} noun="entries" onPage={setPage} />}
      </div>

      {adjusting && (
        <AdjustDialog profile={profile} balance={balance?.balance ?? 0} onClose={() => setAdjusting(false)}
          onDone={(r, amount) => {
            setAdjusting(false); refresh();
            const nb = Number(r.balance ?? 0).toLocaleString();
            onToast(r.duplicate ? `Already applied · ${profile.username} balance ${nb} Sparks`
              : `${signed(amount)} Sparks for ${profile.username} · new balance ${nb}`);
          }} />
      )}
    </div>
  );
}

// Step 1: amount (+ adds, − deducts) and a required reason. Step 2: confirm with the balance before → after.
function AdjustDialog({ profile, balance, onClose, onDone }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(null);   // { amount, reason, transactionId } once the form is checked
  const { busy, error, run, setError } = useAction();

  const value = amount.trim() === '' ? NaN : Number(amount.trim().replace(/^−/, '-'));
  const validAmount = Number.isInteger(value) && value !== 0 && Math.abs(value) <= MAX_ADJUST;
  const after = validAmount ? balance + value : null;
  const tooLow = after !== null && after < 0;
  const r = reason.trim();
  const ok = validAmount && !tooLow && r.length >= 3 && r.length <= 255;

  const next = (e) => { e.preventDefault(); if (!ok) return; setError(null); setConfirm({ amount: value, reason: r, transactionId: newAdjustId() }); };
  // The same transactionId on a retry after a network error: the backend applies it once.
  const send = () => run(async () => { const res = await adminApi.adjustSparks(profile.id, confirm); onDone(res, confirm.amount); });

  const add = (confirm?.amount ?? 0) > 0;
  return (
    <Modal title={confirm ? (add ? 'Add Sparks?' : 'Deduct Sparks?') : `Adjust Sparks · ${profile.username}`} onClose={onClose}>
      {!confirm ? (
        <form onSubmit={next}>
          <p className="muted">Current balance: <b>{balance.toLocaleString()}</b> Sparks. Use a minus sign to deduct (e.g. −20). A deduction also lowers Lifetime earned (it is a correction).</p>
          <label>Amount
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="numeric" placeholder="e.g. 50 or -20" aria-label="Amount" required autoComplete="off" />
            <span className="hint">{validAmount ? `New balance: ${after.toLocaleString()}` : `A whole number other than 0, at most ${MAX_ADJUST.toLocaleString()} either way.`}</span>
          </label>
          {tooLow && <p className="error" role="alert">Not enough Sparks: the balance is {balance.toLocaleString()}, this needs {Math.abs(value).toLocaleString()}. The balance cannot go below zero.</p>}
          <label>Reason
            <input value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={255} required placeholder="Required, saved in the audit log" aria-label="Reason" />
          </label>
          <div className="modal-foot">
            <button type="button" className="btn-secondary" onClick={onClose}>Cancel</button>
            <button disabled={!ok}>Continue</button>
          </div>
        </form>
      ) : (
        <>
          <p>{add ? 'Add' : 'Deduct'} <b>{Math.abs(confirm.amount).toLocaleString()} Sparks</b> {add ? 'to' : 'from'} <b className="gu">{profile.username}</b>?</p>
          <dl className="facts">
            <div><dt>Balance now</dt><dd>{balance.toLocaleString()}</dd></div>
            <div><dt>After</dt><dd>{(balance + confirm.amount).toLocaleString()}</dd></div>
          </dl>
          <p>Reason: <span className="gu">{confirm.reason}</span></p>
          <p className="muted">Recorded in the audit log.</p>
          {error && <p className="error" role="alert">{errorText(error)}</p>}
          <div className="modal-foot">
            <button type="button" className="btn-secondary" onClick={() => { setConfirm(null); setError(null); }} disabled={busy}>Back</button>
            <button type="button" onClick={send} disabled={busy}>{busy && <span className="spinner" aria-hidden="true" />}{busy ? 'Saving…' : (add ? 'Add Sparks' : 'Deduct Sparks')}</button>
          </div>
        </>
      )}
    </Modal>
  );
}
