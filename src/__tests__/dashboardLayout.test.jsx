import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';
import { AGE_GROUPS } from '../ageGroups';

// Part C: search on top, separate total cards linking to the matching Users filter, charts below; Users page tweaks.

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const TODAY = '2026-11-22T18:30:00.000Z';
const DASH = {
  generatedAt: new Date().toISOString(), timeZone: 'Asia/Kolkata',
  totals: { accounts: 5, adultAccounts: 3, parentAccounts: 2, profiles: 6, childProfiles: 3, newRegistrationsToday: 1, todayStartsAt: TODAY,
    pendingDeletions: 2, studentsToVerify: 4, studentsPendingVerification: 3, studentsInterested: 1 },
  ageGroups: AGE_GROUPS.map(({ key, label }) => ({ ageGroup: key, label, count: 1 })),
  registrations: { days: 30, total: 0, series: [{ date: '2026-11-23', count: 0 }] },
  modes: [], languages: [], recentRegistrations: [], recentAdminActivity: [],
};
const USERS = { page: 1, pageSize: 25, totalAccounts: 1, totalRows: 2, countries: [], rows: [
  { accountId: 7, parentAccountId: null, profileId: null, accountType: 'parent', isChild: false, name: null, username: null, email: 'mom@x.org', isParentEmail: false, matched: false, joined: TODAY },
  { accountId: 7, parentAccountId: 7, profileId: 30, accountType: 'child', isChild: true, name: null, username: 'kid_a', email: 'mom@x.org', isParentEmail: true, studentStatus: 'interested', matched: true, joined: TODAY },
] };

let role; let loc;
function Spy() { loc = useLocation(); return null; }
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('ssa_admin_token', 'tok'); role = 'full_admin';
  global.fetch = vi.fn((url) => {
    if (url.endsWith('/admin/auth/me')) return json(200, { admin: { id: 1, email: 'a@x.org', name: 'A', role } });
    if (url.includes('/admin/dashboard')) return json(200, DASH);
    if (url.includes('/admin/users?')) return json(200, USERS);
    return json(404, { error: { code: 'NOT_FOUND', message: 'unmocked' } });
  });
});
afterEach(() => vi.restoreAllMocks());
const mount = (path = '/dashboard') => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /><Spy /></AuthProvider></MemoryRouter>);
const usersQuery = () => {
  const u = global.fetch.mock.calls.map(([x]) => x).filter((x) => x.includes('/admin/users?')).at(-1);
  return Object.fromEntries(new URL(u).searchParams);
};

test('a large "Search users" box at the top; Enter opens Users with ?q=', async () => {
  const user = userEvent.setup(); mount();
  const box = await screen.findByLabelText('Search users');
  // above the cards
  const cards = await screen.findByLabelText('Adults');
  expect(box.compareDocumentPosition(cards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  await user.type(box, 'mom@x.org{Enter}');
  expect(await screen.findByRole('heading', { name: 'Users' })).toBeInTheDocument();
  expect(loc.pathname).toBe('/users');
  expect(new URLSearchParams(loc.search).get('q')).toBe('mom@x.org');
  await waitFor(() => expect(usersQuery().q).toBe('mom@x.org'));
  expect(screen.getByLabelText('Search name, username or email')).toHaveValue('mom@x.org');
});

test('separate total cards, each linking to the matching Users filter', async () => {
  mount();
  const card = async (label) => screen.findByLabelText(label);
  expect(await card('Adults')).toHaveAttribute('href', '/users?accountType=adult');
  expect(await card('Adults')).toHaveTextContent('3');
  expect(await card('Parent accounts')).toHaveAttribute('href', '/users?accountType=parent');
  expect(await card('Child profiles')).toHaveAttribute('href', '/users?accountType=child');
  expect(await card('Child profiles')).toHaveTextContent('3');
  expect(await card('New registrations today')).toHaveAttribute('href', `/users?joinedSince=${encodeURIComponent(TODAY)}`);
  expect(await card('Pending deletion requests')).toHaveAttribute('href', '/deletion-requests?status=pending');
  expect(await card('Students to verify')).toHaveAttribute('href', '/users?studentStatus=pending_verification,interested');
  expect(screen.getAllByRole('link').filter((a) => a.classList.contains('stat'))).toHaveLength(6);
  expect(screen.queryByLabelText('Total accounts')).toBeNull();
});

test('charts and recent activity come below the cards', async () => {
  mount();
  const cards = (await screen.findByLabelText('Adults')).closest('.stats');
  for (const title of ['Users by age group', 'New registrations', 'Users by mode and language', 'Recent registrations', 'Recent admin activity']) {
    const panel = screen.getByRole('heading', { name: title });
    expect(cards.compareDocumentPosition(panel) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  }
});

test('"New registrations today" opens Users filtered by joinedSince, shows the chip and the matching count', async () => {
  const user = userEvent.setup(); mount();
  await user.click(await screen.findByLabelText('New registrations today'));
  await screen.findByRole('heading', { name: 'Users' });
  await waitFor(() => expect(usersQuery().joinedSince).toBe(TODAY));
  expect(screen.getByText(/Joined since/)).toBeInTheDocument();
  expect(await screen.findByRole('status')).toHaveTextContent('2 matching rows');
  await user.click(screen.getByRole('button', { name: 'Remove the joined since filter' }));
  await waitFor(() => expect(usersQuery()).not.toHaveProperty('joinedSince'));
  expect(screen.queryByText(/Joined since/)).toBeNull();
});

test('the Adults / Child profiles cards open Users with that Account type selected', async () => {
  const user = userEvent.setup(); mount();
  await user.click(await screen.findByLabelText('Child profiles'));
  await screen.findByRole('heading', { name: 'Users' });
  expect(screen.getByLabelText('Account type', { selector: 'select' })).toHaveValue('child');
  await waitFor(() => expect(usersQuery().accountType).toBe('child'));
});

test('Content Editor: no search box, no cards, no dashboard data', async () => {
  role = 'content_editor'; mount();
  expect(await screen.findByRole('heading', { name: /Welcome/ })).toBeInTheDocument();
  expect(screen.queryByLabelText('Search users')).toBeNull();
  expect(screen.queryByLabelText('Adults')).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Users by age group' })).toBeNull();
  expect(global.fetch.mock.calls.some(([u]) => u.includes('/admin/dashboard'))).toBe(false);
});

test('Users: a parent row without a username says "Parent account" in grey and is the highlighted family header', async () => {
  mount('/users');
  const head = await screen.findByTestId('user-row-7-account');
  expect(head).toHaveClass('family-head');
  const labels = within(head).getAllByText('Parent account');
  expect(labels).toHaveLength(2);   // Name (no name on record) and Username
  labels.forEach((l) => expect(l).toHaveClass('muted'));
  expect(screen.getByTestId('user-row-7-30')).not.toHaveClass('family-head');
  expect(within(screen.getByTestId('user-row-7-30')).queryByText('Parent account')).toBeNull();
});

test('Users: a parent with a name keeps it; "Parent account" stays in the Username column', async () => {
  global.fetch = vi.fn((url) => {
    if (url.endsWith('/admin/auth/me')) return json(200, { admin: { id: 1, email: 'a@x.org', name: 'A', role } });
    if (url.includes('/admin/users?')) return json(200, { ...USERS, rows: [{ ...USERS.rows[0], name: 'Priya Mehta' }] });
    return json(404, {});
  });
  mount('/users');
  const head = within(await screen.findByTestId('user-row-7-account'));
  expect(head.getByText('Priya Mehta')).toBeInTheDocument();
  expect(head.getAllByText('Parent account')).toHaveLength(1);
});
