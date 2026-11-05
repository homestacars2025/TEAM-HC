import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import { usePageAccess } from '../../contexts/PageAccessContext';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { useStaffProfiles } from '../../hooks/useStaffProfiles';
import { formatTRY, useCurrency } from '../../lib/CurrencyContext';
import { customerBalances, getLedgerRows, ledgerTotals, type LedgerRow } from '../../lib/customerLedger';
import { fetchCurrentUsdRate } from '../../lib/exchangeRate';
import { reviewStats, type ReviewExpense } from '../../lib/expenseReview';
import { istanbulDate } from '../../lib/istanbulTime';
import { getCustodyMovements, getSignatures, getWalletBalances, type Signatures } from '../../lib/queries/expenseReview';
import { getMonthCompanyExpenses, getMonthSheetExpenses, getUnpaidFines } from '../../lib/queries/financeHome';
import { getSupplierBalances } from '../../lib/queries/suppliers';
import { formatMoney, owedByCurrency, type SupplierBalance } from '../../lib/suppliers';
import PlateChip from '../booking/PlateChip';
import { ComplianceTriangle } from '../cars/Compliance';
import StaffAvatar from '../StaffAvatar';
import { StatTile } from '../WalletParts';

const ACCOUNTING = '/dashboard/accounting';

/** A source that fails leaves its own tile empty rather than blanking the page. */
const settle = <T,>(work: Promise<T>): Promise<T | null> => work.catch(() => null);

interface HomeData {
  movements: ReviewExpense[] | null;
  signatures: Signatures | null;
  balances: Map<string, number> | null;
  ledger: LedgerRow[] | null;
  fines: { count: number; total: number } | null;
  suppliers: SupplierBalance[] | null;
  sheetExpenses: number | null;
  companyExpenses: number | null;
}

