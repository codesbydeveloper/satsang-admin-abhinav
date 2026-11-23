import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';
import { fmt, fmtDate, toDate } from '../components/ui';
import { displayName, EmailFact } from '../pages/DeletionRequests';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const ago = (min) => new Date(Date.now() - min * 60000).toISOString();

// Rows in the backend's shape (src/routes/admin/deletionRequests.js).
const pendingRow = (id, extra = {}) => ({
  id, accountId: 100 + id, accountType: 'adult', source: 'app', status: 'pending', username: `user_${id}`, email: `u${id}@x.org`,
  emailVerified: true, childProfiles: 0, profilesDeleted: null, requestedAt: ago(id * 10), decidedAt: null, decidedBy: null, decisionNote: null, ...extra,
});
const PARENT = pendingRow(1, { accountType: 'parent', username: null, email: 'parent@x.org', childProfiles: 2, source: 'web' });
const UNVERIFIED = pendingRow(2, { emailVerified: false });
const DONE = { ...pendingRow(50), status: 'completed', username: null, email: null, emailVerified: null, profilesDeleted: 1, decidedAt: ago(5), decidedBy: { id: 1, name: 'Abhinav' } };

let routes; let pending;
const list = (rows, counts) => ({ status: 'pending', page: 1, pageSize: 10, total: rows.length, counts, rows });
const asRole = (role) => {
  sessionStorage.setItem('ssa_admin_token', 'tok');
  global.fetch = vi.fn((url, opts = {}) => {
    const path = url.replace(/^.*\/api\/v1/, '');
    const key = `${opts.method || 'GET'} ${path.split('?')[0]}`;
    if (key === 'GET /admin/auth/me') return json(200, { admin: { id: 1, email: 'a@x.org', name: 'Abhinav', role } });
    const h = routes[key];
    return h ? h(new URLSearchParams(path.split('?')[1] || ''), opts) : json(404, { error: { code: 'NOT_FOUND', message: `unmocked ${key}` } });
  });
};
beforeEach(() => {
  sessionStorage.clear();
  pending = [PARENT, UNVERIFIED, ...Array.from({ length: 10 }, (_, i) => pendingRow(i + 3))];   // 12 pending
  routes = {
    'GET /admin/deletion-requests': (p) => {
      const counts = { pending: pending.length, completed: 1, rejected: 0, all: pending.length + 1 };
      if (p.get('status') === 'completed') return json(200, list([DONE], counts));
      const page = Number(p.get('page')); const size = Number(p.get('pageSize'));
      return json(200, { ...list(pending.slice((page - 1) * size, page * size), counts), page, total: pending.length });
    },
  };
});
afterEach(() => vi.restoreAllMocks());

