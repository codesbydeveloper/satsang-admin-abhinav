import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';
import { AGE_GROUPS } from '../api';
import { timeAgo, toDate } from '../components/ui';

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });

// Same shape as the backend's GET /admin/dashboard (UTC DATETIMEs come as 'YYYY-MM-DD HH:MM:SS').
const sqlUtc = (msAgo) => new Date(Date.now() - msAgo).toISOString().slice(0, 19).replace('T', ' ');
const series = Array.from({ length: 30 }, (_, i) => ({ date: new Date(Date.now() - (29 - i) * 864e5).toISOString().slice(0, 10), count: i % 5 }));
const DASH = {
  generatedAt: new Date().toISOString(), timeZone: 'America/New_York',
  totals: { accounts: 1248, adultAccounts: 859, parentAccounts: 389, profiles: 1391, childProfiles: 532, newRegistrationsToday: 17 },
  ageGroups: AGE_GROUPS.map((ageGroup, i) => ({ ageGroup, count: i * 10 })),
  registrations: { days: 30, total: series.reduce((s, x) => s + x.count, 0), series },
  modes: [{ key: 'sanatan', count: 512 }, { key: 'satsang', count: 870 }, { key: 'not_set', count: 9 }],
  languages: [{ key: 'en', count: 948 }, { key: 'gu', count: 443 }],
  recentRegistrations: [
    { accountId: 10, profileId: 20, type: 'adult', username: 'radha_seva', ageGroup: 'Yuvak/Yuvatis A', createdAt: sqlUtc(2 * 60000) },
    { accountId: 9, profileId: 19, type: 'child', username: 'કૃષ્ણ_ભક્ત', ageGroup: 'Bals/Balikas B', createdAt: sqlUtc(30 * 60000) },
    { accountId: 9, profileId: null, type: 'parent', username: null, ageGroup: null, createdAt: sqlUtc(60 * 60000) },
  ],
  recentAdminActivity: [
    { id: 5, adminId: 1, adminName: 'Abhinav', adminEmail: 'a@x.org', action: 'profile.age_group_override', entityType: 'profile', entityId: '20', details: { ageGroup: 'Vadil', reason: 'typo in DOB' }, createdAt: sqlUtc(2 * 60000) },
    { id: 4, adminId: null, adminName: null, adminEmail: 'old@x.org', action: 'admin.login', entityType: null, entityId: null, details: null, createdAt: sqlUtc(3 * 3600000) },
  ],
};

let dashboard;
const asRole = (role, name = 'Abhinav') => {
  sessionStorage.setItem('ssa_admin_token', 'tok');
  global.fetch = vi.fn((url) => {
    if (url.endsWith('/admin/auth/me')) return json(200, { admin: { id: 1, email: 'a@x.org', name, role } });
    if (url.includes('/admin/dashboard')) return dashboard(url);
    return json(404, { error: { code: 'NOT_FOUND', message: 'unmocked' } });
  });
};
beforeEach(() => { sessionStorage.clear(); dashboard = () => json(200, DASH); });
afterEach(() => vi.restoreAllMocks());
const mount = (path = '/') => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);

test('Full Admin: calls the dashboard API and shows welcome bar + live cards', async () => {
  asRole('full_admin'); mount();
  expect(await screen.findByRole('heading', { name: 'Welcome, Abhinav' })).toBeInTheDocument();
  expect(screen.getByText('Full Admin', { selector: '.badge' })).toBeInTheDocument();
  const card = async (label) => within(await screen.findByLabelText(label));
  (await card('Total accounts')).getByText('1,248');
  (await card('Adult / independent')).getByText('859');
  (await card('Parent accounts')).getByText('389');
  (await card('Child profiles')).getByText('532');
  (await card('New registrations today')).getByText('17');
  const call = global.fetch.mock.calls.map(([u]) => u).find((u) => u.includes('/admin/dashboard'));
  expect(call).toMatch(/days=30/); expect(call).toMatch(/recent=5/); expect(call).toMatch(/activity=10/);
  expect(screen.queryByRole('note')).toBeNull();   // no sample-data banner any more
});

