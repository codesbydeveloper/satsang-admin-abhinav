import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';
import UserDetail from '../pages/UserDetail';
import { AGE_GROUPS } from '../ageGroups';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const now = new Date().toISOString();

const row = (o) => ({ accountId: 1, email: 'x@x.org', accountType: 'adult', emailVerified: true, createdAt: now, profileId: 1, username: 'u', ageGroup: 'Vadil', ageGroupOverridden: false, isChild: false, studentStatus: 'not_asked', ...o });
const LIST = { page: 1, pageSize: 25, totalAccounts: 2, rows: [
  row({ accountId: 5, email: 'adult@x.org', profileId: 9, username: 'radha_seva', studentStatus: 'verified' }),
  row({ accountId: 7, email: 'mom@example.com', accountType: 'parent', profileId: 30, username: 'kid_one', isChild: true, studentStatus: 'pending_verification' }),
  row({ accountId: 7, email: 'mom@example.com', accountType: 'parent', profileId: 31, username: 'kid_two', isChild: true, studentStatus: 'pending_verification' }),
  row({ accountId: 7, email: 'mom@example.com', accountType: 'parent', profileId: 32, username: 'kid_three', isChild: true, studentStatus: 'interested' }),
] };

const ACCOUNT = { id: 7, email: 'mom@example.com', accountType: 'parent', language: 'en', emailVerified: true, parentPinSet: true, createdAt: '2026-11-20T08:00:00.000Z' };
const kid = (id, username, studentStatus, extra = {}) => ({ id, username, avatarId: 3, avatarKey: 'peacock', age: 9, ageGroup: 'Bals/Balikas B', ageGroupOverridden: false, isChild: true, language: 'en', mode: 'satsang',
  studentStatus, studentStatusUpdatedAt: '2026-11-21T09:00:00.000Z', studentVerifiedBy: null, studentVerifiedByName: null, studentVerifiedAt: null, studentSparksAwarded: 0, ...extra });
let profiles;
let actionReply;
let role;

const posts = () => global.fetch.mock.calls.filter(([u, o]) => u.includes('/student-status') && o?.method === 'POST');
const listCalls = () => global.fetch.mock.calls.map(([u]) => decodeURIComponent(u)).filter((u) => u.includes('/admin/users?'));

beforeEach(() => {
  sessionStorage.clear(); sessionStorage.setItem('ssa_admin_token', 'tok');
  role = 'full_admin';
  profiles = [
    kid(30, 'kid_pending', 'pending_verification'),
    kid(31, 'kid_interested', 'interested'),
    kid(32, 'kid_verified', 'verified', { studentVerifiedBy: 2, studentVerifiedByName: 'Seva Admin', studentVerifiedAt: '2026-11-21T10:00:00.000Z', studentSparksAwarded: 10 }),
    kid(33, 'kid_not_enrolled', 'not_enrolled'),
    kid(34, 'kid_unanswered', 'not_asked'),
  ];
  actionReply = (id, action) => json(200, { profileId: id, studentStatus: action === 'verify' ? 'verified' : 'x', previousStatus: 'y', sparksAwarded: action === 'verify' ? 10 : action === 'confirm_interest' ? 5 : 0, studentSparksAwarded: 10 });
  global.fetch = vi.fn((url, opts = {}) => {
    if (url.endsWith('/admin/auth/me')) return json(200, { admin: { id: 1, email: 'a@x.org', name: 'Abhinav', role } });
    const m = url.match(/\/admin\/profiles\/(\d+)\/student-status$/);
    if (m && opts.method === 'POST') return actionReply(Number(m[1]), JSON.parse(opts.body).action);
    if (url.includes('/admin/users?')) return json(200, LIST);
    if (url.includes('/admin/users/7')) return json(200, { account: ACCOUNT, profiles });
    return json(404, { error: { code: 'NOT_FOUND', message: 'unmocked' } });
  });
});
afterEach(() => vi.restoreAllMocks());

const mountApp = (path) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
const mountDetail = async () => { mountApp('/users/7'); await screen.findByRole('heading', { name: 'mom@example.com' }); };
const section = (username) => screen.getByRole('group', { name: `Loyadham Online Classes for ${username}` });
const buttonsIn = (username) => within(section(username)).queryAllByRole('button').map((b) => b.textContent);

// ---- Users page ----

// The Users table and its Class Status filter: src/__tests__/usersTable.test.jsx.

// ---- User detail ----

