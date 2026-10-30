import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const SETTINGS = { newUserSparks: 25, referrerSparks: 50, windowHours: 48, maxPerReferrer: null };
const LIST = { page: 1, pageSize: 25, total: 2, rows: [
  { id: 2, code: 'K7P2QX', status: 'waiting_for_first_quiz', referrer: { accountId: 4, accountType: 'adult', username: 'friend_1' },
    referee: { accountId: 9, accountType: 'adult', username: 'new_one' }, newUserSparks: 25, newUserStatus: 'reserved', referrerSparks: 50,
    createdAt: '2026-10-30 09:00:00', qualifiedAt: null, creditedAt: null },
  { id: 1, code: 'ABCD23', status: 'qualified', referrer: null,
    referee: { accountId: 7, accountType: 'parent', username: null }, newUserSparks: 25, newUserStatus: 'reserved', referrerSparks: 50,
    createdAt: '2026-10-29 09:00:00', qualifiedAt: '2026-10-29 12:00:00', creditedAt: null },
] };

let role = 'full_admin';
beforeEach(() => {
  role = 'full_admin';
  sessionStorage.setItem('ssa_admin_token', 'tok');
  global.fetch = vi.fn((url, opts = {}) => {
    if (url.endsWith('/admin/auth/me')) return json(200, { admin: { id: 1, email: 'a@x.org', name: 'Abhinav', role } });
    if (url.endsWith('/admin/referrals/settings') && opts.method === 'PUT') return json(200, { settings: { ...SETTINGS, ...JSON.parse(opts.body) } });
    if (url.endsWith('/admin/referrals/settings')) return json(200, { settings: SETTINGS });
    if (url.includes('/admin/referrals?')) return json(200, LIST);
    if (url.includes('/admin/dashboard')) return json(503, { error: { code: 'UNAVAILABLE', message: 'not needed here' } });
    if (url.includes('/admin/deletion-requests')) return json(200, { counts: { pending: 0 }, rows: [], total: 0 });
    return json(404, { error: { code: 'NOT_FOUND', message: 'unmocked' } });
  });
});
afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

const mount = (path = '/referrals') => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);

test('Full Admin: the four settings load; Unlimited disables the max; Save sends only valid values', async () => {
  const user = userEvent.setup(); mount();
  const newUser = await screen.findByLabelText(/^New user Sparks/);
  expect(newUser).toHaveValue(25);
  expect(screen.getByLabelText(/^Referrer Sparks/)).toHaveValue(50);
  expect(screen.getByLabelText(/^Window \(hours\)/)).toHaveValue(48);
  const max = screen.getByLabelText(/^Max referrals per person/);
  expect(max).toBeDisabled();
  expect(screen.getByLabelText(/^Unlimited/)).toBeChecked();
  const save = screen.getByRole('button', { name: 'Save settings' });
  expect(save).toBeDisabled();   // nothing changed

  await user.clear(screen.getByLabelText(/^Referrer Sparks/));
  await user.type(screen.getByLabelText(/^Referrer Sparks/), '60');
  await user.click(screen.getByLabelText(/^Unlimited/));
  expect(max).toBeEnabled();
  expect(save).toBeDisabled();   // a limit is needed now
  await user.type(max, '10');
  expect(save).toBeEnabled();
  await user.click(save);

  await waitFor(() => expect(screen.getByText('Referral settings saved')).toBeInTheDocument());
  const put = global.fetch.mock.calls.find(([u, o]) => u.endsWith('/admin/referrals/settings') && o?.method === 'PUT');
  expect(JSON.parse(put[1].body)).toEqual({ newUserSparks: 25, referrerSparks: 60, windowHours: 48, maxPerReferrer: 10 });
});

test('Full Admin: the list shows code, usernames and status, never emails; filters reach the API', async () => {
  const user = userEvent.setup(); mount();
  expect(await screen.findByText('K7P2QX')).toBeInTheDocument();
  const table = screen.getByRole('table');
  expect(within(table).getByText('friend_1')).toBeInTheDocument();
  expect(within(table).getByText('new_one')).toBeInTheDocument();
  expect(within(table).getByText('Waiting for first quiz')).toBeInTheDocument();
  expect(within(table).getByText('Deleted account')).toBeInTheDocument();
  expect(within(table).getByText('Parent account #7')).toBeInTheDocument();
  expect(table.textContent).not.toMatch(/@/);

  await user.click(screen.getByRole('button', { name: 'Qualified' }));
  await waitFor(() => expect(global.fetch.mock.calls.some(([u]) => u.includes('/admin/referrals?') && u.includes('status=qualified'))).toBe(true));
  await user.type(screen.getByLabelText('Search referrals'), 'new_{Enter}');
  await waitFor(() => expect(global.fetch.mock.calls.some(([u]) => u.includes('q=new_'))).toBe(true));
});

test('Full Admin sees Referrals in the sidebar', async () => {
  mount('/dashboard');
  expect(await screen.findByRole('link', { name: 'Referrals' })).toBeInTheDocument();
});

test('Content Editor: no Referrals link and /referrals goes back to the dashboard', async () => {
  role = 'content_editor';
  mount('/referrals');
  await screen.findByRole('link', { name: 'Dashboard' });
  expect(screen.queryByRole('link', { name: 'Referrals' })).toBeNull();
  expect(screen.queryByText('Referral settings')).toBeNull();
  expect(global.fetch.mock.calls.some(([u]) => u.includes('/admin/referrals'))).toBe(false);
});
