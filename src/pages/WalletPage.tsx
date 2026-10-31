import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '../lib/CurrencyContext';
import { istanbulDate } from '../lib/istanbulTime';
import {
  getMyWalletMovements, walletBalance, walletTotals, withRunningBalance,
  type WalletMovement, type WalletMovementWithBalance,
} from '../lib/queries/wallet';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { ReceiptLightbox, categoryLabel, formatDateDisplay, isPdfUrl, useDateLocale } from './AccountingPage';

/**
 * The signed-in employee's custody, read-only: entries are recorded on the
 * Accounting page. Salary and bonus are a separate thing and do not belong here.
 */

type Period = 'month' | 'all';
type DirectionFilter = 'all' | 'IN' | 'OUT';

const COLOR_IN = 'text-emerald-600';
const COLOR_OUT = 'text-red-600';

const selectClass =
  'h-11 min-w-0 cursor-pointer rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 text-sm text-[#0f1117] outline-none focus:border-[var(--accent)] sm:h-10';

const SummaryCard: React.FC<{ label: string; value: React.ReactNode; valueClass?: string }> = ({ label, value, valueClass }) => (
  <div className="min-w-0 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-5">
    <div className="text-[13px] font-medium text-gray-600">{label}</div>
    <div className={`mt-2 truncate text-[26px] font-semibold leading-tight sm:text-[28px] ${valueClass ?? 'text-[#0f1117]'}`}>{value}</div>
  </div>
);

const Amount: React.FC<{ movement: WalletMovementWithBalance }> = ({ movement }) => {
  const { fmt } = useCurrency();
  const isIn = movement.direction === 'IN';
  return (
    <bdi dir="ltr" className={`hc-num font-semibold ${isIn ? COLOR_IN : COLOR_OUT}`}>
      {isIn ? '+' : '−'}{fmt(movement.amount)}
    </bdi>
  );
};

const Running: React.FC<{ value: number }> = ({ value }) => {
  const { fmt } = useCurrency();
  return <bdi dir="ltr" className="hc-num text-gray-600">{value < 0 ? '−' : ''}{fmt(value)}</bdi>;
};

const Receipt: React.FC<{ url: string | null; onOpen: (url: string) => void }> = ({ url, onOpen }) => {
  const { t } = useTranslation('myWallet');
  if (!url) return <span className="text-gray-300">—</span>;

  const frame = 'flex size-11 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-[var(--border-subtle)] bg-[var(--surface)] no-underline sm:size-10';

  // A PDF has no image to enlarge, so it opens in the browser's own viewer.
  if (isPdfUrl(url)) {
    return (
      <a href={url} target="_blank" rel="noreferrer" title={t('viewReceipt')} aria-label={t('viewReceipt')} className={`${frame} text-[10px] font-bold text-gray-500`}>{'PDF'}</a>
    );
  }
  return (
    <button type="button" onClick={() => onOpen(url)} title={t('viewReceipt')} aria-label={t('viewReceipt')} className={frame}>
      <img src={url} alt="" loading="lazy" className="size-full object-cover" />
    </button>
  );
};

