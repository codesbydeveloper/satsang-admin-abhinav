import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';
import { fromLocalInput, isHttpsUrl, newsStatus, spinStats, streakAmounts, streakForm, toLocalInput } from '../home';
import { donateError } from '../pages/Donate';
import { newsErrors } from '../pages/News';

// M2 chunk 2.3C: News & Updates, Feedback, Daily Spin, Streak, Donate (backend 2.3A).

const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const news = (o) => ({ id: 1, title: { en: 'Diwali Sabha', gu: 'દિવાળી સભા' }, body: { en: 'Join us', gu: 'આવો' }, imageUrl: null,
  publishAt: '2026-11-20T14:00:00.000Z', pinned: true, active: true, createdBy: 1, updatedBy: null, createdAt: '2026-11-20T14:00:00.000Z', updatedAt: null, ...o });
const NEWS = [
  news(),
  news({ id: 2, title: { en: 'New quiz week', gu: null }, body: { en: 'Coming soon', gu: null }, publishAt: '2099-01-01T10:00:00.000Z', pinned: false }),
  news({ id: 3, title: { en: 'Old post', gu: null }, body: { en: 'Hidden', gu: null }, active: false, pinned: false }),
];
const FEEDBACK = [
  { id: 12, accountId: 7, profileId: 31, username: 'kid_one', isChild: true, category: 'bug', message: 'The quiz froze on question 3', appVersion: '1.0.3', device: 'Pixel 7', status: 'open', adminNote: null, resolvedBy: null, resolvedAt: null, createdAt: '2026-11-25T10:00:00.000Z' },
  { id: 11, accountId: 4, profileId: 20, username: 'friend_1', isChild: false, category: 'idea', message: 'More bhajans please', appVersion: null, device: null, status: 'resolved', adminNote: 'Planned', resolvedBy: 1, resolvedAt: '2026-11-25T12:00:00.000Z', createdAt: '2026-11-24T10:00:00.000Z' },
];
const WHEEL = { isDefault: true, updatedBy: null, updatedAt: null, note: 'Built-in values are defaults to be confirmed by Loyadham.', segments: [
  { index: 0, label: '5 Sparks', sparks: 5, weight: 50, chancePercent: 50 },
  { index: 1, label: null, sparks: 10, weight: 30, chancePercent: 30 },
  { index: 2, label: 'Jackpot', sparks: 100, weight: 20, chancePercent: 20 },
] };
const STREAK = { isDefault: true, amounts: [5, 10, 15, 20, 25, 30, 50], updatedBy: null, updatedAt: null, note: '' };

let role; let donate;
const calls = (re, method = 'GET') => global.fetch.mock.calls.filter(([u, o]) => re.test(u) && (o?.method || 'GET') === method);
const bodyOf = (re, method) => JSON.parse(calls(re, method).at(-1)[1].body);
let loc;
function Spy() { loc = useLocation(); return null; }

