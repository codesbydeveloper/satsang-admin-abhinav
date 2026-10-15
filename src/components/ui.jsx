import { useState } from 'react';

export const Err = ({ error }) => (error ? <p className="error" role="alert">{error.message || String(error)}</p> : null);

// Runs an async action, tracking busy/error state for a form or button.
export function useAction() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const run = async (fn) => {
    setBusy(true); setError(null);
    try { return await fn(); } catch (e) { setError(e); return undefined; } finally { setBusy(false); }
  };
  return { busy, error, run, setError };
}

export const fmt = (d) => (d ? new Date(d).toLocaleString() : '—');