const mount = () => render(<MemoryRouter initialEntries={['/deletion-requests']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
const rowFor = async (text) => (await screen.findByRole('cell', { name: new RegExp(text) })).closest('tr');
const listCalls = () => global.fetch.mock.calls.map(([u]) => u).filter((u) => /\/admin\/deletion-requests\?/.test(u));

test('loads from the API: counts, columns, parent label, no sample banner, pagination and sidebar badge', async () => {
  asRole('full_admin'); const user = userEvent.setup(); mount();
  const parent = await rowFor('\\(parent account\\)');
  expect(within(parent).getByText('parent@x.org')).toBeInTheDocument();
  expect(within(parent).getByText('Web page')).toBeInTheDocument();
  expect(within(parent).getByRole('cell', { name: '2' })).toBeInTheDocument();
  expect(screen.queryByText(/sample data/i)).toBeNull();
  expect(screen.getByRole('button', { name: /Pending\s*12/ })).toHaveAttribute('aria-pressed', 'true');
  for (const h of ['Username', 'Account type', 'Child profiles', 'Requested from', 'Requested', 'Email verified', 'Status', 'Actions']) {
    expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
  }
  expect(listCalls()[0]).toMatch(/status=pending/); expect(listCalls()[0]).toMatch(/source=all/); expect(listCalls()[0]).toMatch(/pageSize=10/);
  expect(screen.getByText('Page 1 of 2')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Next' }));
  expect(await screen.findByText('Page 2 of 2')).toBeInTheDocument();
  expect(listCalls().at(-1)).toMatch(/page=2/);
  expect(screen.getByRole('link', { name: /^Deletion requests/ })).toHaveTextContent('12');
});

test('search sends q, source sends source, Refresh keeps them', async () => {
  asRole('full_admin'); const user = userEvent.setup(); mount();
  await rowFor('user_3');
  await user.type(screen.getByRole('searchbox'), 'parent@');
  await user.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(listCalls().at(-1)).toMatch(/q=parent%40/));
  await user.selectOptions(screen.getByRole('combobox'), 'web');
  await waitFor(() => expect(listCalls().at(-1)).toMatch(/source=web/));
  const n = listCalls().length;
  await user.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(listCalls()).toHaveLength(n + 1));
  expect(listCalls().at(-1)).toMatch(/q=parent%40.*source=web|source=web.*q=parent%40/);
});

test('reloads when the admin comes back to the tab', async () => {
  asRole('full_admin'); mount();
  await rowFor('user_3');
  const n = listCalls().length;
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await waitFor(() => expect(listCalls().length).toBeGreaterThan(n));
});

test('Approve disabled when email not verified; completed rows show only View and the admin name', async () => {
  asRole('full_admin'); const user = userEvent.setup(); mount();
  const row = await rowFor('user_2');
  const approve = within(row).getByRole('button', { name: 'Approve' });
  expect(approve).toBeDisabled();
  expect(approve.closest('[title]')).toHaveAttribute('title', 'Email not verified yet');
  await user.click(screen.getByRole('button', { name: /^Completed/ }));
  const done = await rowFor('Details removed');
  expect(within(done).getAllByRole('button').map((b) => b.textContent)).toEqual(['View']);
  routes['GET /admin/deletion-requests/50'] = () => json(200, { request: DONE, account: null, profiles: [] });
  await user.click(within(done).getByRole('button', { name: /View/ }));
  const panel = screen.getByRole('dialog', { name: 'Deletion request' });
  expect(within(panel).getByText('Abhinav')).toBeInTheDocument();
});

test('view panel shows the child profiles; approve a parent account by typing its email, then the list reloads', async () => {
  routes['GET /admin/deletion-requests/1'] = () => json(200, { request: PARENT, account: { id: 101, email: 'parent@x.org' }, profiles: [
    { id: 7, username: 'radha_nani', isChild: true, ageGroup: 'Bals/Balikas A' }, { id: 8, username: 'kanha_09', isChild: true, ageGroup: 'Bals/Balikas C' }] });
  let body;
  routes['POST /admin/deletion-requests/1/approve'] = (_p, o) => { body = JSON.parse(o.body); pending = pending.filter((r) => r.id !== 1); return json(200, { id: 1, status: 'completed', accountId: 101, profilesDeleted: 3 }); };
  asRole('full_admin'); const user = userEvent.setup(); mount();
  const row = await rowFor('\\(parent account\\)');
  await user.click(within(row).getByRole('button', { name: /View/ }));
  const panel = screen.getByRole('dialog', { name: 'Deletion request' });
  expect(await within(panel).findByText('radha_nani')).toBeInTheDocument();
  expect(within(panel).getByText('Bals/Balikas C')).toBeInTheDocument();

  await user.click(within(panel).getByRole('button', { name: 'Approve' }));
  const pop = screen.getByRole('dialog', { name: 'Permanently delete this account?' });
  expect(pop).toHaveTextContent('This will delete parent@x.org and its 2 child profiles, including progress, Sparks, Dress Up items, saved Shangars and leaderboard entries. This cannot be undone.');
  const del = within(pop).getByRole('button', { name: 'Delete permanently' });
  await user.type(within(pop).getByLabelText('Type the email to confirm'), 'parent@x.or');
  expect(del).toBeDisabled();
  await user.type(within(pop).getByLabelText('Type the email to confirm'), 'g');
  await user.click(del);

  expect(await screen.findByText('Account deleted')).toBeInTheDocument();
  expect(body).toEqual({ confirm: true });
  expect(await screen.findByRole('button', { name: /Pending\s*11/ })).toBeInTheDocument();
  await waitFor(() => expect(screen.getByRole('link', { name: /^Deletion requests/ })).toHaveTextContent('11'));
});

test('reject sends the reason (3+ characters)', async () => {
  let body;
  routes['POST /admin/deletion-requests/3/reject'] = (_p, o) => { body = JSON.parse(o.body); return json(200, { id: 3, status: 'rejected', accountId: 103 }); };
  asRole('full_admin'); const user = userEvent.setup(); mount();
  const row = await rowFor('user_3');
  await user.click(within(row).getByRole('button', { name: 'Reject' }));
  const pop = screen.getByRole('dialog', { name: 'Reject deletion request' });
  const reject = within(pop).getByRole('button', { name: 'Reject' });
  await user.type(within(pop).getByLabelText('Reason'), ' ab ');
  expect(reject).toBeDisabled();
  await user.type(within(pop).getByLabelText('Reason'), 'c');
  await user.click(reject);
  expect(await screen.findByText('Request rejected')).toBeInTheDocument();
  expect(body).toEqual({ reason: 'ab c' });
});

test.each([
  [409, 'DELETION_REQUEST_DECIDED', 'This request was already handled'],
  [404, 'DELETION_REQUEST_NOT_FOUND', 'Request not found'],
  [403, 'FORBIDDEN', "You don't have permission"],
])('a %s on reject shows "%s" in a toast', async (status, code, text) => {
  routes['POST /admin/deletion-requests/3/reject'] = () => json(status, { error: { code, message: 'server text' } });
  asRole('full_admin'); const user = userEvent.setup(); mount();
  const row = await rowFor('user_3');
  await user.click(within(row).getByRole('button', { name: 'Reject' }));
  await user.type(within(screen.getByRole('dialog')).getByLabelText('Reason'), 'reason');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reject' }));
  expect(await screen.findByText(text)).toBeInTheDocument();
});

test('a 401 logs out to the login screen', async () => {
  asRole('full_admin');
  routes['GET /admin/deletion-requests'] = () => json(401, { error: { code: 'UNAUTHORIZED', message: 'Session expired' } });
  mount();
  expect(await screen.findByRole('button', { name: /continue/i })).toBeInTheDocument();
  expect(sessionStorage.getItem('ssa_admin_token')).toBeNull();
});

test('empty state', async () => {
  pending = [];
  asRole('full_admin'); mount();
  expect(await screen.findByText('No deletion requests')).toBeInTheDocument();
});

test('Content Editor: no menu item, no API call', async () => {
  asRole('content_editor'); mount();
  expect(await screen.findByRole('link', { name: 'Blocked words' })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: /Deletion requests/ })).toBeNull();
  expect(listCalls()).toHaveLength(0);
});

