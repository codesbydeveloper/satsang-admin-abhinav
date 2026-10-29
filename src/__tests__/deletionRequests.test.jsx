import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';

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
  const done = await rowFor('\\(adult account\\)');
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