beforeEach(() => {
  role = 'full_admin';
  donate = { donateUrl: '', isDefault: true, defaultDonateUrl: '', updatedBy: null, updatedAt: null };
  sessionStorage.setItem('ssa_admin_token', 'tok');
  global.fetch = vi.fn((url, opts = {}) => {
    const m = opts.method || 'GET';
    const body = opts.body ? JSON.parse(opts.body) : null;
    if (url.endsWith('/admin/auth/me')) return json(200, { admin: { id: 1, email: 'a@x.org', name: 'Abhinav', role } });
    if (url.includes('/admin/dashboard')) return json(503, { error: { code: 'UNAVAILABLE', message: 'not needed here' } });
    if (url.includes('/admin/deletion-requests')) return json(200, { counts: { pending: 0 }, rows: [], total: 0 });
    if (/\/admin\/news\/\d+$/.test(url) && m === 'DELETE') return json(200, { deleted: true, id: 1 });
    if (/\/admin\/news\/\d+$/.test(url) && m === 'PATCH') return json(200, { news: news(body) });
    if (url.endsWith('/admin/news') && m === 'POST') return json(201, { news: news({ id: 9 }) });
    if (url.includes('/admin/news')) return json(200, { page: 1, pageSize: 25, total: NEWS.length, items: NEWS });
    if (/\/admin\/feedback\/\d+$/.test(url)) return json(200, { feedback: { ...FEEDBACK[0], ...body } });
    if (url.includes('/admin/feedback')) return json(200, { page: 1, pageSize: 25, total: 2, openCount: 1, items: FEEDBACK });
    if (url.endsWith('/admin/home/spin-segments') && m === 'PUT') {
      return json(200, { ...WHEEL, isDefault: false, segments: body.segments.map((s, index) => ({ index, label: s.label || null, ...s, chancePercent: 0 })) });
    }
    if (url.endsWith('/admin/home/spin-segments')) return json(200, WHEEL);
    if (url.endsWith('/admin/home/streak-bonus') && m === 'PUT') return json(200, { ...STREAK, isDefault: false, amounts: body.amounts });
    if (url.endsWith('/admin/home/streak-bonus')) return json(200, STREAK);
    if (url.endsWith('/admin/home/donate-url') && m === 'PUT') { donate = { ...donate, donateUrl: body.donateUrl, isDefault: false, updatedAt: '2026-11-26T10:00:00.000Z' }; return json(200, donate); }
    if (url.endsWith('/admin/home/donate-url')) return json(200, donate);
    return json(404, { error: { code: 'NOT_FOUND', message: 'unmocked' } });
  });
});
afterEach(() => { vi.clearAllMocks(); sessionStorage.clear(); });

const mount = (path) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /><Spy /></AuthProvider></MemoryRouter>);

test('helpers: chance %, average Sparks, streak days 1–7 + after, https check, news status, local time round trip', () => {
  const s = spinStats([{ sparks: 5, weight: 50 }, { sparks: 10, weight: 30 }, { sparks: 100, weight: 20 }]);
  expect(s.chances).toEqual([50, 30, 20]);
  expect(s.average).toBe(25.5);   // (5·50 + 10·30 + 100·20) / 100
  expect(spinStats([{ sparks: 5, weight: NaN }]).average).toBe(0);

  expect(streakForm([5, 10, 15, 20, 25, 30, 50])).toEqual({ days: [5, 10, 15, 20, 25, 30, 50], after: 50 });
  expect(streakForm([5, 10])).toEqual({ days: [5, 10, 10, 10, 10, 10, 10], after: 10 });
  expect(streakForm([1, 2, 3, 4, 5, 6, 7, 8, 9])).toEqual({ days: [1, 2, 3, 4, 5, 6, 7], after: 8 });
  expect(streakAmounts([1, 2, 3, 4, 5, 6, 7], 60)).toEqual([1, 2, 3, 4, 5, 6, 7, 60]);

  expect(isHttpsUrl('https://loyadham.org/donate')).toBe(true);
  expect(isHttpsUrl('http://loyadham.org')).toBe(false);
  expect(isHttpsUrl('javascript:alert(1)')).toBe(false);
  expect(isHttpsUrl('loyadham.org')).toBe(false);
  expect(donateError('')).toBeNull();   // empty hides the button
  expect(donateError('http://x.org')).toMatch(/https/);
  expect(donateError(`https://x.org/${'a'.repeat(260)}`)).toMatch(/255/);

  const now = Date.parse('2026-11-26T10:00:00Z');
  expect(newsStatus({ active: true, publishAt: '2026-11-25T10:00:00.000Z' }, now)).toBe('published');
  expect(newsStatus({ active: true, publishAt: '2026-11-27T10:00:00.000Z' }, now)).toBe('scheduled');
  expect(newsStatus({ active: false, publishAt: '2026-11-25T10:00:00.000Z' }, now)).toBe('inactive');
  expect(fromLocalInput(toLocalInput('2026-11-28T14:00:00.000Z'))).toBe('2026-11-28T14:00:00.000Z');
  expect(fromLocalInput('')).toBeNull();

  const ok = { titleEn: 'T', bodyEn: 'B', titleGu: '', bodyGu: '', imageUrl: '', publishAt: '2026-11-28T10:00' };
  expect(newsErrors(ok)).toEqual({});
  expect(Object.keys(newsErrors({ ...ok, titleEn: ' ', bodyEn: '', imageUrl: 'http://x.org/a.png', publishAt: '' }))).toEqual(['titleEn', 'bodyEn', 'imageUrl', 'publishAt']);
});

