import React from 'react';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import NotificationToasts from '../../components/NotificationToasts';
import NotificationRow from '../../components/NotificationRow';
import type { MyNotification } from '../types/tasks';
import { expiryNotice, expiryVars } from './compliance';

let mockArrival: MyNotification | null = null;

jest.mock('../InboxContext', () => ({
  useInbox: () => ({ arrival: mockArrival, refresh: jest.fn() }),
}));

jest.mock('../../contexts/PageAccessContext', () => ({
  usePageAccess: () => ({
    pages: [{ key: 'cars', route: '/dashboard/cars' }],
    canAccessPage: () => true,
    canAccessRoute: () => true,
    firstAllowedRoute: '/dashboard/home',
  }),
}));

jest.mock('../queries/tasks', () => ({ markNotificationRead: jest.fn() }));

const notification = (over: Partial<MyNotification> = {}, vars: Record<string, unknown> = {}): MyNotification => ({
  id: 'n1',
  category: 'reminder',
  event_key: 'compliance.insurance.expiring',
  i18n_key: 'compliance.insurance.expiring',
  body_i18n_key: null,
  vars: { plate: '34ABC123', model: 'Fiat Egea', days_left: 3, expiry: '2026-11-04', ...vars },
  title: 'stored title',
  body: 'stored body',
  link: '/cars',
  entity_type: 'car',
  entity_id: '7',
  is_read: false,
  created_at: '2026-11-01T06:00:00Z',
  ...over,
});

const withApp = (ui: React.ReactElement) => render(
  <I18nextProvider i18n={i18n}><MemoryRouter>{ui}</MemoryRouter></I18nextProvider>,
);

describe('expiry notices', () => {
  test('reads both kinds, and only these events', () => {
    expect(expiryNotice(notification())).toEqual({ field: 'insurance', daysLeft: 3, urgent: false });
    expect(expiryNotice(notification({ event_key: 'compliance.inspection.expiring' }, { days_left: 1 }))).toEqual({ field: 'inspection', daysLeft: 1, urgent: true });
    expect(expiryNotice(notification({ event_key: 'task.assigned' }))).toBeNull();
  });

  test('0 is a real value, a missing one is not', () => {
    expect(expiryNotice(notification({}, { days_left: 0 }))?.urgent).toBe(true);
    expect(expiryNotice(notification({}, { days_left: null }))).toBeNull();
  });

  test('tidies what is shown, and leaves a bad date alone', () => {
    expect(expiryVars({ model: 'Chery  Tiggo', expiry: '2026-11-04' }, 'en-GB')).toEqual({ model: 'Chery Tiggo', expiry: '4 Nov 2026' });
    expect(expiryVars({ expiry: 'soon' }, 'en-GB')?.expiry).toBe('soon');
  });
});

describe.each([
  ['ar', 'insurance', 3, 'التأمين ينتهي بعد 3 أيام — 34ABC123', 'triangle-amber'],
  ['ar', 'insurance', 1, 'التأمين ينتهي بكرة — 34ABC123', 'triangle-red'],
  ['ar', 'insurance', 0, 'التأمين ينتهي اليوم — 34ABC123', 'triangle-red'],
  ['ar', 'inspection', 3, 'الفحص الدوري ينتهي بعد 3 أيام — 34ABC123', 'triangle-amber'],
  ['ar', 'inspection', 1, 'الفحص الدوري ينتهي بكرة — 34ABC123', 'triangle-red'],
  ['ar', 'inspection', 0, 'الفحص الدوري ينتهي اليوم — 34ABC123', 'triangle-red'],
  ['en', 'insurance', 3, 'Insurance expires in 3 days — 34ABC123', 'triangle-amber'],
  ['en', 'insurance', 1, 'Insurance expires tomorrow — 34ABC123', 'triangle-red'],
  ['en', 'inspection', 0, 'Periodic inspection expires today — 34ABC123', 'triangle-red'],
])('%s %s, %i days left', (lang, field, days, title, art) => {
  const item = notification({ event_key: `compliance.${field}.expiring`, i18n_key: `compliance.${field}.expiring` }, { days_left: days });

  beforeEach(() => i18n.changeLanguage(lang));

  test('in the bell', () => {
    const { container } = withApp(<NotificationRow notification={item} onOpen={jest.fn()} />);
    expect(screen.getByText(title)).toBeTruthy();
    expect(container.querySelector('img')?.getAttribute('src')).toContain(art);
  });

  test('in a live toast', () => {
    mockArrival = item;
    withApp(<NotificationToasts />);
    expect(screen.getByText(title)).toBeTruthy();
    expect(document.querySelector('[role=status] img')?.getAttribute('src')).toContain(art);
    mockArrival = null;
  });
});

describe('falling back', () => {
  beforeEach(() => i18n.changeLanguage('en'));

  test('no model: the line still reads, in the reader\'s language', () => {
    withApp(<NotificationRow notification={notification({}, { model: null })} onOpen={jest.fn()} />);
    expect(screen.getByText('Expires 4 Nov 2026')).toBeTruthy();
  });

  test('a day with no wording uses the stored sentence', () => {
    withApp(<NotificationRow notification={notification({}, { days_left: 7 })} onOpen={jest.fn()} />);
    expect(screen.getByText('stored title')).toBeTruthy();
  });

  test('other notifications keep their own icon', () => {
    const { container } = withApp(<NotificationRow notification={notification({ event_key: 'task.assigned', i18n_key: null })} onOpen={jest.fn()} />);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('stored title')).toBeTruthy();
  });
});
