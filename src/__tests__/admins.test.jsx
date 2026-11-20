import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
let routes;
const calls = (key) => global.fetch.mock.calls.filter(([u, o = {}]) => `${o.method || 'GET'} ${u.replace(/^.*\/api\/v1/, '').split('?')[0]}` === key);

const ME = { id: 1, email: 'me@x.org', name: 'Me Admin', role: 'full_admin', status: 'active', isActive: true, inviteExpiresAt: null };
const ACTIVE = { id: 2, email: 'ed@x.org', name: 'Ed', role: 'content_editor', status: 'active', isActive: true, inviteExpiresAt: null, lastLoginAt: '2026-11-19T10:00:00.000Z' };
const INVITED = { id: 3, email: 'priya@x.org', name: 'Priya', role: 'content_editor', status: 'invited', isActive: false, inviteExpiresAt: '2099-11-22T10:00:00.000Z' };
const INACTIVE = { id: 4, email: 'old@x.org', name: 'Old', role: 'full_admin', status: 'inactive', isActive: false, inviteExpiresAt: null };
const EXPIRED = { id: 5, email: 'late@x.org', name: 'Late', role: 'content_editor', status: 'invited', isActive: false, inviteExpiresAt: '2020-01-01T00:00:00.000Z' };

beforeEach(() => {
  sessionStorage.clear(); sessionStorage.setItem('ssa_admin_token', 'tok');
  routes = {
    'GET /admin/auth/me': () => json(200, { admin: ME }),
    'GET /admin/admins': () => json(200, { admins: [ME, ACTIVE, INVITED, INACTIVE, EXPIRED] }),
  };
  global.fetch = vi.fn((url, opts = {}) => {
    const key = `${opts.method || 'GET'} ${url.replace(/^.*\/api\/v1/, '').split('?')[0]}`;
    return routes[key] ? routes[key](opts) : json(404, { error: { code: 'NOT_FOUND', message: `unmocked ${key}` } });
  });
});
afterEach(() => vi.restoreAllMocks());

