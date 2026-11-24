import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';

// Part G: "Export to CSV" on the Users page (Full Admin) downloads GET /admin/users/export.csv with the current
// search, filters and sort (never page/pageSize).

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const LIST = { page: 2, pageSize: 25, sort: 'username', order: 'asc', totalAccounts: 30, countries: ['GB', 'IN'], rows: [
  { accountId: 5, parentAccountId: null, profileId: 9, accountType: 'adult', isChild: false, name: 'Anil', username: 'anil_a', country: 'IN', dob: null,
    ageGroup: null, ageGroupKey: null, ageGroupOverridden: false, email: 'anil@x.org', isParentEmail: false, studentStatus: null,
    emailVerified: true, joined: '2026-11-20T10:00:00.000Z', createdAt: '2026-11-20T10:00:00.000Z', matched: true }] };
const CSV = '﻿Name,Username\r\nAnil,anil_a\r\n';

let role; let csvResponse; let clicked; let csvBlob;
beforeEach(() => {
  role = 'full_admin';
  sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('ssa_admin_token', 'tok');
  csvBlob = new Blob([CSV], { type: 'text/csv' });
  csvResponse = () => Promise.resolve({ ok: true, status: 200,
    headers: new Headers({ 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename="satsang-spark-users-2026-11-24.csv"' }),
    blob: () => Promise.resolve(csvBlob) });
  global.fetch = vi.fn((url) => {
    if (url.endsWith('/admin/auth/me')) return json(200, { admin: { id: 1, email: 'a@x.org', name: 'A', role } });
    if (url.includes('/admin/users/export.csv')) return csvResponse();
    if (url.includes('/admin/users?')) return json(200, LIST);
    if (url.includes('/admin/dashboard')) return json(200, {});
    return json(404, { error: { code: 'NOT_FOUND', message: 'unmocked' } });
  });
  URL.createObjectURL = vi.fn(() => 'blob:csv');
  URL.revokeObjectURL = vi.fn();
  clicked = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function click() { clicked.push({ href: this.href, download: this.download }); });
});
afterEach(() => vi.restoreAllMocks());

const mount = async (path) => {
  render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  await screen.findByText('anil_a');
};
const exportCalls = () => global.fetch.mock.calls.filter(([u]) => u.includes('/admin/users/export.csv'));

test('Export to CSV sends the current search, filters and sort (not the page) with the admin token, and downloads the file', async () => {
  const user = userEvent.setup();
  await mount('/users?q=anil&country=IN&accountType=adult&classStatus=verified&sort=username&order=asc&page=2');
  await user.click(screen.getByRole('button', { name: 'Export to CSV' }));
  await waitFor(() => expect(clicked).toHaveLength(1));
  expect(exportCalls()).toHaveLength(1);
  const [url, init] = exportCalls()[0];
  expect(init.headers.Authorization).toBe('Bearer tok');
  expect(Object.fromEntries(new URL(url).searchParams)).toEqual({ q: 'anil', country: 'IN', accountType: 'adult', classStatus: 'verified', sort: 'username', order: 'asc' });
  expect(clicked[0]).toEqual({ href: 'blob:csv', download: 'satsang-spark-users-2026-11-24.csv' });
  expect(URL.createObjectURL).toHaveBeenCalledWith(csvBlob);   // the server's bytes (BOM included), unchanged
  expect(await screen.findByText('CSV downloaded')).toBeInTheDocument();
});

test('Export to CSV: a server error is shown and nothing is downloaded', async () => {
  const user = userEvent.setup();
  csvResponse = () => json(403, { error: { code: 'ROLE_FORBIDDEN', message: 'Your admin role cannot do this' } });
  await mount('/users');
  await user.click(screen.getByRole('button', { name: 'Export to CSV' }));
  expect(await screen.findByText('Your admin role cannot do this')).toBeInTheDocument();
  expect(clicked).toHaveLength(0);
  expect(screen.getByRole('button', { name: 'Export to CSV' })).toBeEnabled();
});

test('Content Editors never see the Users page or the export', async () => {
  role = 'content_editor';
  render(<MemoryRouter initialEntries={['/users']}><AuthProvider><App /></AuthProvider></MemoryRouter>);
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  await new Promise((r) => setTimeout(r, 50));
  expect(screen.queryByRole('button', { name: 'Export to CSV' })).not.toBeInTheDocument();
  expect(exportCalls()).toHaveLength(0);
});
