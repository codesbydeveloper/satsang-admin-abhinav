import { useState } from 'react';
import { adminApi } from '../api';
import { useAuth } from '../auth';
import { Err, useAction } from '../components/ui';

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
    <div className="login">
      <h1>Satsang Spark<small>Admin Panel</small></h1>
      {step === 'password' ? (
        <form onSubmit={submitPassword}>
          <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required /></label>
          <Err error={error} />
          <button disabled={busy}>{busy ? 'Checking…' : 'Continue'}</button>
        </form>
      ) : (
        <form onSubmit={submitCode}>
          {step === 'totp_setup' && setup && (
            <div className="qr">
              <p>First login: scan this with Google Authenticator, Authy or similar, then enter the 6-digit code.</p>
              <img src={setup.qrDataUrl} alt="Authenticator QR code" width="200" height="200" />
              <p className="muted">Can't scan? Enter this key manually: <code>{setup.secret}</code></p>
            </div>
          )}
          {step === 'totp_verify' && <p>Enter the 6-digit code from your authenticator app.</p>}
          <label>Code<input value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" autoFocus required /></label>
          <Err error={error} />
          <button disabled={busy || code.length !== 6}>{busy ? 'Checking…' : 'Log in'}</button>
          <button type="button" className="link" onClick={reset}>Start over</button>
        </form>
      )}
    </div>
  );
}
