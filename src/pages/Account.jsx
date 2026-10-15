import { useState } from 'react';
import { adminApi } from '../api';
import { useAuth } from '../auth';
import { Err, useAction } from '../components/ui';

export default function Account() {
  const { admin, signOut } = useAuth();
  const [cur, setCur] = useState(''); const [next, setNext] = useState('');
  const { busy, error, run } = useAction();
  const submit = (e) => { e.preventDefault(); run(async () => {
    await adminApi.changePassword(cur, next);
    await signOut();   // the server ends all sessions after a password change
  }); };
  return (
    <>
      <h2>My account</h2>
      <p>{admin.email} · {admin.role === 'full_admin' ? 'Full Admin' : 'Content Editor'}</p>
      <h3>Change password</h3>
      <form onSubmit={submit} className="narrow">
        <label>Current password<input type="password" value={cur} onChange={(e) => setCur(e.target.value)} required /></label>
        <label>New password (12+ characters)<input type="password" value={next} onChange={(e) => setNext(e.target.value)} minLength={12} maxLength={72} required /></label>
        <Err error={error} />
        <button disabled={busy}>Change password</button>
        <p className="muted">You will be logged out and must log in again.</p>
      </form>
    </>
  );
}
