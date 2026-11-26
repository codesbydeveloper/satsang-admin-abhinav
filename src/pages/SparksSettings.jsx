import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { ageGroupLabel } from '../ageGroups';
import { Err, fmt, Modal, PageHead, useAction, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { MAX_REWARD, REWARD_ACTIVITIES } from '../sparks';

// Sparks settings (Full Admin): the reward per activity and age group that Quizzes, Games, Puzzles and Learn give
// from Milestone 3 (backend GET/PUT /admin/sparks/config, audited sparks.config_changed). Only changed cells are sent.
const cellKey = (activity, ageGroup) => `${activity}|${ageGroup}`;

export default function SparksSettings() {
  const [config, setConfig] = useState(null);   // the server's answer
  const [form, setForm] = useState({});         // cellKey → input text
  const [confirming, setConfirming] = useState(false);
  const load = useAction();
  const save = useAction();
  const toast = useToast();

  const fill = (c) => { setConfig(c); setForm(Object.fromEntries(c.rewards.map((r) => [cellKey(r.activity, r.ageGroup), String(r.sparks)]))); };
  useEffect(() => { load.run(async () => fill(await adminApi.sparksConfig())); /* eslint-disable-next-line */ }, []);

  const saved = Object.fromEntries((config?.rewards || []).map((r) => [cellKey(r.activity, r.ageGroup), r]));
  const activities = config?.activities || Object.keys(REWARD_ACTIVITIES);
  const groups = config?.ageGroups || [];
  const parse = (v) => (/^\d+$/.test(String(v ?? '').trim()) ? Number(String(v).trim()) : NaN);
  const validCell = (k) => { const n = parse(form[k]); return Number.isInteger(n) && n >= 0 && n <= MAX_REWARD; };
  const keys = Object.keys(form);
  const invalid = keys.filter((k) => !validCell(k));
  const changes = keys.filter((k) => validCell(k) && saved[k] && parse(form[k]) !== saved[k].sparks)
    .map((k) => { const [activity, ageGroup] = k.split('|'); return { activity, ageGroup, from: saved[k].sparks, to: parse(form[k]) }; });

  const submit = () => save.run(async () => {
    const r = await adminApi.saveSparksConfig(changes.map(({ activity, ageGroup, to }) => ({ activity, ageGroup, sparks: to })));
    setConfirming(false); fill(r);
    const n = r.changed?.length ?? changes.length;
    toast.show(n ? `Sparks settings saved · ${n} change${n === 1 ? '' : 's'}` : 'No changes to save');
  });
  const label = (g) => groups.find((x) => x.key === g)?.label || ageGroupLabel(g) || g;
  const actLabel = (a) => REWARD_ACTIVITIES[a] || a;

  return (
    <div className="page">
      <PageHead title="Sparks settings" subtitle="How many Sparks each activity gives, per age group. Quizzes, Games, Puzzles and Learn use these values; changes apply from the next activity finished." />
      <p className="notice info" role="note"><Icon name="alert" size={16} /><span><strong>Values to be confirmed by Loyadham.</strong> The starting values are defaults; cells still on the default are marked “default”.</span></p>
      <div className="card flush">
        {load.error && <div style={{ padding: '12px 20px 0' }}><Err error={load.error} /></div>}
        {!config && !load.error && <p className="muted" style={{ padding: 20 }}>Loading…</p>}
        {config && (
          <form onSubmit={(e) => { e.preventDefault(); if (changes.length && !invalid.length) setConfirming(true); }}>
            <div className="table-scroll">
              <table className="sparks-config">
                <thead><tr><th>Age group</th>{activities.map((a) => <th key={a} className="num">{actLabel(a)}</th>)}</tr></thead>
                <tbody>
                  {groups.map((g) => (
                    <tr key={g.key}>
                      <th scope="row">{g.label}</th>
                      {activities.map((a) => {
                        const k = cellKey(a, g.key); const s = saved[k];
                        if (!s) return <td key={a} className="num muted">—</td>;
                        const bad = !validCell(k); const changed = !bad && parse(form[k]) !== s.sparks;
                        return (
                          <td key={a} className={`num${changed ? ' cell-changed' : ''}`}>
                            <input type="number" inputMode="numeric" min={0} max={MAX_REWARD} step={1} value={form[k]} aria-invalid={bad || undefined}
                              aria-label={`${actLabel(a)} Sparks for ${g.label}`} onChange={(e) => setForm({ ...form, [k]: e.target.value })}
                              title={s.updatedAt ? `Last changed ${fmt(s.updatedAt)}` : undefined} />
                            {s.isDefault && !changed && <span className="tag" title={`Default: ${s.defaultSparks}`}>default</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="row" style={{ padding: '14px 20px' }}>
              <button disabled={!changes.length || invalid.length > 0 || save.busy}><Icon name="check" size={16} />Save</button>
              {changes.length > 0 && <button type="button" className="btn-secondary" onClick={() => fill(config)} disabled={save.busy}>Undo changes</button>}
              <span className="muted">{invalid.length ? `Each value must be a whole number from 0 to ${MAX_REWARD.toLocaleString()}.`
                : changes.length ? `${changes.length} unsaved change${changes.length === 1 ? '' : 's'}` : 'Every change is recorded in the audit log.'}</span>
            </div>
          </form>
        )}
      </div>

      {confirming && (
        <Modal title="Save Sparks settings?" onClose={() => { if (!save.busy) setConfirming(false); }}>
          <p>{changes.length} reward{changes.length === 1 ? '' : 's'} will change:</p>
          <ul className="change-list">
            {changes.map((c) => <li key={cellKey(c.activity, c.ageGroup)}>{actLabel(c.activity)} · {label(c.ageGroup)}: <b>{c.from}</b> → <b>{c.to}</b></li>)}
          </ul>
          <p className="muted">Applies to activities finished from now on. Sparks already given are not changed. Recorded in the audit log.</p>
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
