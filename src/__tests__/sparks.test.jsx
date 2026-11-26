import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';
import { insufficientMessage, newAdjustId, signed } from '../sparks';

// M2 chunk 2.2B: Sparks balance + history per profile, Adjust Sparks, the Users "Sparks" column, Sparks settings.

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const ACCOUNT = { id: 7, email: 'mom@example.com', accountType: 'parent', language: 'en', emailVerified: true, parentPinSet: true, createdAt: '2026-11-20T08:00:00.000Z' };
const kid = (id, username) => ({ id, username, avatarId: 3, avatarKey: 'peacock', age: 9, ageGroup: 'Bals/Balikas B', ageGroupOverridden: false, isChild: true, language: 'en', mode: 'satsang', studentStatus: 'not_asked', studentSparksAwarded: 0 });
const BAL = {
  30: { profileId: 30, balance: 150, lifetimeEarned: 170, lifetimeSpent: 20, pending: 50 },
  31: { profileId: 31, balance: 0, lifetimeEarned: 0, lifetimeSpent: 0, pending: 0 },
};
const tx = (o) => ({ id: 1, profileId: 30, transactionId: 't', amount: 100, type: 'signup_bonus', status: 'verified', reference: null, note: null, createdBy: null, createdAt: '2026-11-21T10:00:00.000Z', verifiedAt: null, reversedAt: null, reversedBy: null, reversedReason: null, ...o });
const HISTORY = {
  30: [
    tx({ id: 3, amount: 50, type: 'admin_adjust', note: 'Satsang sabha prize', createdBy: 2 }),
    tx({ id: 2, amount: 50, type: 'referral', status: 'pending' }),
    tx({ id: 1 }),
  ],
  31: [],
};
const CONFIG = {
  activities: ['quiz', 'game', 'puzzle', 'learn'],
  ageGroups: [{ key: 'Shishu', label: 'Shishu' }, { key: 'Vadil', label: 'Vadil' }],
  rewards: [
    ...['Shishu', 'Vadil'].flatMap((g) => [['quiz', 20], ['game', g === 'Vadil' ? 5 : 15], ['puzzle', g === 'Vadil' ? 15 : 5], ['learn', 10]]
      .map(([activity, sparks]) => ({ activity, ageGroup: g, sparks, defaultSparks: sparks, isDefault: true, updatedBy: null, updatedAt: null }))),
  ],
  note: 'Seeded values are defaults to be confirmed by Loyadham.',
};

let role; let adjustReply; let configPut;
const calls = (re, method = 'GET') => global.fetch.mock.calls.filter(([u, o]) => re.test(u) && (o?.method || 'GET') === method);
let loc;
function Spy() { loc = useLocation(); return null; }

