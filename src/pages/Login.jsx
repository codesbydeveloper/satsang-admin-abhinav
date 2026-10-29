import { useState } from 'react';
import { adminApi } from '../api';
import { useAuth } from '../auth';
import { Err, useAction } from '../components/ui';
import { Icon, Logo } from '../components/icons';

// Login is three steps: password -> authenticator code (first time: scan QR) -> signed in.
export default function Login() {
  const { signIn } = useAuth();
  const [step, setStep] = useState('password');     // password | totp_setup | totp_verify
  const [stepToken, setStepToken] = useState(null);
  const [setup, setSetup] = useState(null);          // { secret, qrDataUrl }
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const { busy, error, run, setError } = useAction();

  const reset = () => { setStep('password'); setStepToken(null); setSetup(null); setCode(''); setPassword(''); setError(null); };

  const submitPassword = (e) => { e.preventDefault(); run(async () => {
    const r = await adminApi.login(email.trim(), password);
    setStepToken(r.stepToken); setStep(r.step);
    if (r.step === 'totp_setup') setSetup(await adminApi.totpSetup(r.stepToken));
  }); };

  const submitCode = (e) => { e.preventDefault(); run(async () => {
    const r = step === 'totp_setup' ? await adminApi.totpEnable(stepToken, code) : await adminApi.totpVerify(stepToken, code);
    signIn(r.token, r.admin);
  }); };

  return (
    <div className="auth">
      <div className="auth-card">
        <div className="auth-brand"><Logo size={40} /><div>Satsang Spark<small>Admin Panel</small></div></div>
        <div className="steps" aria-hidden="true"><span className="on" /><span className={step !== 'password' ? 'on' : ''} /></div>
        {step === 'password' ? (
          <>
            <h2>Sign in</h2>
            <p className="muted">Step 1 of 2 · Enter your admin email and password.</p>
            <form onSubmit={submitPassword}>
              <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" placeholder="you@example.org" required /></label>
              <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
              <Err error={error} />
              <button disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
            </form>
          </>
        ) : (
          <>
            <h2>{step === 'totp_setup' ? 'Set up two-factor' : 'Two-factor check'}</h2>
            <p className="muted">Step 2 of 2 · {step === 'totp_setup' ? 'Scan the QR code, then enter the 6-digit code.' : 'Enter the 6-digit code from your authenticator app.'}</p>
            <form onSubmit={submitCode}>
              {step === 'totp_setup' && setup && (
                <div className="qr">
                  <p className="muted">Scan with Google Authenticator, Microsoft Authenticator or Authy.</p>
                  <img src={setup.qrDataUrl} alt="Authenticator QR code" width="180" height="180" />
                  <p className="muted">Can't scan? Enter this key manually:<br /><code>{setup.secret}</code></p>
                </div>
              )}
              <label>Code<input className="code-input" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" placeholder="••••••" autoFocus required /></label>
              <Err error={error} />
              <button disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Log in'}</button>
              <button type="button" className="link" onClick={reset}>Start over</button>
            </form>
          </>
        )}
        <p className="auth-foot"><Icon name="lock" size={13} /> Authorised Loyadham administrators only. Every action is recorded.</p>
      </div>
    </div>
  );
}
