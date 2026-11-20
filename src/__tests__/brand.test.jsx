import { readFileSync } from 'node:fs';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, expect, test, vi } from 'vitest';
import App from '../App';
import { AuthProvider } from '../auth';

// The client's official logo: full logo on the login + accept-invite cards, the Spark in the sidebar, favicons.
const json = (status, body) => Promise.resolve({ ok: status < 400, status, json: () => Promise.resolve(body) });
const ADMIN = { id: 1, email: 'a@x.org', name: 'A', role: 'full_admin', isActive: true };
let routes;
beforeEach(() => {
  sessionStorage.clear(); localStorage.clear();
  routes = {
    'GET /admin/auth/invite/t1': () => json(200, { email: 'p@x.org', name: 'P', role: 'content_editor' }),
    'GET /admin/auth/me': () => json(200, { admin: ADMIN }),
  };
  global.fetch = vi.fn((url, opts = {}) => {
    const key = `${opts.method || 'GET'} ${url.replace(/^.*\/api\/v1/, '').split('?')[0]}`;
    return routes[key] ? routes[key](opts) : json(404, { error: { code: 'NOT_FOUND', message: `unmocked ${key}` } });
  });
});
const mount = (path) => render(<MemoryRouter initialEntries={[path]}><AuthProvider><App /></AuthProvider></MemoryRouter>);

const expectFullLogo = (container) => {
  const img = screen.getByRole('img', { name: 'Satsang Spark' });
  expect(img.getAttribute('src')).toMatch(/logo-full/);
  expect(img.closest('.auth-logo-panel')).not.toBeNull();     // on the cream panel
  expect(within(img.closest('.auth-logo')).getByText('Admin Panel')).toBeInTheDocument();
  expect(container.querySelector('svg.logo')).toBeNull();      // the old orange square is gone
};

test('login card shows the full official logo with "Admin Panel" under it', async () => {
  const { container } = mount('/');
  expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument();
  expectFullLogo(container);
});

test('accept-invite card shows the full official logo', async () => {
  const { container } = mount('/accept-invite?token=t1');
  expect(await screen.findByRole('heading', { name: 'Set your password' })).toBeInTheDocument();
  expectFullLogo(container);
});

test('sidebar shows the Spark symbol next to "Satsang Spark" / "Admin Panel"', async () => {
  sessionStorage.setItem('ssa_admin_token', 'tok');
  const { container } = mount('/');
  await screen.findByRole('link', { name: 'Dashboard' });
  const brand = container.querySelector('.brand');
  const spark = within(brand).getByRole('img', { name: 'Satsang Spark' });
  expect(spark.getAttribute('src')).toMatch(/spark/);
  expect(spark).toHaveAttribute('width', '36');
  expect(brand).toHaveTextContent('Satsang Spark');
  expect(brand).toHaveTextContent('Admin Panel');
  expect(container.querySelector('svg.logo')).toBeNull();
});

test('index.html sets the Spark favicons and keeps the title', () => {
  const html = readFileSync('index.html', 'utf8');
  expect(html).toContain('<title>Satsang Spark Admin</title>');
  expect(html).toMatch(/rel="icon"[^>]*sizes="32x32"[^>]*href="\/favicon-32.png"/);
  expect(html).toMatch(/rel="apple-touch-icon"[^>]*sizes="180x180"[^>]*href="\/apple-touch-icon.png"/);
});
