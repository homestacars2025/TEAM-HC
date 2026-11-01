import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useLocation, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { formatTRY } from '../lib/CurrencyContext';
import { isLegacyApproval } from '../lib/expenseReview';
import { istanbulDate } from '../lib/istanbulTime';
import { canDeleteExpense, expenseErrorKey, formatPlate } from '../lib/custodyExpense';
import {
  custodyBalance, custodyTotals, deleteCustodyExpense, getMyCustodyMovements, withRunningCustody,
  type CustodyMovement, type CustodyMovementWithBalance,
} from '../lib/queries/custody';
import { ReceiptThumb, PeriodToggle, StatTile, selectClass, type Period } from '../components/WalletParts';
import FilterBar from '../components/FilterBar';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { ReceiptLightbox, formatDateDisplay, useDateLocale } from './AccountingPage';
import Button from '../components/Button';
import AddExpenseSheet from '../components/custody/AddExpenseSheet';
import MyEnvelopes from '../components/cash/MyEnvelopes';
import { useMyEnvelopes } from '../hooks/useMyEnvelopes';
import ConfirmDialog from '../components/custody/ConfirmDialog';
import PlateChip from '../components/booking/PlateChip';
import ReviewPill from '../components/custody/ReviewPill';
import { useExpenseCategoryLabel } from '../components/custody/useExpenseCategoryLabel';

/**
 * The signed-in employee's custody (الوديعة): company money they hold. Money in is
 * recorded on the Accounting page; expenses are logged here by the person who spent
 * it. Salary and bonuses are My wallet. Always in lira: this is cash that changed
 * hands in lira, not a figure to convert.
 */

type DirectionFilter = 'all' | 'IN' | 'OUT';

/** `all`, `company`, or a car id as text. */
type TargetFilter = string;

const TOAST_MS = 3200;
/** As long as the arrival animation, so a later filter change doesn't replay it. */
const FRESH_MS = 1800;

const COLOR_IN = 'text-emerald-600';
const COLOR_OUT = 'text-red-600';

const Amount: React.FC<{ movement: CustodyMovementWithBalance }> = ({ movement }) => {
  const isIn = movement.direction === 'IN';
  return (
    <bdi dir="ltr" className={`hc-num font-semibold ${isIn ? COLOR_IN : COLOR_OUT}`}>
      {isIn ? '+' : '−'}{formatTRY(movement.amount)}
    </bdi>
  );
};

const Running: React.FC<{ value: number }> = ({ value }) => (
  <bdi dir="ltr" className="hc-num text-gray-600">{value < 0 ? '−' : ''}{formatTRY(value)}</bdi>
);

const PlusIcon: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
  </svg>
);

/** Who an expense was for. Money coming in was for nobody. */
const Target: React.FC<{ movement: CustodyMovement }> = ({ movement }) => {
  const { t } = useTranslation('custody');
  if (movement.direction !== 'OUT') return <span className="text-gray-300">—</span>;
  if (movement.car) return <PlateChip plate={movement.car.plate_number} />;
  if (movement.expense_scope === 'company') return <span className="text-gray-700">{t('company')}</span>;
  return <span className="text-gray-300">—</span>;
};