beforeEach(() => {
  sessionStorage.clear(); localStorage.clear(); sessionStorage.setItem('ssa_admin_token', 'tok');
  role = 'full_admin';
  adjustReply = (id, body) => json(201, { duplicate: false, transaction: tx({ id: 9, amount: body.amount, type: 'admin_adjust', note: body.reason, createdBy: 1 }), profileId: id, ...BAL[id], balance: BAL[id].balance + body.amount });
  configPut = (body) => json(200, { changed: body.rewards.map((r) => ({ activity: r.activity, ageGroup: r.ageGroup, from: 0, to: r.sparks })), ...CONFIG,
    rewards: CONFIG.rewards.map((r) => { const c = body.rewards.find((x) => x.activity === r.activity && x.ageGroup === r.ageGroup); return c ? { ...r, sparks: c.sparks, isDefault: false } : r; }) });
  global.fetch = vi.fn((url, opts = {}) => {
    const method = opts.method || 'GET';
    if (url.endsWith('/admin/auth/me')) return json(200, { admin: { id: 1, email: 'a@x.org', name: 'Abhinav', role } });
    if (url.endsWith('/admin/admins')) return json(200, { admins: [{ id: 1, name: 'Abhinav', email: 'a@x.org' }, { id: 2, name: 'Seva Admin', email: 's@x.org' }] });
    let m = url.match(/\/admin\/profiles\/(\d+)\/sparks\/adjust$/);
    if (m && method === 'POST') return adjustReply(Number(m[1]), JSON.parse(opts.body));
    m = url.match(/\/admin\/profiles\/(\d+)\/sparks\/history/);
    if (m) { const items = HISTORY[m[1]] || []; return json(200, { profileId: Number(m[1]), page: 1, pageSize: 10, total: items.length, items }); }
    m = url.match(/\/admin\/profiles\/(\d+)\/sparks$/);
    if (m) return json(200, BAL[m[1]]);
    if (url.endsWith('/admin/sparks/config') && method === 'PUT') return configPut(JSON.parse(opts.body));
    if (url.endsWith('/admin/sparks/config')) return json(200, CONFIG);
    if (url.includes('/admin/users/7')) return json(200, { account: ACCOUNT, profiles: [kid(30, 'kid_one'), kid(31, 'kid_two')] });
    if (url.includes('/admin/users?')) return json(200, { page: 1, pageSize: 25, totalAccounts: 1, totalRows: 2, countries: [], rows: [
      { accountId: 7, profileId: null, accountType: 'parent', isChild: false, name: 'Mom', email: 'mom@example.com', matched: true, joined: '2026-11-20T08:00:00.000Z' },
      { accountId: 7, parentAccountId: 7, profileId: 30, accountType: 'child', isChild: true, username: 'kid_one', email: 'mom@example.com', isParentEmail: true, matched: true, sparksBalance: 1500, joined: '2026-11-20T08:00:00.000Z' },
    ] });
    if (url.includes('/admin/dashboard')) return json(503, { error: { code: 'UNAVAILABLE', message: 'not needed' } });
    if (url.includes('/admin/deletion-requests')) return json(200, { counts: { pending: 0 }, rows: [], total: 0 });
    return json(404, { error: { code: 'NOT_FOUND', message: 'unmocked' } });
  });
});
afterEach(() => vi.restoreAllMocks());

const mount = (path) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /><Spy /></AuthProvider></MemoryRouter>);
const sparksOf = (u) => within(screen.getByRole('group', { name: `Sparks for ${u}` }));
const mountDetail = async () => { mount('/users/7'); await screen.findByRole('heading', { name: 'mom@example.com' }); await waitFor(() => expect(sparksOf('kid_one').getByText('150')).toBeInTheDocument()); };

// ---- helpers ----
test('helpers: signed amounts, idempotency ids, the INSUFFICIENT_SPARKS message', () => {
  expect(signed(50)).toBe('+50'); expect(signed(-1200)).toBe('−1,200');
  const id = newAdjustId();
  expect(id).toMatch(/^[a-z0-9][a-z0-9_.:-]{0,63}$/);
  expect(newAdjustId()).not.toBe(id);
  expect(insufficientMessage({ code: 'INSUFFICIENT_SPARKS', details: { balance: 10, needed: 50 } })).toMatch(/balance is 10, this needs 50/);
  expect(insufficientMessage({ code: 'OTHER' })).toBeNull();
});

// ---- 1. per profile: balance, lifetime, pending, history ----
test('each profile (every child separately) shows balance, lifetime earned/spent, pending and its own history', async () => {
  await mountDetail();
  const one = sparksOf('kid_one');
  expect(one.getByText('Balance').nextSibling).toHaveTextContent('150');
  expect(one.getByText('Lifetime earned').nextSibling).toHaveTextContent('170');
  expect(one.getByText('Lifetime spent').nextSibling).toHaveTextContent('20');
  expect(one.getByText('Pending', { selector: 'dt' }).nextSibling).toHaveTextContent('50');
  const table = within(one.getByRole('table', { name: 'Sparks history for kid_one' }));
  const rows = table.getAllByRole('row').slice(1).map((r) => r.textContent);
  expect(rows[0]).toMatch(/Admin adjustment\+50Verified.*Seva AdminSatsang sabha prize/);
  expect(rows[1]).toMatch(/Referral\+50Pending/);
  expect(rows[2]).toMatch(/Sign-up bonus\+100Verified/);
  expect(one.getByText('Sparks history (3)')).toBeInTheDocument();

  const two = sparksOf('kid_two');
  expect(two.getByText('Balance').nextSibling).toHaveTextContent('0');
  expect(await two.findByText('No Sparks yet.')).toBeInTheDocument();
  expect(calls(/\/admin\/profiles\/30\/sparks$/)).toHaveLength(1);
  expect(calls(/\/admin\/profiles\/31\/sparks$/)).toHaveLength(1);
});

