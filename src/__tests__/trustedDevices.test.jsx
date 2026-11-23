import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';
import { api, tokenExpiry } from '../api';

// Part F2: trusted devices, remember me (refresh tokens), Full Admin limit, Content Editor visibility.

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
let routes;
const keyOf = (u, o = {}) => `${o.method || 'GET'} ${u.replace(/^.*\/api\/v1/, '').split('?')[0]}`;
const calls = (key) => global.fetch.mock.calls.filter(([u, o]) => keyOf(u, o) === key);
const bodyOf = (key, i = 0) => JSON.parse(calls(key)[i][1].body);

const DEVICE_KEY = 'satsang_admin_device';
const ADMIN = { id: 1, email: 'a@x.org', name: 'A', role: 'full_admin', isActive: true };
const EDITOR = { id: 2, email: 'e@x.org', name: 'Ed', role: 'content_editor', status: 'active', isActive: true };
const CHALLENGE = { step: 'email_otp', challengeToken: 'chal1', expiresInSeconds: 600, resendAfterSeconds: 60 };
// A readable JWT whose exp is `inSeconds` from now (the panel only reads exp, never checks a signature).
const jwt = (inSeconds) => `h.${btoa(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + inSeconds }))}.s`;

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); routes = {};
  global.fetch = vi.fn((url, opts = {}) => {
    const key = keyOf(url, opts);
    return routes[key] ? routes[key](opts) : json(404, { error: { code: 'NOT_FOUND', message: `unmocked ${key}` } });
  });
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const mount = (path = '/') => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
const fillPassword = async (user, { untickRemember = false } = {}) => {
  await user.type(await screen.findByLabelText(/^email/i), 'a@x.org');
  await user.type(screen.getByLabelText(/^password/i), 'secret-password');
  if (untickRemember) await user.click(screen.getByLabelText(/remember me/i));
  await user.click(screen.getByRole('button', { name: /continue/i }));
};

// ---------- Login ----------

test('Remember me is ticked by default', async () => {
  mount();
  expect(await screen.findByLabelText(/remember me/i)).toBeChecked();
});

test('trusted device: the stored device token is sent and step "done" opens the dashboard with no code', async () => {
  localStorage.setItem(DEVICE_KEY, 'dev-123');
  routes['POST /admin/auth/login'] = () => json(200, { step: 'done', token: 'tok-done', admin: ADMIN, rememberMe: true, refreshToken: 'rt-1', device: { id: 7 } });
  const user = userEvent.setup(); mount();
  await fillPassword(user);
  expect(await screen.findByRole('link', { name: 'Audit log' })).toBeInTheDocument();
  expect(bodyOf('POST /admin/auth/login')).toEqual({ email: 'a@x.org', password: 'secret-password', rememberMe: true, deviceToken: 'dev-123' });
  expect(screen.queryByLabelText(/^code$/i)).toBeNull();
  expect(calls('POST /admin/auth/verify-otp')).toHaveLength(0);
  expect(localStorage.getItem(DEVICE_KEY)).toBe('dev-123');
});

test('new device: code step sends trustDevice: true and the returned device token is saved', async () => {
  routes['POST /admin/auth/login'] = () => json(200, CHALLENGE);
  routes['POST /admin/auth/verify-otp'] = () => json(200, { step: 'done', token: 'tok', admin: ADMIN, refreshToken: 'rt-1', deviceToken: 'dev-new' });
  const user = userEvent.setup(); mount();
  await fillPassword(user);
  expect(bodyOf('POST /admin/auth/login')).not.toHaveProperty('deviceToken');
  await user.type(await screen.findByLabelText(/^code$/i), '123456');
  expect(await screen.findByRole('link', { name: 'Audit log' })).toBeInTheDocument();
  expect(bodyOf('POST /admin/auth/verify-otp')).toEqual({ challengeToken: 'chal1', code: '123456', trustDevice: true });
  expect(localStorage.getItem(DEVICE_KEY)).toBe('dev-new');
});