const mount = async () => {
  render(<MemoryRouter initialEntries={['/admins']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  await screen.findByText('ed@x.org');
};
const row = (id) => within(screen.getByTestId(`admin-${id}`));

test('list shows name, email, role and a status badge for each status', async () => {
  await mount();
  expect(screen.getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['Name', 'Email', 'Role', 'Status', 'Last login', 'Actions']);
  expect(row(2).getByText('Active')).toBeInTheDocument();
  expect(row(2).getByText('Content Editor')).toBeInTheDocument();
  expect(row(3).getByText(/^Invited – expires .*2099/)).toBeInTheDocument();
  expect(row(4).getByText('Inactive')).toBeInTheDocument();
  expect(row(4).getByText('Full Admin')).toBeInTheDocument();
  expect(row(5).getByText(/Invite expired – expired .*2020/)).toBeInTheDocument();
  expect(screen.queryByLabelText(/temporary password/i)).toBeNull();
});

test('actions depend on the status', async () => {
  await mount();
  expect(row(3).getByRole('button', { name: 'Resend invite' })).toBeInTheDocument();
  expect(row(3).getByRole('button', { name: 'Cancel invite' })).toBeInTheDocument();
  expect(row(3).queryByRole('button', { name: /deactivate|change role|reactivate/i })).toBeNull();
  expect(row(2).getByRole('button', { name: 'Change role' })).toBeInTheDocument();
  expect(row(2).getByRole('button', { name: 'Deactivate' })).toBeInTheDocument();
  expect(row(2).queryByRole('button', { name: /invite|reactivate/i })).toBeNull();
  expect(row(4).getByRole('button', { name: 'Reactivate' })).toBeInTheDocument();
  expect(row(4).queryByRole('button', { name: /deactivate|change role|invite/i })).toBeNull();
});

test('own row: no change role / deactivate, marked "you"', async () => {
  await mount();
  expect(row(1).getByText('you')).toBeInTheDocument();
  expect(row(1).queryAllByRole('button')).toHaveLength(0);
  expect(row(1).getByText('Your account')).toBeInTheDocument();
});

test('Add admin dialog: needs name + valid email, sends {email, name, role}, toasts and reloads', async () => {
  routes['POST /admin/admins'] = () => json(201, { admin: { id: 9 } });
  const user = userEvent.setup(); await mount();
  await user.click(screen.getByRole('button', { name: 'Add admin' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Add admin' }));
  const send = dialog.getByRole('button', { name: 'Send invite' });
  expect(send).toBeDisabled();
  expect(dialog.queryByLabelText(/password/i)).toBeNull();
  await user.type(dialog.getByLabelText('Name'), 'Priya Shah');
  await user.type(dialog.getByLabelText(/^email/i), 'not-an-email');
  expect(send).toBeDisabled();
  await user.clear(dialog.getByLabelText(/^email/i)); await user.type(dialog.getByLabelText(/^email/i), ' new@x.org ');
  await user.selectOptions(dialog.getByLabelText('Role'), 'full_admin');
  await user.click(send);
  expect(await screen.findByText('Invite sent to new@x.org')).toBeInTheDocument();
  expect(JSON.parse(calls('POST /admin/admins')[0][1].body)).toEqual({ email: 'new@x.org', name: 'Priya Shah', role: 'full_admin' });
  expect(screen.queryByRole('dialog')).toBeNull();
  await waitFor(() => expect(calls('GET /admin/admins')).toHaveLength(2));
});

test('Add admin dialog: ADMIN_EXISTS under Email, EMAIL_FAILED as a clear message, dialog stays open', async () => {
  routes['POST /admin/admins'] = () => json(409, { error: { code: 'ADMIN_EXISTS', message: 'An admin with this email already exists' } });
  const user = userEvent.setup(); await mount();
  await user.click(screen.getByRole('button', { name: 'Add admin' }));
  const dialog = within(screen.getByRole('dialog'));
  await user.type(dialog.getByLabelText('Name'), 'Ed');
  await user.type(dialog.getByLabelText(/^email/i), 'ed@x.org');
  await user.click(dialog.getByRole('button', { name: 'Send invite' }));
  expect(await dialog.findByText('An admin with this email already exists.')).toBeInTheDocument();
  expect(dialog.getByLabelText(/^email/i)).toHaveAttribute('aria-invalid', 'true');
  routes['POST /admin/admins'] = () => json(503, { error: { code: 'EMAIL_FAILED', message: 'x' } });
  await user.type(dialog.getByLabelText(/^email/i), 'x');
  await user.click(dialog.getByRole('button', { name: 'Send invite' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent("We couldn't send the invite email. Nothing was saved. Please try again.");
});

test('resend invite calls the API and toasts', async () => {
  routes['POST /admin/admins/3/resend-invite'] = () => json(200, { admin: INVITED });
  const user = userEvent.setup(); await mount();
  await user.click(row(3).getByRole('button', { name: 'Resend invite' }));
  expect(await screen.findByText('New invite sent to priya@x.org')).toBeInTheDocument();
  expect(calls('POST /admin/admins/3/resend-invite')).toHaveLength(1);
});

test('cancel invite asks first, then sends DELETE', async () => {
  routes['DELETE /admin/admins/3'] = () => json(200, { ok: true, cancelled: true });
  const user = userEvent.setup(); await mount();
  await user.click(row(3).getByRole('button', { name: 'Cancel invite' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Cancel invite?' }));
  await user.click(dialog.getByRole('button', { name: 'Keep invite' }));
  expect(calls('DELETE /admin/admins/3')).toHaveLength(0);
  await user.click(row(3).getByRole('button', { name: 'Cancel invite' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel invite' }));
  expect(await screen.findByText('Invite for priya@x.org cancelled')).toBeInTheDocument();
  expect(calls('DELETE /admin/admins/3')).toHaveLength(1);
});

test('change role sends PATCH {role}', async () => {
  routes['PATCH /admin/admins/2'] = () => json(200, { admin: { ...ACTIVE, role: 'full_admin' } });
  const user = userEvent.setup(); await mount();
  await user.click(row(2).getByRole('button', { name: 'Change role' }));
  const dialog = within(screen.getByRole('dialog', { name: 'Change role for Ed' }));
  expect(dialog.getByLabelText('New role')).toHaveValue('full_admin');
  await user.click(dialog.getByRole('button', { name: 'Change role' }));
  expect(await screen.findByText('ed@x.org is now Full Admin')).toBeInTheDocument();
  expect(JSON.parse(calls('PATCH /admin/admins/2')[0][1].body)).toEqual({ role: 'full_admin' });
});

test('deactivate asks first and sends PATCH {active:false}; reactivate sends {active:true}', async () => {
  routes['PATCH /admin/admins/2'] = () => json(200, { admin: { ...ACTIVE, status: 'inactive' } });
  routes['PATCH /admin/admins/4'] = () => json(200, { admin: { ...INACTIVE, status: 'active' } });
  const user = userEvent.setup(); await mount();
  await user.click(row(2).getByRole('button', { name: 'Deactivate' }));
  await user.click(within(screen.getByRole('dialog', { name: 'Deactivate Ed?' })).getByRole('button', { name: 'Deactivate' }));
  expect(await screen.findByText('ed@x.org deactivated')).toBeInTheDocument();
  expect(JSON.parse(calls('PATCH /admin/admins/2')[0][1].body)).toEqual({ active: false });
  await user.click(row(4).getByRole('button', { name: 'Reactivate' }));
  expect(await screen.findByText('old@x.org can log in again')).toBeInTheDocument();
  expect(JSON.parse(calls('PATCH /admin/admins/4')[0][1].body)).toEqual({ active: true });
});

test('LAST_FULL_ADMIN: the backend message is shown and the dialog stays open', async () => {
  const OTHER_FULL = { ...ACTIVE, id: 6, email: 'full@x.org', name: 'Full', role: 'full_admin' };
  routes['GET /admin/admins'] = () => json(200, { admins: [ME, OTHER_FULL] });
  routes['PATCH /admin/admins/6'] = () => json(409, { error: { code: 'LAST_FULL_ADMIN', message: 'At least one active Full Admin must remain' } });
  const user = userEvent.setup();
  render(<MemoryRouter initialEntries={['/admins']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  await screen.findByText('full@x.org');
  await user.click(row(6).getByRole('button', { name: 'Deactivate' }));
  const dialog = within(screen.getByRole('dialog'));
  await user.click(dialog.getByRole('button', { name: 'Deactivate' }));
  expect(await dialog.findByRole('alert')).toHaveTextContent('At least one active Full Admin must remain');
});

test('a Content Editor has no Admins menu and /admins is not reachable', async () => {
  routes['GET /admin/auth/me'] = () => json(200, { admin: { ...ACTIVE } });
  render(<MemoryRouter initialEntries={['/admins']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  await screen.findByRole('link', { name: 'Blocked words' });
  expect(screen.queryByRole('link', { name: 'Admins' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Admins' })).toBeNull();
  expect(calls('GET /admin/admins')).toHaveLength(0);
});
