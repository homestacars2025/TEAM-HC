import React from 'react';
import fs from 'fs';
import path from 'path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PageAccessProvider, usePageAccess } from './PageAccessContext';
import RequirePage, { RedirectToFirstPage } from '../components/RequirePage';
import i18n from '../i18n';

/**
 * Access is the one thing here that must fail safely, so the Supabase client is
 * faked per test: each lookup can be made to fail on its own.
 */

const PAGES = [
  { key: 'tasks', label_en: 'Tasks', label_ar: 'المهام', route: '/dashboard/tasks', group_key: 'main', sort_order: 1 },
  { key: 'cars', label_en: 'Cars', label_ar: 'السيارات', route: '/dashboard/cars', group_key: 'fleet', sort_order: 10 },
  { key: 'car_tracking', label_en: 'Car Tracking', label_ar: 'تتبع', route: '/dashboard/cars/tracking', group_key: 'fleet', sort_order: 11 },
  { key: 'accounting', label_en: 'Accounting', label_ar: 'المحاسبة', route: '/dashboard/accounting', group_key: 'finance', sort_order: 30 },
  { key: 'media_ideas', label_en: 'Ideas', label_ar: 'الأفكار', route: '/dashboard/media/ideas', group_key: 'media', sort_order: 40 },
  { key: 'media_calendar', label_en: 'Calendar', label_ar: 'التقويم', route: '/dashboard/media/calendar', group_key: 'media', sort_order: 41 },
];

type Result = { data: unknown; error: { message: string } | null };

let mockAllowed: Result;
let mockPages: Result;
let mockMember: Result;
let mockSession: { data: { session: unknown }; error: unknown };
let mockRpcCalls = 0;
let mockMaybeSingleCalls = 0;
const mockSignOut = jest.fn(async () => ({ error: null }));

jest.mock('../lib/supabase', () => {
  const query = (result: () => unknown) => {
    const chain: Record<string, unknown> = {};
    ['select', 'eq', 'order'].forEach(m => { chain[m] = () => chain; });
    // `.single()` is deliberately absent: it errors on zero rows, which is what an
    // admin has, so reaching for it would fail every test here.
    chain.maybeSingle = async () => { mockMaybeSingleCalls += 1; return result(); };
    chain.then = (resolve: (v: unknown) => void) => resolve(result());
    return chain;
  };
  return {
    supabase: {
      auth: {
        getSession: async () => mockSession,
        signOut: () => mockSignOut(),
      },
      rpc: async () => { mockRpcCalls += 1; return mockAllowed; },
      from: (table: string) => query(() => (table === 'app_pages' ? mockPages : mockMember)),
    },
  };
});

const allow = (...keys: string[]) => { mockAllowed = { data: keys.map(page_key => ({ page_key })), error: null }; };

beforeEach(async () => {
  await i18n.changeLanguage('en');
  mockSession = { data: { session: { user: { id: 'user-1' } } }, error: null };
  mockPages = { data: PAGES, error: null };
  mockMember = {
    data: {
      department_key: 'operations',
      is_department_head: true,
      departments: { key: 'operations', label_en: 'Operations', label_ar: 'العمليات' },
    },
    error: null,
  };
  allow('tasks', 'cars');
  mockSignOut.mockClear();
  mockRpcCalls = 0;
  mockMaybeSingleCalls = 0;
});

afterEach(() => { jest.useRealTimers(); });

const Probe: React.FC = () => {
  const access = usePageAccess();
  return (
    <div>
      <span data-testid="loading">{String(access.loading)}</span>
      <span data-testid="error">{String(access.error)}</span>
      <span data-testid="refresh-failed">{String(access.refreshFailed)}</span>
      <span data-testid="allowed">{Array.from(access.allowedPages).sort().join(',')}</span>
      <span data-testid="first">{String(access.firstAllowedRoute)}</span>
      <span data-testid="department">{access.department?.label ?? 'none'}</span>
      <span data-testid="head">{String(access.isDepartmentHead)}</span>
      <span data-testid="route-cars">{String(access.canAccessRoute('/dashboard/cars/'))}</span>
      <span data-testid="route-tracking">{String(access.canAccessRoute('/dashboard/cars/tracking'))}</span>
      <span data-testid="route-deep">{String(access.canAccessRoute('/dashboard/cars/24'))}</span>
      <button onClick={() => { access.refresh(); }}>refresh</button>
    </div>
  );
};

const mountProbe = async () => {
  render(<PageAccessProvider><Probe /></PageAccessProvider>);
  await waitFor(() => expect(screen.getByTestId('loading')).toHaveTextContent('false'));
};