test('deviceTokenInvalid: the stored device token is forgotten and the code step follows', async () => {
  localStorage.setItem(DEVICE_KEY, 'dev-revoked');
  routes['POST /admin/auth/login'] = () => json(200, { ...CHALLENGE, deviceTokenInvalid: true });
  const user = userEvent.setup(); mount();
  await fillPassword(user);
  expect(await screen.findByLabelText(/^code$/i)).toBeInTheDocument();
  expect(bodyOf('POST /admin/auth/login').deviceToken).toBe('dev-revoked');
  expect(localStorage.getItem(DEVICE_KEY)).toBeNull();
});

// ---------- Remember me storage ----------

test('Remember me ON: token + refresh token in localStorage, nothing in sessionStorage', async () => {
  routes['POST /admin/auth/login'] = () => json(200, { step: 'done', token: 'tok-on', admin: ADMIN, rememberMe: true, refreshToken: 'rt-on' });
  const user = userEvent.setup(); mount();
  await fillPassword(user);
  await screen.findByRole('link', { name: 'Audit log' });
  expect(localStorage.getItem('ssa_admin_token')).toBe('tok-on');
  expect(localStorage.getItem('ssa_admin_refresh')).toBe('rt-on');
  expect(sessionStorage.getItem('ssa_admin_token')).toBeNull();
});

test('Remember me OFF: sessionStorage only, rememberMe: false sent', async () => {
  routes['POST /admin/auth/login'] = () => json(200, { step: 'done', token: 'tok-off', admin: ADMIN, rememberMe: false, refreshToken: null });
  const user = userEvent.setup(); mount();
  await fillPassword(user, { untickRemember: true });
  await screen.findByRole('link', { name: 'Audit log' });
  expect(bodyOf('POST /admin/auth/login').rememberMe).toBe(false);
  expect(sessionStorage.getItem('ssa_admin_token')).toBe('tok-off');
  expect(localStorage.getItem('ssa_admin_token')).toBeNull();
  expect(localStorage.getItem('ssa_admin_refresh')).toBeNull();
});

test('logout clears the session tokens but keeps the device token', async () => {
  localStorage.setItem('ssa_admin_token', 'tok'); localStorage.setItem('ssa_admin_refresh', 'rt'); localStorage.setItem(DEVICE_KEY, 'dev-1');
  routes['GET /admin/auth/me'] = () => json(200, { admin: ADMIN });
  routes['POST /admin/auth/logout'] = () => json(200, { ok: true });
  routes['GET /admin/dashboard'] = () => json(200, {});
  const user = userEvent.setup(); mount('/account');
  await user.click(await screen.findByRole('button', { name: /log out/i }));
  expect(await screen.findByRole('button', { name: /continue/i })).toBeInTheDocument();
  expect(localStorage.getItem('ssa_admin_token')).toBeNull();
  expect(localStorage.getItem('ssa_admin_refresh')).toBeNull();
  expect(sessionStorage.getItem('ssa_admin_token')).toBeNull();
  expect(localStorage.getItem(DEVICE_KEY)).toBe('dev-1');
});

// ---------- Auto refresh ----------

test('tokenExpiry reads exp from a JWT and ignores anything else', () => {
  const exp = tokenExpiry(jwt(100));
  expect(exp).toBeGreaterThan(Date.now() / 1000);
  expect(tokenExpiry('not-a-jwt')).toBeNull();
});

test('a token about to expire is refreshed before the request; the new pair is stored', async () => {
  localStorage.setItem('ssa_admin_token', jwt(10)); localStorage.setItem('ssa_admin_refresh', 'rt-old');
  routes['POST /admin/auth/refresh'] = () => json(200, { token: 'tok-new', admin: ADMIN, refreshToken: 'rt-new' });
  routes['GET /admin/users'] = (o) => { expect(o.headers.Authorization).toBe('Bearer tok-new'); return json(200, { users: [] }); };
  await api('/admin/users');
  expect(bodyOf('POST /admin/auth/refresh')).toEqual({ refreshToken: 'rt-old' });
  expect(calls('POST /admin/auth/refresh')[0][1].headers.Authorization).toBeUndefined();
  expect(localStorage.getItem('ssa_admin_token')).toBe('tok-new');
  expect(localStorage.getItem('ssa_admin_refresh')).toBe('rt-new');
});

