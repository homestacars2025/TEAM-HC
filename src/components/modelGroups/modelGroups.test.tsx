import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18n from '../../i18n';
import { ModelGroupCard } from './ModelGroupCard';
import { ModelGroupSheet } from './ModelGroupSheet';
import type { ModelGroupAccess, ModelGroupRow, ModelGroupStats } from '../../lib/modelGroups';

const mockWrites: Array<{ table: string; kind: string; payload: unknown }> = [];
jest.mock('../../lib/supabase', () => {
  const chain = (table: string, kind: string, payload: unknown) => {
    mockWrites.push({ table, kind, payload });
    const query: Record<string, unknown> = {};
    query.eq = () => query;
    query.select = () => query;
    query.single = async () => ({ data: { id: 7 }, error: null });
    return query;
  };
  return {
    supabase: {
      from: (table: string) => ({
        update: (payload: unknown) => chain(table, 'update', payload),
        insert: (payload: unknown) => chain(table, 'insert', payload),
      }),
      storage: { from: () => ({ upload: async () => ({ error: null }), getPublicUrl: () => ({ data: { publicUrl: 'u' } }) }) },
    },
  };
});

const group: ModelGroupRow = {
  id: 7, name: 'Renault Clio', brand: 'Renault', model: 'Clio', category: 'Economy', transmission: 'Manual', fuel: 'Petrol',
  seats: 5, luggage: 2, daily_km: 300, monthly_km: null, deposit: 8000, min_age: 21, price: 40, image_url: null,
};
const stats: ModelGroupStats = { model_group_id: 7, cars_total: 4, cars_active: 4, rented_now: 3, utilization: 72, bookings_month: 9, avg_daily_rate: 1500 };
const STAFF: ModelGroupAccess = { canEditSpecs: true, canEditAll: false, canCreate: false, canSeeRealRate: false };
const ADMIN: ModelGroupAccess = { canEditSpecs: true, canEditAll: true, canCreate: true, canSeeRealRate: true };

const wrap = (node: React.ReactNode) => <I18nextProvider i18n={i18n}>{node}</I18nextProvider>;
const card = (showRealRate: boolean, onEdit: (() => void) | null = () => {}) => (
  <ModelGroupCard group={group} stats={stats} statsReady tiers={[]} usdRate={34.5} monthLabel="November 2026" showRealRate={showRealRate} onEdit={onEdit} onViewCars={() => {}} />
);

beforeEach(async () => {
  mockWrites.length = 0;
  await i18n.changeLanguage('en');
});

describe('the card', () => {
  test('shows the price in lira, the specs and the month', () => {
    render(wrap(card(true)));
    expect(screen.getByText('₺1.380')).toBeInTheDocument();
    expect(screen.getByText('Manual')).toBeInTheDocument();
    expect(screen.getByText('5 seats')).toBeInTheDocument();
    expect(screen.getByText('2 bags')).toBeInTheDocument();
    expect(screen.getByText('3 / 4')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Utilization 72%' })).toBeInTheDocument();
    expect(screen.getByText('Avg real rate')).toBeInTheDocument();
  });

  test('hides the real daily rate from staff without Accounting', () => {
    render(wrap(card(false)));
    expect(screen.queryByText('Avg real rate')).not.toBeInTheDocument();
    expect(screen.queryByText('₺1.500')).not.toBeInTheDocument();
  });

  test('has no Edit button for someone who may not edit', () => {
    render(wrap(card(false, null)));
    expect(screen.queryByRole('button', { name: /Edit/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /View cars/ })).toBeInTheDocument();
  });

  test('reads in Arabic', async () => {
    await i18n.changeLanguage('ar');
    render(wrap(card(false)));
    expect(screen.getByText('اقتصادية')).toBeInTheDocument();
    expect(screen.getByText('عادي')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /عرض السيارات/ })).toBeInTheDocument();
  });
});

describe('the edit drawer', () => {
  test('staff see prices and rules locked, and saving sends only the spec they changed', async () => {
    const onSaved = jest.fn();
    render(wrap(<ModelGroupSheet group={group} tiers={[]} usdRate={34.5} access={STAFF} onClose={() => {}} onSaved={onSaved} />));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).queryByLabelText('Base daily price (USD)')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Deposit (₺)')).not.toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: /Add tier/ })).not.toBeInTheDocument();
    expect(within(dialog).getByText(/Prices, the deposit and the rules are set by an admin/)).toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText('Seats'), { target: { value: '7' } });
    expect(within(dialog).getByText('1 unsaved change')).toBeInTheDocument();
    await act(async () => { fireEvent.click(within(dialog).getByRole('button', { name: 'Save' })); });

    expect(mockWrites).toEqual([{ table: 'model_group', kind: 'update', payload: { seats: 7 } }]);
    expect(onSaved).toHaveBeenCalledWith('Changes saved');
  });

  test('an admin can edit the price and the deposit', () => {
    render(wrap(<ModelGroupSheet group={group} tiers={[]} usdRate={34.5} access={ADMIN} onClose={() => {}} onSaved={() => {}} />));
    expect(screen.getByLabelText('Base daily price (USD)')).toHaveValue('40');
    expect(screen.getByLabelText('Deposit (₺)')).toHaveValue('8000');
    expect(screen.getByRole('button', { name: /Add tier/ })).toBeInTheDocument();
  });

  test('closing with unsaved changes asks first', () => {
    const onClose = jest.fn();
    render(wrap(<ModelGroupSheet group={group} tiers={[]} usdRate={34.5} access={STAFF} onClose={onClose} onSaved={() => {}} />));
    fireEvent.change(screen.getByLabelText('Luggage (bags)'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole('alertdialog')).toHaveTextContent('Discard your changes?');
  });
});
