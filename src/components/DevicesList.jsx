import { useEffect, useState } from 'react';
import { EmptyRow, Err, fmt, fmtDate, timeAgo } from './ui';

export const DEVICE_NOTE = 'Removing a device means the next sign-in there needs an email code.';

// Trusted browsers of one admin: label, added, last used, and Remove (asks first, in the row).
// load() resolves to { devices: [{ id, label, createdAt, lastUsedAt }] }; remove(id) revokes one.
export default function DevicesList({ load, remove, onRemoved }) {
  const [devices, setDevices] = useState(null);
  const [error, setError] = useState(null);
  const [asking, setAsking] = useState(null);   // device id waiting for "Yes, remove"
  const [busyId, setBusyId] = useState(null);

  const refresh = async () => {
    try { setDevices((await load()).devices || []); } catch (e) { setError(e); setDevices((d) => d || []); }
  };
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const confirmRemove = async (d) => {
    setBusyId(d.id); setError(null);
    try { await remove(d.id); setAsking(null); onRemoved?.(d); await refresh(); } catch (e) { setError(e); } finally { setBusyId(null); }
  };

  return (
    <>
      <p className="muted">{DEVICE_NOTE}</p>
      <Err error={error} />
      <div className="table-scroll">
        <table>
          <thead><tr><th>Device</th><th>Added</th><th>Last used</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {!devices && <EmptyRow cols={4} icon="shield">Loading devices…</EmptyRow>}
            {devices && devices.length === 0 && <EmptyRow cols={4} icon="shield">No trusted devices.</EmptyRow>}
            {devices && devices.map((d) => (
              <tr key={d.id} data-testid={`device-${d.id}`}>
                <td>{d.label || 'Unknown browser'}</td>
                <td title={fmt(d.createdAt)}>{fmtDate(d.createdAt)}</td>
                <td title={fmt(d.lastUsedAt)}>{d.lastUsedAt ? timeAgo(d.lastUsedAt) : <span className="muted">Never</span>}</td>
                <td className="actions">
                  {asking === d.id ? <>
                    <span className="muted">Remove this device?</span>
                    <button type="button" className="link danger" disabled={busyId === d.id} onClick={() => confirmRemove(d)}>
                      {busyId === d.id ? 'Removing…' : 'Yes, remove'}
                    </button>
                    <button type="button" className="link" disabled={busyId === d.id} onClick={() => setAsking(null)}>Keep</button>
                  </> : <button type="button" className="link danger" onClick={() => setAsking(d.id)}>Remove</button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
