import { useState } from 'react';
import { adminApi } from '../api';
import { useAuth } from '../auth';
import { Err, PageHead, useAction } from '../components/ui';
import { Icon } from '../components/icons';
import { initials } from '../components/Layout';

export default function Account() {
  const { admin, signOut } = useAuth();
  const [cur, setCur] = useState(''); const [next, setNext] = useState(''); const [again, setAgain] = useState('');
  const { busy, error, run, setError } = useAction();
  const full = admin.role === 'full_admin';
  const submit = (e) => { e.preventDefault();
    if (next !== again) { setError(new Error('The new passwords do not match.')); return; }
    run(async () => {
      await adminApi.changePassword(cur, next);
      await signOut();   // the server ends all sessions after a password change
    });
  };
  return (
    <div className="page">
      <PageHead title="My account" subtitle="Your admin profile and sign-in security." />
      <div className="card">
        <div className="profile-top">
          <span className="avatar lg" aria-hidden="true">{initials(admin.name || admin.email)}</span>
          <div>
            <h3>{admin.name || admin.email}</h3>
            <div className="cell-sub">{admin.email}</div>
            <div className="row" style={{ marginTop: 6, gap: 6 }}>
              <span className={`pill ${full ? 'brand' : 'muted'}`}>{full ? 'Full Admin' : 'Content Editor'}</span>
              <span className="pill ok"><Icon name="shield" size={12} />Two-factor on</span>
            </div>
          </div>
        </div>
      </div>
      <div className="card narrow" style={{ maxWidth: 520 }}>
        <div className="card-head"><div><h3>Change password</h3><p className="muted">You will be logged out everywhere and must log in again.</p></div></div>
        <form onSubmit={submit}>
          <label>Current password<input type="password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" required /></label>
          <label>New password<input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={12} maxLength={72} autoComplete="new-password" required />
            <span className="hint">At least 12 characters.</span></label>
          <label>Repeat new password<input type="password" value={again} onChange={(e) => setAgain(e.target.value)} minLength={12} maxLength={72} autoComplete="new-password" required /></label>
          <Err error={error} />
          <button disabled={busy}><Icon name="key" size={16} />{busy ? 'Changing…' : 'Change password'}</button>
        </form>
      </div>
    </div>
  );
}