// ---- Retained email (Full Admin, completed rows) and UTC timestamps (19 Nov 2026) ----
const days = (n) => new Date(Date.now() + n * 86400000).toISOString();
const fact = (panel, label) => within(panel).getByText(label, { selector: 'dt' }).nextElementSibling;
const openCompleted = async (row) => {
  routes['GET /admin/deletion-requests'] = () => json(200, list([row], { pending: 0, completed: 1, rejected: 0, all: 1 }));
  routes[`GET /admin/deletion-requests/${row.id}`] = () => json(200, { request: row, account: null, profiles: [] });
  asRole('full_admin'); const user = userEvent.setup(); mount();
  const tr = await rowFor(displayNameRe(row));
  await user.click(within(tr).getByRole('button', { name: /View/ }));
  const panel = screen.getByRole('dialog', { name: 'Deletion request' });
  await waitFor(() => expect(global.fetch.mock.calls.some(([u]) => u.endsWith(`/admin/deletion-requests/${row.id}`))).toBe(true));
  return { panel, tr };
};
// these rows are served on the default (Pending) tab, whose first column shows displayName
const displayNameRe = (r) => displayName(r).replace(/[()]/g, '\\$&');

test('completed row with a retained email: list shows it under the name; drawer shows it with the "Kept until" note', async () => {
  const until = days(29);
  const row = { ...DONE, email: 'ravi@x.org', emailRetainedUntil: until, deletedByOwner: true, decidedBy: null };
  const { panel, tr } = await openCompleted(row);
  expect(within(tr).getByText('ravi@x.org')).toBeInTheDocument();
  const email = fact(panel, 'Email');
  expect(email).toHaveTextContent('ravi@x.org');
  const dateText = fmtDate(until);
  const note = within(email).getByText(`Kept until ${dateText} – then erased automatically for privacy.`);
  expect(note).toHaveClass('cell-sub');   // the small grey note style
  expect(note).toHaveAttribute('title', fmt(until));
});