test('an admin who is no longer listed shows as "Admin #id"', async () => {
  HISTORY[30][0] = tx({ id: 3, amount: -5, type: 'admin_adjust', note: 'Correction', createdBy: 99 });
  try {
    await mountDetail();
    expect(await sparksOf('kid_one').findByText('Admin #99')).toBeInTheDocument();
    expect(sparksOf('kid_one').getByText('−5')).toBeInTheDocument();
  } finally { HISTORY[30][0] = tx({ id: 3, amount: 50, type: 'admin_adjust', note: 'Satsang sabha prize', createdBy: 2 }); }
});

// ---- 2. Adjust Sparks ----
const openAdjust = async (user, u = 'kid_one') => {
  await user.click(screen.getByRole('button', { name: `Adjust Sparks for ${u}` }));
  return within(screen.getByRole('dialog'));
};

test('Adjust: amount + required reason, confirm step, posts once with a transactionId, toast with the new balance, reloads', async () => {
  await mountDetail(); const user = userEvent.setup();
  const d = await openAdjust(user);
  const next = d.getByRole('button', { name: 'Continue' });
  expect(next).toBeDisabled();
  await user.type(d.getByLabelText('Amount'), '25');
  expect(d.getByText('New balance: 175')).toBeInTheDocument();
  expect(next).toBeDisabled();   // reason still missing
  await user.type(d.getByLabelText('Reason'), 'Sabha prize');
  await user.click(next);

  const c = within(screen.getByRole('dialog', { name: 'Add Sparks?' }));
  expect(c.getByText('Balance now').nextSibling).toHaveTextContent('150');
  expect(c.getByText('After').nextSibling).toHaveTextContent('175');
  expect(calls(/sparks\/adjust$/, 'POST')).toHaveLength(0);   // nothing sent before confirming
  const before = calls(/\/admin\/profiles\/30\/sparks$/).length;
  await user.click(c.getByRole('button', { name: 'Add Sparks' }));

  expect(await screen.findByText('+25 Sparks for kid_one · new balance 175')).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
  const posts = calls(/\/admin\/profiles\/30\/sparks\/adjust$/, 'POST');
  expect(posts).toHaveLength(1);
  const body = JSON.parse(posts[0][1].body);
  expect(body).toMatchObject({ amount: 25, reason: 'Sabha prize' });
  expect(body.transactionId).toMatch(/^admin-adjust-/);
  await waitFor(() => expect(calls(/\/admin\/profiles\/30\/sparks$/).length).toBe(before + 1));
});

