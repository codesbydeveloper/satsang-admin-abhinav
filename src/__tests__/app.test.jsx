import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
let routes;
beforeEach(() => { sessionStorage.clear(); routes = {}; global.fetch = vi.fn((url, opts = {}) => {
  const key = `${opts.method || 'GET'} ${url.replace(/^.*\/api\/v1/, '').split('?')[0]}`;
  return routes[key] ? routes[key](opts) : json(404, { error: { code: 'NOT_FOUND', message: `unmocked ${key}` } });
}); });
afterEach(() => vi.restoreAllMocks());

const mount = () => render(<MemoryRouter initialEntries={['/']}><AuthProvider><App /></AuthProvider></MemoryRouter>);

test('login with 2FA shows the Full Admin menus', async () => {
  routes['POST /admin/auth/login'] = () => json(200, { step: 'totp_verify', stepToken: 'step1' });
  routes['POST /admin/auth/totp/verify'] = (o) => { expect(o.headers.Authorization).toBe('Bearer step1'); expect(JSON.parse(o.body)).toEqual({ code: '123456' }); return json(200, { token: 'admintok', admin: { id: 1, email: 'a@x.org', name: 'A', role: 'full_admin' } }); };
  routes['GET /admin/users'] = () => json(200, { page: 1, pageSize: 25, totalAccounts: 0, rows: [] });
  const user = userEvent.setup(); mount();
  await user.type(await screen.findByLabelText(/email/i), 'a@x.org');
  await user.type(screen.getByLabelText(/password/i), 'secret-password');
  await user.click(screen.getByRole('button', { name: /continue/i }));
  await user.type(await screen.findByLabelText(/code/i), '123456');
  await user.click(screen.getByRole('button', { name: /log in/i }));
  expect(await screen.findByRole('link', { name: 'Audit log' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Admins' })).toBeInTheDocument();
  expect(sessionStorage.getItem('ssa_admin_token')).toBe('admintok');
});

test('first login shows the QR code to enrol the authenticator', async () => {
  routes['POST /admin/auth/login'] = () => json(200, { step: 'totp_setup', stepToken: 's' });
  routes['POST /admin/auth/totp/setup'] = () => json(200, { secret: 'ABCDEF', qrDataUrl: 'data:image/png;base64,AAAA' });
  const user = userEvent.setup(); mount();
  await user.type(await screen.findByLabelText(/email/i), 'a@x.org');
  await user.type(screen.getByLabelText(/password/i), 'secret-password');
  await user.click(screen.getByRole('button', { name: /continue/i }));
  expect(await screen.findByAltText(/authenticator qr/i)).toBeInTheDocument();
  expect(screen.getByText('ABCDEF')).toBeInTheDocument();
});

test('wrong password shows the server message and stays on login', async () => {
  routes['POST /admin/auth/login'] = () => json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' } });
  const user = userEvent.setup(); mount();
  await user.type(await screen.findByLabelText(/email/i), 'a@x.org');
  await user.type(screen.getByLabelText(/password/i), 'nope');
  await user.click(screen.getByRole('button', { name: /continue/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect');
});

test('Content Editor only sees blocked words, not users/admins/audit log', async () => {
  sessionStorage.setItem('ssa_admin_token', 'tok');
  routes['GET /admin/auth/me'] = () => json(200, { admin: { id: 2, email: 'e@x.org', name: 'Ed', role: 'content_editor' } });
  routes['GET /admin/blocked-words'] = () => json(200, { words: [{ id: 1, word: 'shit', kind: 'blocked' }] });
  render(<MemoryRouter initialEntries={['/blocked-words']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  expect(await screen.findByRole('heading', { name: /blocked words/i })).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Users' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Admins' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Audit log' })).toBeNull();
  await waitFor(() => expect(screen.getByText('shit')).toBeInTheDocument());
});

test('an expired session returns to the login screen', async () => {
  sessionStorage.setItem('ssa_admin_token', 'old');
  routes['GET /admin/auth/me'] = () => json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } });
  mount();
  expect(await screen.findByRole('button', { name: /continue/i })).toBeInTheDocument();
  expect(sessionStorage.getItem('ssa_admin_token')).toBeNull();
});