const value = (id: string) => screen.getByTestId(id).textContent;

describe('PageAccessProvider', () => {
  test('exposes what the server allowed, in sort order', async () => {
    await mountProbe();
    expect(value('allowed')).toBe('cars,tasks');
    expect(value('first')).toBe('/dashboard/tasks');
    expect(value('department')).toBe('Operations');
    expect(value('head')).toBe('true');
    expect(value('error')).toBe('null');
  });

  test('a route is matched exactly, so a parent page never unlocks its child', async () => {
    await mountProbe();
    expect(value('route-cars')).toBe('true');
    expect(value('route-tracking')).toBe('false');
    expect(value('route-deep')).toBe('false');
  });

  test('an allowed key with no active page grants nothing', async () => {
    allow('tasks', 'retired_page');
    await mountProbe();
    expect(value('allowed')).toBe('tasks');
  });

  test('an admin has no team_members row, which is not a failure', async () => {
    mockMember = { data: null, error: null };
    allow('tasks', 'cars', 'accounting');
    await mountProbe();

    expect(mockMaybeSingleCalls).toBeGreaterThan(0);
    expect(value('error')).toBe('null');
    expect(value('department')).toBe('none');
    expect(value('head')).toBe('false');
    expect(value('allowed')).toBe('accounting,cars,tasks');
  });

  test('the department label follows the language', async () => {
    await i18n.changeLanguage('ar');
    await mountProbe();
    expect(value('department')).toBe('العمليات');
  });

  test.each([
    ['my_allowed_pages', () => { mockAllowed = { data: null, error: { message: 'boom' } }; }],
    ['app_pages', () => { mockPages = { data: null, error: { message: 'boom' } }; }],
    ['team_members', () => { mockMember = { data: null, error: { message: 'boom' } }; }],
    ['the session', () => { mockSession = { data: { session: null }, error: null }; }],
  ])('fails closed when %s fails', async (_name, breakIt) => {
    breakIt();
    await mountProbe();
    expect(value('allowed')).toBe('');
    expect(value('first')).toBe('null');
    expect(value('error')).not.toBe('null');
  });

  test('retrying a failed first load stays closed until one succeeds', async () => {
    mockAllowed = { data: null, error: { message: 'boom' } };
    await mountProbe();

    await act(async () => { fireEvent.click(screen.getByText('refresh')); });
    expect(value('allowed')).toBe('');
    expect(value('error')).toBe('boom');
    expect(value('refresh-failed')).toBe('false');

    allow('cars');
    await act(async () => { fireEvent.click(screen.getByText('refresh')); });
    expect(value('allowed')).toBe('cars');
    expect(value('error')).toBe('null');
  });

  test('a failed refresh keeps the last good answer and raises no error', async () => {
    await mountProbe();
    mockAllowed = { data: null, error: { message: 'boom' } };

    await act(async () => { window.dispatchEvent(new Event('focus')); });

    expect(value('allowed')).toBe('cars,tasks');
    expect(value('first')).toBe('/dashboard/tasks');
    expect(value('error')).toBe('null');
    expect(value('refresh-failed')).toBe('true');
  });

  test.each([
    ['app_pages', () => { mockPages = { data: null, error: { message: 'boom' } }; }],
    ['team_members', () => { mockMember = { data: null, error: { message: 'boom' } }; }],
    ['the session', () => { mockSession = { data: { session: null }, error: null }; }],
  ])('a failed refresh of %s keeps access too', async (_name, breakIt) => {
    await mountProbe();
    breakIt();
    await act(async () => { fireEvent.click(screen.getByText('refresh')); });
    expect(value('allowed')).toBe('cars,tasks');
    expect(value('department')).toBe('Operations');
    expect(value('refresh-failed')).toBe('true');
  });

  test('retries at 1s, 3s, 10s, then every 60s', async () => {
    await mountProbe();
    jest.useFakeTimers('modern');
    mockAllowed = { data: null, error: { message: 'boom' } };

    const advance = async (ms: number) => {
      await act(async () => {
        jest.advanceTimersByTime(ms);
        for (let i = 0; i < 20; i += 1) await Promise.resolve();
      });
    };

    await act(async () => {
      window.dispatchEvent(new Event('focus'));
      for (let i = 0; i < 20; i += 1) await Promise.resolve();
    });
    const start = mockRpcCalls;

    for (const delay of [1000, 3000, 10000, 60000, 60000]) {
      const before = mockRpcCalls;
      await advance(delay - 1);
      expect(mockRpcCalls).toBe(before);
      await advance(1);
      expect(mockRpcCalls).toBe(before + 1);
    }
    expect(mockRpcCalls).toBe(start + 5);
    expect(value('allowed')).toBe('cars,tasks');

    // A success ends the retries and clears the flag.
    allow('tasks', 'cars');
    await advance(60000);
    expect(value('refresh-failed')).toBe('false');
    const settled = mockRpcCalls;
    await advance(60000);
    expect(mockRpcCalls).toBe(settled);
  });

  test('only a successful refresh changes access', async () => {
    await mountProbe();
    expect(value('allowed')).toBe('cars,tasks');

    allow('tasks');
    await act(async () => { window.dispatchEvent(new Event('focus')); });
    await waitFor(() => expect(value('allowed')).toBe('tasks'));
    expect(value('refresh-failed')).toBe('false');
  });
});

