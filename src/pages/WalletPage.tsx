import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTRY } from '../lib/CurrencyContext';
import { istanbulDate } from '../lib/istanbulTime';
import {
  ENTRY_TYPES, getMyMonthlySalary, getMyWalletEntries, signedAmount, walletBalance, walletTotals, withRunningBalance,
  type EntryType, type WalletEntry, type WalletEntryWithBalance,
} from '../lib/queries/staffWallet';
import { PeriodToggle, ReceiptThumb, SummaryCard, selectClass, type Period } from '../components/WalletParts';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { ReceiptLightbox, formatDateDisplay, useDateLocale } from './AccountingPage';

/**
 * The signed-in person's salary and bonuses, read-only: entries are written from
 * Admin. Company money they hold is My custody, a different thing. Always in lira,
 * because that is what the company owes, whatever the currency selector says.
 */

const CHIP: Record<EntryType, string> = {
  salary: 'bg-emerald-50 text-emerald-700',
  bonus: 'bg-violet-50 text-violet-700',
  advance: 'bg-amber-50 text-amber-700',
  deduction: 'bg-red-50 text-red-700',
  payout: 'bg-blue-50 text-blue-700',
};

/** What `admin_post_monthly_salaries` writes; everything else is someone's own words. */
const SALARY_NOTE = 'Monthly salary';

const signedMoney = (value: number) => `${value < 0 ? '−' : ''}${formatTRY(value)}`;

