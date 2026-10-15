import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { adminApi, AGE_GROUPS } from '../api';
import { Err, fmt, useAction } from '../components/ui';

function AgeGroupEditor({ profile, onSaved }) {
  const [value, setValue] = useState(profile.age_group_override || '');
  const [reason, setReason] = useState('');
  const { busy, error, run } = useAction();
  const save = (e) => { e.preventDefault(); run(async () => {
    await adminApi.setAgeGroup(profile.id, value || null, reason.trim());
    setReason(''); onSaved();
  }); };
  return (
    <form onSubmit={save} className="inline-form">
      <select value={value} onChange={(e) => setValue(e.target.value)} aria-label="Age group override">
        <option value="">Automatic (from date of birth)</option>
        {AGE_GROUPS.map((g) => <option key={g} value={g}>{g}</option>)}
      </select>
      <input placeholder="Reason (required, saved in audit log)" value={reason} onChange={(e) => setReason(e.target.value)} minLength={3} maxLength={200} required />
      <button disabled={busy}>Save</button>
      <Err error={error} />
    </form>
  );
}

export default function UserDetail() {
  const { id } = useParams();
  const [data, setData] = useState(null);
  const { error, run } = useAction();
  const load = () => run(async () => setData(await adminApi.user(id)));
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id]);

  if (error && !data) return <><Link to="/users">← Users</Link><Err error={error} /></>;
  if (!data) return <p className="muted">Loading…</p>;
  const { account: a, profiles } = data;
  return (
    <>
      <Link to="/users">← Users</Link>
      <h2>{a.email}</h2>
      <dl>
        <dt>Account type</dt><dd>{a.account_type}</dd>
        <dt>Email verified</dt><dd>{a.email_verified_at ? fmt(a.email_verified_at) : 'No'}</dd>
        <dt>Language</dt><dd>{a.preferred_language}</dd>
        <dt>Joined</dt><dd>{fmt(a.created_at)}</dd>
      </dl>
      <h3>Profiles</h3>
      {profiles.length === 0 && <p className="muted">No profiles yet.</p>}
      {profiles.map((p) => (
        <section className="card" key={p.id}>
          <h4>{p.username}{p.is_child ? <span className="tag">child</span> : null}</h4>
          <p>Current age group: <strong>{p.age_group}</strong>{p.age_group_override ? ' (set by an admin)' : ''} · DOB {String(p.dob).slice(0, 10)} · {p.language} · {p.mode || 'no mode chosen'}</p>
          <AgeGroupEditor profile={p} onSaved={load} />
        </section>
      ))}
      <p className="muted">Viewing this page is recorded in the audit log. Passwords and Parent PINs are never shown.</p>
    </>
  );
}
