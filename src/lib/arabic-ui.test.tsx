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

// Every page granted, which is what an admin sees.
jest.mock('../contexts/PageAccessContext', () => {
  const page = (key: string, route: string, group_key: string, sort_order: number) =>
    ({ key, route, group_key, sort_order, label_en: key, label_ar: key });
  const pages = [
    page('tasks', '/dashboard/tasks', 'main', 1),
    page('bookings', '/dashboard/bookings', 'main', 2),
    page('calendar', '/dashboard/calendar', 'main', 3),
    page('cars', '/dashboard/cars', 'fleet', 10),
    page('car_tracking', '/dashboard/cars/tracking', 'fleet', 11),
    page('car_issues', '/dashboard/car-issues', 'fleet', 12),
    page('model_groups', '/dashboard/model-groups', 'fleet', 13),
    page('operations', '/dashboard/operations', 'operations', 20),
    page('kgm', '/dashboard/kgm', 'operations', 21),
    page('fines', '/dashboard/fines', 'operations', 22),
    page('kabis', '/dashboard/kabis', 'operations', 23),
    page('accounting', '/dashboard/accounting', 'finance', 30),
    page('customer_wallets', '/dashboard/customer-wallets', 'finance', 31),
    page('media_ideas', '/dashboard/media/ideas', 'media', 40),
    page('media_calendar', '/dashboard/media/calendar', 'media', 41),
    page('media_influencers', '/dashboard/media/influencers', 'media', 42),
  ];
  return {
    usePageAccess: () => ({
      pages,
      allowedPages: new Set(pages.map(p => p.key)),
      canAccessPage: () => true,
      canAccessRoute: () => true,
      firstAllowedRoute: pages[0].route,
      department: { key: 'operations', label: 'العمليات' },
      isDepartmentHead: true,
      loading: false,
      error: null,
      refresh: async () => {},
    }),
  };
});

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
    expect(screen.getByText('المالية')).toBeInTheDocument();
    expect(screen.getByText('الأفكار')).toBeInTheDocument();
    expect(screen.getByText('المؤثرون')).toBeInTheDocument();
    expect(screen.getByText('المحاسبة')).toBeInTheDocument();

    // KABIS keeps its Latin name on purpose — staff look for that exact word.
    expect(screen.getByText('KABIS')).toBeInTheDocument();
  });

  test('no English label leaks through in Arabic', () => {
    mountSidebar();
    for (const leaked of ['Accounting', 'Ideas', 'Influencers', 'Media', 'Finance', 'Car Issues', 'Sign out']) {
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

describe('every key the Car Issues page asks for exists in both languages', () => {
  const KEYS = [
    'eyebrow', 'title', 'subtitle', 'logIssue', 'loading', 'card.resolvedIn',
    'tiles.all', 'tiles.open', 'tiles.resolvedMonth', 'tiles.accidents', 'tiles.average',
    'layout.board', 'layout.list', 'add.typeSection', 'add.descriptionHelp', 'detail.before', 'detail.after',
    'types.damage', 'types.accident', 'types.sound',
    'types.mechanical', 'types.maintenance', 'types.other',
    'status.open', 'status.resolved',
    'filters.search', 'filters.allStatuses', 'filters.allTypes',
    'empty.noneTitle', 'empty.noneBody', 'empty.filteredTitle', 'empty.filteredBody',
    'add.title', 'add.subtitle', 'add.discoveredOn', 'add.descriptionPlaceholder',
    'add.bookingOptional', 'add.damagePhotos', 'add.addPhotos', 'add.noBookings',
    'add.noBookingLinked', 'add.unknownCustomer', 'add.saving', 'add.loadingCars',
    'add.selectCar', 'add.selectCarFirst', 'add.loadingBookings',
    'detail.title', 'detail.noDescription', 'detail.discovered', 'detail.loggedBy',
    'detail.resolved', 'detail.noDamagePhotos', 'detail.noRepairPhotos',
    'detail.addRepairPhotos', 'detail.uploading', 'detail.uploadPhotos',
    'detail.updating', 'detail.markResolved', 'detail.reopen', 'detail.confirmDelete',
    'detail.deleting', 'detail.yesDelete', 'detail.damagePhotosCount',
    'detail.repairPhotosCount', 'detail.photosPartial',
    'errors.selectCar', 'errors.description', 'errors.discovered',
    'errors.emptyDescription', 'errors.photoUpload',
    'toast.logged', 'toast.resolved', 'toast.reopened', 'toast.updated',
    'toast.photosAdded', 'toast.deleted',
  ];
  const SHARED = [
    'fields.car', 'fields.customer', 'fields.booking', 'fields.description',
    'fields.type', 'actions.cancel', 'actions.edit', 'actions.delete',
    'actions.tryAgain', 'actions.saveChanges', 'actions.close',
  ];

  test.each(['en', 'ar'])('%s has every Car Issues key', async (lng) => {
    await i18n.changeLanguage(lng);
    expect(KEYS.filter(k => !i18n.exists(`carIssues:${k}`))).toEqual([]);
    expect(SHARED.filter(k => !i18n.exists(`common:${k}`))).toEqual([]);
    // `showing` only exists behind plural suffixes, so it needs a count to
    // resolve — checked at 1 and at 10, which take different forms in English.
    expect(i18n.exists('carIssues:showing', { count: 1 })).toBe(true);
    expect(i18n.exists('carIssues:showing', { count: 10 })).toBe(true);
  });

  test('Arabic is actually Arabic', async () => {
    await i18n.changeLanguage('ar');
    const arabic = /[؀-ۿ]/;
    expect(KEYS.filter(k => !arabic.test(i18n.t(`carIssues:${k}`) as string))).toEqual([]);
    expect(SHARED.filter(k => !arabic.test(i18n.t(`common:${k}`) as string))).toEqual([]);
    expect(i18n.t('carIssues:showing', { shown: 3, count: 10 })).toMatch(arabic);
  });

  test('the vocabulary matches what the notifications already say', async () => {
    await i18n.changeLanguage('ar');
    // A task card says "السيارة {{plate}}"; the page must not call it anything else.
    expect(i18n.t('common:fields.car')).toBe('السيارة');
    expect(i18n.t('carIssues:title')).toBe(i18n.t('sidebar:nav.carIssues'));
  });
});

describe('every key the Accounting page asks for exists in both languages', () => {
  // Read off AccountingPage: every `t('...')`, plus the three template forms it builds.
  const KEYS = [
    'title', 'subtitle', 'loading',
    'tabs.cars', 'tabs.expenses', 'tabs.customers', 'month.previous', 'month.next',
    'direction.IN', 'direction.OUT',
    'table.direction', 'table.category', 'table.note', 'table.receipt', 'table.amount', 'table.actions',
    'summary.totalIn', 'summary.totalOut', 'summary.net', 'summary.balance', 'summary.in', 'summary.out',
    'form.selectCar', 'form.employee', 'form.selectEmployee', 'form.noteOptional', 'form.notePlaceholder',
    'form.descriptionOptional', 'form.descriptionPlaceholder', 'form.uploadingReceipt',
    'form.saveTransaction', 'form.saveExpense', 'form.saveEntry',
    'cars.search', 'cars.noCars', 'cars.selectCar', 'cars.pickCar', 'cars.addTransaction',
    'cars.runningTotal', 'cars.noCarSelected', 'cars.noTransactions',
    'cars.addTitle', 'cars.editTitle', 'cars.deleteTitle', 'cars.deleteMessage',
    'expenses.company', 'expenses.wallets', 'expenses.addExpense', 'expenses.empty',
    'expenses.addTitle', 'expenses.editTitle', 'expenses.deleteTitle', 'expenses.deleteMessage',
    'wallets.addEntry', 'wallets.empty', 'wallets.unknown', 'wallets.employee', 'wallets.history',
    'wallets.noTransactions', 'wallets.receipt', 'wallets.addTitle', 'wallets.editTitle',
    'wallets.deleteTitle', 'wallets.deleteMessage',
    'customers.movedTitle', 'customers.movedBody', 'customers.open',
    'receipt.optional', 'receipt.upload', 'receipt.attach', 'receipt.unsupported', 'receipt.tooLarge',
    'receipt.pendingUpload', 'receipt.replace', 'receipt.current', 'receipt.viewPdf', 'receipt.viewImage',
    'receipt.view', 'receipt.viewReceipt', 'receipt.openInNewTab', 'receipt.alt', 'receipt.previewAlt',
    'confirm.confirm', 'confirm.deleting',
    'toast.txnAdded', 'toast.txnUpdated', 'toast.txnDeleted',
    'toast.txnSaveError', 'toast.txnUpdateError', 'toast.txnDeleteError',
    'toast.receiptSavedWarning', 'toast.receiptUpdatedWarning',
    'toast.expenseAdded', 'toast.expenseUpdated', 'toast.expenseDeleted',
    'toast.expenseSaveError', 'toast.expenseUpdateError', 'toast.expenseDeleteError',
    'toast.walletAdded', 'toast.walletUpdated', 'toast.walletDeleted',
    'toast.walletSaveError', 'toast.walletUpdateError', 'toast.walletDeleteError',
  ];
  const SHARED = [
    'fields.car', 'fields.date', 'fields.description',
    'actions.cancel', 'actions.close', 'actions.edit', 'actions.delete',
    'actions.remove', 'actions.saving', 'actions.saveChanges',
  ];

  /**
   * The wording the owner signed off on, keyed by the value the database stores.
   * Pinned so a later edit cannot quietly call the same thing two names.
   */
  const CATEGORIES: Record<string, [key: string, arabic: string]> = {
    'Rent Collection': ['rentCollection', 'تحصيل إيجار'],
    Wash: ['wash', 'غسيل'],
    Oil: ['oil', 'زيت'],
    Petrol: ['petrol', 'وقود'],
    HGS: ['hgs', 'رسوم HGS'],
    Maintenance: ['maintenance', 'صيانة'],
    'Deposit from Manager': ['depositFromManager', 'إيداع من المدير'],
    Refund: ['refund', 'استرجاع'],
    Marketing: ['marketing', 'تسويق'],
    Operations: ['operations', 'عمليات'],
    Branch: ['branch', 'الفرع'],
    Food: ['food', 'طعام'],
    'Custody from Manager': ['custodyFromManager', 'عهدة من المدير'],
    GPS: ['gps', 'GPS'],
    Other: ['other', 'أخرى'],
  };

  test.each(['en', 'ar'])('%s has every Accounting key', async (lng) => {
    await i18n.changeLanguage(lng);
    const categoryKeys = Object.values(CATEGORIES).map(([k]) => `categories.${k}`);
    expect([...KEYS, ...categoryKeys].filter(k => !i18n.exists(`accounting:${k}`))).toEqual([]);
    expect(SHARED.filter(k => !i18n.exists(`common:${k}`))).toEqual([]);
  });

  test('Arabic is actually Arabic', async () => {
    await i18n.changeLanguage('ar');
    const arabic = /[؀-ۿ]/;
    expect(KEYS.filter(k => !arabic.test(i18n.t(`accounting:${k}`) as string))).toEqual([]);
    expect(SHARED.filter(k => !arabic.test(i18n.t(`common:${k}`) as string))).toEqual([]);
  });

  test('categories keep their English stored value and show the agreed Arabic', async () => {
    await i18n.changeLanguage('en');
    for (const [stored, [key]] of Object.entries(CATEGORIES)) {
      expect(i18n.t(`accounting:categories.${key}`)).toBe(stored);
    }
    await i18n.changeLanguage('ar');
    for (const [key, arabic] of Object.values(CATEGORIES)) {
      expect(i18n.t(`accounting:categories.${key}`)).toBe(arabic);
    }
  });

  test('the vocabulary matches Customer Wallets', async () => {
    await i18n.changeLanguage('ar');
    expect(i18n.t('accounting:title')).toBe(i18n.t('sidebar:nav.accounting'));
    expect(i18n.t('accounting:direction.IN')).toBe(i18n.t('wallets:direction.IN'));
    expect(i18n.t('accounting:direction.OUT')).toBe(i18n.t('wallets:direction.OUT'));
    expect(i18n.t('accounting:categories.refund')).toBe(i18n.t('wallets:types.refund'));
    expect(i18n.t('accounting:categories.hgs')).toBe(i18n.t('wallets:types.hgs'));
    expect(i18n.t('accounting:summary.balance')).toBe(i18n.t('wallets:table.balance'));
    expect(i18n.t('accounting:toast.txnAdded')).toBe(i18n.t('wallets:toast.added'));
    // Wash and Cleaning are different services and stay different words.
    expect(i18n.t('accounting:categories.wash')).not.toBe(i18n.t('wallets:types.cleaning'));
  });

  test('the staff Accounting page names no investor and no commission, in either language', () => {
    // Privacy rule for this page: those belong to the admin project only.
    const en = JSON.stringify(require('../locales/en/accounting.json'));
    const ar = JSON.stringify(require('../locales/ar/accounting.json'));
    expect(en).not.toMatch(/investor|commission/i);
    expect(ar).not.toMatch(/مستثمر|عمول/);
  });
});