const Chip: React.FC<{ type: EntryType }> = ({ type }) => {
  const { t } = useTranslation('myWallet');
  return <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ${CHIP[type]}`}>{t(`type.${type}`)}</span>;
};

const Amount: React.FC<{ entry: WalletEntryWithBalance }> = ({ entry }) => {
  const value = signedAmount(entry);
  return (
    <bdi dir="ltr" className={`hc-num font-semibold ${value > 0 ? 'text-emerald-600' : 'text-red-600'}`}>
      {value > 0 ? '+' : '−'}{formatTRY(value)}
    </bdi>
  );
};

const Running: React.FC<{ value: number }> = ({ value }) => (
  <bdi dir="ltr" className="hc-num text-gray-600">{signedMoney(value)}</bdi>
);

const WalletPage: React.FC = () => {
  const { t } = useTranslation('myWallet');
  const { t: tc } = useTranslation('common');
  const dateLocale = useDateLocale();
  const { userId } = useCurrentUser();

  const [rows, setRows] = useState<WalletEntry[] | null>(null);
  const [salary, setSalary] = useState<number | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [period, setPeriod] = useState<Period>('month');
  const [month, setMonth] = useState('all');
  const [type, setType] = useState<'all' | EntryType>('all');
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setFailed(false);
    Promise.all([getMyWalletEntries(userId), getMyMonthlySalary(userId)])
      .then(([entries, monthly]) => {
        if (cancelled) return;
        setRows(entries);
        setSalary(monthly);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [userId, attempt]);

  const closeReceipt = useCallback(() => setReceipt(null), []);

  const thisMonth = istanbulDate().slice(0, 7);
  const totals = useMemo(() => walletTotals(rows ?? [], period === 'month' ? thisMonth : undefined), [rows, period, thisMonth]);
  const balance = useMemo(() => walletBalance(rows ?? []), [rows]);

  const months = useMemo(
    () => Array.from(new Set((rows ?? []).map(r => r.month.slice(0, 7)))).sort().reverse(),
    [rows],
  );

  // The running balance is worked out over everything first, so a filtered row
  // still shows what the balance really was at that point. Newest on top.
  const visible = useMemo(() => withRunningBalance(rows ?? [])
    .filter(r => month === 'all' || r.month.startsWith(month))
    .filter(r => type === 'all' || r.entry_type === type)
    .reverse(), [rows, month, type]);

  const monthLabel = (key: string) => new Date(`${key.slice(0, 7)}-01T00:00:00`).toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });
  const entryDate = (entry: WalletEntry) => formatDateDisplay(istanbulDate(new Date(entry.created_at)), dateLocale);
  const noteOf = (entry: WalletEntry) => (entry.note === SALARY_NOTE ? t('salaryNote') : entry.note);

  if (failed) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <p role="alert" className="text-sm text-gray-600">{t('failed')}</p>
        <button type="button" onClick={() => setAttempt(n => n + 1)} className="min-h-11 cursor-pointer rounded-xl bg-[var(--accent-strong)] px-5 text-sm font-semibold text-white hover:bg-[var(--accent-strong-hover)]">
          {tc('actions.tryAgain')}
        </button>
      </div>
    );
  }

  const loading = rows === null;

  return (
    <div className="flex flex-col gap-6 p-4 sm:p-6 lg:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-[#0f1117] sm:text-[28px]">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
          {salary !== null && (
            <p className="mt-1 text-sm font-medium text-gray-700">
              {t('monthlySalary', { amount: formatTRY(salary) })}
            </p>
          )}
        </div>
        <PeriodToggle value={period} onChange={setPeriod} monthLabel={t('period.month')} allLabel={t('period.all')} />
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label={t('balance')}
          hint={t('balanceHint')}
          valueClass={balance < 0 ? 'text-red-600' : undefined}
          value={loading ? '—' : <bdi dir="ltr">{signedMoney(balance)}</bdi>}
        />
        <SummaryCard label={t(`earned.${period}`)} value={loading ? '—' : <bdi dir="ltr">{formatTRY(totals.earned)}</bdi>} />
        <SummaryCard label={t(`paid.${period}`)} value={loading ? '—' : <bdi dir="ltr">{formatTRY(totals.paid)}</bdi>} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)]">
        <header className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-4 md:flex-row md:items-center md:justify-between md:px-5">
          <h2 className="text-[15px] font-semibold text-[#0f1117]">{t('movements')}</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex">
            <select aria-label={t('filters.month')} value={month} onChange={e => setMonth(e.target.value)} className={selectClass}>
              <option value="all">{t('filters.allMonths')}</option>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select aria-label={t('filters.type')} value={type} onChange={e => setType(e.target.value as 'all' | EntryType)} className={selectClass}>
              <option value="all">{t('filters.allTypes')}</option>
              {ENTRY_TYPES.map(option => <option key={option} value={option}>{t(`type.${option}`)}</option>)}
            </select>
          </div>
        </header>

        {loading ? (
          <div className="flex flex-col gap-3 p-5" aria-busy>
            {[0, 1, 2, 3].map(i => <div key={i} className="h-8 animate-pulse rounded-md bg-black/[0.05]" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="px-5 py-12 text-center text-sm text-gray-500">
            {rows.length === 0 ? t('empty') : t('emptyFiltered')}
          </div>
        ) : (
          <>
            {/* Seven columns need the room a sidebar leaves only from here up. */}
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-xs font-medium text-gray-500">
                    <th scope="col" className="px-5 py-3 text-start font-medium">{t('table.date')}</th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">{t('table.type')}</th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">{t('table.month')}</th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">{t('table.note')}</th>
                    <th scope="col" className="px-3 py-3 text-end font-medium">{t('table.amount')}</th>
                    <th scope="col" className="px-3 py-3 text-center font-medium">{t('table.receipt')}</th>
                    <th scope="col" className="px-5 py-3 text-end font-medium">{t('table.running')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(row => (
                    <tr key={row.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                      <td className="whitespace-nowrap px-5 py-3 text-gray-700">{entryDate(row)}</td>
                      <td className="px-3 py-3"><Chip type={row.entry_type} /></td>
                      <td className="whitespace-nowrap px-3 py-3 text-gray-700">{monthLabel(row.month)}</td>
                      <td className="max-w-[260px] px-3 py-3 text-gray-500">{noteOf(row) || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-end"><Amount entry={row} /></td>
                      <td className="px-3 py-2"><div className="flex justify-center"><ReceiptThumb url={row.receipt_url} label={t('viewReceipt')} onOpen={setReceipt} /></div></td>
                      <td className="whitespace-nowrap px-5 py-3 text-end"><Running value={row.running} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="xl:hidden">
              {visible.map(row => (
                <li key={row.id} className="flex items-start gap-3 border-b border-[var(--border-subtle)] p-4 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <Chip type={row.entry_type} />
                    <div className="mt-1 text-[13px] text-gray-700">{monthLabel(row.month)}</div>
                    {noteOf(row) && <div className="mt-0.5 text-[13px] text-gray-500">{noteOf(row)}</div>}
                    <div className="mt-1 text-xs text-gray-400">{entryDate(row)}</div>
                  </div>
                  <div className="shrink-0 text-end text-sm">
                    <div><Amount entry={row} /></div>
                    <div className="mt-1 text-xs"><Running value={row.running} /></div>
                  </div>
                  {row.receipt_url && <ReceiptThumb url={row.receipt_url} label={t('viewReceipt')} onOpen={setReceipt} />}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      {receipt && <ReceiptLightbox url={receipt} onClose={closeReceipt} />}
    </div>
  );
};

export default WalletPage;
