import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
let routes;
const TOKEN = 'inv_abc123';
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  routes = { [`GET /admin/auth/invite/${TOKEN}`]: () => json(200, { email: 'priya@example.org', name: 'Priya', role: 'content_editor' }) };
  global.fetch = vi.fn((url, opts = {}) => {
    const key = `${opts.method || 'GET'} ${url.replace(/^.*\/api\/v1/, '').split('?')[0]}`;
    return routes[key] ? routes[key](opts) : json(404, { error: { code: 'NOT_FOUND', message: `unmocked ${key}` } });
  });
});
afterEach(() => vi.restoreAllMocks());

const mount = (qs = `?token=${TOKEN}`) => render(<MemoryRouter initialEntries={[`/accept-invite${qs}`]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
const noTokenInStorage = () => expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain(TOKEN);

test('valid link: shows name, email, role; sets the password; "Your account is ready" + Go to login', async () => {
  routes['POST /admin/auth/accept-invite'] = (o) => {
    expect(o.headers.Authorization).toBeUndefined();
    expect(JSON.parse(o.body)).toEqual({ token: TOKEN, password: 'a long passphrase' });
    return json(200, { ok: true, email: 'priya@example.org', message: 'Your password is set. You can now log in.' });
  };
  const user = userEvent.setup(); mount();
  expect(await screen.findByRole('heading', { name: 'Set your password' })).toBeInTheDocument();
  expect(screen.getByText('priya@example.org')).toBeInTheDocument();
  expect(screen.getByText('Priya')).toBeInTheDocument();
  expect(screen.getAllByText('Content Editor').length).toBeGreaterThan(0);
  expect(screen.queryByRole('link', { name: 'Dashboard' })).toBeNull();   // no admin menus, no login needed
  const pw = screen.getByLabelText(/^password/i);
  await user.type(pw, 'a long passphrase');
  await user.type(screen.getByLabelText(/^confirm password/i), 'a long passphrase');
  // show / hide
  expect(pw).toHaveAttribute('type', 'password');
  await user.click(screen.getByRole('button', { name: 'Show password' }));
  expect(pw).toHaveAttribute('type', 'text');
  await user.click(screen.getByRole('button', { name: 'Hide password' }));
  expect(pw).toHaveAttribute('type', 'password');
  await user.click(screen.getByRole('button', { name: 'Set password' }));
  expect(await screen.findByRole('heading', { name: 'Your account is ready' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Go to login' })).toHaveAttribute('href', '/');
  noTokenInStorage();
});

test('short password or mismatched passwords keep the button disabled and explain why', async () => {
  const user = userEvent.setup(); mount();
  await screen.findByRole('heading', { name: 'Set your password' });
  const btn = screen.getByRole('button', { name: 'Set password' });
  await user.type(screen.getByLabelText(/^password/i), 'short');
  await user.tab();
  expect(screen.getByText(/at least 12 characters/i)).toHaveClass('field-error');
  expect(btn).toBeDisabled();
  await user.type(screen.getByLabelText(/^password/i), ' but now long enough');
  await user.type(screen.getByLabelText(/^confirm password/i), 'something else entirely');
  expect(screen.getByText('The passwords do not match.')).toBeInTheDocument();
  expect(btn).toBeDisabled();
  expect(global.fetch.mock.calls.some(([u]) => u.includes('accept-invite'))).toBe(false);
});

test('invalid link: clear screen asking a Full Admin to resend', async () => {
  routes[`GET /admin/auth/invite/${TOKEN}`] = () => json(404, { error: { code: 'INVITE_INVALID', message: 'x' } });
  mount();
  expect(await screen.findByRole('heading', { name: 'This invite link is not valid' })).toBeInTheDocument();
  expect(screen.getByText(/Ask a Full Admin to resend your invite/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/^password/i)).toBeNull();
});

test('expired link: clear screen asking a Full Admin to resend', async () => {
  routes[`GET /admin/auth/invite/${TOKEN}`] = () => json(410, { error: { code: 'INVITE_EXPIRED', message: 'x' } });
  mount();
  expect(await screen.findByRole('heading', { name: 'This invite has expired' })).toBeInTheDocument();
  expect(screen.getByText(/Ask a Full Admin to resend your invite/)).toBeInTheDocument();
});

test('missing token: invalid screen without calling the API', async () => {
  mount('');
  expect(await screen.findByRole('heading', { name: 'This invite link is not valid' })).toBeInTheDocument();
  expect(global.fetch).not.toHaveBeenCalled();
});

test('link that expires between loading and saving shows the expired screen', async () => {
  routes['POST /admin/auth/accept-invite'] = () => json(410, { error: { code: 'INVITE_EXPIRED', message: 'x' } });
  const user = userEvent.setup(); mount();
  await screen.findByRole('heading', { name: 'Set your password' });
  await user.type(screen.getByLabelText(/^password/i), 'a long passphrase');
  await user.type(screen.getByLabelText(/^confirm password/i), 'a long passphrase');
  await user.click(screen.getByRole('button', { name: 'Set password' }));
  expect(await screen.findByRole('heading', { name: 'This invite has expired' })).toBeInTheDocument();
});

test('works while another admin is logged in, and never sends their admin token', async () => {
  sessionStorage.setItem('ssa_admin_token', 'admintok');
  routes['GET /admin/auth/me'] = () => json(200, { admin: { id: 1, email: 'a@x.org', role: 'full_admin' } });
  mount();
  expect(await screen.findByRole('heading', { name: 'Set your password' })).toBeInTheDocument();
  const inviteCall = global.fetch.mock.calls.find(([u]) => u.includes('/admin/auth/invite/'));
  expect(inviteCall[1].headers.Authorization).toBeUndefined();
});
