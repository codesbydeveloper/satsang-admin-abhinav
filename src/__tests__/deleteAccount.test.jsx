import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';
import { isEmail } from '../pages/DeleteAccount';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
let routes;
beforeEach(() => { sessionStorage.clear(); routes = {}; global.fetch = vi.fn((url, opts = {}) => {
  const key = `${opts.method || 'GET'} ${url.replace(/^.*\/api\/v1/, '').split('?')[0]}`;
  return routes[key] ? routes[key](opts) : json(404, { error: { code: 'NOT_FOUND', message: `unmocked ${key}` } });
}); });
afterEach(() => vi.restoreAllMocks());

const mount = (path = '/delete-account') => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
const fill = async (user, password = 'my-password1') => {
  await user.type(screen.getByLabelText('Email'), ' parent@x.org ');
  await user.type(screen.getByLabelText('Password'), password);
};
const submitBtn = () => screen.getByRole('button', { name: 'Request Deletion' });

test('is public: no admin login screen or admin menus; lists what gets deleted', () => {
  mount();
  expect(screen.getByRole('heading', { name: 'Request Account Deletion' })).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /continue/i })).toBeNull();
  expect(screen.queryByRole('link', { name: /blocked words/i })).toBeNull();
  for (const t of ['all child profiles on the account', 'Sparks', 'Dress Up items', 'saved Shangars', 'leaderboard entries']) expect(screen.getByText(t)).toBeInTheDocument();
  expect(screen.getByText('This cannot be undone.')).toBeInTheDocument();
});

test('Request Deletion stays disabled until a valid email and a password are typed', async () => {
  const user = userEvent.setup(); mount();
  expect(submitBtn()).toBeDisabled();
  await user.type(screen.getByLabelText('Email'), 'parent@x');
  await user.type(screen.getByLabelText('Password'), 'pw');
  expect(submitBtn()).toBeDisabled();
  await user.type(screen.getByLabelText('Email'), '.org');
  expect(submitBtn()).toBeEnabled();
  expect(isEmail(' a@b.co ')).toBe(true); expect(isEmail('a@b')).toBe(false); expect(isEmail('a b@c.org')).toBe(false);
});

test('files the request with email + password + confirm, never sends an admin token, then shows received', async () => {
  sessionStorage.setItem('ssa_admin_token', 'admintok');
  routes['GET /admin/auth/me'] = () => json(200, { admin: { id: 1, email: 'a@x.org', role: 'full_admin' } });
  routes['POST /public/delete-account'] = (o) => {
    expect(o.headers.Authorization).toBeUndefined();
    expect(JSON.parse(o.body)).toEqual({ email: 'parent@x.org', password: 'my-password1', confirm: true });
    return json(202, { requested: true, requestId: 9, status: 'pending' });
  };
  const user = userEvent.setup(); mount();
  await fill(user);
  await user.click(submitBtn());
  expect(await screen.findByText('Your request has been received and will be processed soon.')).toBeInTheDocument();
});

test('wrong password: message in the chosen language, password cleared, admin session kept', async () => {
  sessionStorage.setItem('ssa_admin_token', 'admintok');
  routes['GET /admin/auth/me'] = () => json(200, { admin: { id: 1, email: 'a@x.org', role: 'full_admin' } });
  routes['POST /public/delete-account'] = () => json(401, { error: { code: 'INVALID_CREDENTIALS', message: 'Email or password is incorrect' } });
  const user = userEvent.setup(); mount();
  await fill(user, 'wrong1');
  await user.click(submitBtn());
  expect(await screen.findByRole('alert')).toHaveTextContent('Email or password is incorrect.');
  expect(screen.getByLabelText('Password')).toHaveValue('');
  expect(sessionStorage.getItem('ssa_admin_token')).toBe('admintok');
  await user.click(screen.getByRole('button', { name: 'ગુજરાતી' }));
  expect(screen.getByRole('alert')).toHaveTextContent('ઈમેલ અથવા પાસવર્ડ ખોટો છે.');
});

test('too many attempts shows the rate-limit message', async () => {
  routes['POST /public/delete-account'] = () => json(429, { error: { code: 'RATE_LIMITED', message: 'Too many attempts' } });
  const user = userEvent.setup(); mount();
  await fill(user);
  await user.click(submitBtn());
  expect(await screen.findByRole('alert')).toHaveTextContent(/too many attempts/i);
});

test('Gujarati toggle switches the page text and language', async () => {
  const user = userEvent.setup(); mount();
  await user.click(screen.getByRole('button', { name: 'ગુજરાતી' }));
  expect(screen.getByRole('heading', { name: 'એકાઉન્ટ કાઢી નાખવાની વિનંતી' })).toBeInTheDocument();
  expect(document.querySelector('.public-page')).toHaveAttribute('lang', 'gu');
  await user.click(screen.getByRole('button', { name: 'English' }));
  expect(screen.getByRole('heading', { name: 'Request Account Deletion' })).toBeInTheDocument();
});

test('/delete-account/confirmed shows the received message, no form', () => {
  mount('/delete-account/confirmed');
  expect(screen.getByText('Your request has been received and will be processed soon.')).toBeInTheDocument();
  expect(screen.queryByLabelText('Email')).toBeNull();
});
