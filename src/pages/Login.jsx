import { useEffect, useRef, useState } from 'react';
import { adminApi, getDeviceToken, setDeviceToken } from '../api';
import { useAuth } from '../auth';
import { Err } from '../components/ui';
import { Icon } from '../components/icons';
import { FullLogo } from '../components/brand';

// Login is two steps: email + password -> 6-digit code sent by email -> signed in.
// The challenge token lives only in this component's state (never in storage); a reload starts over.
// Trusted device: after the first code, this browser keeps a device token (localStorage, kept on logout) and
// later sign-ins finish after the password (step: 'done'). Remember me picks localStorage + refresh vs sessionStorage.

// a***@example.com: first letter of the name part, then the domain.
export const maskEmail = (email) => {
  const [name, domain] = String(email).split('@');
  return domain ? `${name.slice(0, 1)}***@${domain}` : email;
};

const EMAIL_FAILED = "We couldn't send the code. Please try again.";
const msg = (e, fallback) => new Error(e?.code === 'EMAIL_FAILED' ? EMAIL_FAILED : (e?.message || fallback));
const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`;

export default function Login() {
  const { signIn } = useAuth();
  const [step, setStep] = useState('password');     // password | code
  const [challenge, setChallenge] = useState(null);  // { token, email }
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [code, setCode] = useState('');
  const [resendIn, setResendIn] = useState(0);       // seconds until "Resend code" is allowed
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const inFlight = useRef(false);
  const codeRef = useRef(null);

  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const t = setTimeout(() => setResendIn((s) => Math.max(0, s - 1)), 1000);
    return () => clearTimeout(t);
  }, [resendIn]);

  // Back to step 1, optionally explaining why (too many tries, expired login, resend limit).
  const startOver = (why) => {
    setStep('password'); setChallenge(null); setCode(''); setPassword(''); setResendIn(0); setNotice('');
    setError(why ? new Error(why) : null);
  };

  const guard = async (fn) => {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true);
    try { await fn(); } finally { inFlight.current = false; setBusy(false); }
  };

  const submitPassword = (e) => { e.preventDefault(); setError(null); guard(async () => {
    try {
      const r = await adminApi.login(email.trim(), password, { deviceToken: getDeviceToken() || undefined, rememberMe: remember });
      if (r.deviceTokenInvalid) setDeviceToken(null);   // revoked or unknown: forget it; the code step below trusts again
      if (r.step === 'done') { signIn(r.token, r.admin, { refreshToken: r.refreshToken, remember }); return; }
      setChallenge({ token: r.challengeToken, email: email.trim(), remember });
      setResendIn(r.resendAfterSeconds ?? 60); setCode(''); setNotice(''); setStep('code');
    } catch (err) { setError(msg(err, 'Sign in failed.')); }
  }); };

  const verify = (value) => { setError(null); setNotice(''); guard(async () => {
    try {
      const r = await adminApi.verifyOtp(challenge.token, value, true);
      if (r.deviceToken) setDeviceToken(r.deviceToken);
      signIn(r.token, r.admin, { refreshToken: r.refreshToken, remember: challenge.remember });
    } catch (err) {
      setCode('');
      switch (err.code) {
        case 'OTP_INVALID': {
          const left = err.details?.attemptsLeft;
          setError(new Error(`That code is not right.${typeof left === 'number' ? ` ${plural(left, 'try', 'tries')} left.` : ''}`));
          codeRef.current?.focus();
          break;
        }
        case 'OTP_EXPIRED': setError(new Error('This code has expired. Request a new code or start over.')); break;
        case 'OTP_LOCKED': case 'ADMIN_LOCKED': startOver('Too many wrong codes. Please log in again.'); break;
        case 'CHALLENGE_INVALID': startOver('This login has expired. Please log in again.'); break;
        default: setError(msg(err, 'Could not check the code.'));
      }
    }
  }); };

  const resend = () => { setError(null); setNotice(''); guard(async () => {
    try {
      const r = await adminApi.resendOtp(challenge.token);
      setCode(''); setResendIn(r.resendAfterSeconds ?? 60);
      setNotice(`We sent a new code.${typeof r.resendsLeft === 'number' ? ` ${plural(r.resendsLeft, 'resend')} left.` : ''}`);
      codeRef.current?.focus();
    } catch (err) {
      switch (err.code) {
        case 'RESEND_TOO_SOON': {
          const wait = err.details?.retryAfterSeconds ?? 60;
          setResendIn(wait); setError(new Error(`Please wait ${plural(wait, 'second')} before asking for a new code.`));
          break;
        }
        case 'RESEND_LIMIT': startOver('Too many new codes for this login. Please log in again.'); break;
        case 'CHALLENGE_INVALID': startOver('This login has expired. Please log in again.'); break;
        default: setError(msg(err, 'Could not send a new code.'));
      }
    }
  }); };

  // Digits only, max 6; a pasted "123 456" works too. The 6th digit submits on its own.
  const onCode = (e) => {
    const v = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(v);
    if (v.length === 6) verify(v);
  };
  const submitCode = (e) => { e.preventDefault(); if (code.length === 6) verify(code); };

  return (
    <div className="auth">
      <div className="auth-card">
        <FullLogo />
        <div className="steps" aria-hidden="true"><span className="on" /><span className={step !== 'password' ? 'on' : ''} /></div>
        {step === 'password' ? (
          <>
            <h2>Sign in</h2>
            <p className="muted">Step 1 of 2 · Enter your admin email and password.</p>
            <form onSubmit={submitPassword}>
              <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@example.org" required /></label>
              <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
              <label className="inline check"><input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
                <span>Remember me<span className="hint"> Stay signed in on this browser for 30 days. Untick on a shared computer.</span></span></label>
              <Err error={error} />
              <button disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
            </form>
          </>
        ) : (
          <>
            <h2>Check your email</h2>
            <p className="muted">Step 2 of 2 · We sent a 6-digit code to <strong>{maskEmail(challenge.email)}</strong>. It expires in 10 minutes.</p>
            <form onSubmit={submitCode}>
              <label>Code<input ref={codeRef} className="code-input" value={code} onChange={onCode} inputMode="numeric" pattern="[0-9]*" autoComplete="one-time-code" placeholder="••••••" maxLength={12} autoFocus required /></label>
              <Err error={error} />
              {notice && <p className="muted" role="status">{notice}</p>}
              <p className="info-note"><Icon name="shield" size={16} />After this code, this browser is trusted: next time only your password is needed.</p>
              <button disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Log in'}</button>
              <button type="button" className="link" onClick={resend} disabled={busy || resendIn > 0}>
                {resendIn > 0 ? `Resend code in ${resendIn}s` : 'Resend code'}
              </button>
              <button type="button" className="link" onClick={() => startOver()}>Start over</button>
            </form>
          </>
        )}
        <p className="auth-foot"><Icon name="lock" size={13} /> Authorised Loyadham administrators only. Every action is recorded.</p>
      </div>
    </div>
  );
}