test('sidebar groups: Content, Engagement, Support, Settings for a Full Admin; a Content Editor sees News only', async () => {
  const { unmount } = mount('/dashboard');
  const nav = await screen.findByRole('navigation', { name: 'Main' });
  for (const name of ['News & Updates', 'Daily Spin', 'Streak', 'Feedback', 'Donate']) expect(within(nav).getByRole('link', { name })).toBeInTheDocument();
  for (const label of ['Content', 'Engagement', 'Support', 'Settings']) expect(within(nav).getByText(label)).toBeInTheDocument();
  unmount();

  role = 'content_editor';
  mount('/daily-spin');
  const nav2 = await screen.findByRole('navigation', { name: 'Main' });
  expect(within(nav2).getByRole('link', { name: 'News & Updates' })).toBeInTheDocument();
  for (const name of ['Daily Spin', 'Streak', 'Feedback', 'Donate']) expect(within(nav2).queryByRole('link', { name })).toBeNull();
  await waitFor(() => expect(loc.pathname).toBe('/dashboard'));   // Full Admin pages send a Content Editor back
  expect(calls(/\/admin\/home\//)).toHaveLength(0);
});

test('News (Content Editor): list shows status, pinned and date; create with both languages, preview, validation', async () => {
  role = 'content_editor';
  const user = userEvent.setup(); mount('/news');
  const table = await screen.findByRole('table', { name: 'News & Updates' });
  await within(table).findByText('Diwali Sabha');
  const [, first, second, third] = within(table).getAllByRole('row');
  expect(first).toHaveTextContent('Published'); expect(first).toHaveTextContent('Pinned'); expect(first).toHaveTextContent('દિવાળી સભા');
  expect(second).toHaveTextContent('Scheduled'); expect(second).toHaveTextContent('No (English shown)');
  expect(third).toHaveTextContent('Inactive');

  await user.click(within(screen.getByRole('group', { name: 'Status' })).getByRole('button', { name: 'Scheduled' }));
  await waitFor(() => expect(calls(/\/admin\/news\?.*status=scheduled/).length).toBe(1));

  await user.click(screen.getByRole('button', { name: /New post/ }));
  const drawer = await screen.findByRole('dialog', { name: 'New post' });
  const create = within(drawer).getByRole('button', { name: 'Create post' });
  await user.click(create);   // empty: errors show, nothing sent
  expect(within(drawer).getByText('English title is required.')).toBeInTheDocument();
  expect(calls(/\/admin\/news$/, 'POST')).toHaveLength(0);

  await user.type(within(drawer).getByLabelText(/^Title/), 'Annakut');
  await user.type(within(drawer).getByLabelText(/^Text/), 'Come for darshan');
  // Preview: English everywhere; Gujarati falls back to English and says so
  const gu = within(drawer).getByRole('region', { name: 'Gujarati preview' });
  expect(gu).toHaveTextContent('Annakut'); expect(gu).toHaveTextContent('No Gujarati text: the app shows the English one.');
  await user.type(within(drawer).getByLabelText(/^Gujarati title/), 'અન્નકૂટ');
  expect(gu).toHaveTextContent('અન્નકૂટ'); expect(gu).toHaveTextContent('No Gujarati text');
  expect(within(drawer).getByRole('region', { name: 'English preview' })).toHaveTextContent('Annakut');

  await user.type(within(drawer).getByLabelText(/^Image URL/), 'http://cdn.x.org/a.png');
  expect(within(drawer).getByText(/Use an https:\/\/ image address/)).toBeInTheDocument();
  await user.clear(within(drawer).getByLabelText(/^Image URL/));
  await user.type(within(drawer).getByLabelText(/^Image URL/), 'https://cdn.x.org/a.png');
  await user.click(within(drawer).getByLabelText(/Pinned/));
  await user.click(create);

  await screen.findByText('Post created');
  const b = bodyOf(/\/admin\/news$/, 'POST');
  expect(b).toMatchObject({ titleEn: 'Annakut', titleGu: 'અન્નકૂટ', bodyEn: 'Come for darshan', bodyGu: null, imageUrl: 'https://cdn.x.org/a.png', pinned: true, active: true });
  expect(b.publishAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\.000Z$/);
});

test('News: edit sends only the changed fields; delete asks first', async () => {
  const user = userEvent.setup(); mount('/news');
  await user.click(await screen.findByRole('button', { name: 'Edit Diwali Sabha' }));
  const drawer = await screen.findByRole('dialog', { name: 'Edit post' });
  expect(within(drawer).getByRole('button', { name: 'Save changes' })).toBeDisabled();   // nothing changed yet
  await user.click(within(drawer).getByLabelText(/Pinned/));
  await user.click(within(drawer).getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Post saved');
  expect(calls(/\/admin\/news\/1$/, 'PATCH')[0][0]).toMatch(/\/admin\/news\/1$/);
  expect(bodyOf(/\/admin\/news\/1$/, 'PATCH')).toEqual({ pinned: false });

  await user.click(screen.getByRole('button', { name: 'Delete New quiz week' }));
  const modal = await screen.findByRole('dialog', { name: 'Delete this post?' });
  expect(calls(/\/admin\/news\/2$/, 'DELETE')).toHaveLength(0);
  await user.click(within(modal).getByRole('button', { name: 'Delete post' }));
  await screen.findByText('Post deleted');
  expect(calls(/\/admin\/news\/2$/, 'DELETE')).toHaveLength(1);
});

test('Feedback (Full Admin): category, username + child badge, filters reach the API, Mark resolved with a note', async () => {
  const user = userEvent.setup(); mount('/feedback');
  const table = await screen.findByRole('table', { name: 'Feedback' });
  await within(table).findByText('kid_one');
  const [, open, done] = within(table).getAllByRole('row');
  expect(open).toHaveTextContent('Bug'); expect(open).toHaveTextContent('kid_one'); expect(open).toHaveTextContent('Child');
  expect(open).toHaveTextContent('The quiz froze on question 3'); expect(open).toHaveTextContent('App 1.0.3 · Pixel 7'); expect(open).toHaveTextContent('Open');
  expect(done).toHaveTextContent('Idea'); expect(done).not.toHaveTextContent('Child'); expect(done).toHaveTextContent('Resolved'); expect(done).toHaveTextContent('Note: Planned');
  expect(table.textContent).not.toMatch(/@/);
  expect(calls(/\/admin\/feedback\?.*status=open/).length).toBe(1);   // opens on the open ones

  await user.selectOptions(screen.getByLabelText('Category'), 'bug');
  await waitFor(() => expect(calls(/\/admin\/feedback\?.*category=bug/).length).toBe(1));
  await user.click(screen.getByRole('button', { name: 'All' }));
  await waitFor(() => expect(calls(/\/admin\/feedback\?.*status=all/).length).toBe(1));
  await user.type(screen.getByLabelText('Search feedback'), '#12{Enter}');
  await waitFor(() => expect(calls(/\/admin\/feedback\?.*q=%2312/).length).toBe(1));

  await user.click(within(open).getByRole('button', { name: /Mark resolved/ }));
  const modal = await screen.findByRole('dialog', { name: 'Mark feedback #12 resolved?' });
  await user.type(within(modal).getByLabelText(/Note for other admins/), 'Fixed in 1.0.4');
  await user.click(within(modal).getByRole('button', { name: 'Mark resolved' }));
  await screen.findByText('Feedback #12 marked resolved');
  expect(bodyOf(/\/admin\/feedback\/12$/, 'PATCH')).toEqual({ status: 'resolved', note: 'Fixed in 1.0.4' });

  await user.click(within(done).getByRole('button', { name: 'Open again' }));
  await waitFor(() => expect(bodyOf(/\/admin\/feedback\/11$/, 'PATCH')).toEqual({ status: 'open' }));
});

test('Daily Spin: chance % and average per spin, live while editing; save asks first and sends the wheel', async () => {
  const user = userEvent.setup(); mount('/daily-spin');
  expect(await screen.findByText(/Values to be confirmed by Loyadham/)).toBeInTheDocument();
  await screen.findByRole('table', { name: 'Wheel segments' });
  expect(screen.getByTestId('chance-0')).toHaveTextContent('50%');
  expect(screen.getByTestId('chance-2')).toHaveTextContent('20%');
  expect(screen.getByTestId('spin-average')).toHaveTextContent('25.5');
  const save = screen.getByRole('button', { name: 'Save' });
  expect(save).toBeDisabled();

  const w = screen.getByLabelText('Weight for segment 3');
  await user.clear(w); await user.type(w, '70');   // weights 50/30/70 = 150
  expect(screen.getByTestId('chance-2')).toHaveTextContent('46.7%');
  expect(screen.getByTestId('spin-average')).toHaveTextContent('50.3');   // (250 + 300 + 7000) / 150

  await user.clear(w);
  expect(save).toBeDisabled();   // a missing weight blocks Save
  await user.type(w, '70');
  await user.click(screen.getByRole('button', { name: 'Add segment' }));
  await user.type(screen.getByLabelText('Sparks for segment 4'), '50');
  await user.type(screen.getByLabelText('Weight for segment 4'), '50');
  await user.click(save);
  const modal = await screen.findByRole('dialog', { name: 'Save the Daily Spin wheel?' });
  expect(modal).toHaveTextContent('25.5'); expect(calls(/spin-segments/, 'PUT')).toHaveLength(0);
  await user.click(within(modal).getByRole('button', { name: 'Save wheel' }));
  await screen.findByText('Daily Spin saved');
  expect(bodyOf(/spin-segments$/, 'PUT')).toEqual({ segments: [
    { label: '5 Sparks', sparks: 5, weight: 50 }, { sparks: 10, weight: 30 }, { label: 'Jackpot', sparks: 100, weight: 70 }, { sparks: 50, weight: 50 }] });
});

test('Streak: day 1–7 and every day after; save asks first and sends 8 amounts', async () => {
  const user = userEvent.setup(); mount('/streak');
  expect(await screen.findByLabelText('Day 1')).toHaveValue(5);
  expect(screen.getByLabelText('Day 7')).toHaveValue(50);
  expect(screen.getByLabelText('Every day after')).toHaveValue(50);
  expect(screen.getByText(/Values to be confirmed by Loyadham/)).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();   // [5…50] = [5…50, 50]: no change

  await user.clear(screen.getByLabelText('Every day after')); await user.type(screen.getByLabelText('Every day after'), '60');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  const modal = await screen.findByRole('dialog', { name: 'Save the Streak Bonus?' });
  expect(modal).toHaveTextContent('Every day after (day 8+): 50 → 60');
  await user.click(within(modal).getByRole('button', { name: 'Save changes' }));
  await screen.findByText('Streak Bonus saved');
  expect(bodyOf(/streak-bonus$/, 'PUT')).toEqual({ amounts: [5, 10, 15, 20, 25, 30, 50, 60] });
});

test('Donate: https only, Open link, empty hides the button', async () => {
  const user = userEvent.setup(); mount('/donate');
  const input = await screen.findByLabelText(/^Donate URL/);
  expect(screen.getByText(/Values to be confirmed by Loyadham/)).toBeInTheDocument();
  expect(screen.getByText('Empty: the Donate button is hidden in the app.')).toBeInTheDocument();
  await user.type(input, 'http://loyadham.org/donate');
  expect(screen.getByRole('alert')).toHaveTextContent('https://');
  expect(screen.getByRole('button', { name: 'Save' })).toBeDisabled();
  expect(screen.queryByRole('link', { name: 'Open' })).toBeNull();

  await user.clear(input); await user.type(input, 'https://loyadham.org/donate');
  const open = screen.getByRole('link', { name: 'Open' });
  expect(open).toHaveAttribute('href', 'https://loyadham.org/donate');
  expect(open).toHaveAttribute('target', '_blank'); expect(open).toHaveAttribute('rel', 'noopener noreferrer');
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Donate URL saved');
  expect(bodyOf(/donate-url$/, 'PUT')).toEqual({ donateUrl: 'https://loyadham.org/donate' });

  await user.clear(input);
  await user.click(screen.getByRole('button', { name: 'Save' }));
  await screen.findByText('Donate button hidden');
  expect(bodyOf(/donate-url$/, 'PUT')).toEqual({ donateUrl: '' });
});
