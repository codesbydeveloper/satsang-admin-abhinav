import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';
import { maskEmail } from '../pages/Login';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
let routes;
beforeEach(() => { sessionStorage.clear(); localStorage.clear(); routes = {}; global.fetch = vi.fn((url, opts = {}) => {
  const key = `${opts.method || 'GET'} ${url.replace(/^.*\/api\/v1/, '').split('?')[0]}`;
  return routes[key] ? routes[key](opts) : json(404, { error: { code: 'NOT_FOUND', message: `unmocked ${key}` } });
}); });
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); });

const mount = (path = '/') => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);

const ADMIN = { id: 1, email: 'a@x.org', name: 'A', role: 'full_admin', isActive: true };
const CHALLENGE = { step: 'email_otp', challengeToken: 'chal1', expiresInSeconds: 600, resendAfterSeconds: 60 };
const verifyCalls = () => global.fetch.mock.calls.filter(([u]) => u.includes('/admin/auth/verify-otp'));

// Fills step 1 and returns the code input of step 2.
const toCodeStep = async (user, email = 'asha@example.com') => {
  await user.type(await screen.findByLabelText(/email/i), email);
  await user.type(screen.getByLabelText(/password/i), 'secret-password');
  await user.click(screen.getByRole('button', { name: /continue/i }));
  return screen.findByLabelText(/^code$/i);
};
// Advances the resend countdown one second at a time (each tick re-arms its own timer).
const tick = (seconds) => { for (let i = 0; i < seconds; i++) act(() => { vi.advanceTimersByTime(1000); }); };

test('maskEmail keeps the first letter and the domain', () => {
  expect(maskEmail('asha@example.com')).toBe('a***@example.com');
  expect(maskEmail('b@x.org')).toBe('b***@x.org');
});

test('login -> emailed code -> dashboard with the Full Admin menus', async () => {
  routes['POST /admin/auth/login'] = (o) => { expect(JSON.parse(o.body)).toEqual({ email: 'asha@example.com', password: 'secret-password', rememberMe: true }); return json(200, CHALLENGE); };
  routes['POST /admin/auth/verify-otp'] = (o) => {
    expect(o.headers.Authorization).toBeUndefined();
    expect(JSON.parse(o.body)).toEqual({ challengeToken: 'chal1', code: '123456', trustDevice: true });
    return json(200, { token: 'admintok', admin: ADMIN });
  };
  const user = userEvent.setup(); mount();
  const input = await toCodeStep(user);
  expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  expect(screen.getByText('a***@example.com')).toBeInTheDocument();
  // The challenge token is kept in memory only.
  expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain('chal1');
  await user.type(input, '123456');   // the 6th digit submits on its own
  expect(await screen.findByRole('link', { name: 'Audit log' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Admins' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Dashboard' })).toBeInTheDocument();
  expect(localStorage.getItem('ssa_admin_token')).toBe('admintok');   // Remember me is on by default
  expect(verifyCalls()).toHaveLength(1);
});

test('pasting a full code (with a space) logs in', async () => {
  routes['POST /admin/auth/login'] = () => json(200, CHALLENGE);
  routes['POST /admin/auth/verify-otp'] = (o) => { expect(JSON.parse(o.body).code).toBe('654321'); return json(200, { token: 't', admin: ADMIN }); };
  const user = userEvent.setup(); mount();
  const input = await toCodeStep(user);
  input.focus(); await user.paste('654 321');
  expect(await screen.findByRole('link', { name: 'Audit log' })).toBeInTheDocument();
  expect(verifyCalls()).toHaveLength(1);
});

test('the code input takes digits only and Log in waits for 6', async () => {
  routes['POST /admin/auth/login'] = () => json(200, CHALLENGE);
  const user = userEvent.setup(); mount();
  const input = await toCodeStep(user);
  await user.type(input, '12ab3');
  expect(input).toHaveValue('123');
  expect(screen.getByRole('button', { name: 'Log in' })).toBeDisabled();
  expect(verifyCalls()).toHaveLength(0);
});

test('a wrong code shows the tries left and stays on the code step', async () => {
  routes['POST /admin/auth/login'] = () => json(200, CHALLENGE);
  routes['POST /admin/auth/verify-otp'] = () => json(401, { error: { code: 'OTP_INVALID', message: 'Wrong code', details: { attemptsLeft: 3 } } });
  const user = userEvent.setup(); mount();
  await user.type(await toCodeStep(user), '000000');
  expect(await screen.findByRole('alert')).toHaveTextContent('That code is not right. 3 tries left.');
  expect(screen.getByLabelText(/^code$/i)).toHaveValue('');
  expect(screen.getByRole('heading', { name: 'Check your email' })).toBeInTheDocument();
  expect(sessionStorage.getItem('ssa_admin_token')).toBeNull();
});