test('Adjust: a negative amount deducts; below zero is blocked before sending', async () => {
  await mountDetail(); const user = userEvent.setup();
  const d = await openAdjust(user);
  await user.type(d.getByLabelText('Reason'), 'Correction');
  await user.type(d.getByLabelText('Amount'), '-200');
  expect(d.getByRole('alert')).toHaveTextContent('Not enough Sparks: the balance is 150, this needs 200');
  expect(d.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await user.clear(d.getByLabelText('Amount'));
  await user.type(d.getByLabelText('Amount'), '-20');
  await user.click(d.getByRole('button', { name: 'Continue' }));
  const c = within(screen.getByRole('dialog', { name: 'Deduct Sparks?' }));
  expect(c.getByText('After').nextSibling).toHaveTextContent('130');
  await user.click(c.getByRole('button', { name: 'Deduct Sparks' }));
  expect(await screen.findByText('−20 Sparks for kid_one · new balance 130')).toBeInTheDocument();
});

test('Adjust: the server INSUFFICIENT_SPARKS error is shown and the dialog stays open', async () => {
  adjustReply = () => json(409, { error: { code: 'INSUFFICIENT_SPARKS', message: 'Not enough Sparks', details: { balance: 5, needed: 20 } } });
  await mountDetail(); const user = userEvent.setup();
  const d = await openAdjust(user);
  await user.type(d.getByLabelText('Amount'), '-20');
  await user.type(d.getByLabelText('Reason'), 'Correction');
  await user.click(d.getByRole('button', { name: 'Continue' }));
  const dialog = screen.getByRole('dialog', { name: 'Deduct Sparks?' });
  await user.click(within(dialog).getByRole('button', { name: 'Deduct Sparks' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Not enough Sparks: the balance is 5, this needs 20. Nothing was changed.');
  expect(screen.getByRole('dialog', { name: 'Deduct Sparks?' })).toBeInTheDocument();
});

test('Adjust: amount 0 or a short reason cannot continue', async () => {
  await mountDetail(); const user = userEvent.setup();
  const d = await openAdjust(user);
  await user.type(d.getByLabelText('Amount'), '0');
  await user.type(d.getByLabelText('Reason'), 'Long enough');
  expect(d.getByRole('button', { name: 'Continue' })).toBeDisabled();
  await user.clear(d.getByLabelText('Amount')); await user.type(d.getByLabelText('Amount'), '5');
  await user.clear(d.getByLabelText('Reason')); await user.type(d.getByLabelText('Reason'), 'ab');
  expect(d.getByRole('button', { name: 'Continue' })).toBeDisabled();
});

// ---- 3. Users table column ----
test('Users: "Sparks" column shows the real balance and sorts by it (biggest first)', async () => {
  mount('/users'); const user = userEvent.setup();
  expect(await screen.findByText('1,500')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Sparks' }));
  await waitFor(() => expect(new URLSearchParams(loc.search).get('sort')).toBe('sparks'));
  const last = new URL(calls(/\/admin\/users\?/).at(-1)[0]).searchParams;
  expect(last.get('sort')).toBe('sparks');
  expect(last.get('order')).toBe('desc');
  expect(screen.getByRole('columnheader', { name: /Sparks/ })).toHaveAttribute('aria-sort', 'descending');
});

// ---- 4. Sparks settings ----
test('Sparks settings: sidebar link under Administration, the note, editable table, Save confirms and sends only changes', async () => {
  mount('/sparks-settings'); const user = userEvent.setup();
  expect(await screen.findByRole('heading', { name: 'Sparks settings' })).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Sparks settings' })).toHaveAttribute('href', '/sparks-settings');
  expect(screen.getByText('Values to be confirmed by Loyadham.')).toBeInTheDocument();
  const game = await screen.findByLabelText('Game Sparks for Vadil');
  expect(game).toHaveValue(5);
  const save = screen.getByRole('button', { name: 'Save' });
  expect(save).toBeDisabled();

  await user.clear(game); await user.type(game, '7');
  await user.clear(screen.getByLabelText('Quiz Sparks for Shishu')); await user.type(screen.getByLabelText('Quiz Sparks for Shishu'), '25');
  expect(screen.getByText('2 unsaved changes')).toBeInTheDocument();
  await user.click(save);
  const dialog = screen.getByRole('dialog', { name: 'Save Sparks settings?' });
  expect(dialog).toHaveTextContent('Quiz · Shishu: 20 → 25');
  expect(dialog).toHaveTextContent('Game · Vadil: 5 → 7');
  expect(calls(/\/admin\/sparks\/config$/, 'PUT')).toHaveLength(0);
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

  expect(await screen.findByText('Sparks settings saved · 2 changes')).toBeInTheDocument();
  const put = calls(/\/admin\/sparks\/config$/, 'PUT');
  expect(put).toHaveLength(1);
  expect(JSON.parse(put[0][1].body)).toEqual({ rewards: [
    { activity: 'quiz', ageGroup: 'Shishu', sparks: 25 },
    { activity: 'game', ageGroup: 'Vadil', sparks: 7 },
  ] });
  expect(screen.getByLabelText('Game Sparks for Vadil')).toHaveValue(7);
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
});

test('Sparks settings: an invalid value blocks Save; a server error stays in the dialog', async () => {
  configPut = () => json(403, { error: { code: 'FORBIDDEN', message: 'Full Admin only' } });
  mount('/sparks-settings'); const user = userEvent.setup();
  const learn = await screen.findByLabelText('Learn Sparks for Vadil');
  await user.clear(learn); await user.type(learn, '20000');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.getByText(/whole number from 0 to 10,000/)).toBeInTheDocument();
  await user.clear(learn); await user.type(learn, '12');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  const dialog = screen.getByRole('dialog', { name: 'Save Sparks settings?' });
  await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Full Admin only');
});

test('Content Editor: no Sparks settings link, the page redirects, no Sparks calls', async () => {
  role = 'content_editor';
  mount('/sparks-settings');
  await screen.findByRole('link', { name: 'Dashboard' });
  expect(screen.queryByRole('link', { name: 'Sparks settings' })).toBeNull();
  expect(global.fetch.mock.calls.some(([u]) => u.includes('/sparks'))).toBe(false);
});
