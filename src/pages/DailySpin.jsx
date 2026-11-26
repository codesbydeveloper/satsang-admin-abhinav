import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { Err, fmt, Modal, PageHead, useAction, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { avg, CONFIRM_NOTE, pct, SPIN_LIMITS, spinStats, wholeNumber } from '../home';

// Daily Spark Spin wheel (Full Admin; backend /admin/home/spin-segments, audited spin.segments_changed). The server
// picks the segment by weight; the app never sees the weights. Saving replaces the whole wheel.
const toRows = (segments) => segments.map((s) => ({ label: s.label || '', sparks: String(s.sparks), weight: String(s.weight) }));
const parseRow = (r) => ({ label: r.label.trim(), sparks: wholeNumber(r.sparks, 1, SPIN_LIMITS.maxSparks), weight: wholeNumber(r.weight, 1, SPIN_LIMITS.maxWeight) });
const rowOk = (p) => Number.isFinite(p.sparks) && Number.isFinite(p.weight) && p.label.length <= SPIN_LIMITS.label;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

export default function DailySpin() {
  const [wheel, setWheel] = useState(null);
  const [rows, setRows] = useState([]);
  const [confirming, setConfirming] = useState(false);
  const load = useAction();
  const save = useAction();
  const toast = useToast();
  const fill = (w) => { setWheel(w); setRows(toRows(w.segments)); };
  useEffect(() => { load.run(async () => fill(await adminApi.spinSegments())); /* eslint-disable-next-line */ }, []);

  const parsed = rows.map(parseRow);
  const allOk = parsed.every(rowOk) && rows.length >= SPIN_LIMITS.minSegments && rows.length <= SPIN_LIMITS.maxSegments;
  const stats = spinStats(parsed);
  const savedStats = wheel ? spinStats(wheel.segments) : null;
  const body = parsed.map((p) => ({ ...(p.label ? { label: p.label } : {}), sparks: p.sparks, weight: p.weight }));
  const savedBody = wheel ? wheel.segments.map((s) => ({ ...(s.label ? { label: s.label } : {}), sparks: s.sparks, weight: s.weight })) : [];
  const changed = wheel && !same(body, savedBody);

  const setCell = (i, k) => (e) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: e.target.value } : r)));
  const remove = (i) => setRows(rows.filter((_, j) => j !== i));
  const add = () => setRows([...rows, { label: '', sparks: '', weight: '' }]);
  const submit = () => save.run(async () => {
    const r = await adminApi.saveSpinSegments(body);
    setConfirming(false); fill(r); toast.show('Daily Spin saved');
  });

  return (
    <div className="page">
      <PageHead title="Daily Spin" subtitle="The Daily Spark Spin wheel: one spin every 24 hours per profile. The server picks a segment by its weight; a bigger weight is a bigger chance." />
      <p className="notice info" role="note"><Icon name="alert" size={16} /><span><strong>{CONFIRM_NOTE}</strong>{wheel?.isDefault ? ' The wheel still has the built-in starting values.' : wheel?.updatedAt ? ` Last changed ${fmt(wheel.updatedAt)}.` : ''}</span></p>
      <div className="card flush">
        {load.error && <div style={{ padding: '12px 20px 0' }}><Err error={load.error} /></div>}
        {!wheel && !load.error && <p className="muted" style={{ padding: 20 }}>Loading…</p>}
        {wheel && (
          <form onSubmit={(e) => { e.preventDefault(); if (changed && allOk) setConfirming(true); }}>
            <div className="table-scroll">
              <table className="spin-table" aria-label="Wheel segments">
                <thead><tr><th>#</th><th>Label (optional)</th><th className="num">Sparks</th><th className="num">Weight</th><th className="num">Chance</th><th /></tr></thead>
                <tbody>
                  {rows.map((r, i) => {
                    const p = parsed[i];
                    return (
                      <tr key={i}>
                        <td className="cell-sub">{i + 1}</td>
                        <td><input value={r.label} maxLength={SPIN_LIMITS.label} placeholder={Number.isFinite(p.sparks) ? `${p.sparks} Sparks` : ''} onChange={setCell(i, 'label')} aria-label={`Label for segment ${i + 1}`} /></td>
                        <td className="num"><input type="number" inputMode="numeric" min={1} max={SPIN_LIMITS.maxSparks} step={1} value={r.sparks} onChange={setCell(i, 'sparks')}
                          aria-label={`Sparks for segment ${i + 1}`} aria-invalid={!Number.isFinite(p.sparks) || undefined} /></td>
                        <td className="num"><input type="number" inputMode="numeric" min={1} max={SPIN_LIMITS.maxWeight} step={1} value={r.weight} onChange={setCell(i, 'weight')}
                          aria-label={`Weight for segment ${i + 1}`} aria-invalid={!Number.isFinite(p.weight) || undefined} /></td>
                        <td className="num" data-testid={`chance-${i}`}>{Number.isFinite(p.weight) && stats.total ? pct(stats.chances[i]) : '—'}</td>
                        <td className="num"><button type="button" className="link danger" onClick={() => remove(i)} disabled={rows.length <= SPIN_LIMITS.minSegments}
                          aria-label={`Remove segment ${i + 1}`}><Icon name="trash" size={16} /></button></td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot><tr>
                  <td colSpan={3}><button type="button" className="link" onClick={add} disabled={rows.length >= SPIN_LIMITS.maxSegments}><Icon name="plus" size={16} />Add segment</button></td>
                  <td className="num cell-sub">Total {stats.total.toLocaleString()}</td>
                  <td className="num cell-sub">100%</td><td />
                </tr></tfoot>
              </table>
            </div>
            <div className="spin-summary">
              <div><span className="muted">Average Sparks per spin</span><b data-testid="spin-average">{avg(stats.average)}</b></div>
              {changed && savedStats && <div><span className="muted">Saved wheel</span><b>{avg(savedStats.average)}</b></div>}
            </div>
            <div className="row" style={{ padding: '14px 20px' }}>
              <button disabled={!changed || !allOk || save.busy}><Icon name="check" size={16} />Save</button>
              {changed && <button type="button" className="btn-secondary" onClick={() => fill(wheel)} disabled={save.busy}>Undo changes</button>}
              <span className="muted">{!allOk ? `${SPIN_LIMITS.minSegments}–${SPIN_LIMITS.maxSegments} segments; Sparks 1–${SPIN_LIMITS.maxSparks.toLocaleString()} and weight 1–${SPIN_LIMITS.maxWeight.toLocaleString()}, whole numbers.`
                : changed ? 'Unsaved changes' : 'Every change is recorded in the audit log.'}</span>
            </div>
          </form>
        )}
      </div>

      {confirming && (
        <Modal title="Save the Daily Spin wheel?" onClose={() => { if (!save.busy) setConfirming(false); }}>
          <p>The wheel will have <b>{rows.length}</b> segments. Average per spin: <b>{avg(savedStats.average)}</b> → <b>{avg(stats.average)}</b> Sparks.</p>
          <ul className="change-list">
            {parsed.map((p, i) => <li key={i}>{p.label || `${p.sparks} Sparks`}: {p.sparks} Sparks · {pct(stats.chances[i])}</li>)}
          </ul>
          <p className="muted">Applies to spins from now on. Spins already made keep what they won. Recorded in the audit log.</p>
          <Err error={save.error} />
          <div className="modal-foot">
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)} disabled={save.busy}>Cancel</button>
            <button type="button" onClick={submit} disabled={save.busy}>{save.busy && <span className="spinner" aria-hidden="true" />}{save.busy ? 'Saving…' : 'Save wheel'}</button>
          </div>
        </Modal>
      )}
      {toast.element}
    </div>
  );
}