test('a 401 is retried once after a refresh', async () => {
  localStorage.setItem('ssa_admin_token', 'tok-old'); localStorage.setItem('ssa_admin_refresh', 'rt-old');
  routes['POST /admin/auth/refresh'] = () => json(200, { token: 'tok-new', admin: ADMIN, refreshToken: 'rt-new' });
  routes['GET /admin/users'] = (o) => (o.headers.Authorization === 'Bearer tok-new' ? json(200, { users: [1] }) : json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } }));
  expect(await api('/admin/users')).toEqual({ users: [1] });
  expect(calls('GET /admin/users')).toHaveLength(2);
  expect(calls('POST /admin/auth/refresh')).toHaveLength(1);
});

test('parallel 401s share one refresh (a refresh token works only once)', async () => {
  localStorage.setItem('ssa_admin_token', 'tok-old'); localStorage.setItem('ssa_admin_refresh', 'rt-old');
  routes['POST /admin/auth/refresh'] = () => json(200, { token: 'tok-new', admin: ADMIN, refreshToken: 'rt-new' });
  routes['GET /admin/users'] = (o) => (o.headers.Authorization === 'Bearer tok-new' ? json(200, {}) : json(401, { error: { code: 'UNAUTHORIZED' } }));
  await Promise.all([api('/admin/users'), api('/admin/users'), api('/admin/users')]);
  expect(calls('POST /admin/auth/refresh')).toHaveLength(1);
});

test('REFRESH_INVALID signs out: back to login, tokens cleared, device kept', async () => {
  localStorage.setItem('ssa_admin_token', 'tok-old'); localStorage.setItem('ssa_admin_refresh', 'rt-dead'); localStorage.setItem(DEVICE_KEY, 'dev-1');
  routes['GET /admin/auth/me'] = () => json(401, { error: { code: 'UNAUTHORIZED', message: 'expired' } });
  routes['POST /admin/auth/refresh'] = () => json(401, { error: { code: 'REFRESH_INVALID', message: 'Please sign in again.' } });
  mount();
  expect(await screen.findByRole('button', { name: /continue/i })).toBeInTheDocument();
  expect(localStorage.getItem('ssa_admin_token')).toBeNull();
  expect(localStorage.getItem('ssa_admin_refresh')).toBeNull();
  expect(localStorage.getItem(DEVICE_KEY)).toBe('dev-1');
});

test('only a refresh token left (browser was closed past the 8 h token): still signed in', async () => {
  localStorage.setItem('ssa_admin_refresh', 'rt-1');
  routes['POST /admin/auth/refresh'] = () => json(200, { token: 'tok-new', admin: ADMIN, refreshToken: 'rt-2' });
  routes['GET /admin/auth/me'] = (o) => { expect(o.headers.Authorization).toBe('Bearer tok-new'); return json(200, { admin: ADMIN }); };
  routes['GET /admin/dashboard'] = () => json(200, {});
  mount();
  expect(await screen.findByRole('link', { name: 'Audit log' })).toBeInTheDocument();
  expect(localStorage.getItem('ssa_admin_refresh')).toBe('rt-2');
});

test('an idle panel refreshes on its own shortly before the token expires', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.setItem('ssa_admin_token', jwt(5 * 60)); localStorage.setItem('ssa_admin_refresh', 'rt-1');
  routes['GET /admin/auth/me'] = () => json(200, { admin: ADMIN });
  routes['GET /admin/blocked-words'] = () => json(200, { words: [] });
  routes['POST /admin/auth/refresh'] = () => json(200, { token: jwt(8 * 3600), admin: ADMIN, refreshToken: 'rt-2' });
  mount('/blocked-words');
  await screen.findByRole('heading', { name: /blocked words/i });
  expect(calls('POST /admin/auth/refresh')).toHaveLength(0);
  await act(async () => { vi.advanceTimersByTime(4 * 60 * 1000 + 1000); });   // 60 s before exp
  await waitFor(() => expect(calls('POST /admin/auth/refresh')).toHaveLength(1));
  expect(localStorage.getItem('ssa_admin_refresh')).toBe('rt-2');
});

// ---------- My account: trusted devices ----------

