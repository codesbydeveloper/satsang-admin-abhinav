import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { Err, fmt, Modal, PageHead, useAction, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { CONFIRM_NOTE, MAX_STREAK_SPARKS, STREAK_DAYS, streakAmounts, streakForm, wholeNumber } from '../home';

// Streak Bonus (Full Admin; backend /admin/home/streak-bonus, audited streak.amounts_changed). Each game day in a row
// (America/New_York) adds the amount for that streak day; from day 8 on, "every day after" is used.
const num = (v) => wholeNumber(v, 0, MAX_STREAK_SPARKS);

export default function Streak() {
  const [saved, setSaved] = useState(null);
  const [form, setForm] = useState(null);   // { days: [7 strings], after: string }
  const [confirming, setConfirming] = useState(false);
  const load = useAction();
  const save = useAction();
  const toast = useToast();
  const fill = (s) => { setSaved(s); const f = streakForm(s.amounts); setForm({ days: f.days.map(String), after: String(f.after) }); };
  useEffect(() => { load.run(async () => fill(await adminApi.streakBonus())); /* eslint-disable-next-line */ }, []);

  const values = form ? streakAmounts(form.days.map(num), num(form.after)) : [];
  const valid = values.length > 0 && values.every(Number.isFinite);
  const before = saved ? streakAmounts(streakForm(saved.amounts).days, streakForm(saved.amounts).after) : [];
  // Compared with the saved amounts as the form shows them (a 7-value list already repeats its last for day 8+).
  const changed = valid && saved && JSON.stringify(values) !== JSON.stringify(before);
  const name = (i) => (i < STREAK_DAYS ? `Day ${i + 1}` : `Every day after (day ${STREAK_DAYS + 1}+)`);
  const diffs = values.map((v, i) => ({ i, from: before[i], to: v })).filter((d) => d.from !== d.to);

  const submit = () => save.run(async () => {
    const r = await adminApi.saveStreakBonus(values);
    setConfirming(false); fill(r); toast.show('Streak Bonus saved');
  });
  const input = (label, value, onChange) => (
    <label key={label}>{label}
      <input type="number" inputMode="numeric" min={0} max={MAX_STREAK_SPARKS} step={1} value={value} onChange={onChange} aria-invalid={!Number.isFinite(num(value)) || undefined} />
    </label>
  );

  return (
    <div className="page">
      <PageHead title="Streak" subtitle="Sparks for playing on game days in a row (midnight to midnight, New York time). The bonus builds up until the player claims it; missing a day starts the streak again at day 1." />
      <p className="notice info" role="note"><Icon name="alert" size={16} /><span><strong>{CONFIRM_NOTE}</strong>{saved?.isDefault ? ' These are the built-in starting values.' : saved?.updatedAt ? ` Last changed ${fmt(saved.updatedAt)}.` : ''}</span></p>
      <div className="card">
        {load.error && <Err error={load.error} />}
        {!form && !load.error && <p className="muted">Loading…</p>}
        {form && (
          <form onSubmit={(e) => { e.preventDefault(); if (changed) setConfirming(true); }}>
            <div className="streak-grid">
              {form.days.map((v, i) => input(`Day ${i + 1}`, v, (e) => setForm({ ...form, days: form.days.map((x, j) => (j === i ? e.target.value : x)) })))}
              {input('Every day after', form.after, (e) => setForm({ ...form, after: e.target.value }))}
            </div>
            <p className="hint">Sparks added on that streak day (0–{MAX_STREAK_SPARKS.toLocaleString()}). “Every day after” is used from day {STREAK_DAYS + 1} on. A whole week adds <b>{valid ? values.slice(0, STREAK_DAYS).reduce((a, b) => a + b, 0).toLocaleString() : '—'}</b> Sparks.</p>
            <div className="row">
              <button disabled={!changed || save.busy}><Icon name="check" size={16} />Save</button>
              {changed && <button type="button" className="btn-secondary" onClick={() => fill(saved)} disabled={save.busy}>Undo changes</button>}
              <span className="muted">{!valid ? `Each value must be a whole number from 0 to ${MAX_STREAK_SPARKS.toLocaleString()}.` : changed ? 'Unsaved changes' : 'Every change is recorded in the audit log.'}</span>
            </div>
          </form>
        )}
      </div>
      {confirming && (
        <Modal title="Save the Streak Bonus?" onClose={() => { if (!save.busy) setConfirming(false); }}>
          <ul className="change-list">{diffs.map((d) => <li key={d.i}>{name(d.i)}: <b>{d.from ?? '—'}</b> → <b>{d.to}</b></li>)}</ul>
          <p className="muted">Applies to streak days counted from now on. Recorded in the audit log.</p>
          <Err error={save.error} />
          <div className="modal-foot">
            <button type="button" className="btn-secondary" onClick={() => setConfirming(false)} disabled={save.busy}>Cancel</button>
            <button type="button" onClick={submit} disabled={save.busy}>{save.busy && <span className="spinner" aria-hidden="true" />}{save.busy ? 'Saving…' : 'Save changes'}</button>
          </div>
        </Modal>
      )}
      {toast.element}
    </div>
  );
}
