import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';
import { countryName, fmtDob } from '../pages/Users';
import { classStatusFromUrl } from '../studentStatus';

// Part B: the grouped Users table, sortable columns, toolbar filters, URL state.

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const row = (o) => ({
  accountId: 1, parentAccountId: null, profileId: 1, accountType: 'adult', isChild: false, name: null, username: null, country: null, dob: null,
  ageGroup: null, ageGroupKey: null, ageGroupOverridden: false, email: 'x@x.org', isParentEmail: false, studentStatus: null,
  emailVerified: true, joined: '2026-11-20T10:00:00.000Z', createdAt: '2026-11-20T10:00:00.000Z', matched: true, ...o,
});
const ROWS = [
  row({ accountId: 5, profileId: 9, name: 'Anil Shah', username: 'anil_a', country: 'IN', dob: '1996-03-04', ageGroup: 'Yuvaks/Yuvatis A', ageGroupKey: 'Yuvak/Yuvatis A', email: 'anil@x.org', studentStatus: 'verified' }),
  row({ accountId: 7, profileId: null, accountType: 'parent', name: 'Priya Mehta', email: 'mom@x.org', matched: false }),
  row({ accountId: 7, parentAccountId: 7, profileId: 30, accountType: 'child', isChild: true, username: 'kid_a', country: 'GB', dob: '2014-10-24', ageGroup: 'Bals/Balikas C', ageGroupKey: 'Bals/Balikas C', email: 'mom@x.org', isParentEmail: true, studentStatus: 'pending_verification' }),
  row({ accountId: 7, parentAccountId: 7, profileId: 31, accountType: 'child', isChild: true, username: 'kid_b', country: 'GB', dob: '2017-10-24', ageGroup: 'Bals/Balikas B', ageGroupKey: 'Bals/Balikas B', email: 'mom@x.org', isParentEmail: true, studentStatus: 'interested' }),
];
const LIST = { page: 1, pageSize: 25, sort: 'joined', order: 'desc', totalAccounts: 2, countries: ['GB', 'IN', 'US'], rows: ROWS };

let loc;
function Spy() { loc = useLocation(); return null; }
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('ssa_admin_token', 'tok');
  global.fetch = vi.fn((url) => {
    if (url.endsWith('/admin/auth/me')) return json(200, { admin: { id: 1, email: 'a@x.org', name: 'A', role: 'full_admin' } });
    if (url.includes('/admin/users?')) return json(200, LIST);
    return json(404, { error: { code: 'NOT_FOUND', message: 'unmocked' } });
  });
});
afterEach(() => vi.restoreAllMocks());

const mount = async (path = '/users') => {
  render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /><Spy /></AuthProvider></MemoryRouter>);
  await screen.findByText('anil_a');
};
const lastQuery = () => {
  const u = global.fetch.mock.calls.map(([x]) => x).filter((x) => x.includes('/admin/users?')).at(-1);
  return Object.fromEntries(new URL(u).searchParams);
};
const urlParams = () => Object.fromEntries(new URLSearchParams(loc.search));
const tr = (accountId, profileId) => within(screen.getByTestId(`user-row-${accountId}-${profileId ?? 'account'}`));

test('columns in the agreed order', async () => {
  await mount();
  expect(screen.getAllByRole('columnheader').map((h) => h.textContent.replace(/[▲▼]/g, '').trim()))
    .toEqual(['Name', 'Username', 'Account type', 'Country', 'DOB', 'Age group', 'Email', 'Class status', 'Joined', 'View']);
});

