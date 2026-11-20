import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { adminApi } from '../api';
import { Err } from '../components/ui';
import { Icon } from '../components/icons';
import { FullLogo } from '../components/brand';
import { ROLE_LABEL } from './Admins';

// Public page from the invite email: /accept-invite?token=...  No admin login needed.
// The token is read from the address bar into memory only: never stored, logged or sent anywhere but our own backend.
const MIN = 12;
const ASK = 'Ask a Full Admin to resend your invite.';

export default function AcceptInvite() {
  const { search } = useLocation();
  const [token] = useState(() => new URLSearchParams(search).get('token') || '');
  const [state, setState] = useState(token ? 'loading' : 'invalid');   // loading | form | done | invalid | expired | error
  const [invite, setInvite] = useState(null);
  const [loadError, setLoadError] = useState(null);
  const [pw, setPw] = useState(''); const [again, setAgain] = useState('');
  const [show, setShow] = useState(false);
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const fail = (e) => {
    if (e.code === 'INVITE_INVALID' || e.status === 404) setState('invalid');
    else if (e.code === 'INVITE_EXPIRED' || e.status === 410) setState('expired');
    else return false;
    return true;
  };

  useEffect(() => {
    if (!token) return;
    let live = true;
    adminApi.inviteInfo(token)
      .then((r) => { if (live) { setInvite(r); setState('form'); } })
      .catch((e) => { if (live && !fail(e)) { setLoadError(e); setState('error'); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const pwError = pw.length < MIN ? `At least ${MIN} characters.` : '';
  const matchError = again && pw !== again ? 'The passwords do not match.' : '';
  const valid = !pwError && pw === again;

  const submit = async (e) => {
    e.preventDefault(); setTouched(true);
    if (!valid || busy) return;
    setBusy(true); setError(null);
    try { await adminApi.acceptInvite(token, pw); setPw(''); setAgain(''); setState('done'); } catch (err) { if (!fail(err)) setError(err); } finally { setBusy(false); }
  };

  return (
    <div className="auth">
      <div className="auth-card">
        <FullLogo />
        {state === 'loading' && <p className="muted" role="status">Checking your invite…</p>}

        {(state === 'invalid' || state === 'expired') && (
          <div role="alert">
            <h2>{state === 'expired' ? 'This invite has expired' : 'This invite link is not valid'}</h2>
            <p className="muted">{state === 'expired' ? 'Invite links work for 48 hours.' : 'It may have been used already, replaced by a newer invite, or cancelled.'} {ASK}</p>
            <p><Link to="/">Go to login</Link></p>
          </div>
        )}

        {state === 'error' && <><h2>Something went wrong</h2><Err error={loadError} /><p className="muted">Please reload this page in a moment.</p></>}

        {state === 'form' && invite && (
          <>
            <h2>Set your password</h2>
            <p className="muted">Welcome{invite.name ? `, ${invite.name}` : ''}. You have been invited as <b>{ROLE_LABEL[invite.role] || invite.role}</b>.</p>
            <dl className="invite-facts">
              <dt>Name</dt><dd>{invite.name || '—'}</dd>
              <dt>Email</dt><dd>{invite.email}</dd>
              <dt>Role</dt><dd>{ROLE_LABEL[invite.role] || invite.role}</dd>
            </dl>
            <form onSubmit={submit} noValidate>
              <input type="email" value={invite.email} autoComplete="username" readOnly hidden />
              <label>Password
                <span className="pw-field">
                  <input type={show ? 'text' : 'password'} value={pw} onChange={(e) => setPw(e.target.value)} onBlur={() => setTouched(true)} minLength={MIN} maxLength={72}
                    autoComplete="new-password" required aria-invalid={touched && !!pwError} aria-describedby="pw-hint" />
                  <button type="button" className="eye" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show}>
                    <Icon name={show ? 'eye-off' : 'eye'} size={18} />
                  </button>
                </span>
                <span className={touched && pwError ? 'field-error' : 'hint'} id="pw-hint">At least {MIN} characters. A short sentence is easy to remember.</span>
              </label>
              <label>Confirm password
                <input type={show ? 'text' : 'password'} value={again} onChange={(e) => setAgain(e.target.value)} maxLength={72} autoComplete="new-password" required
                  aria-invalid={!!matchError} aria-describedby={matchError ? 'again-err' : undefined} />
                {matchError && <span className="field-error" id="again-err">{matchError}</span>}
              </label>
              <Err error={error} />
              <button disabled={busy || !valid}>{busy ? 'Saving…' : 'Set password'}</button>
            </form>
          </>
        )}

        {state === 'done' && (
          <div role="status">
            <h2>Your account is ready</h2>
            <p className="muted">Log in with {invite?.email || 'your email'} and your new password. We will email you a 6-digit code each time.</p>
            <Link className="btn" to="/">Go to login</Link>
          </div>
        )}
        <p className="auth-foot"><Icon name="lock" size={13} /> Authorised Loyadham administrators only. Every action is recorded.</p>
      </div>
    </div>
  );
}
