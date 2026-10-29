import { useEffect, useState } from 'react';
import { adminApi } from '../api';
import { EmptyRow, Err, fmt, PageHead, Pager, timeAgo, useAction } from '../components/ui';
import { Icon } from '../components/icons';

const EMPTY = { action: '', entityType: '', from: '', to: '' };
const details = (d) => { if (!d) return ''; const o = typeof d === 'string' ? JSON.parse(d) : d; return Object.entries(o).map(([k, v]) => `${k}: ${v !== null && typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · '); };

export default function AuditLog() {
  const [filters, setFilters] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY); const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const { error, run } = useAction();
  const pageSize = 50;

  useEffect(() => { run(async () => setData(await adminApi.audit({ ...applied, page, pageSize }))); /* eslint-disable-next-line */ }, [applied, page]);
  const pages = data ? Math.max(1, Math.ceil(data.total / pageSize)) : 1;
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });
  const active = Object.values(applied).some(Boolean);

  return (
    <div className="page">
      <PageHead title="Audit log" subtitle="Every admin action is recorded here. Entries cannot be edited or deleted." />
      <div className="card flush">
        <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(filters); }}>
          <div className="search" style={{ maxWidth: 280 }}><Icon name="filter" size={16} /><input placeholder="Action starts with (e.g. admin.)" aria-label="Action" value={filters.action} onChange={set('action')} /></div>
          <input placeholder="Entity (e.g. profile)" aria-label="Entity" value={filters.entityType} onChange={set('entityType')} style={{ width: 170 }} />
          <label className="inline">From <input type="date" value={filters.from} onChange={set('from')} /></label>
          <label className="inline">To <input type="date" value={filters.to} onChange={set('to')} /></label>
          <button>Filter</button>
          {active && <button type="button" className="btn-secondary" onClick={() => { setFilters(EMPTY); setPage(1); setApplied(EMPTY); }}>Clear</button>}
        </form>
        {error && <div style={{ padding: '12px 20px 0' }}><Err error={error} /></div>}
        <div className="table-scroll">
          <table>
            <thead><tr><th>When</th><th>Admin</th><th>Action</th><th>Entity</th><th>Details</th><th>IP</th></tr></thead>
            <tbody>
              {!data && !error && <EmptyRow cols={6} icon="list">Loading…</EmptyRow>}
              {data && data.entries.length === 0 && <EmptyRow cols={6} icon="list">No entries{active ? ' match these filters' : ''}.</EmptyRow>}
              {data && data.entries.map((e) => (
                <tr key={e.id}>
                  <td title={fmt(e.createdAt)} style={{ whiteSpace: 'nowrap' }}><div className="cell-main" style={{ fontWeight: 500 }}>{timeAgo(e.createdAt)}</div><div className="cell-sub">{fmt(e.createdAt)}</div></td>
                  <td className="cell-sub">{e.adminEmail || '—'}</td>
                  <td><span className="pill muted"><code>{e.action}</code></span></td>
                  <td>{e.entityType ? <>{e.entityType} <span className="muted">#{e.entityId}</span></> : <span className="muted">—</span>}</td>
                  <td className="details">{details(e.details)}</td>
                  <td className="cell-sub">{e.ip || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} pages={pages} total={data?.total} noun="entries" onPage={setPage} />
      </div>
    </div>
  );
}