test('each profile is its own row; children right under their parent, marked "↳ child", greyed parent when only a child matched', async () => {
  await mount();
  const rows = screen.getAllByTestId(/^user-row-/).map((r) => r.dataset.testid);
  expect(rows).toEqual(['user-row-5-9', 'user-row-7-account', 'user-row-7-30', 'user-row-7-31']);
  expect(tr(5, 9).getByText('Anil Shah')).toBeInTheDocument();
  expect(tr(5, 9).getByText('Adult')).toBeInTheDocument();
  expect(tr(5, 9).getByText('India')).toBeInTheDocument();
  expect(tr(5, 9).getByText(fmtDob('1996-03-04'))).toBeInTheDocument();
  expect(tr(5, 9).getByText('Yuvaks/Yuvatis A')).toBeInTheDocument();
  expect(tr(5, 9).getByText('anil@x.org')).toBeInTheDocument();
  expect(tr(5, 9).queryByText('Parent email')).toBeNull();
  expect(tr(5, 9).getByText('Verified student')).toBeInTheDocument();

  const parent = screen.getByTestId('user-row-7-account');
  expect(parent).toHaveClass('row-dim');
  expect(tr(7, null).getByText('Priya Mehta')).toBeInTheDocument();
  expect(tr(7, null).getByText('Parent')).toBeInTheDocument();
  expect(screen.getByTestId('user-row-5-9')).not.toHaveClass('row-dim');

  const kid = screen.getByTestId('user-row-7-30');
  expect(kid).toHaveClass('child-row');
  expect(tr(7, 30).getByText('↳ child')).toBeInTheDocument();
  expect(tr(7, 30).getByText('Child')).toBeInTheDocument();
  expect(tr(7, 30).getByText('United Kingdom')).toBeInTheDocument();
  // the child's own class status, not the parent's
  expect(tr(7, 30).getByText('Pending verification')).toBeInTheDocument();
  expect(tr(7, 31).getByText('Interested')).toBeInTheDocument();
  expect(tr(7, null).queryByText(/Pending|Interested|Verified/)).toBeNull();
  expect(tr(7, 30).getByRole('link', { name: 'View kid_a' })).toHaveAttribute('href', '/users/7');
});

test('a child row shows "Parent email" with the email in grey', async () => {
  await mount();
  expect(tr(7, 30).getByText('Parent email')).toBeInTheDocument();
  const email = tr(7, 30).getByText('mom@x.org');
  expect(email).toHaveClass('muted');
  expect(tr(7, null).queryByText('Parent email')).toBeNull();
});

test('clicking a header sorts (arrow + aria-sort); again flips the order; kept in the URL', async () => {
  const user = userEvent.setup(); await mount();
  expect(lastQuery()).toMatchObject({ sort: 'joined', order: 'desc' });
  expect(screen.getByRole('columnheader', { name: /joined/i })).toHaveAttribute('aria-sort', 'descending');
  await user.click(screen.getByRole('button', { name: /^username/i }));
  await waitFor(() => expect(lastQuery()).toMatchObject({ sort: 'username', order: 'asc' }));
  expect(screen.getByRole('columnheader', { name: /username/i })).toHaveAttribute('aria-sort', 'ascending');
  expect(screen.getByRole('button', { name: /^username/i })).toHaveTextContent('▲');
  expect(urlParams()).toMatchObject({ sort: 'username', order: 'asc' });
  await user.click(screen.getByRole('button', { name: /^username/i }));
  await waitFor(() => expect(lastQuery()).toMatchObject({ sort: 'username', order: 'desc' }));
  expect(screen.getByRole('button', { name: /^username/i })).toHaveTextContent('▼');
  await user.click(screen.getByRole('button', { name: /^dob/i }));
  await waitFor(() => expect(lastQuery()).toMatchObject({ sort: 'dob', order: 'asc' }));
  expect(screen.queryByRole('button', { name: /class status/i })).toBeNull();   // not sortable
});

test('filters: Country (countries present), Age group, Account type, Class Status; sent and kept in the URL', async () => {
  const user = userEvent.setup(); await mount();
  const country = screen.getByLabelText('Country', { selector: 'select' });
  expect([...country.options].map((o) => o.textContent)).toEqual(['All', 'United Kingdom', 'India', 'United States']);
  expect([...screen.getByLabelText('Account type', { selector: 'select' }).options].map((o) => o.textContent)).toEqual(['All', 'Adult', 'Parent', 'Child']);
  expect([...screen.getByLabelText('Class Status', { selector: 'select' }).options].map((o) => o.textContent))
    .toEqual(['All', 'Verified Students', 'Pending Verification', 'Interested', 'Not Enrolled']);
  expect(screen.queryByLabelText('Online Classes')).toBeNull();

  await user.selectOptions(country, 'GB');
  await user.selectOptions(screen.getByLabelText('Age group', { selector: 'select' }), 'Bals/Balikas B');
  await user.selectOptions(screen.getByLabelText('Account type', { selector: 'select' }), 'child');
  await user.selectOptions(screen.getByLabelText('Class Status', { selector: 'select' }), 'interested');
  await user.type(screen.getByLabelText('Search name, username or email'), 'kid');
  await user.click(screen.getByRole('button', { name: 'Search' }));
  const want = { q: 'kid', country: 'GB', ageGroup: 'Bals/Balikas B', accountType: 'child', classStatus: 'interested' };
  await waitFor(() => expect(lastQuery()).toMatchObject(want));
  expect(urlParams()).toMatchObject(want);

  await user.click(screen.getByRole('button', { name: 'Clear' }));
  await waitFor(() => expect(lastQuery()).not.toHaveProperty('country'));
  for (const k of Object.keys(want)) { expect(lastQuery()).not.toHaveProperty(k); expect(urlParams()).not.toHaveProperty(k); }
  expect(screen.getByLabelText('Search name, username or email')).toHaveValue('');
  expect(screen.queryByRole('button', { name: 'Clear' })).toBeNull();
});

