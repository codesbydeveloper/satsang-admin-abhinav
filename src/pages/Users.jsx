import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../api';
import { Err, fmt, useAction } from '../components/ui';

export default function Users() {
  const [q, setQ] = useState(''); const [applied, setApplied] = useState(''); const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const { error, run } = useAction();
  const pageSize = 25;

  useEffect(() => { run(async () => setData(await adminApi.users({ q: applied, page, pageSize }))); /* eslint-disable-next-line */ }, [applied, page]);

  const pages = data ? Math.max(1, Math.ceil(data.totalAccounts / pageSize)) : 1;
  return (
    <>
      <h2>Users</h2>
      <form className="row" onSubmit={(e) => { e.preventDefault(); setPage(1); setApplied(q.trim()); }}>
        <input placeholder="Search username or email" value={q} onChange={(e) => setQ(e.target.value)} />
        <button>Search</button>
      </form>
      <Err error={error} />
      {data && (
        <table>
          <thead><tr><th>Username</th><th>Email</th><th>Type</th><th>Age group</th><th>Verified</th><th>Joined</th></tr></thead>
          <tbody>
            {data.rows.length === 0 && <tr><td colSpan="6" className="muted">No users found.</td></tr>}
            {data.rows.map((r) => (
              <tr key={`${r.accountId}-${r.profileId ?? 'x'}`}>
                <td><Link to={`/users/${r.accountId}`}>{r.username || (r.accountType === 'parent' ? '(parent account)' : '—')}</Link>{r.isChild && <span className="tag">child</span>}</td>
                <td>{r.email}</td>
                <td>{r.accountType}</td>
                <td>{r.ageGroup || '—'}{r.ageGroupOverridden && <span className="tag">override</span>}</td>
                <td>{r.emailVerified ? 'Yes' : 'No'}</td>
                <td>{fmt(r.createdAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="row pager">
        <button disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page} of {pages}{data ? ` · ${data.totalAccounts} accounts` : ''}</span>
        <button disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </>
  );
}