const CarsScreen = () => <div>cars screen</div>;
const TasksScreen = () => <div>tasks screen</div>;
const IdeasScreen = () => <div>ideas screen</div>;
const CalendarScreen = () => <div>content calendar screen</div>;

const mountRoutes = (entry: string) => render(
  <MemoryRouter initialEntries={[entry]}>
    <PageAccessProvider>
      <Routes>
        <Route path="/login" element={<div>login screen</div>} />
        <Route path="/dashboard">
          <Route index element={<RedirectToFirstPage />} />
          <Route path="cars" element={<RequirePage page="cars"><CarsScreen /></RequirePage>} />
          <Route path="tasks" element={<RequirePage page="tasks"><TasksScreen /></RequirePage>} />
          <Route path="accounting" element={<RequirePage page="accounting"><div>accounting screen</div></RequirePage>} />
          <Route path="media">
            <Route index element={<RedirectToFirstPage within="/dashboard/media/" />} />
            <Route path="ideas" element={<RequirePage page="media_ideas"><IdeasScreen /></RequirePage>} />
            <Route path="calendar" element={<RequirePage page="media_calendar"><CalendarScreen /></RequirePage>} />
          </Route>
          <Route path="*" element={<RedirectToFirstPage />} />
        </Route>
      </Routes>
    </PageAccessProvider>
  </MemoryRouter>,
);