test('pending deletions card shows "not tracked" and opens the Deletion Requests page', async () => {
  asRole('full_admin'); const user = userEvent.setup(); mount();
  const card = await screen.findByLabelText('Pending deletion requests');
  expect(card).not.toHaveClass('warn');
  expect(card).toHaveTextContent(/not tracked yet/i);
  await user.click(card);
  expect(await screen.findByRole('heading', { name: 'Deletion requests' })).toBeInTheDocument();
});

test('charts: 9 age groups, 7/30 day toggle, mode (with not chosen) and language donuts', async () => {
  asRole('full_admin'); const user = userEvent.setup(); mount();
  await screen.findByRole('heading', { name: 'Users by age group' });
  for (const g of AGE_GROUPS) expect(screen.getByText(g, { selector: '.bar-label' })).toBeInTheDocument();
  expect(screen.getAllByTestId('line-hit')).toHaveLength(7);
  await user.click(screen.getByRole('button', { name: 'Last 30 days' }));
  expect(screen.getAllByTestId('line-hit')).toHaveLength(30);
  expect(screen.getByText(`${DASH.registrations.total} new accounts in the last 30 days`)).toBeInTheDocument();
  expect(screen.getByText('Sanatan')).toBeInTheDocument();
  expect(screen.getByText('Not chosen yet')).toBeInTheDocument();
  expect(screen.getByText(/Gujarati/)).toBeInTheDocument();
});

test('recent registrations (no email/DOB/phone) and admin activity with "what changed"', async () => {
  asRole('full_admin'); mount();
  const table = (await screen.findByRole('heading', { name: 'Recent registrations' })).closest('section');
  expect(within(table).getAllByRole('link', { name: 'View' })).toHaveLength(3);
  expect(within(table).getByText('Child profile')).toBeInTheDocument();
  expect(within(table).getByText('(parent account)')).toBeInTheDocument();
  expect(table.textContent).not.toMatch(/@|date of birth|dob|phone/i);
  expect(within(table).getAllByText('2 min ago')).toHaveLength(1);   // UTC time read correctly, not shifted
  const activity = screen.getByRole('heading', { name: 'Recent admin activity' }).closest('section');
  expect(within(activity).getByText(/profile #20 · ageGroup: Vadil, reason: typo in DOB/)).toBeInTheDocument();
  expect(within(activity).getByText('old@x.org')).toBeInTheDocument();
  expect(within(activity).getByRole('link', { name: 'View all' })).toHaveAttribute('href', '/audit-log');
});

test('shows the server error with a retry button', async () => {
  asRole('full_admin');
  let calls = 0;
  dashboard = () => (++calls === 1 ? json(500, { error: { code: 'INTERNAL', message: 'Server is down' } }) : json(200, DASH));
  const user = userEvent.setup(); mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('Server is down');
  await user.click(screen.getByRole('button', { name: 'Try again' }));
  expect(await screen.findByLabelText('Total accounts')).toBeInTheDocument();
  expect(calls).toBe(2);
});

test('empty database: zeros and empty-state messages, no crash', async () => {
  asRole('full_admin');
  dashboard = () => json(200, { ...DASH,
    totals: { accounts: 0, adultAccounts: 0, parentAccounts: 0, profiles: 0, childProfiles: 0, newRegistrationsToday: 0 },
    ageGroups: AGE_GROUPS.map((ageGroup) => ({ ageGroup, count: 0 })),
    registrations: { days: 30, total: 0, series: series.map((s) => ({ ...s, count: 0 })) },
    modes: [{ key: 'sanatan', count: 0 }, { key: 'satsang', count: 0 }], languages: [{ key: 'en', count: 0 }, { key: 'gu', count: 0 }],
    recentRegistrations: [], recentAdminActivity: [] });
  mount();
  expect(await screen.findByText('No registrations yet.')).toBeInTheDocument();
  expect(screen.getByText('No admin activity yet.')).toBeInTheDocument();
});

test('Content Editor: no API call, no user numbers, no activity, only Blocked words action', async () => {
  asRole('content_editor', 'Priya'); mount('/deletion-requests');
  expect(await screen.findByRole('heading', { name: 'Welcome, Priya' })).toBeInTheDocument();
  expect(screen.getByText('Content Editor', { selector: '.badge' })).toBeInTheDocument();
  expect(screen.queryByLabelText('Total accounts')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Recent admin activity' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Deletion requests' })).toBeNull();
  const quick = screen.getByRole('heading', { name: 'Quick actions' }).closest('section');
  expect(within(quick).getAllByRole('link').map((l) => l.textContent)).toEqual(['Blocked words']);
  expect(global.fetch.mock.calls.some(([u]) => u.includes('/admin/dashboard'))).toBe(false);
});