const WalletPage: React.FC = () => {
  const { t } = useTranslation('myWallet');
  const { t: ta } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const dateLocale = useDateLocale();
  const { fmt } = useCurrency();
  const { userId } = useCurrentUser();

  const [rows, setRows] = useState<WalletMovement[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [period, setPeriod] = useState<Period>('month');
  const [month, setMonth] = useState('all');
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [category, setCategory] = useState('all');
  const [receipt, setReceipt] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setFailed(false);
    getMyWalletMovements(userId)
      .then(data => { if (!cancelled) setRows(data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [userId, attempt]);

  const closeReceipt = useCallback(() => setReceipt(null), []);

  const thisMonth = istanbulDate().slice(0, 7);
  const totals = useMemo(() => walletTotals(rows ?? [], period === 'month' ? thisMonth : undefined), [rows, period, thisMonth]);
  const balance = useMemo(() => walletBalance(rows ?? []), [rows]);

  const months = useMemo(
    () => Array.from(new Set((rows ?? []).map(r => r.transaction_date.slice(0, 7)))).sort().reverse(),
    [rows],
  );
  const categories = useMemo(
    () => Array.from(new Set((rows ?? []).map(r => r.category).filter((c): c is string => !!c))).sort(),
    [rows],
  );

  // The running balance is worked out over everything first, so a filtered row
  // still shows what the balance really was at that point. Newest on top.
  const visible = useMemo(() => withRunningBalance(rows ?? [])
    .filter(r => month === 'all' || r.transaction_date.startsWith(month))
    .filter(r => direction === 'all' || r.direction === direction)
    .filter(r => category === 'all' || r.category === category)
    .reverse(), [rows, month, direction, category]);

  const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });

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
        </div>
        <div role="group" className="inline-flex rounded-xl border border-[var(--border-subtle)] p-1">
          {(['month', 'all'] as Period[]).map(p => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => setPeriod(p)}
              className={`min-h-9 cursor-pointer rounded-lg px-4 text-[13px] font-semibold transition-colors ${period === p ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'text-gray-500 hover:text-gray-700'}`}
            >
              {t(`period.${p}`)}
            </button>
          ))}
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <SummaryCard
          label={t('balance')}
          valueClass={balance < 0 ? COLOR_OUT : undefined}
          value={loading ? '—' : <bdi dir="ltr">{balance < 0 ? '−' : ''}{fmt(balance)}</bdi>}
        />
        <SummaryCard label={t('received')} value={loading ? '—' : <bdi dir="ltr">{fmt(totals.received)}</bdi>} />
        <SummaryCard label={t('spent')} value={loading ? '—' : <bdi dir="ltr">{fmt(totals.spent)}</bdi>} />
      </div>

      <section className="overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)]">
        <header className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-4 md:flex-row md:items-center md:justify-between md:px-5">
          <h2 className="text-[15px] font-semibold text-[#0f1117]">{t('movements')}</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3 md:flex">
            <select aria-label={t('filters.month')} value={month} onChange={e => setMonth(e.target.value)} className={selectClass}>
              <option value="all">{t('filters.allMonths')}</option>
              {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
            </select>
            <select aria-label={t('filters.direction')} value={direction} onChange={e => setDirection(e.target.value as DirectionFilter)} className={selectClass}>
              <option value="all">{t('filters.allDirections')}</option>
              <option value="IN">{t('direction.IN')}</option>
              <option value="OUT">{t('direction.OUT')}</option>
            </select>
            <select aria-label={t('filters.category')} value={category} onChange={e => setCategory(e.target.value)} className={selectClass}>
              <option value="all">{t('filters.allCategories')}</option>
              {categories.map(c => <option key={c} value={c}>{categoryLabel(ta, c)}</option>)}
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
            {/* Desktop and tablet */}
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[720px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-start text-xs font-medium text-gray-500">
                    <th scope="col" className="px-5 py-3 text-start font-medium">{t('table.date')}</th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">{t('table.category')}</th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">{t('table.description')}</th>
                    <th scope="col" className="px-3 py-3 text-end font-medium">{t('table.amount')}</th>
                    <th scope="col" className="px-3 py-3 text-center font-medium">{t('table.receipt')}</th>
                    <th scope="col" className="px-5 py-3 text-end font-medium">{t('table.running')}</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(row => (
                    <tr key={row.id} className="border-b border-[var(--border-subtle)] last:border-b-0">
                      <td className="whitespace-nowrap px-5 py-3 text-gray-700">{formatDateDisplay(row.transaction_date, dateLocale)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-gray-700">{categoryLabel(ta, row.category)}</td>
                      <td className="max-w-[280px] px-3 py-3 text-gray-500">{row.description || '—'}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-end"><Amount movement={row} /></td>
                      <td className="px-3 py-2"><div className="flex justify-center"><Receipt url={row.receipt_url} onOpen={setReceipt} /></div></td>
                      <td className="whitespace-nowrap px-5 py-3 text-end"><Running value={row.running} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Phone */}
            <ul className="md:hidden">
              {visible.map(row => (
                <li key={row.id} className="flex items-start gap-3 border-b border-[var(--border-subtle)] p-4 last:border-b-0">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[#0f1117]">{categoryLabel(ta, row.category)}</div>
                    {row.description && <div className="mt-0.5 text-[13px] text-gray-500">{row.description}</div>}
                    <div className="mt-1 text-xs text-gray-400">{formatDateDisplay(row.transaction_date, dateLocale)}</div>
                  </div>
                  <div className="shrink-0 text-end text-sm">
                    <div><Amount movement={row} /></div>
                    <div className="mt-1 text-xs"><Running value={row.running} /></div>
                  </div>
                  {row.receipt_url && <Receipt url={row.receipt_url} onOpen={setReceipt} />}
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