test('completed row whose retained email has passed its date shows "Details removed"', async () => {
  const { panel } = await openCompleted({ ...DONE, email: null, emailRetainedUntil: days(-1) });
  expect(fact(panel, 'Email')).toHaveTextContent(/^Details removed$/);
  expect(within(panel).queryByText(/Kept until/)).toBeNull();
});

test('completed row that kept no email shows "— (account deleted)"', async () => {
  const { panel } = await openCompleted({ ...DONE, email: null, emailRetainedUntil: null });
  expect(fact(panel, 'Email')).toHaveTextContent(/^— \(account deleted\)$/);
});

test('EmailFact: the cut-off is compared with now; a pending row without email shows a dash', () => {
  const until = '2026-12-01T00:00:00.000Z';
  const at = (iso) => render(<EmailFact r={{ status: 'completed', email: null, emailRetainedUntil: until }} now={Date.parse(iso)} />).container.textContent;
  expect(at('2026-11-30T23:59:59.000Z')).toBe('— (account deleted)');
  expect(at('2026-12-01T00:00:00.000Z')).toBe('Details removed');
  expect(render(<EmailFact r={{ status: 'pending', email: null }} />).container.textContent).toBe('—');
});

test('in-app deletion: Requested and Handled show the same local time for the same UTC moment', async () => {
  const at = '2026-11-19T12:02:37.000Z';
  const { panel } = await openCompleted({ ...DONE, requestedAt: at, decidedAt: at, decidedBy: null, deletedByOwner: true });
  const local = new Date(at).toLocaleString();
  expect(fact(panel, 'Requested')).toHaveTextContent(local);
  expect(fact(panel, 'Handled')).toHaveTextContent(local);
});

test('timestamp formatting: ISO "Z" strings are read as UTC and shown in local time; legacy zone-less strings too', () => {
  const iso = '2026-11-19T12:02:37.000Z';
  expect(toDate(iso).toISOString()).toBe(iso);
  expect(toDate('2026-11-19 12:02:37').toISOString()).toBe(iso);   // older backend format, UTC without a zone
  expect(fmt(iso)).toBe(new Date(Date.UTC(2026, 10, 19, 12, 2, 37)).toLocaleString());
  expect(fmt('2026-11-19 12:02:37')).toBe(fmt(iso));
  expect(fmt(null)).toBe('—');
});

