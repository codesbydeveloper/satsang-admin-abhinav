import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const USERS = { page: 1, pageSize: 25, totalAccounts: 1, rows: [
  { accountId: 5, email: 'adult@x.org', accountType: 'adult', emailVerified: true, createdAt: new Date().toISOString(), profileId: 9, username: 'radha_seva', ageGroup: 'Vadil', ageGroupOverridden: false, isChild: false }] };

beforeEach(() => {
  sessionStorage.setItem('ssa_admin_token', 'tok');
  global.fetch = vi.fn((url) => {
    if (url.endsWith('/admin/auth/me')) return json(200, { admin: { id: 1, email: 'a@x.org', name: 'Abhinav', role: 'full_admin' } });
    if (url.includes('/admin/users?')) return json(200, USERS);
    return json(404, { error: { code: 'NOT_FOUND', message: 'unmocked' } });
  });
});
afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

const mount = () => render(<MemoryRouter initialEntries={['/users']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
const userCalls = () => global.fetch.mock.calls.map(([u]) => u).filter((u) => u.includes('/admin/users?'));
test('Users is view only: no "Add user" button or dialog, but Export to CSV and View stay', async () => {
  mount();
  expect(await screen.findByText('radha_seva')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /add user/i })).toBeNull();
  expect(screen.queryByText(/add user/i)).toBeNull();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: 'Export to CSV' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'View radha_seva' })).toBeInTheDocument();
  expect(global.fetch.mock.calls.some(([, o]) => o?.method === 'POST')).toBe(false);
});

test('Refresh reloads with the same search and page; also when coming back to the tab', async () => {
  const user = userEvent.setup(); mount();
  await screen.findByText('radha_seva');
  await user.type(screen.getByLabelText('Search name, username or email'), 'radha');
  await user.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(userCalls().at(-1)).toMatch(/q=radha/));
  const n = userCalls().length;
  await user.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(userCalls()).toHaveLength(n + 1));
  expect(userCalls().at(-1)).toMatch(/q=radha/);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await waitFor(() => expect(userCalls()).toHaveLength(n + 2));
});