const DEVICES = [
  { id: 11, label: 'Chrome on Windows', createdAt: '2026-11-20T10:00:00.000Z', lastUsedAt: '2026-11-23T08:00:00.000Z' },
  { id: 12, label: 'Safari on iPhone', createdAt: '2026-11-21T10:00:00.000Z', lastUsedAt: null },
];

test('My account lists trusted devices and removes one after confirming', async () => {
  sessionStorage.setItem('ssa_admin_token', 'tok');
  let list = DEVICES;
  routes['GET /admin/auth/me'] = () => json(200, { admin: EDITOR });
  routes['GET /admin/me/devices'] = () => json(200, { devices: list });
  routes['DELETE /admin/me/devices/11'] = () => { list = DEVICES.slice(1); return json(200, { ok: true, revoked: true }); };
  const user = userEvent.setup(); mount('/account');
  expect(await screen.findByRole('heading', { name: 'Trusted devices' })).toBeInTheDocument();
  expect(await screen.findByText('Chrome on Windows')).toBeInTheDocument();
  expect(screen.getByText('Safari on iPhone')).toBeInTheDocument();
  expect(screen.getByText('Removing a device means the next sign-in there needs an email code.')).toBeInTheDocument();
  const row = within(screen.getByTestId('device-11'));
  expect(row.getByText(/ago|just now/i)).toBeInTheDocument();
  expect(within(screen.getByTestId('device-12')).getByText('Never')).toBeInTheDocument();

  await user.click(row.getByRole('button', { name: 'Remove' }));
  expect(calls('DELETE /admin/me/devices/11')).toHaveLength(0);   // asks first
  await user.click(row.getByRole('button', { name: 'Keep' }));
  await user.click(row.getByRole('button', { name: 'Remove' }));
  await user.click(row.getByRole('button', { name: 'Yes, remove' }));
  await waitFor(() => expect(screen.queryByText('Chrome on Windows')).toBeNull());
  expect(calls('DELETE /admin/me/devices/11')).toHaveLength(1);
});