test('a link with ?status=rejected opens the Rejected tab (the dashboard card links to ?status=pending)', async () => {
  asRole('full_admin');
  render(<MemoryRouter initialEntries={['/deletion-requests?status=rejected']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  expect(await screen.findByRole('button', { name: /^Rejected/ })).toHaveAttribute('aria-pressed', 'true');
  await waitFor(() => expect(listCalls()[0]).toMatch(/status=rejected/));
});

// ---- Part E (23 Nov 2026): Completed tab with Username + Email columns, child deletions, "Details removed" ----
const CHILD_DONE = { ...DONE, id: 61, accountType: 'parent', target: 'child_profile', profileId: 30, source: 'admin', username: 'kid_alpha', email: 'parent@x.org',
  isParentEmail: true, childProfiles: 0, profilesDeleted: 1, emailRetainedUntil: days(29) };
const ADULT_DONE = { ...DONE, id: 62, target: 'account', username: 'ravi_k', email: 'ravi@x.org', emailRetainedUntil: days(20), source: 'app', deletedByOwner: true, decidedBy: null };
const EXPIRED = { ...DONE, id: 123, target: 'account', username: null, email: null, emailRetainedUntil: days(-2) };
const showCompleted = async (rows) => {
  routes['GET /admin/deletion-requests'] = (p) => json(200, { ...list(p.get('status') === 'completed' ? rows : [], { pending: 0, completed: rows.length, rejected: 0, all: rows.length }), status: p.get('status') });
  asRole('full_admin'); const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/deletion-requests?status=completed']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  await screen.findByTestId(`completed-${rows[0].id}`);
  return user;
};

test('Completed tab: separate Username and Email columns with the real values while they are kept', async () => {
  await showCompleted([ADULT_DONE, CHILD_DONE, EXPIRED]);
  for (const h of ['Username', 'Email', 'Account type', 'Child profiles', 'Deleted from', 'Deleted', 'Status', 'Actions']) {
    expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument();
  }
  expect(screen.queryByRole('columnheader', { name: 'Email verified' })).toBeNull();
  const [nameCell, emailCell] = within(screen.getByTestId('completed-62')).getAllByRole('cell');
  expect(nameCell).toHaveTextContent('ravi_k');
  expect(nameCell).toHaveTextContent('Request #62');
  expect(emailCell).toHaveTextContent('ravi@x.org');
  expect(emailCell).toHaveTextContent(`Kept until ${fmtDate(ADULT_DONE.emailRetainedUntil)}`);
  expect(emailCell).not.toHaveTextContent('ravi_k');
});

test('a deleted child is listed with its username, "Child" type and the parent email labelled "Parent email"', async () => {
  await showCompleted([CHILD_DONE]);
  const tr = screen.getByTestId('completed-61');
  const [nameCell, emailCell, typeCell, kidsCell, fromCell] = within(tr).getAllByRole('cell');
  expect(nameCell).toHaveTextContent('kid_alpha');
  expect(emailCell).toHaveTextContent('parent@x.org');
  expect(within(emailCell).getByText('Parent email')).toBeInTheDocument();
  expect(typeCell).toHaveTextContent(/child/i);
  expect(kidsCell).toHaveTextContent('0');
  expect(fromCell).toHaveTextContent('Admin Panel');
});

test('after the period: "Details removed" and the request id, no username or email', async () => {
  await showCompleted([EXPIRED]);
  const [nameCell, emailCell] = within(screen.getByTestId('completed-123')).getAllByRole('cell');
  expect(nameCell).toHaveTextContent('Details removed');
  expect(nameCell).toHaveTextContent('Request #123');
  expect(emailCell).toHaveTextContent(/^—$/);
});

test('search on the Completed tab sends q (username, email or #ID); the Admin Panel source can be picked', async () => {
  const user = await showCompleted([ADULT_DONE]);
  const box = screen.getByRole('searchbox');
  expect(box).toHaveAttribute('placeholder', 'Search username, email or #ID');
  await user.type(box, 'kid_al');
  await user.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(listCalls().at(-1)).toMatch(/status=completed/));
  await waitFor(() => expect(listCalls().at(-1)).toMatch(/q=kid_al/));
  await user.selectOptions(screen.getByRole('combobox'), 'admin');
  await waitFor(() => expect(listCalls().at(-1)).toMatch(/source=admin/));
});
