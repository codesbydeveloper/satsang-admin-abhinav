import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const ACCOUNT = { id: 7, email: 'mom@example.com', accountType: 'parent', firstName: 'Meera', lastName: 'Patel', gender: 'prefer_not_to_say', language: 'en', phone: null, emailVerified: true, emailVerifiedAt: '2026-10-20 09:00:00', parentPinSet: true, createdAt: '2026-10-20 08:59:00' };
const KID = { id: 30, username: 'krishna_kid', avatarId: 3, avatarKey: 'peacock', age: 9, ageGroup: 'Bals/Balikas B', ageGroupOverridden: false, isChild: true, language: 'en', mode: 'satsang' };

let deleteReply;
beforeEach(() => {
  sessionStorage.clear(); sessionStorage.setItem('ssa_admin_token', 'tok');
  deleteReply = () => json(200, { deleted: true, accountId: 7, profilesDeleted: 1 });
  global.fetch = vi.fn((url, opts = {}) => {
    if (url.endsWith('/admin/auth/me')) return json(200, { admin: { id: 1, email: 'a@x.org', name: 'Abhinav', role: 'full_admin' } });
    if (url.includes('/admin/users/7') && opts.method === 'DELETE') return deleteReply(opts);
    if (url.includes('/admin/users/7')) return json(200, { account: ACCOUNT, profiles: [KID] });
    if (url.includes('/admin/users')) return json(200, { page: 1, pageSize: 25, totalAccounts: 0, rows: [] });
    return json(404, { error: { code: 'NOT_FOUND', message: 'unmocked' } });
  });
});
afterEach(() => vi.restoreAllMocks());
const mount = async () => {
  render(<MemoryRouter initialEntries={['/users/7']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  await screen.findByRole('heading', { name: 'mom@example.com' });
};

test('shows account info, child profiles and the age-group dropdown', async () => {
  await mount();
  expect(screen.getByRole('heading', { name: /child profiles/i })).toBeInTheDocument();
  expect(screen.getByText('First name').nextSibling).toHaveTextContent('Meera');
  expect(screen.getByText('Last name').nextSibling).toHaveTextContent('Patel');
  expect(screen.getByText('Gender').nextSibling).toHaveTextContent('Prefer not to say');
  const card = screen.getByRole('region', { name: 'Profile krishna_kid' });
  expect(within(card).getByLabelText('Age group override')).toHaveValue('');
  expect(within(card).getByRole('button', { name: 'Rename krishna_kid' })).toBeInTheDocument();
  expect(within(card).getByRole('button', { name: 'Delete profile krishna_kid' })).toBeInTheDocument();
});

test('rename popup: validates, cancels with Escape, and says the server is not connected yet', async () => {
  await mount(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Rename krishna_kid' }));
  const dialog = screen.getByRole('dialog', { name: 'Rename username' });
  const rename = within(dialog).getByRole('button', { name: 'Rename' });
  expect(rename).toBeDisabled();
  await user.type(within(dialog).getByLabelText(/new username/i), 'Krishna_Kid');
  await user.click(rename);
  expect(within(dialog).getByRole('alert')).toHaveTextContent(/different username/i);
  await user.clear(within(dialog).getByLabelText(/new username/i));
  await user.type(within(dialog).getByLabelText(/new username/i), 'shyam_seva');
  await user.click(rename);
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/not connected to the server yet/i);
  await user.keyboard('{Escape}');
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('delete child profile popup needs a reason and the username typed before the button unlocks', async () => {
  await mount(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Delete profile krishna_kid' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete child profile?' });
  expect(dialog).toHaveTextContent(/cannot be undone/i);
  const del = within(dialog).getByRole('button', { name: 'Delete profile' });
  expect(del).toBeDisabled();
  await user.type(within(dialog).getByLabelText('Reason'), 'Parent asked by email');
  expect(del).toBeDisabled();
  await user.type(within(dialog).getByLabelText('Type krishna_kid to confirm'), 'krishna_kid');
  expect(del).toBeEnabled();
  await user.click(del);
  expect(await within(dialog).findByRole('alert')).toHaveTextContent(/not connected/i);
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

test('delete account popup lists the child profiles and requires the email', async () => {
  await mount(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Delete account' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete this account?' });
  expect(dialog).toHaveTextContent(/1 child profile/);
  const del = within(dialog).getByRole('button', { name: 'Delete account' });
  await user.type(within(dialog).getByLabelText('Reason'), 'Duplicate account');
  await user.type(within(dialog).getByLabelText('Type mom@example.com to confirm'), 'wrong@example.com');
  expect(del).toBeDisabled();
  await user.clear(within(dialog).getByLabelText('Type mom@example.com to confirm'));
  await user.type(within(dialog).getByLabelText('Type mom@example.com to confirm'), 'mom@example.com');
  expect(del).toBeEnabled();
  await user.click(within(dialog).getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

const confirmAccountDelete = async (user) => {
  await user.click(screen.getByRole('button', { name: 'Delete account' }));
  const dialog = screen.getByRole('dialog', { name: 'Delete this account?' });
  await user.type(within(dialog).getByLabelText('Reason'), 'Duplicate account');
  await user.type(within(dialog).getByLabelText('Type mom@example.com to confirm'), 'mom@example.com');
  await user.click(within(dialog).getByRole('button', { name: 'Delete account' }));
  return dialog;
};

test('delete account calls DELETE /admin/users/:id with confirm + reason, then returns to Users with a notice', async () => {
  let sent;
  deleteReply = (opts) => { sent = opts; return json(200, { deleted: true, accountId: 7, profilesDeleted: 1 }); };
  await mount(); const user = userEvent.setup();
  await confirmAccountDelete(user);
  expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('mom@example.com was deleted, with 1 profile.');
  expect(sent.method).toBe('DELETE');
  expect(sent.headers.Authorization).toBe('Bearer tok');
  expect(JSON.parse(sent.body)).toEqual({ confirm: true, reason: 'Duplicate account' });
});

test('delete account shows the server error and stays on the page', async () => {
  deleteReply = () => json(404, { error: { code: 'ACCOUNT_NOT_FOUND', message: 'Account not found' } });
  await mount(); const user = userEvent.setup();
  const dialog = await confirmAccountDelete(user);
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Account not found');
  expect(screen.getByRole('heading', { name: 'mom@example.com' })).toBeInTheDocument();
});
