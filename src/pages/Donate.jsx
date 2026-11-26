import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { Err, fmt, PageHead, useAction, useToast } from '../components/ui';
import { Icon } from '../components/icons';
import { CONFIRM_NOTE, DONATE_MAX, isHttpsUrl } from '../home';

// Donate button URL (Full Admin; backend /admin/home/donate-url, audited donate_url.changed). Loyadham's official
// donation page; empty hides the app's Donate button. The panel accepts https only.
export const donateError = (v) => {
  const s = v.trim();
  if (!s) return null;
  if (s.length > DONATE_MAX) return `At most ${DONATE_MAX} characters.`;
  return isHttpsUrl(s) ? null : 'Use a full https:// address, for example https://www.example.org/donate.';
};

export default function Donate() {
  const [saved, setSaved] = useState(null);
  const [url, setUrl] = useState('');
  const load = useAction();
  const save = useAction();
  const toast = useToast();
  const fill = (d) => { setSaved(d); setUrl(d.donateUrl || ''); };
  useEffect(() => { load.run(async () => fill(await adminApi.donateUrl())); /* eslint-disable-next-line */ }, []);

  const error = donateError(url);
  const value = url.trim();
  const changed = saved && value !== (saved.donateUrl || '');
  const submit = (e) => {
    e.preventDefault();
    if (error || !changed) return;
    save.run(async () => { fill(await adminApi.saveDonateUrl(value)); toast.show(value ? 'Donate URL saved' : 'Donate button hidden'); });
  };

  return (
    <div className="page">
      <PageHead title="Donate" subtitle="Where the app’s Donate button goes: Loyadham’s official donation page. Leave it empty to hide the button." />
      <p className="notice info" role="note"><Icon name="alert" size={16} /><span><strong>{CONFIRM_NOTE}</strong> Use only the official donation address Loyadham gives you.</span></p>
      <div className="card">
        {load.error && <Err error={load.error} />}
        {!saved && !load.error && <p className="muted">Loading…</p>}
        {saved && (
          <form onSubmit={submit} noValidate>
            <label>Donate URL
              <input type="url" inputMode="url" placeholder="https://…" value={url} maxLength={DONATE_MAX + 50} onChange={(e) => setUrl(e.target.value)} aria-invalid={!!error || undefined} />
              {error ? <span className="field-error" role="alert">{error}</span>
                : <span className="hint">{value ? 'The app opens this page in the browser.' : 'Empty: the Donate button is hidden in the app.'}</span>}
            </label>
            <p className="muted">
              {saved.isDefault ? (saved.defaultDonateUrl ? 'Now using the server setting (DONATE_URL).' : 'Not set yet: the Donate button is hidden.') : `Last changed ${fmt(saved.updatedAt)}.`}
            </p>
            <Err error={save.error} />
            <div className="row">
              <button disabled={!!error || !changed || save.busy}><Icon name="check" size={16} />Save</button>
              {value && !error && <a className="btn-secondary btn-link" href={value} target="_blank" rel="noopener noreferrer"><Icon name="external" size={16} />Open</a>}
              {changed && <button type="button" className="btn-secondary" onClick={() => fill(saved)} disabled={save.busy}>Undo changes</button>}
            </div>
          </form>
        )}
      </div>
      {toast.element}
    </div>
  );
}