describe('RequirePage', () => {
  test('opens an allowed page', async () => {
    mountRoutes('/dashboard/cars');
    expect(await screen.findByText('cars screen')).toBeInTheDocument();
  });

  test('never renders the page while access is still loading', () => {
    mountRoutes('/dashboard/cars');
    expect(screen.queryByText('cars screen')).toBeNull();
  });

  test('a page typed into the URL is refused, with a way out', async () => {
    mountRoutes('/dashboard/accounting');
    expect(await screen.findByText('No access to this page')).toBeInTheDocument();
    expect(screen.queryByText('accounting screen')).toBeNull();

    fireEvent.click(screen.getByText('Go to my dashboard'));
    expect(await screen.findByText('tasks screen')).toBeInTheDocument();
  });

  test('a failed refresh leaves the open page exactly where it is', async () => {
    mountRoutes('/dashboard/cars');
    expect(await screen.findByText('cars screen')).toBeInTheDocument();

    mockAllowed = { data: null, error: { message: 'boom' } };
    await act(async () => { window.dispatchEvent(new Event('focus')); });

    expect(screen.getByText('cars screen')).toBeInTheDocument();
    expect(screen.queryByText("Couldn't load your access")).toBeNull();
  });

  test('a successful refresh that removes the open page redirects to the first allowed page', async () => {
    mountRoutes('/dashboard/cars');
    expect(await screen.findByText('cars screen')).toBeInTheDocument();

    allow('tasks');
    await act(async () => { window.dispatchEvent(new Event('focus')); });

    expect(await screen.findByText('tasks screen')).toBeInTheDocument();
    expect(screen.queryByText('No access to this page')).toBeNull();
  });

  test('a refresh that removes every page shows the no-pages screen', async () => {
    mountRoutes('/dashboard/cars');
    expect(await screen.findByText('cars screen')).toBeInTheDocument();

    allow();
    await act(async () => { window.dispatchEvent(new Event('focus')); });

    expect(await screen.findByText('Your account has no pages assigned yet — contact your admin')).toBeInTheDocument();
  });

  test('an admin with no team_members row opens pages normally', async () => {
    mockMember = { data: null, error: null };
    allow('tasks', 'cars', 'accounting');
    mountRoutes('/dashboard/accounting');
    expect(await screen.findByText('accounting screen')).toBeInTheDocument();
  });

  test('a load failure shows Try again, and recovering opens the page', async () => {
    mockAllowed = { data: null, error: { message: 'boom' } };
    mountRoutes('/dashboard/cars');
    expect(await screen.findByText("Couldn't load your access")).toBeInTheDocument();
    expect(screen.queryByText('cars screen')).toBeNull();

    allow('cars');
    fireEvent.click(screen.getByText('Try again'));
    expect(await screen.findByText('cars screen')).toBeInTheDocument();
  });

  test('zero pages shows the contact-your-admin screen, with Sign out', async () => {
    allow();
    mountRoutes('/dashboard/cars');
    expect(await screen.findByText('Your account has no pages assigned yet — contact your admin')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Sign out'));
    await waitFor(() => expect(mockSignOut).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('login screen')).toBeInTheDocument();
  });
});

describe('redirects', () => {
  test('the index goes to the first allowed page, not to cars', async () => {
    allow('cars', 'accounting');
    const first = mountRoutes('/dashboard');
    expect(await screen.findByText('cars screen')).toBeInTheDocument();
    first.unmount();

    allow('tasks', 'cars');
    mountRoutes('/dashboard');
    expect(await screen.findByText('tasks screen')).toBeInTheDocument();
  });

  test('an unknown path falls back the same way', async () => {
    mountRoutes('/dashboard/does-not-exist');
    expect(await screen.findByText('tasks screen')).toBeInTheDocument();
  });

  test('the Media index goes to the Media page this user has', async () => {
    allow('tasks', 'media_calendar');
    mountRoutes('/dashboard/media');
    expect(await screen.findByText('content calendar screen')).toBeInTheDocument();
  });

  test('the Media index with no Media page goes to the first allowed page', async () => {
    mountRoutes('/dashboard/media');
    expect(await screen.findByText('tasks screen')).toBeInTheDocument();
  });

  test('zero pages at the index shows the screen rather than looping', async () => {
    allow();
    mountRoutes('/dashboard');
    expect(await screen.findByText('Your account has no pages assigned yet — contact your admin')).toBeInTheDocument();
  });
});

describe('the refresh banner wording', () => {
  test('exists in both languages', async () => {
    await i18n.changeLanguage('en');
    expect(i18n.t('common:pageAccess.refreshFailed')).toBe("Couldn't refresh permissions — retrying");
    expect(i18n.t('common:pageAccess.retry')).toBe('Retry');

    await i18n.changeLanguage('ar');
    expect(i18n.t('common:pageAccess.refreshFailed')).toMatch(/[؀-ۿ]/);
    expect(i18n.t('common:pageAccess.retry')).toMatch(/[؀-ۿ]/);
  });
});

describe('App.tsx', () => {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.tsx'), 'utf8');
  const routes = Array.from(app.matchAll(/<Route\b[\s\S]*?(?:\/>|>\n)/g)).map(m => m[0]);

  test('every dashboard page sits behind RequirePage, on the key its route has', () => {
    const expected: Record<string, string> = {
      cars: 'cars',
      'cars/tracking': 'car_tracking',
      'car-issues': 'car_issues',
      'model-groups': 'model_groups',
      kgm: 'kgm',
      bookings: 'bookings',
      fines: 'fines',
      operations: 'operations',
      'customer-wallets': 'customer_wallets',
      tasks: 'tasks',
      accounting: 'accounting',
      kabis: 'kabis',
      ideas: 'media_ideas',
      influencers: 'media_influencers',
    };
    for (const [routePath, key] of Object.entries(expected)) {
      const line = routes.find(r => r.includes(`path="${routePath}"`));
      expect(line).toContain(`<RequirePage page="${key}">`);
    }
    // Two routes share the path `calendar`, so they are matched by key instead.
    expect(app).toContain('<Route path="calendar" element={<RequirePage page="calendar">');
    expect(app).toContain('<Route path="calendar" element={<RequirePage page="media_calendar">');
  });

  test('no route renders a page without a guard', () => {
    const unguarded = routes
      .filter(r => /<(?!RedirectToFirstPage)\w+Page \/>/.test(r) && !r.includes('RequirePage') && !r.includes('LoginPage'));
    expect(unguarded).toEqual([]);
  });

  test('the old section guard is gone from the whole app', () => {
    const walk = (dir: string): string[] => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) return walk(full);
      return /\.tsx?$/.test(e.name) && !e.name.endsWith('.test.tsx') && !e.name.endsWith('.test.ts') ? [full] : [];
    });
    const banned = /staff_sections|restricted_sections|my_allowed_restricted_sections|can_view_accounting|SectionAccess|RequireSection/;
    const offenders = walk(path.join(__dirname, '..')).filter(f => banned.test(fs.readFileSync(f, 'utf8')));
    expect(offenders).toEqual([]);
  });
});
