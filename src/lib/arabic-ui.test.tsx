import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import i18n from '../i18n';
import { LANG_STORAGE_KEY } from '../i18n';
import { FF_LANGUAGE_SWITCHER } from './featureFlags';

/**
 * Guards the Arabic surfaces that cannot be reached in a screenshot without
 * signing in: the restricted sidebar sections, and the Add Car dialog.
 */

// Granted every restricted section, which is what an admin sees.
jest.mock('./SectionAccessContext', () => ({
  useSectionAccess: () => ({
    loading: false,
    restricted: new Set(['kabis', 'accounting', 'media']),
    allowed: new Set(['kabis', 'accounting', 'media']),
    canAccess: () => true,
    refresh: async () => {},
  }),
  SectionAccessProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// The badge counts poll over the network; the labels under test do not need them.
jest.mock('./InboxContext', () => ({
  useInbox: () => ({ unreadCount: 0, openTasksCount: 3, refresh: async () => {} }),
  InboxProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// eslint-disable-next-line import/first
import Sidebar from '../components/Sidebar';
// eslint-disable-next-line import/first
import { CurrencyProvider } from './CurrencyContext';
// eslint-disable-next-line import/first
import { LanguageProvider } from './LanguageContext';

const mountSidebar = () => render(
  <MemoryRouter initialEntries={['/dashboard/cars']}>
    <LanguageProvider><CurrencyProvider><Sidebar /></CurrencyProvider></LanguageProvider>
  </MemoryRouter>,
);

beforeEach(async () => {
  localStorage.clear();
  localStorage.setItem(FF_LANGUAGE_SWITCHER, '1');
  localStorage.setItem(LANG_STORAGE_KEY, 'ar');
  await i18n.changeLanguage('ar');
});

afterAll(async () => { await i18n.changeLanguage('en'); });

describe('restricted sidebar sections in Arabic', () => {
  test('the sections a screenshot without a login could never show are translated', () => {
    mountSidebar();

    // The Media group heading and its three pages.
    expect(screen.getByText('الوسائط')).toBeInTheDocument();
    expect(screen.getByText('الأفكار')).toBeInTheDocument();
    expect(screen.getByText('المؤثرون')).toBeInTheDocument();
    expect(screen.getByText('المحاسبة')).toBeInTheDocument();

    // KABIS keeps its Latin name on purpose — staff look for that exact word.
    expect(screen.getByText('KABIS')).toBeInTheDocument();
  });

  test('no English label leaks through in Arabic', () => {
    mountSidebar();
    for (const leaked of ['Accounting', 'Ideas', 'Influencers', 'Media', 'Car Issues', 'Sign out']) {
      expect(screen.queryByText(leaked)).toBeNull();
    }
  });

  test('the two Calendar entries both resolve, and separately', () => {
    mountSidebar();
    // Same word today, distinct keys — so Arabic can diverge later.
    expect(screen.getAllByText('التقويم').length).toBe(2);
  });
});

describe('every key the Cars page asks for exists in both languages', () => {
  // Read off CarsPage: `t('...')` plus the two template forms it builds.
  const KEYS = [
    'eyebrow', 'title', 'subtitle', 'errorTitle',
    'alerts.label', 'alerts.upcomingReturns', 'alerts.insuranceExpiry', 'alerts.inspectionExpiry',
    'table.label', 'table.searchPlaceholder', 'table.openDocument',
    'table.noMatch', 'table.none', 'table.km',
    'columns.plateNumber', 'columns.model', 'columns.year', 'columns.currentKm',
    'columns.status', 'columns.insurance', 'columns.ruhsat', 'columns.kasko',
    'status.working', 'status.parking', 'status.maintenance', 'status.selling', 'status.replacement',
    'cards.all.label', 'cards.all.description',
    'cards.working.label', 'cards.working.description',
    'cards.parking.label', 'cards.parking.description',
    'cards.maintenance.label', 'cards.maintenance.description',
    'cards.selling.label', 'cards.selling.description',
    'cards.replacement.label', 'cards.replacement.description',
    // The dialog has no trigger in the UI yet, so nothing else would catch these.
    'modal.title', 'modal.subtitle', 'modal.modelGroup', 'modal.selectModelGroup',
    'modal.plateNumber', 'modal.platePlaceholder', 'modal.investor', 'modal.selectInvestor',
    'modal.loading', 'modal.cancel', 'modal.creating', 'modal.create',
    'modal.errors.modelGroup', 'modal.errors.plate', 'modal.errors.investor',
  ];

  test.each(['en', 'ar'])('%s has every Cars key', async (lng) => {
    await i18n.changeLanguage(lng);
    const missing = KEYS.filter(k => !i18n.exists(`cars:${k}`));
    expect(missing).toEqual([]);
  });

  test('Arabic is actually Arabic, not an English fallback', async () => {
    await i18n.changeLanguage('ar');
    const arabic = /[؀-ۿ]/;
    // The plate placeholder is a Latin plate format on purpose, so it is exempt.
    const translated = KEYS.filter(k => k !== 'modal.platePlaceholder');
    const untranslated = translated.filter(k => !arabic.test(i18n.t(`cars:${k}`) as string));
    expect(untranslated).toEqual([]);
  });
});