const DeleteButton: React.FC<{ onClick: () => void }> = ({ onClick }) => {
  const { t } = useTranslation('custody');
  return (
    <button
      type="button"
      onClick={onClick}
      title={t('deleteExpense')}
      aria-label={t('deleteExpense')}
      className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-red-50 hover:text-red-600 sm:size-9"
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
};

const CustodyPage: React.FC = () => {
  const { t } = useTranslation('custody');
  const { t: tc } = useTranslation('common');
  const dateLocale = useDateLocale();
  const { userId } = useCurrentUser();

  const [rows, setRows] = useState<CustodyMovement[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [period, setPeriod] = useState<Period>('month');
  const [month, setMonth] = useState('all');
  const [direction, setDirection] = useState<DirectionFilter>('all');
  const [category, setCategory] = useState('all');
  const [target, setTarget] = useState<TargetFilter>('all');
  const [receipt, setReceipt] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [freshId, setFreshId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<CustodyMovement | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; failed: boolean } | null>(null);
  const toastTimer = useRef(0);
  const { envelopes, failed: envelopesFailed } = useMyEnvelopes(userId);
  const [opened] = useState(() => Date.now());

  // The account menu and Home link straight to the list, which sits under the movements.
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#envelopes' && envelopes) document.getElementById('envelopes')?.scrollIntoView({ block: 'start' });
  }, [hash, envelopes]);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    setFailed(false);
    getMyCustodyMovements(userId)
      .then(data => { if (!cancelled) setRows(data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [userId, attempt]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const showToast = useCallback((text: string, failed = false) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, failed });
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  /** Quietly, because a failure here must not replace the page with an error screen. */
  const refresh = useCallback(() => {
    if (!userId) return;
    getMyCustodyMovements(userId).then(setRows).catch(() => {});
  }, [userId]);

  const closeReceipt = useCallback(() => setReceipt(null), []);
  const closeSheet = useCallback(() => setAdding(false), []);

  const onExpenseSaved = useCallback((row: CustodyMovement) => {
    setAdding(false);
    setRows(prev => [...(prev ?? []), row]);
    // It has to be seen arriving, whatever the list was filtered to.
    setMonth('all');
    setDirection('all');
    setCategory('all');
    setTarget('all');
    setFreshId(row.id);
    showToast(t('toastSaved'));
    refresh();
  }, [refresh, showToast, t]);

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteCustodyExpense(deleting.id);
      const removed = deleting.id;
      setRows(prev => (prev ?? []).filter(row => row.id !== removed));
      showToast(t('toastDeleted'));
    } catch (failure) {
      const key = expenseErrorKey((failure as { message?: string })?.message);
      showToast(t(`expense.errors.${key === 'tooLate' ? 'tooLate' : 'deleteFailed'}`), true);
      refresh();
    }
    setDeleteBusy(false);
    setDeleting(null);
  };

  // A goal gap links here to show one entry. Both layouts render it, so the one
  // on screen is whichever has a box.
  const [params] = useSearchParams();
  const highlighted = Number(params.get('entry')) || null;
  useEffect(() => {
    if (!highlighted || !rows) return;
    Array.from(document.querySelectorAll<HTMLElement>(`[data-entry="${highlighted}"]`))
      .find(el => el.offsetParent !== null)
      ?.scrollIntoView({ block: 'center' });
  }, [highlighted, rows]);
  const highlightClass = (id: number) => {
    if (id === freshId) return 'hc-row-new';
    return id === highlighted ? 'bg-[var(--accent-soft)]' : '';
  };

  // A back-dated expense lands lower down, so the list moves to meet it.
  useEffect(() => {
    if (freshId === null) return;
    Array.from(document.querySelectorAll<HTMLElement>(`[data-entry="${freshId}"]`))
      .find(el => el.offsetParent !== null)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    const timer = window.setTimeout(() => setFreshId(null), FRESH_MS);
    return () => window.clearTimeout(timer);
  }, [freshId]);

  const thisMonth = istanbulDate().slice(0, 7);
  const totals = useMemo(() => custodyTotals(rows ?? [], period === 'month' ? thisMonth : undefined), [rows, period, thisMonth]);
  const balance = useMemo(() => custodyBalance(rows ?? []), [rows]);

  const labelFor = useExpenseCategoryLabel();

  const targets = useMemo(() => {
    const plates = new Map<number, string>();
    (rows ?? []).forEach(row => { if (row.car_id !== null && row.car) plates.set(row.car_id, row.car.plate_number); });
    return Array.from(plates, ([id, plate]) => ({ id, plate })).sort((a, b) => a.plate.localeCompare(b.plate, 'en', { numeric: true }));
  }, [rows]);

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
  const visible = useMemo(() => withRunningCustody(rows ?? [])
    .filter(r => month === 'all' || r.transaction_date.startsWith(month))
    .filter(r => direction === 'all' || r.direction === direction)
    .filter(r => category === 'all' || r.category === category)
    .filter(r => target === 'all' || (target === 'company' ? r.expense_scope === 'company' : String(r.car_id) === target))
    .reverse(), [rows, month, direction, category, target]);

  const monthLabel = (key: string) => new Date(`${key}-01T00:00:00`).toLocaleDateString(dateLocale, { month: 'long', year: 'numeric' });

  if (failed) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <p role="alert" className="text-sm text-gray-600">{t('failed')}</p>
        <Button onClick={() => setAttempt(n => n + 1)}>{tc('actions.tryAgain')}</Button>
      </div>
    );
  }

  const loading = rows === null;

  return (
    <div className="hc-fab-page flex flex-col gap-6 p-4 sm:p-6 lg:p-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold text-[#0f1117] sm:text-[28px]">{t('title')}</h1>
          <p className="mt-1 text-sm text-gray-500">{t('subtitle')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PeriodToggle value={period} onChange={setPeriod} monthLabel={t('period.month')} allLabel={t('period.all')} />
          <Button disabled={loading} onClick={() => setAdding(true)} className="max-sm:!hidden">
            <PlusIcon size={16} />
            {t('expense.add')}
          </Button>
        </div>
      </header>

      <div className="hc-tiles">
        <StatTile
          tone={balance < 0 ? 'negative' : 'balance'}
          label={t('balance')}
          value={loading ? null : `${balance < 0 ? '−' : ''}${formatTRY(balance)}`}
          sub={t('tile.current')}
        />
        <StatTile tone="received" label={t('received')} value={loading ? null : formatTRY(totals.received)} sub={t(`period.${period}`)} />
        <StatTile tone="spent" label={t('spent')} value={loading ? null : formatTRY(totals.spent)} sub={t(`period.${period}`)} />
      </div>

      <section className="surface-depth overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)]">
        <header className="flex flex-col gap-3 border-b border-[var(--border-subtle)] p-4 md:flex-row md:items-center md:justify-between md:px-5">
          <h2 className="text-[15px] font-semibold text-[#0f1117]">{t('movements')}</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 md:flex">
            <FilterBar
              fields={[
                {
                  key: 'month',
                  label: t('filters.month'),
                  activeLabel: month === 'all' ? null : monthLabel(month),
                  onClear: () => setMonth('all'),
                  control: (
                    <select aria-label={t('filters.month')} value={month} onChange={e => setMonth(e.target.value)} className={selectClass}>
                      <option value="all">{t('filters.allMonths')}</option>
                      {months.map(m => <option key={m} value={m}>{monthLabel(m)}</option>)}
                    </select>
                  ),
                },
                {
                  key: 'direction',
                  label: t('filters.direction'),
                  activeLabel: direction === 'all' ? null : t(`direction.${direction}`),
                  onClear: () => setDirection('all'),
                  control: (
                    <select aria-label={t('filters.direction')} value={direction} onChange={e => setDirection(e.target.value as DirectionFilter)} className={selectClass}>
                      <option value="all">{t('filters.allDirections')}</option>
                      <option value="IN">{t('direction.IN')}</option>
                      <option value="OUT">{t('direction.OUT')}</option>
                    </select>
                  ),
                },
                {
                  key: 'category',
                  label: t('filters.category'),
                  activeLabel: category === 'all' ? null : labelFor(category),
                  onClear: () => setCategory('all'),
                  control: (
                    <select aria-label={t('filters.category')} value={category} onChange={e => setCategory(e.target.value)} className={selectClass}>
                      <option value="all">{t('filters.allCategories')}</option>
                      {categories.map(c => <option key={c} value={c}>{labelFor(c)}</option>)}
                    </select>
                  ),
                },
                {
                  key: 'target',
                  label: t('filters.target'),
                  activeLabel: target === 'all' ? null : target === 'company' ? t('company') : formatPlate(targets.find(car => String(car.id) === target)?.plate ?? ''),
                  onClear: () => setTarget('all'),
                  control: (
                    <select aria-label={t('filters.target')} value={target} onChange={e => setTarget(e.target.value)} className={selectClass}>
                      <option value="all">{t('filters.allTargets')}</option>
                      <option value="company">{t('company')}</option>
                      {targets.map(car => <option key={car.id} value={String(car.id)}>{formatPlate(car.plate)}</option>)}
                    </select>
                  ),
                },
              ]}
            />
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
            {/* The table needs the room a sidebar leaves only from here up. */}
            <div className="hidden overflow-x-auto xl:block">
              <table className="w-full min-w-[860px] border-collapse text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-subtle)] text-start text-xs font-medium text-gray-500">
                    <th scope="col" className="px-5 py-3 text-start font-medium">{t('table.date')}</th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">{t('table.category')}</th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">{t('table.target')}</th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">{t('table.description')}</th>
                    <th scope="col" className="px-3 py-3 text-end font-medium">{t('table.amount')}</th>
                    <th scope="col" className="px-3 py-3 text-start font-medium">{t('table.status')}</th>
                    <th scope="col" className="px-3 py-3 text-center font-medium">{t('table.receipt')}</th>
                    <th scope="col" className="px-3 py-3 text-end font-medium">{t('table.running')}</th>
                    <th scope="col" className="w-12 px-3 py-3"><span className="sr-only">{t('table.actions')}</span></th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map(row => (
                    <tr key={row.id} data-entry={row.id} className={`border-b border-[var(--border-subtle)] last:border-b-0 ${highlightClass(row.id)}`}>
                      <td className="whitespace-nowrap px-5 py-3 text-gray-700">{formatDateDisplay(row.transaction_date, dateLocale)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-gray-700">{labelFor(row.category)}</td>
                      <td className="whitespace-nowrap px-3 py-3"><Target movement={row} /></td>
                      <td className="max-w-[240px] px-3 py-3 text-gray-500">
                        {row.description || '—'}
                        {row.supplier && <div className="mt-0.5 text-xs text-gray-400" dir="auto">{row.supplier.name}</div>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-end"><Amount movement={row} /></td>
                      <td className="whitespace-nowrap px-3 py-3">{row.direction === 'OUT' && <ReviewPill status={row.review_status} note={row.review_note} legacy={isLegacyApproval(row)} />}</td>
                      <td className="px-3 py-2"><div className="flex justify-center"><ReceiptThumb url={row.receipt_url} label={t('viewReceipt')} onOpen={setReceipt} /></div></td>
                      <td className="whitespace-nowrap px-3 py-3 text-end"><Running value={row.running} /></td>
                      <td className="px-3 py-1">{canDeleteExpense(row, userId) && <DeleteButton onClick={() => setDeleting(row)} />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="xl:hidden">
              {visible.map(row => (
                <li key={row.id} data-entry={row.id} className={`flex items-start gap-3 border-b border-[var(--border-subtle)] p-4 last:border-b-0 ${highlightClass(row.id)}`}>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium text-[#0f1117]">{labelFor(row.category)}</div>
                    {row.direction === 'OUT' && (row.car || row.expense_scope === 'company') && <div className="mt-1 text-[13px]"><Target movement={row} /></div>}
                    {row.description && <div className="mt-1 text-[13px] text-gray-500">{row.description}</div>}
                    {row.supplier && <div className="mt-1 text-xs text-gray-500" dir="auto">{row.supplier.name}</div>}
                    <div className="mt-1 text-xs text-gray-400">{formatDateDisplay(row.transaction_date, dateLocale)}</div>
                    {row.direction === 'OUT' && <div className="mt-1.5"><ReviewPill status={row.review_status} note={row.review_note} legacy={isLegacyApproval(row)} /></div>}
                    {row.direction === 'OUT' && row.review_status === 'rejected' && row.review_note && <div className="mt-1 text-xs text-red-600" dir="auto">{row.review_note}</div>}
                  </div>
                  <div className="shrink-0 text-end text-sm">
                    <div><Amount movement={row} /></div>
                    <div className="mt-1 text-xs"><Running value={row.running} /></div>
                  </div>
                  {row.receipt_url && <ReceiptThumb url={row.receipt_url} label={t('viewReceipt')} onOpen={setReceipt} />}
                  {canDeleteExpense(row, userId) && <DeleteButton onClick={() => setDeleting(row)} />}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <MyEnvelopes envelopes={envelopes} failed={envelopesFailed} now={opened} />

      {!loading && (
        <Button onClick={() => setAdding(true)} aria-label={t('expense.add')} className="hc-fab sm:!hidden">
          <PlusIcon size={24} />
        </Button>
      )}

      {receipt && <ReceiptLightbox url={receipt} onClose={closeReceipt} />}

      {adding && userId && rows && (
        <AddExpenseSheet userId={userId} balance={balance} rows={rows} onClose={closeSheet} onSaved={onExpenseSaved} />
      )}

      {deleting && (
        <ConfirmDialog
          title={t('deleteConfirm.title')}
          body={t('deleteConfirm.body')}
          confirmLabel={deleteBusy ? t('deleteConfirm.deleting') : t('deleteConfirm.confirm')}
          cancelLabel={tc('actions.cancel')}
          busy={deleteBusy}
          onConfirm={confirmDelete}
          onCancel={() => setDeleting(null)}
        />
      )}

      {toast && ReactDOM.createPortal(
        <div role={toast.failed ? 'alert' : 'status'} className={`hc-toast-in fixed inset-x-3 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[9400] mx-auto max-w-sm rounded-2xl px-4 py-3 text-center text-sm font-semibold text-white shadow-lg sm:bottom-6 ${toast.failed ? 'bg-red-600' : 'bg-[#0f1117]'}`}>
          {toast.text}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default CustodyPage;
