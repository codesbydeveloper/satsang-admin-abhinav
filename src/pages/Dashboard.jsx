import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { adminApi } from '../api';
import { useAuth } from '../auth';
import { BarList, Donut, LineChart } from '../components/charts';
import { fmt, timeAgo, useAction } from '../components/ui';
import { Icon } from '../components/icons';

const TYPE_LABEL = { adult: 'Adult', parent: 'Parent', child: 'Child profile' };
const MODE_LABEL = { sanatan: 'Sanatan', satsang: 'Satsang', not_set: 'Not chosen yet' };
const LANG_LABEL = { en: 'English', gu: 'ગુજરાતી (Gujarati)' };

// "What changed" for an audit entry: the entity plus its details, kept to one short line.
function describeChange(a) {
  let d = a.details;
  if (typeof d === 'string') { try { d = JSON.parse(d); } catch { /* plain text */ } }
  const extra = d && typeof d === 'object'
    ? Object.entries(d).map(([k, v]) => `${k}: ${v !== null && typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')
    : (d || '');
  const s = [a.entityType ? `${a.entityType} #${a.entityId}` : '', extra].filter(Boolean).join(' · ');
  return s.length > 140 ? `${s.slice(0, 139)}…` : (s || '—');
}

function WelcomeBar({ admin, isFull }) {
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return (
    <header className="welcome">
      <div>
        <h2>Welcome, {admin.name || admin.email}</h2>
        <span className={`badge${isFull ? ' full' : ''}`}>{isFull ? 'Full Admin' : 'Content Editor'}</span>
      </div>
      <time dateTime={new Date().toISOString().slice(0, 10)} className="muted">{today}</time>
    </header>
  );
}

function SummaryCards({ s }) {
  const card = (key, label, value, extra = {}) => {
    const body = (
      <>
        <span className="stat-label">{label}</span>
        <span className="stat-value">{value.toLocaleString()}</span>
        {extra.hint && <span className="stat-hint">{extra.hint}</span>}
      </>
    );
    const cls = `stat${extra.warn ? ' warn' : ''}`;
    return extra.to
      ? <Link key={key} to={extra.to} className={cls} aria-label={label}>{body}</Link>
      : <div key={key} className={cls} aria-label={label}>{body}</div>;
  };
  // The backend has no deletion-request queue yet (accounts are deleted immediately), so no count to show.
  const pending = s.pendingDeletions;
  const hasPending = typeof pending === 'number';
  return (
    <div className="stats">
      {card('total', 'Total accounts', s.accounts, { to: '/users' })}
      {card('adult', 'Adult / independent', s.adultAccounts)}
      {card('parent', 'Parent accounts', s.parentAccounts)}
      {card('child', 'Child profiles', s.childProfiles)}
      {card('today', 'New registrations today', s.newRegistrationsToday, { hint: 'Since midnight, New York time' })}
      {card('deletions', 'Pending deletion requests', hasPending ? pending : '—', {
        to: '/deletion-requests', warn: hasPending && pending > 0,
        hint: !hasPending ? 'Not tracked yet' : pending > 0 ? '⚠ Needs review' : 'All clear',
      })}
    </div>
  );
}

function Panel({ title, action, children, className = '' }) {
  return (
    <section className={`panel ${className}`}>
      <div className="panel-head"><h3>{title}</h3>{action}</div>
      {children}
    </section>
  );
}

function Registrations({ data }) {
  const [days, setDays] = useState(7);
  const shown = data.slice(-days);
  const total = shown.reduce((sum, d) => sum + d.count, 0);
  return (
    <Panel title="New registrations" action={
      <div className="segmented" role="group" aria-label="Time range">
        {[7, 30].map((d) => <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>Last {d} days</button>)}
      </div>
    }>
      <p className="muted">{total.toLocaleString()} new accounts in the last {days} days</p>
      <LineChart data={shown} />
    </Panel>
  );
}

function RecentRegistrations({ rows }) {
  return (
    <Panel title="Recent registrations" action={<Link to="/users">View all</Link>} className="wide">
      <div className="table-scroll">
        <table>
          <thead><tr><th>Username</th><th>Account type</th><th>Age group</th><th>Registered</th><th /></tr></thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan="5" className="muted">No registrations yet.</td></tr>}
            {rows.map((r) => (
              <tr key={`${r.type}-${r.accountId}-${r.profileId ?? 'x'}`}>
                <td className="gu">{r.username || <span className="muted">(parent account)</span>}</td>
                <td>{TYPE_LABEL[r.type] || r.type}</td>
                <td>{r.ageGroup || '—'}</td>
                <td title={fmt(r.createdAt)}>{timeAgo(r.createdAt)}</td>
                <td><Link className="btn-small" to={`/users/${r.accountId}`}>View</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

function RecentActivity({ items }) {
  return (
    <Panel title="Recent admin activity" action={<Link to="/audit-log">View all</Link>}>
      {items.length === 0 && <p className="muted">No admin activity yet.</p>}
      <ul className="activity">
        {items.map((a) => (
          <li key={a.id}>
            <div><b>{a.adminName || a.adminEmail || 'System'}</b> <code>{a.action}</code></div>
            <div className="muted details">{describeChange(a)}</div>
            <time dateTime={a.createdAt} title={fmt(a.createdAt)} className="muted">{timeAgo(a.createdAt)}</time>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function QuickActions({ isFull }) {
  return (
    <Panel title="Quick actions">
      <div className="quick">
        {isFull ? (
          <>
            <Link className="btn" to="/users"><Icon name="search" size={16} />Search user</Link>
            <Link className="btn btn-secondary" to="/admins"><Icon name="plus" size={16} />Add admin</Link>
            <Link className="btn btn-secondary" to="/deletion-requests"><Icon name="trash" size={16} />View deletion requests</Link>
          </>
        ) : (
          <Link className="btn" to="/blocked-words"><Icon name="ban" size={16} />Blocked words</Link>
        )}
      </div>
    </Panel>
  );
}

function Skeleton() {
  return (
    <div aria-busy="true" aria-label="Loading dashboard">
      <div className="stats">{Array.from({ length: 6 }, (_, i) => <div key={i} className="stat skeleton" style={{ height: 96 }} />)}</div>
      <div className="dash-grid">
        <div className="panel skeleton" style={{ height: 320 }} />
        <div className="panel skeleton" style={{ height: 320 }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { admin, isFull } = useAuth();
  const [data, setData] = useState(null);
  const { busy, error, run } = useAction();
  // User numbers are Full Admin only (Content Editors see content + blocked words only).
  const load = () => run(async () => { setData(null); setData(await adminApi.dashboard()); });
  useEffect(() => { if (isFull) load(); /* eslint-disable-next-line */ }, [isFull]);

  return (
    <div className="dashboard">
      <WelcomeBar admin={admin} isFull={isFull} />
      {isFull && (
        <>
          {error && (
            <div className="error-box" role="alert">
              <p>{error.message || 'Could not load the dashboard.'}</p>
              <button type="button" onClick={load} disabled={busy}>Try again</button>
            </div>
          )}
          {!data && !error && <Skeleton />}
          {data && (
            <>
              <SummaryCards s={data.totals} />
              <div className="dash-grid">
                <Panel title="Users by age group">
                  <p className="muted">Profiles in each age group (adults and children)</p>
                  <BarList data={data.ageGroups.map((g) => ({ label: g.ageGroup, value: g.count }))} />
                </Panel>
                <Registrations data={data.registrations.series} />
                <Panel title="Users by mode and language" className="wide">
                  <div className="donuts">
                    <div><h4>Mode</h4><Donut centerLabel="profiles" segments={data.modes.map((m) => ({ label: MODE_LABEL[m.key] || m.key, value: m.count, neutral: m.key === 'not_set' }))} /></div>
                    <div><h4>Language</h4><Donut centerLabel="profiles" segments={data.languages.map((l) => ({ label: LANG_LABEL[l.key] || l.key, value: l.count }))} /></div>
                  </div>
                </Panel>
                <RecentRegistrations rows={data.recentRegistrations} />
                <RecentActivity items={data.recentAdminActivity} />
                <QuickActions isFull />
              </div>
              <p className="muted">Updated {fmt(data.generatedAt)}</p>
            </>
          )}
        </>
      )}
      {!isFull && <div className="dash-grid"><QuickActions isFull={false} /></div>}
    </div>
  );
}