test('User detail: buttons by status, verified by / when, Sparks reserved with the note', async () => {
  await mountDetail();
  expect(buttonsIn('kid_pending')).toEqual(['Verify student (+10 Sparks)', 'Reject']);
  expect(buttonsIn('kid_interested')).toEqual(['Confirm interest (+5 Sparks)']);
  expect(buttonsIn('kid_verified')).toEqual(['Reset']);
  expect(buttonsIn('kid_not_enrolled')).toEqual(['Reset']);
  expect(buttonsIn('kid_unanswered')).toEqual([]);
  expect(within(section('kid_unanswered')).getByText('Not answered')).toBeInTheDocument();

  const v = section('kid_verified');
  expect(within(v).getByText('Verified student')).toBeInTheDocument();
  expect(within(v).getByText('Verified by').nextSibling).toHaveTextContent('Seva Admin');
  expect(within(v).getByText('Verified on').nextSibling).toHaveTextContent(/2026/);
  expect(within(v).getByText('Sparks reserved').nextSibling).toHaveTextContent('10');
  expect(within(v).getByText('Reserved – becomes spendable when Sparks launch.')).toBeInTheDocument();
  expect(within(v).getByText(/Sparks already given are not taken back/)).toBeInTheDocument();
  expect(within(section('kid_pending')).queryByText('Verified by')).toBeNull();
});