test('the URL restores filters, sort and page on load', async () => {
  await mount('/users?country=IN&accountType=adult&classStatus=verified&sort=email&order=desc&page=2&q=anil');
  expect(lastQuery()).toMatchObject({ country: 'IN', accountType: 'adult', classStatus: 'verified', sort: 'email', order: 'desc', page: '2', q: 'anil' });
  expect(screen.getByLabelText('Country', { selector: 'select' })).toHaveValue('IN');
  expect(screen.getByLabelText('Class Status', { selector: 'select' })).toHaveValue('verified');
  expect(screen.getByLabelText('Search name, username or email')).toHaveValue('anil');
  expect(screen.getByRole('columnheader', { name: /email/i })).toHaveAttribute('aria-sort', 'descending');
});

test('changing a filter goes back to page 1', async () => {
  const user = userEvent.setup(); await mount('/users?page=3');
  expect(lastQuery().page).toBe('3');
  await user.selectOptions(screen.getByLabelText('Account type', { selector: 'select' }), 'parent');
  await waitFor(() => expect(lastQuery()).toMatchObject({ accountType: 'parent', page: '1' }));
  expect(urlParams()).not.toHaveProperty('page');
});

test('old ?studentStatus= links map to Class Status; the dashboard "pending + interested" link still works', async () => {
  expect(classStatusFromUrl(null, 'pending_verification')).toEqual({ classStatus: 'pending_verification', studentStatus: undefined });
  expect(classStatusFromUrl(null, 'interest_confirmed').classStatus).toBe('interested');
  expect(classStatusFromUrl(null, 'not_asked').classStatus).toBe('not_enrolled');
  expect(classStatusFromUrl('verified', 'not_asked').classStatus).toBe('verified');
  expect(classStatusFromUrl('bogus', 'bogus')).toEqual({ classStatus: 'all', studentStatus: undefined });

  const user = userEvent.setup(); await mount('/users?studentStatus=pending_verification,interested');
  const select = screen.getByLabelText('Class Status', { selector: 'select' });
  expect(select).toHaveValue('pending_verification,interested');
  expect(lastQuery()).toMatchObject({ studentStatus: 'pending_verification,interested' });
  expect(lastQuery()).not.toHaveProperty('classStatus');
  await user.selectOptions(select, 'verified');
  await waitFor(() => expect(lastQuery()).toMatchObject({ classStatus: 'verified' }));
  expect(lastQuery()).not.toHaveProperty('studentStatus');
  expect(urlParams()).not.toHaveProperty('studentStatus');
});

test('an old single-status link selects its Class Status', async () => {
  await mount('/users?studentStatus=not_enrolled');
  expect(screen.getByLabelText('Class Status', { selector: 'select' })).toHaveValue('not_enrolled');
  expect(lastQuery()).toMatchObject({ classStatus: 'not_enrolled' });
});

test('helpers: country names and a DOB that never shifts a day', () => {
  expect(countryName('IN')).toBe('India');
  expect(countryName(null)).toBeNull();
  expect(fmtDob('2017-10-24')).toMatch(/24/);
  expect(fmtDob('2017-10-24')).toMatch(/2017/);
  expect(fmtDob(null)).toBeNull();
});

test('narrow screens: the table sits in a horizontal scroller; the toolbar wraps', async () => {
  await mount();
  expect(screen.getByRole('table').parentElement).toHaveClass('table-scroll');
  expect(screen.getByRole('table')).toHaveClass('users-table');
  expect(screen.getByRole('button', { name: 'Search' }).closest('form')).toHaveClass('toolbar');
});