test('dates: backend UTC strings are read as UTC; timeAgo wording', () => {
  expect(toDate('2026-10-21 10:00:00').toISOString()).toBe('2026-10-21T10:00:00.000Z');
  expect(toDate('2026-10-21T10:00:00.000Z').toISOString()).toBe('2026-10-21T10:00:00.000Z');
  const now = Date.parse('2026-10-21T12:00:00Z');
  expect(timeAgo('2026-10-21 11:59:30', now)).toBe('Just now');
  expect(timeAgo('2026-10-21 11:58:00', now)).toBe('2 min ago');
  expect(timeAgo('2026-10-21 09:00:00', now)).toBe('3 h ago');
  expect(timeAgo('2026-10-20 10:00:00', now)).toBe('Yesterday');
});

test('Users page: each row has a View button that opens that account', async () => {
  asRole('full_admin');
  const base = global.fetch;
  global.fetch = vi.fn((url, o) => (url.includes('/admin/users?') || url.endsWith('/admin/users')
    ? json(200, { page: 1, pageSize: 25, totalAccounts: 1, rows: [{ accountId: 2, profileId: null, username: null, email: 'test1@example.com', accountType: 'parent', isChild: false, ageGroup: null, emailVerified: false, createdAt: '2026-10-21 15:16:37' }] })
    : url.includes('/admin/users/2')
      ? json(200, { account: { id: 2, email: 'test1@example.com', accountType: 'parent', language: 'en', emailVerified: false, parentPinSet: false, createdAt: '2026-10-21 15:16:37' }, profiles: [] })
      : base(url, o)));
  const user = userEvent.setup(); mount('/users');
  const view = await screen.findByRole('link', { name: 'View test1@example.com' });
  expect(view).toHaveAttribute('href', '/users/2');
  await user.click(view);
  expect(await screen.findByRole('heading', { name: 'test1@example.com' })).toBeInTheDocument();
});

test('User detail reads the backend camelCase fields and pre-selects an existing age-group override', async () => {
  asRole('full_admin');
  const base = global.fetch;
  global.fetch = vi.fn((url, o) => (url.includes('/admin/users/7')
    ? json(200, {
      account: { id: 7, email: 'mom@example.com', accountType: 'parent', language: 'gu', phone: null, emailVerified: true, emailVerifiedAt: '2026-10-20 09:00:00', parentPinSet: true, privacyPolicyVersion: '1.0', consentAcceptedAt: '2026-10-20 08:59:00', createdAt: '2026-10-20 08:59:00' },
      profiles: [{ id: 30, username: 'નીલકંઠ', avatarId: 3, avatarKey: 'peacock', age: 9, ageGroup: 'Vadil', ageGroupOverridden: true, isChild: true, language: 'gu', mode: 'satsang', createdAt: '2026-10-20 09:10:00' }],
    })
    : base(url, o)));
  mount('/users/7');
  expect(await screen.findByRole('heading', { name: 'mom@example.com' })).toBeInTheDocument();
  expect(screen.getByText('Parent PIN set')).toBeInTheDocument();
  expect(screen.getByText('Verified')).toBeInTheDocument();
  expect(screen.getByText('Satsang')).toBeInTheDocument();
  expect(screen.getByText('Avatar: peacock')).toBeInTheDocument();
  expect(screen.getByLabelText('Age group override')).toHaveValue('Vadil');
});