test('Verify: confirm dialog, Cancel sends nothing, Confirm posts the action, toasts and reloads', async () => {
  await mountDetail(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Verify student (+10 Sparks) for kid_pending' }));
  let dialog = screen.getByRole('dialog', { name: 'Verify this student?' });
  expect(dialog).toHaveTextContent('10 Sparks are reserved');
  await user.click(within(dialog).getByRole('button', { name: 'Cancel' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(posts()).toHaveLength(0);

  const detailCalls = () => global.fetch.mock.calls.filter(([u]) => u.endsWith('/admin/users/7')).length;
  const before = detailCalls();
  await user.click(screen.getByRole('button', { name: 'Verify student (+10 Sparks) for kid_pending' }));
  dialog = screen.getByRole('dialog', { name: 'Verify this student?' });
  await user.click(within(dialog).getByRole('button', { name: 'Verify student' }));
  expect(await screen.findByText('kid_pending verified as a student · +10 Sparks reserved')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
  const [url, opts] = posts()[0];
  expect(url).toMatch(/\/api\/v1\/admin\/profiles\/30\/student-status$/);
  expect(JSON.parse(opts.body)).toEqual({ action: 'verify' });
  await waitFor(() => expect(detailCalls()).toBe(before + 1));
});

test('Reject, Confirm interest and Reset each confirm first and send their action', async () => {
  await mountDetail(); const user = userEvent.setup();
  const doAction = async (button, title, confirm) => {
    await user.click(screen.getByRole('button', { name: button }));
    const d = screen.getByRole('dialog', { name: title });
    await user.click(within(d).getByRole('button', { name: confirm }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    return d;
  };
  await doAction('Reject for kid_pending', 'Reject this enrolment?', 'Reject');
  expect(await screen.findByText('kid_pending: enrolment rejected')).toBeInTheDocument();
  await doAction('Confirm interest (+5 Sparks) for kid_interested', 'Confirm this interest?', 'Confirm interest');
  expect(await screen.findByText('kid_interested: interest confirmed · +5 Sparks reserved')).toBeInTheDocument();

  await user.click(screen.getByRole('button', { name: 'Reset for kid_verified' }));
  expect(screen.getByRole('dialog', { name: 'Reset the student status?' })).toHaveTextContent('Sparks already given are not taken back.');
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reset' }));
  expect(await screen.findByText('kid_verified: student status reset')).toBeInTheDocument();

  expect(posts().map(([u, o]) => [u.match(/profiles\/(\d+)/)[1], JSON.parse(o.body).action]))
    .toEqual([['30', 'reject'], ['31', 'confirm_interest'], ['32', 'reset']]);
});

test('a backend error is shown in the dialog, which stays open; no success toast', async () => {
  actionReply = () => json(409, { error: { code: 'INVALID_STUDENT_TRANSITION', message: 'Cannot verify a profile whose student status is verified' } });
  await mountDetail(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Verify student (+10 Sparks) for kid_pending' }));
  const dialog = screen.getByRole('dialog', { name: 'Verify this student?' });
  await user.click(within(dialog).getByRole('button', { name: 'Verify student' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Cannot verify a profile whose student status is verified');
  expect(screen.getByRole('dialog', { name: 'Verify this student?' })).toBeInTheDocument();
  expect(screen.queryByText(/verified as a student/)).toBeNull();
});

test('verifying again after a reset says no new Sparks were given', async () => {
  actionReply = (id) => json(200, { profileId: id, studentStatus: 'verified', previousStatus: 'pending_verification', sparksAwarded: 0, studentSparksAwarded: 10 });
  await mountDetail(); const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Verify student (+10 Sparks) for kid_pending' }));
  await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Verify student' }));
  expect(await screen.findByText('kid_pending verified as a student · no new Sparks (already given before)')).toBeInTheDocument();
});

test('Content Editor: sees the status and Sparks, but no student-status buttons', async () => {
  role = 'content_editor';
  // The Users pages are Full Admin routes (the backend 403s them too); render the page directly to check it stays read-only.
  render(<MemoryRouter initialEntries={['/users/7']}><AuthProvider><Routes><Route path="/users/:id" element={<UserDetail />} /></Routes></AuthProvider></MemoryRouter>);
  await screen.findByRole('heading', { name: 'mom@example.com' });
  await waitFor(() => expect(global.fetch.mock.calls.some(([u]) => u.endsWith('/admin/auth/me'))).toBe(true));
  for (const p of profiles) expect(buttonsIn(p.username)).toEqual([]);
  expect(within(section('kid_pending')).getByText('Pending verification')).toBeInTheDocument();
  expect(within(section('kid_verified')).getByText('Verified by').nextSibling).toHaveTextContent('Seva Admin');
  expect(screen.queryByRole('button', { name: /Verify student|Confirm interest|Reject|^Reset/ })).toBeNull();
  expect(posts()).toHaveLength(0);
});

test('Content Editor: no Users route, so no Class Status filter', async () => {
  role = 'content_editor';
  mountApp('/users?studentStatus=pending_verification');
  expect(await screen.findByRole('heading', { name: /Welcome/ })).toBeInTheDocument();
  expect(screen.queryByLabelText('Class Status')).toBeNull();
  expect(listCalls()).toHaveLength(0);
});

// ---- Dashboard ----

const DASH = (totals) => ({
  generatedAt: now, timeZone: 'Asia/Kolkata',
  totals: { accounts: 3, adultAccounts: 1, parentAccounts: 2, profiles: 4, childProfiles: 3, newRegistrationsToday: 1, pendingDeletions: 0, ...totals },
  ageGroups: AGE_GROUPS.map(({ key }) => ({ ageGroup: key, count: 0 })),
  registrations: { days: 30, total: 0, series: [{ date: now.slice(0, 10), count: 0 }] },
  modes: [], languages: [], recentRegistrations: [], recentAdminActivity: [],
});
const withDashboard = (totals) => {
  const base = global.fetch;
  global.fetch = vi.fn((url, o) => (url.includes('/admin/dashboard') ? json(200, DASH(totals)) : base(url, o)));
};

test('Dashboard: "Students to verify" shows pending + interested and opens Users filtered by both', async () => {
  withDashboard({ studentsToVerify: 3, studentsPendingVerification: 2, studentsInterested: 1 });
  const user = userEvent.setup(); mountApp('/dashboard');
  const card = await screen.findByLabelText('Students to verify');
  expect(card).toHaveTextContent('3');
  expect(card).toHaveTextContent('2 pending · 1 interested');
  expect(card).toHaveClass('warn');
  expect(card).toHaveAttribute('href', '/users?studentStatus=pending_verification,interested');
  await user.click(card);
  expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
  // the old link still works: shown as its own Class Status option and sent as studentStatus
  expect(screen.getByLabelText('Class Status', { selector: 'select' })).toHaveValue('pending_verification,interested');
  await waitFor(() => expect(listCalls().at(-1)).toMatch(/studentStatus=pending_verification,interested/));
});

test('Dashboard: no students waiting is "All clear"; an older backend shows "Not available"', async () => {
  withDashboard({ studentsToVerify: 0, studentsPendingVerification: 0, studentsInterested: 0 });
  const { unmount } = mountApp('/dashboard');
  const card = await screen.findByLabelText('Students to verify');
  expect(card).not.toHaveClass('warn');
  expect(card).toHaveTextContent(/0\s*All clear/);
  unmount();

  withDashboard({});
  mountApp('/dashboard');
  expect(await screen.findByLabelText('Students to verify')).toHaveTextContent(/—\s*Not available/);
});