test('a failed device removal shows the server message', async () => {
  sessionStorage.setItem('ssa_admin_token', 'tok');
  routes['GET /admin/auth/me'] = () => json(200, { admin: ADMIN });
  routes['GET /admin/me/devices'] = () => json(200, { devices: DEVICES });
  routes['DELETE /admin/me/devices/11'] = () => json(404, { error: { code: 'DEVICE_NOT_FOUND', message: 'This device was already removed.' } });
  const user = userEvent.setup(); mount('/account');
  const row = within(await screen.findByTestId('device-11'));
  await user.click(row.getByRole('button', { name: 'Remove' }));
  await user.click(row.getByRole('button', { name: 'Yes, remove' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('This device was already removed.');
});

// ---------- Admins page ----------

const ME = { id: 1, email: 'me@x.org', name: 'Me', role: 'full_admin', status: 'active', isActive: true };
const OTHER = { id: 2, email: 'ed@x.org', name: 'Ed', role: 'content_editor', status: 'active', isActive: true };
const INVITED = { id: 3, email: 'p@x.org', name: 'P', role: 'content_editor', status: 'invited', isActive: false, inviteExpiresAt: '2099-01-01T00:00:00.000Z' };
const adminsSetup = (limit = { max: 3, used: 3 }) => {
  sessionStorage.setItem('ssa_admin_token', 'tok');
  routes['GET /admin/auth/me'] = () => json(200, { admin: ME });
  routes['GET /admin/admins'] = () => json(200, { admins: [ME, OTHER, INVITED], fullAdminLimit: limit });
};
const LIMIT_ERR = { error: { code: 'FULL_ADMIN_LIMIT', message: 'There can be at most 3 Full Admins.' } };

test('Admins: "Full Admins: used/max" next to Add admin', async () => {
  adminsSetup({ max: 3, used: 2 });
  mount('/admins');
  expect(await screen.findByTestId('full-admin-limit')).toHaveTextContent('Full Admins: 2/3');
});

test('Admins: Devices dialog lists another admin\'s devices and removes one', async () => {
  adminsSetup();
  routes['GET /admin/admins/2/devices'] = () => json(200, { devices: DEVICES });
  routes['DELETE /admin/admins/2/devices/12'] = () => json(200, { ok: true, revoked: true });
  const user = userEvent.setup(); mount('/admins');
  await screen.findByText('ed@x.org');
  expect(within(screen.getByTestId('admin-1')).queryByRole('button', { name: 'Devices' })).toBeNull();   // own: My account
  expect(within(screen.getByTestId('admin-3')).queryByRole('button', { name: 'Devices' })).toBeNull();   // invited: none yet
  await user.click(within(screen.getByTestId('admin-2')).getByRole('button', { name: 'Devices' }));
  const dialog = within(await screen.findByRole('dialog', { name: /trusted devices – ed/i }));
  expect(await dialog.findByText('Safari on iPhone')).toBeInTheDocument();
  expect(dialog.getByText(/next sign-in there needs an email code/)).toBeInTheDocument();
  const row = within(dialog.getByTestId('device-12'));
  await user.click(row.getByRole('button', { name: 'Remove' }));
  await user.click(row.getByRole('button', { name: 'Yes, remove' }));
  await waitFor(() => expect(calls('DELETE /admin/admins/2/devices/12')).toHaveLength(1));
  expect(await screen.findByText('Device removed for ed@x.org')).toBeInTheDocument();
});

test('Admins: FULL_ADMIN_LIMIT on invite shows the server message in the dialog', async () => {
  adminsSetup();
  routes['POST /admin/admins'] = () => json(409, LIMIT_ERR);
  const user = userEvent.setup(); mount('/admins');
  await screen.findByText('ed@x.org');
  await user.click(screen.getByRole('button', { name: 'Add admin' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Add admin' }));
  await user.type(dialog.getByLabelText('Name'), 'Fourth');
  await user.type(dialog.getByLabelText(/^email/i), 'fourth@x.org');
  await user.selectOptions(dialog.getByLabelText('Role'), 'full_admin');
  await user.click(dialog.getByRole('button', { name: 'Send invite' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('There can be at most 3 Full Admins.');
});

test('Admins: FULL_ADMIN_LIMIT on change role shows the server message in the dialog', async () => {
  adminsSetup();
  routes['PATCH /admin/admins/2'] = () => json(409, LIMIT_ERR);
  const user = userEvent.setup(); mount('/admins');
  await screen.findByText('ed@x.org');
  await user.click(within(screen.getByTestId('admin-2')).getByRole('button', { name: 'Change role' }));
  const dialog = within(screen.getByRole('dialog'));
  await user.click(dialog.getByRole('button', { name: 'Change role' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('There can be at most 3 Full Admins.');
});

// ---------- Content Editor ----------

test('Content Editor: no private menus, quick actions or routes', async () => {
  sessionStorage.setItem('ssa_admin_token', 'tok');
  routes['GET /admin/auth/me'] = () => json(200, { admin: EDITOR });
  routes['GET /admin/blocked-words'] = () => json(200, { words: [] });
  routes['GET /admin/me/devices'] = () => json(200, { devices: [] });
  mount('/dashboard');
  expect(await screen.findAllByRole('link', { name: 'Blocked words' })).not.toHaveLength(0);
  for (const name of ['Users', 'Deletion requests', 'Referrals', 'Admins', 'Audit log']) expect(screen.queryByRole('link', { name })).toBeNull();
  expect(screen.queryByRole('link', { name: /search user|add admin|deletion requests/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /export/i })).toBeNull();
  // The dashboard data (403 for editors) is never requested.
  expect(calls('GET /admin/dashboard')).toHaveLength(0);
});

test.each(['/users', '/users/5', '/deletion-requests', '/admins', '/audit-log', '/referrals'])('Content Editor: %s goes to the dashboard', async (path) => {
  sessionStorage.setItem('ssa_admin_token', 'tok');
  routes['GET /admin/auth/me'] = () => json(200, { admin: EDITOR });
  mount(path);
  expect(await screen.findByText(/Content Editor/, { selector: '.badge' })).toBeInTheDocument();
  expect(global.fetch.mock.calls.map(([u, o]) => keyOf(u, o))).toEqual(['GET /admin/auth/me']);
});
