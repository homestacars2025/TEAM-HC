import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import type { WalletBookingRow, WalletLineRow } from '../../lib/bookingWallet';

const mockGetWallet = jest.fn();
const mockDelete = jest.fn();
const mockDeletedRefresh = jest.fn();
let mockFinance = true;

jest.mock('../../lib/supabase', () => ({ supabase: {} }));
jest.mock('../../lib/queries/bookingWallet', () => ({
  getCustomerWallet: (...args: unknown[]) => mockGetWallet(...args),
  deleteHgsBatch: (...args: unknown[]) => mockDelete(...args),
}));
jest.mock('../../contexts/PageAccessContext', () => ({
  usePageAccess: () => ({ canAccessPage: (key: string) => key === 'accounting' && mockFinance }),
}));
jest.mock('./LedgerActors', () => ({
  LedgerActorsProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  LedgerStamp: () => null,
  useLedgerActorsEnabled: () => false,
  DeletedLedgerEntries: ({ refreshKey }: { refreshKey?: number }) => { mockDeletedRefresh(refreshKey); return null; },
}));
// eslint-disable-next-line import/first
import CustomerWalletSheet from './CustomerWalletSheet';

const booking: WalletBookingRow = {
  id: 710, booking_number: 'HOM-09-26-037', customer_id: 'c1', car_id: 26, start_date: '2026-09-22', end_date: '2026-12-07',
  status: 'confirmed', is_currently_active: true, plate: '41AGZ890', model: 'Renault Clio',
};
let seq = 0;
const row = (o: Partial<WalletLineRow>): WalletLineRow => ({
  id: `l${++seq}`, booking_id: 710, customer_id: 'c1', car_id: 26, type: 'hgs', description: null, amount: 0, direction: 'OUT',
  exchange_rate_at_entry: null, created_at: '2026-11-09T16:32:07Z', ...o,
});
const rows = [
  row({ type: 'rental', amount: 9000, created_at: '2026-09-22T09:00:00Z', event_no: 1 }),
  row({ description: 'HGS to 31/09/2026', amount: 272, created_at: '2026-10-07T00:00:00Z', event_no: null }),
  row({ description: '02-10-2026 Çamlıca → Kurtköy', amount: 65, event_no: 3 }),
  row({ description: '05-10-2026 Çamlıca → Kurtköy', amount: 35, event_no: 3 }),
  row({ description: '03-11-2026 Çamlıca → Kurtköy', amount: 40, created_at: '2026-12-01T10:00:00Z', event_no: 4 }),
];

beforeEach(async () => {
  await act(async () => { await i18n.changeLanguage('en'); });
  mockFinance = true;
  mockGetWallet.mockReset().mockResolvedValue({ customer: { id: 'c1', first_name: 'Ali', last_name: 'Kaya' }, rows, bookings: [booking], replacements: [] });
  mockDelete.mockReset().mockResolvedValue({ deleted: 2, total: 100, releasedTransits: 2 });
  mockDeletedRefresh.mockReset();
});

const open = async (onChanged = jest.fn()) => {
  render(<I18nextProvider i18n={i18n}><CustomerWalletSheet customerId="c1" onClose={jest.fn()} onChanged={onChanged} /></I18nextProvider>);
  return screen.findByRole('article', { name: 'HOM-09-26-037' });
};

test('one HGS row per booking; open, each batch has its own header, and the lines without a batch no trash', async () => {
  const card = await open();
  const head = within(card).getByRole('button', { expanded: false });
  expect(head).toHaveTextContent('3 passes + 1 entry');
  fireEvent.click(head);
  const batches = within(card).getAllByRole('region');
  expect(batches).toHaveLength(3);
  expect(batches.map(batch => within(batch).queryAllByRole('button', { name: 'Delete this HGS batch' }).length)).toEqual([1, 1, 0]);
  expect(within(card).getAllByRole('button', { name: 'Delete all HGS of this booking' })).toHaveLength(1);
});

test('delete all: shows count, total and dates, sends null with the reason, then toasts and reads everything again', async () => {
  const onChanged = jest.fn();
  const card = await open(onChanged);
  mockDelete.mockResolvedValue({ deleted: 4, total: 412, releasedTransits: 3 });
  fireEvent.click(within(card).getByRole('button', { name: 'Delete all HGS of this booking' }));
  const ask = await screen.findByRole('alertdialog', { name: 'Delete all HGS entries of this booking?' });
  expect(ask).toHaveTextContent('Entries4');
  expect(ask).toHaveTextContent('Total₺412');
  expect(ask).toHaveTextContent('Datesfrom 02/10 to 03/11');
  fireEvent.change(within(ask).getByLabelText('Reason (optional)'), { target: { value: '  wrong booking ' } });
  const reads = mockGetWallet.mock.calls.length;
  const refreshes = mockDeletedRefresh.mock.calls.length;
  fireEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(710, null, '  wrong booking '));
  expect(await screen.findByText('4 HGS entries deleted · ₺412')).toBeInTheDocument();
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  await waitFor(() => expect(mockGetWallet.mock.calls.length).toBeGreaterThan(reads));
  expect(mockDeletedRefresh.mock.calls.length).toBeGreaterThan(refreshes);
  expect(onChanged).toHaveBeenCalled();
});

test('delete one batch sends its event number; Cancel and Esc send nothing', async () => {
  const card = await open();
  fireEvent.click(within(card).getByRole('button', { expanded: false }));
  const [newest, older] = within(card).getAllByRole('region');
  fireEvent.click(within(older).getByRole('button', { name: 'Delete this HGS batch' }));
  let ask = await screen.findByRole('alertdialog', { name: 'Delete this HGS batch?' });
  expect(ask).toHaveTextContent('Entries2');
  expect(ask).toHaveTextContent('Total₺100');
  fireEvent.click(within(ask).getByRole('button', { name: 'Cancel' }));
  fireEvent.click(within(newest).getByRole('button', { name: 'Delete this HGS batch' }));
  ask = await screen.findByRole('alertdialog');
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(mockDelete).not.toHaveBeenCalled();

  fireEvent.click(within(older).getByRole('button', { name: 'Delete this HGS batch' }));
  fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete' }));
  await waitFor(() => expect(mockDelete).toHaveBeenCalledWith(710, 3, ''));
});

test('a refused delete stays open and says why', async () => {
  mockDelete.mockRejectedValue(new Error('forbidden'));
  const card = await open();
  fireEvent.click(within(card).getByRole('button', { name: 'Delete all HGS of this booking' }));
  const ask = await screen.findByRole('alertdialog');
  fireEvent.click(within(ask).getByRole('button', { name: 'Delete' }));
  expect(await within(ask).findByRole('alert')).toHaveTextContent("Couldn't delete: forbidden");
});

test('no trash for anyone outside finance', async () => {
  mockFinance = false;
  const card = await open();
  fireEvent.click(within(card).getByRole('button', { expanded: false }));
  expect(within(card).queryByRole('button', { name: /Delete (all HGS|this HGS batch)/ })).not.toBeInTheDocument();
});

test('Arabic: the question and the toast read in Arabic', async () => {
  await act(async () => { await i18n.changeLanguage('ar'); });
  const card = await open();
  fireEvent.click(within(card).getByRole('button', { name: 'حذف كل HGS لهذا الحجز' }));
  const ask = await screen.findByRole('alertdialog', { name: 'حذف كل حركات HGS لهذا الحجز؟' });
  fireEvent.click(within(ask).getByRole('button', { name: 'حذف' }));
  expect(await screen.findByText('تم حذف حركتين · ₺100')).toBeInTheDocument();
});
