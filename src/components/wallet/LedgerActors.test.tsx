import React from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import { DeletedLedgerEntries, LedgerActorsProvider, LedgerStamp } from './LedgerActors';
import { clearLedgerActorCache } from '../../lib/ledgerActors';

const mockRpc = jest.fn();
const mockAudit = jest.fn();
const mockFilters: Array<[string, unknown]> = [];

/** The audit table answers `mockAudit`; cars and bookings answer with fixed names. */
jest.mock('../../lib/supabase', () => {
  const names: Record<string, Array<Record<string, unknown>>> = {
    cars: [{ id: 4, plate_number: '34 ABC 12' }, { id: 7, plate_number: '34 XYZ 99' }],
    bookings: [{ id: 9, booking_number: 'HOM-09' }],
    cash_accounts: [],
  };
  const from = (table: string) => {
    const chain: Record<string, unknown> = {};
    ['select', 'order', 'in'].forEach((k) => { chain[k] = () => chain; });
    chain.eq = (column: string, value: unknown) => { mockFilters.push([column, value]); return chain; };
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(
      table === 'customer_ledger_audit' ? mockAudit() : { data: names[table] ?? [], error: null },
    ).then(resolve);
    return chain;
  };
  return { supabase: { rpc: (...args: unknown[]) => mockRpc(...args), from } };
});

const LINA = { id: 'u-lina', full_name: 'Lina Aydın', avatar_url: null, avatar_bg: 'mint', role: 'staff' };
const KEREM = { id: 'u-kerem', full_name: 'Kerem Şahin', avatar_url: 'https://cdn.example/kerem.jpg', avatar_bg: 'sky', role: 'admin' };

beforeEach(async () => {
  await act(async () => { await i18n.changeLanguage('en'); });
  clearLedgerActorCache();
  mockRpc.mockReset().mockResolvedValue({ data: [LINA, KEREM], error: null });
  mockAudit.mockReset();
  mockFilters.length = 0;
});

const renderRows = (enabled = true) => render(
  <I18nextProvider i18n={i18n}>
    <LedgerActorsProvider ids={['u-lina', 'u-kerem', null]} enabled={enabled}>
      <ul>
        <li><LedgerStamp ledgerId="l1" createdBy="u-lina" createdAt="2026-11-10T09:30:00Z" updatedBy="u-kerem" updatedAt="2026-11-11T15:05:00Z" /></li>
        <li><LedgerStamp ledgerId="l2" createdBy={null} createdAt="2026-11-09T08:00:00Z" updatedBy={null} updatedAt={null} /></li>
      </ul>
    </LedgerActorsProvider>
  </I18nextProvider>,
);

test('one call for everyone; creator, editor and the system each named', async () => {
  renderRows();
  const edited = await screen.findByRole('button', { name: /^Recorded by Lina Aydın · 10 Nov 2026.*Last edited by Kerem Şahin · 11 Nov 2026.*Show history$/ });
  expect(screen.getByRole('button', { name: 'Automatic entry (HGS, fines, system). Show history' })).toBeInTheDocument();
  expect(mockRpc).toHaveBeenCalledTimes(1);
  expect(mockRpc).toHaveBeenCalledWith('ledger_actor_cards', { p_ids: ['u-kerem', 'u-lina'] });
  expect(within(edited).getByText('LA')).toBeInTheDocument();
  expect(edited.querySelector('img')?.getAttribute('src')).toBe('https://cdn.example/kerem.jpg');
});

test('in Arabic, the same row reads سجّلها / آخر تعديل / النظام', async () => {
  await act(async () => { await i18n.changeLanguage('ar'); });
  renderRows();
  expect(await screen.findByRole('button', { name: /^سجّلها: Lina Aydın · .*آخر تعديل: Kerem Şahin · .*عرض السجل$/ })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^حركة تلقائية \(HGS، مخالفات، النظام\)/ })).toBeInTheDocument();
});

test('nothing for someone who is not finance, and no lookup', () => {
  renderRows(false);
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(mockRpc).not.toHaveBeenCalled();
});

test('history: newest first, only what changed, old → new, then who recorded it', async () => {
  mockAudit.mockReturnValue({
    data: [{
      id: 2, ledger_id: 'l1', action: 'update', changed_by: 'u-kerem', changed_at: '2026-11-11T15:05:00Z',
      old_row: { amount: 100, type: 'payment', direction: 'IN', description: 'Cash', car_id: 4, booking_id: 9, account_id: null },
      new_row: { amount: 150, type: 'payment', direction: 'IN', description: 'Cash', car_id: 7, booking_id: 9, account_id: null },
    }],
    error: null,
  });
  renderRows();
  fireEvent.click(await screen.findByRole('button', { name: /Last edited by Kerem/ }));
  const history = await screen.findByRole('dialog', { name: 'History' });
  await within(history).findByText('Edited');
  expect(mockFilters).toContainEqual(['ledger_id', 'l1']);
  expect(within(history).getByText('Amount')).toBeInTheDocument();
  expect(within(history).getByText('₺100')).toBeInTheDocument();
  expect(within(history).getByText('₺150')).toBeInTheDocument();
  expect(within(history).getByText('34 XYZ 99')).toBeInTheDocument();
  expect(within(history).queryByText('Description')).not.toBeInTheDocument();
  expect(within(history).getAllByText(/Kerem Şahin|Lina Aydın/).map((node) => node.textContent)).toEqual(['Kerem Şahin', 'Lina Aydın']);

  fireEvent.keyDown(window, { key: 'Escape' });
  await waitFor(() => expect(screen.queryByRole('dialog', { name: 'History' })).not.toBeInTheDocument());
});

test('deleted entries: the customer\'s removed lines, who removed them and when', async () => {
  mockAudit.mockReturnValue({
    data: [{
      id: 5, ledger_id: 'l9', action: 'delete', changed_by: 'u-lina', changed_at: '2026-11-12T10:00:00Z',
      old_row: { customer_id: 'c1', amount: 250, type: 'fine', direction: 'OUT', description: 'Speeding', booking_id: 9, created_by: null, created_at: '2026-11-01T10:00:00Z' },
      new_row: null,
    }],
    error: null,
  });
  render(<I18nextProvider i18n={i18n}><LedgerActorsProvider ids={[]} enabled><DeletedLedgerEntries customerId="c1" /></LedgerActorsProvider></I18nextProvider>);
  const toggle = screen.getByRole('button', { name: /Deleted entries/ });
  fireEvent.click(toggle);
  expect(toggle).toHaveAttribute('aria-pressed', 'true');
  expect(await screen.findByText('Speeding')).toBeInTheDocument();
  expect(mockFilters).toEqual(expect.arrayContaining([['action', 'delete'], ['old_row->>customer_id', 'c1']]));
  expect(screen.getByText(/Deleted by Lina Aydın/)).toBeInTheDocument();
  expect(screen.getByText('HOM-09')).toBeInTheDocument();
  expect(screen.getByText('Fine')).toBeInTheDocument();
});