test('too many wrong codes goes back to step 1', async () => {
  routes['POST /admin/auth/login'] = () => json(200, CHALLENGE);
  routes['POST /admin/auth/verify-otp'] = () => json(429, { error: { code: 'OTP_LOCKED', message: 'Too many wrong codes. Please log in again.' } });
  const user = userEvent.setup(); mount();
  await user.type(await toCodeStep(user), '000000');
  expect(await screen.findByRole('button', { name: /continue/i })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Too many wrong codes. Please log in again.');
});

test('an expired code and a failed email get clear messages', async () => {
  routes['POST /admin/auth/login'] = () => json(200, CHALLENGE);
  routes['POST /admin/auth/verify-otp'] = () => json(401, { error: { code: 'OTP_EXPIRED', message: 'x' } });
  const user = userEvent.setup(); mount();
  await user.type(await toCodeStep(user), '111111');
  expect(await screen.findByRole('alert')).toHaveTextContent('This code has expired. Request a new code or start over.');
  await user.click(screen.getByRole('button', { name: /start over/i }));
  routes['POST /admin/auth/login'] = () => json(503, { error: { code: 'EMAIL_FAILED', message: 'mail down' } });
  await user.type(screen.getByLabelText(/password/i), 'secret-password');
  await user.click(screen.getByRole('button', { name: /continue/i }));
  expect(await screen.findByRole('alert')).toHaveTextContent("We couldn't send the code. Please try again.");
});

test('resend code has a 60 second countdown, then sends a new code', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  routes['POST /admin/auth/login'] = () => json(200, CHALLENGE);
  routes['POST /admin/auth/resend-otp'] = (o) => { expect(JSON.parse(o.body)).toEqual({ challengeToken: 'chal1' }); return json(200, { sent: true, expiresInSeconds: 600, resendAfterSeconds: 60, resendsLeft: 4 }); };
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime }); mount();
  await toCodeStep(user);
  expect(screen.getByRole('button', { name: /^resend code in \d+s$/i })).toBeDisabled();
  tick(61);
  const resend = screen.getByRole('button', { name: 'Resend code' });
  expect(resend).toBeEnabled();
  await user.click(resend);
  expect(await screen.findByRole('status')).toHaveTextContent('We sent a new code. 4 resends left.');
  expect(screen.getByRole('button', { name: /^resend code in \d+s$/i })).toBeDisabled();
});

test('resend too soon waits the server time; resend limit goes back to step 1', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  routes['POST /admin/auth/login'] = () => json(200, { ...CHALLENGE, resendAfterSeconds: 0 });
  routes['POST /admin/auth/resend-otp'] = () => json(429, { error: { code: 'RESEND_TOO_SOON', message: 'x', details: { retryAfterSeconds: 42 } } });
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime }); mount();
  await toCodeStep(user);
  await user.click(screen.getByRole('button', { name: 'Resend code' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Please wait 42 seconds before asking for a new code.');
  expect(screen.getByRole('button', { name: /^resend code in \d+s$/i })).toBeDisabled();
  tick(43);
  routes['POST /admin/auth/resend-otp'] = () => json(429, { error: { code: 'RESEND_LIMIT', message: 'x' } });
  await user.click(screen.getByRole('button', { name: 'Resend code' }));
  expect(await screen.findByRole('button', { name: /continue/i })).toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Too many new codes for this login. Please log in again.');
});

test('no authenticator / QR / two-factor texts are left on the login screens', async () => {
  routes['POST /admin/auth/login'] = () => json(200, CHALLENGE);
  const banned = /authenticator|two-factor|2fa|totp|qr|scan/i;
  const user = userEvent.setup(); mount();
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(banned);
  await toCodeStep(user);
  expect(document.body).not.toHaveTextContent(banned);
  // The only image is the official logo (no QR code).
  expect(screen.getAllByRole('img').map((i) => i.getAttribute('src'))).toEqual([expect.stringMatching(/logo-full/)]);
});

test('Admins and My account have no two-factor column, badge or reset button', async () => {
  sessionStorage.setItem('ssa_admin_token', 'tok');
  routes['GET /admin/auth/me'] = () => json(200, { admin: ADMIN });
  routes['GET /admin/admins'] = () => json(200, { admins: [ADMIN, { id: 2, email: 'b@x.org', name: 'B', role: 'content_editor', isActive: true, lastLoginAt: null }] });
  const banned = /two-factor|2fa|authenticator|not set up/i;
  const { unmount } = mount('/admins');
  expect(await screen.findByText('b@x.org')).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(banned);
  expect(screen.getAllByRole('button', { name: /reset password/i })).toHaveLength(1);   // not on your own row
  unmount();
  mount('/account');
  expect(await screen.findByRole('heading', { name: /change password/i })).toBeInTheDocument();
  expect(document.body).not.toHaveTextContent(banned);
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