const FinanceHome: React.FC<{ userId: string | null }> = ({ userId }) => {
  const { t } = useTranslation('finance');
  const locale = useDateLocale();
  const navigate = useNavigate();
  const { canAccessPage } = usePageAccess();
  const { currency, rates, fmt } = useCurrency();
  const staff = useStaffProfiles();
  const [data, setData] = useState<HomeData | null>(null);
  const [usdRate, setUsdRate] = useState<number | null>(null);
  const month = useMemo(() => istanbulDate().slice(0, 7), []);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      settle(getCustodyMovements()), settle(getSignatures()), settle(getWalletBalances()), settle(getLedgerRows()), settle(getUnpaidFines()),
      settle(getSupplierBalances()), settle(getMonthSheetExpenses(month)), settle(getMonthCompanyExpenses(month)),
    ]).then(([movements, signatures, balances, ledger, fines, suppliers, sheetExpenses, companyExpenses]) => {
      if (!cancelled) setData({ movements, signatures, balances, ledger, fines, suppliers, sheetExpenses, companyExpenses });
    });
    fetchCurrentUsdRate().then(rate => { if (!cancelled) setUsdRate(rate); });
    return () => { cancelled = true; };
  }, [month]);

  const custody = useMemo(() => {
    if (!data?.movements) return null;
    const signed = new Set<number>();
    data.signatures?.forEach((marks, id) => { if (userId && marks.has(userId)) signed.add(id); });
    return reviewStats(data.movements, { month, signed });
  }, [data, month, userId]);

  const customers = useMemo(() => (data?.ledger ? ledgerTotals(customerBalances(data.ledger, currency, rates, usdRate)) : null), [data, currency, rates, usdRate]);
  const held = data?.balances ? Array.from(data.balances.values()).reduce((sum, value) => sum + value, 0) : null;
  const owedSuppliers = data?.suppliers ? owedByCurrency(data.suppliers) : null;
  const supplierCount = data?.suppliers ? new Set(data.suppliers.filter(row => row.balance > 0).map(row => row.supplier_id)).size : 0;
  const pending = useMemo(
    () => (data?.movements ?? []).filter(row => row.direction === 'OUT' && row.review_status === 'pending').slice(0, 5),
    [data],
  );

  const go = (path: string) => () => navigate(path);
  const ready = !!data;
  const sum = (total: number | null | undefined, format: (n: number) => string) => (total === null || total === undefined ? null : format(total));
  const count = (key: string, n: number | undefined) => (ready && n !== undefined ? t(key, { count: n }) : '');

  const actions = [
    { to: `${ACCOUNTING}?tab=custody&filter=pending`, label: t('home.actions.review') },
    { to: `${ACCOUNTING}?tab=custody`, label: t('home.actions.custody') },
    { to: `${ACCOUNTING}?tab=company`, label: t('home.actions.company') },
    { to: `${ACCOUNTING}?tab=car_sheets`, label: t('home.actions.sheets') },
    { to: `${ACCOUNTING}?tab=suppliers`, label: t('home.actions.suppliers') },
  ];

  return (
    <div className="hc-fin">
      <div className="hc-fin-top">
        <div className="hc-tiles hc-tiles-filter hc-fin-tiles">
          <StatTile tone="warn" label={t('home.tiles.pending')} value={sum(custody?.pending.total, formatTRY)} sub={count('review.tiles.expenses', custody?.pending.count)} onPress={go(`${ACCOUNTING}?tab=custody&filter=pending`)} art={<ComplianceTriangle severity="missing" size={40} className="hc-tile-art" />} />
          <StatTile tone="balance" label={t('home.tiles.unsigned')} value={custody ? String(custody.unsigned.count) : null} sub={custody ? formatTRY(custody.unsigned.total) : ''} onPress={go(`${ACCOUNTING}?tab=custody&filter=unsigned`)} />
          <StatTile tone="total" label={t('home.tiles.held')} value={sum(held, n => `${n < 0 ? '−' : ''}${formatTRY(n)}`)} sub={t('home.tiles.heldSub')} onPress={go(`${ACCOUNTING}?tab=custody`)} />
          <StatTile tone="negative" label={t('home.tiles.owed')} value={sum(customers?.owed, fmt)} sub={count('home.customers', customers?.debtors.length)} onPress={go(`${ACCOUNTING}?tab=customers&filter=owes`)} />
          <StatTile tone="received" label={t('home.tiles.credit')} value={sum(customers?.credit, fmt)} sub={count('home.customers', customers?.inCredit)} onPress={go(`${ACCOUNTING}?tab=customers&filter=credit`)} />
          <StatTile tone="spent" label={t('home.tiles.fines')} value={sum(data?.fines?.total, fmt)} sub={count('home.fines', data?.fines?.count)} onPress={canAccessPage('fines') ? go('/dashboard/fines?filter=unpaid') : undefined} />
          <StatTile tone="warn" label={t('home.tiles.suppliers')} value={ready && owedSuppliers ? (owedSuppliers[0] ? formatMoney(owedSuppliers[0].total, owedSuppliers[0].currency) : formatMoney(0, 'TRY')) : null} sub={owedSuppliers && owedSuppliers.length > 1 ? owedSuppliers.slice(1).map(row => formatMoney(row.total, row.currency)).join(' · ') : count('home.suppliers', data?.suppliers ? supplierCount : undefined)} onPress={go(`${ACCOUNTING}?tab=suppliers&filter=owed`)} />
          <StatTile tone="paid" label={t('home.tiles.sheets')} value={sum(data?.sheetExpenses, fmt)} sub={t('home.tiles.thisMonth')} onPress={go(`${ACCOUNTING}?tab=car_sheets`)} />
          <StatTile tone="paid" label={t('home.tiles.company')} value={sum(data?.companyExpenses, fmt)} sub={t('home.tiles.thisMonth')} onPress={go(`${ACCOUNTING}?tab=company`)} />
        </div>

        <section className="hc-trk-card surface-depth hc-fin-actions" aria-label={t('home.actions.title')}>
          <header><h2>{t('home.actions.title')}</h2></header>
          <nav>
            {actions.map(action => <Link key={action.to} to={action.to}>{action.label}</Link>)}
          </nav>
        </section>
      </div>

      <div className="hc-fin-lists">
        <section className="hc-trk-card surface-depth" aria-label={t('home.latest')}>
          <header><h2>{t('home.latest')}</h2></header>
          {!ready ? <div className="hc-fin-skeleton" /> : pending.length === 0 ? <p className="hc-fin-empty">{t('review.emptyPending')}</p> : (
            <ul className="hc-fin-list">
              {pending.map(row => (
                <li key={row.id}>
                  <Link to={`${ACCOUNTING}?tab=custody&filter=pending`}>
                    <StaffAvatar profile={staff?.get(row.employee_id)} size={30} />
                    <span className="min-w-0 flex-1">
                      <strong dir="auto">{staff?.get(row.employee_id)?.full_name ?? t('review.employee')}</strong>
                      <small dir="auto">{formatDay(row.transaction_date, locale)} · {row.description ?? '—'}</small>
                    </span>
                    <b><bdi dir="ltr">{formatTRY(row.amount)}</bdi></b>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="hc-trk-card surface-depth" aria-label={t('home.debtors')}>
          <header><h2>{t('home.debtors')}</h2></header>
          {!ready ? <div className="hc-fin-skeleton" /> : !customers || customers.debtors.length === 0 ? <p className="hc-fin-empty">{t('home.noDebtors')}</p> : (
            <ul className="hc-fin-list">
              {customers.debtors.slice(0, 5).map(entry => (
                <li key={entry.customerId}>
                  <Link to={`${ACCOUNTING}?tab=customers&customer=${encodeURIComponent(entry.customerId)}`}>
                    <span className="min-w-0 flex-1">
                      <strong dir="auto">{entry.name || '—'}</strong>
                      {entry.plate && <small><PlateChip plate={entry.plate} /></small>}
                    </span>
                    <b className="is-minus"><bdi dir="ltr">{fmt(-entry.balance)}</bdi></b>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
};

export default FinanceHome;
