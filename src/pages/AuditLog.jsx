import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { Err, fmt, useAction } from '../components/ui';

export default function AuditLog() {
  const [filters, setFilters] = useState({ action: '', entityType: '', from: '', to: '' });
  const [applied, setApplied] = useState(filters); const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const { error, run } = useAction();
  const pageSize = 50;

  useEffect(() => { run(async () => setData(await adminApi.audit({ ...applied, page, pageSize }))); /* eslint-disable-next-line */ }, [applied, page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <>
      <h2>Audit log</h2>
      <p className="muted">Every admin action is recorded here. Entries cannot be edited or deleted.</p>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(filters); }}>
        <input placeholder="Action starts with (e.g. admin.)" value={filters.action} onChange={set('action')} />
        <input placeholder="Entity (e.g. profile)" value={filters.entityType} onChange={set('entityType')} />
        <label className="inline">From <input type="date" value={filters.from} onChange={set('from')} /></label>
        <label className="inline">To <input type="date" value={filters.to} onChange={set('to')} /></label>
        <button>Filter</button>
      </form>
      <Err error={error} />
      {data && (
        <table>
          <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Entity</th><th>Details</th><th>IP</th></tr></thead>
          <tbody>
            {data.entries.length === 0 && <tr><td colSpan="6" className="muted">No entries.</td></tr>}
            {data.entries.map((e) => (
              <tr key={e.id}>
                <td>{fmt(e.createdAt)}</td><td>{e.adminEmail || '—'}</td><td><code>{e.action}</code></td>
                <td>{e.entityType ? `${e.entityType} #${e.entityId}` : '—'}</td>
                <td className="details">{e.details ? JSON.stringify(typeof e.details === 'string' ? JSON.parse(e.details) : e.details) : ''}</td>
                <td>{e.ip || ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row pager">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}{data ? ` · ${data.total} entries` : ''}</span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </>
  );
}
