import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { ApiError } from '../api';
import { AuthProvider } from '../auth';
import { createUser } from '../api/users';

vi.mock('../api/users', async (orig) => { const real = await orig(); return { ...real, createUser: vi.fn(real.createUser) }; });

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
const openModal = async (user) => {
  await screen.findByText('radha_seva');
  await user.click(screen.getByRole('button', { name: 'Add user' }));
  return screen.getByRole('dialog', { name: 'Add user' });
};
const fillValid = async (user, d) => {
  await user.type(within(d).getByLabelText(/^Email/), 'new@x.org');
  await user.type(within(d).getByLabelText(/^Password/), 'secret123');
  await user.click(within(d).getByLabelText('Parent'));
};

test('Add user: Create stays disabled until the form is valid; defaults; eye toggle; child note', async () => {
  const user = userEvent.setup(); mount();
  const d = await openModal(user);
  const create = within(d).getByRole('button', { name: 'Create user' });
  expect(create).toBeDisabled();
  expect(within(d).getByLabelText('Language')).toHaveValue('en');
  expect(within(d).getByLabelText('Mode')).toHaveValue('satsang');
  expect(within(d).getByLabelText('Mark email as verified')).not.toBeChecked();
  expect(within(d).getByText('Child profiles can only be added by the parent in the app.')).toBeInTheDocument();

  await user.type(within(d).getByLabelText(/^Email/), 'new@x');
  await user.type(within(d).getByLabelText(/^Password/), 'short1');
  await user.click(within(d).getByLabelText('Adult'));
  expect(within(d).getByText('Enter a valid email')).toBeInTheDocument();
  expect(within(d).getByText('Use at least 8 characters')).toBeInTheDocument();
  expect(create).toBeDisabled();

  const pw = within(d).getByLabelText(/^Password/);
  expect(pw).toHaveAttribute('type', 'password');
  await user.click(within(d).getByRole('button', { name: 'Show password' }));
  expect(pw).toHaveAttribute('type', 'text');

  await user.type(within(d).getByLabelText(/^Email/), '.org');
  await user.type(pw, '23');
  expect(create).toBeEnabled();
  await user.type(within(d).getByLabelText(/^Phone/), 'abc');
  expect(create).toBeDisabled();
});

test('Add user: sends the body, closes, toasts "User created" and reloads the list', async () => {
  const user = userEvent.setup(); mount();
  const d = await openModal(user);
  await fillValid(user, d);
  await user.selectOptions(within(d).getByLabelText('Language'), 'gu');
  await user.type(within(d).getByLabelText(/^Phone/), '+1 555 0100');
  await user.click(within(d).getByLabelText('Mark email as verified'));
  const before = userCalls().length;
  await user.click(within(d).getByRole('button', { name: 'Create user' }));
  expect(await screen.findByText('User created')).toBeInTheDocument();
  expect(createUser).toHaveBeenCalledWith({ email: 'new@x.org', password: 'secret123', accountType: 'parent', language: 'gu', mode: 'satsang', phone: '+1 555 0100', emailVerified: true });
  expect(screen.queryByRole('dialog', { name: 'Add user' })).toBeNull();
  await waitFor(() => expect(userCalls().length).toBe(before + 1));
});

test('Add user: 409 EMAIL_TAKEN shows under Email; 400 field details show under the field', async () => {
  createUser.mockRejectedValueOnce(new ApiError(409, 'EMAIL_TAKEN', 'taken'));
  const user = userEvent.setup(); mount();
  const d = await openModal(user);
  await fillValid(user, d);
  await user.click(within(d).getByRole('button', { name: 'Create user' }));
  expect(await within(d).findByText('An account with this email already exists')).toBeInTheDocument();
  expect(within(d).getByLabelText(/^Email/)).toHaveAttribute('aria-invalid', 'true');

  createUser.mockRejectedValueOnce(new ApiError(400, 'VALIDATION_ERROR', 'Some fields are invalid', [{ field: 'phone', message: 'Enter a valid phone number' }]));
  await user.type(within(d).getByLabelText(/^Email/), 'x');   // editing clears the server message
  expect(within(d).queryByText('An account with this email already exists')).toBeNull();
  await user.click(within(d).getByRole('button', { name: 'Create user' }));
  expect(await within(d).findByText('Enter a valid phone number')).toBeInTheDocument();
});

test('Refresh reloads with the same search and page; also when coming back to the tab', async () => {
  const user = userEvent.setup(); mount();
  await screen.findByText('radha_seva');
  await user.type(screen.getByLabelText('Search username or email'), 'radha');
  await user.click(screen.getByRole('button', { name: 'Search' }));
  await waitFor(() => expect(userCalls().at(-1)).toMatch(/q=radha/));
  const n = userCalls().length;
  await user.click(screen.getByRole('button', { name: 'Refresh' }));
  await waitFor(() => expect(userCalls()).toHaveLength(n + 1));
  expect(userCalls().at(-1)).toMatch(/q=radha/);
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await waitFor(() => expect(userCalls()).toHaveLength(n + 2));
});
