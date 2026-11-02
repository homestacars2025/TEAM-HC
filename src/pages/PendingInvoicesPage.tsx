import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import Button from '../components/Button';
import CustomerAvatar from '../components/CustomerAvatar';
import HomeArt from '../components/HomeArt';
import { StatTile } from '../components/WalletParts';
import PlateChip from '../components/booking/PlateChip';
import { ComplianceTriangle } from '../components/cars/Compliance';
import InvoiceDrawer from '../components/invoices/InvoiceDrawer';
import { formatDay, useDateLocale } from '../hooks/useDateLocale';
import { useTileFilter } from '../hooks/useTileFilter';
import { downloadCsv } from '../lib/csv';
import {
  ALL_MONTHS, carName, currentMonth, hasNoRental, INVOICE_FILTERS, inInvoiceFilter, inMonth, invoiceCsvRows, invoiceMatches, invoiceTotals, isMissingAmount, readMonth, shiftMonth, type PendingInvoice,
} from '../lib/pendingInvoices';
import { getPendingInvoices, markInvoices } from '../lib/queries/pendingInvoices';
import { formatMoney } from '../lib/suppliers';

const TOAST_MS = 7000;

const lira = (amount: number) => formatMoney(amount, 'TRY');

const Chevron: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

interface Toast {
  message: string;
  error?: boolean;
  /** Bookings the Undo button puts back. */
  undo?: number[];
}

const PendingInvoicesPage: React.FC = () => {
  const { t } = useTranslation('finance');
  const locale = useDateLocale();
  const [params, setParams] = useSearchParams();
  const month = readMonth(params.get('month'));
  const allMonths = month === ALL_MONTHS;
  const lastMonth = useRef(allMonths ? currentMonth() : month);
  if (!allMonths) lastMonth.current = month;
  const [filter, setFilter] = useTileFilter(INVOICE_FILTERS);

  const [allRows, setAllRows] = useState<PendingInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<'failed' | 'forbidden' | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [open, setOpen] = useState<PendingInvoice | null>(null);
  const [marking, setMarking] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);

  const load = useCallback(async (quietly = false) => {
    if (!quietly) { setLoading(true); setError(null); }
    try {
      setAllRows(await getPendingInvoices());
      setError(null);
    } catch (failure) {
      // The page has its own key, but the server asks for Accounting.
      if (!quietly) setError(/not allowed/i.test((failure as { message?: string })?.message ?? '') ? 'forbidden' : 'failed');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { setSelected(new Set()); }, [month]);

  const showToast = useCallback((next: Toast) => {
    window.clearTimeout(toastTimer.current);
    setToast(next);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const setMonth = (next: string) => setParams(current => {
    const updated = new URLSearchParams(current);
    if (next === currentMonth()) updated.delete('month');
    else updated.set('month', next);
    return updated;
  }, { replace: true });

  const rows = useMemo(() => allRows.filter(row => inMonth(row, month)), [allRows, month]);
  const scoped = useMemo(() => rows.filter(row => invoiceMatches(row, search)), [rows, search]);
  const totals = useMemo(() => invoiceTotals(scoped), [scoped]);
  const shown = useMemo(() => scoped.filter(row => inInvoiceFilter(row, filter)), [scoped, filter]);
  const shownIds = useMemo(() => shown.map(row => row.booking_id), [shown]);
  const allPicked = shownIds.length > 0 && shownIds.every(id => selected.has(id));
  // A filter or search can hide a ticked row, and nothing hidden gets marked.
  const picked = useMemo(() => shownIds.filter(id => selected.has(id)), [shownIds, selected]);

  const toggle = (id: number) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const undo = async (ids: number[]) => {
    setToast(null);
    try {
      await markInvoices(ids, false);
      showToast({ message: t('invoices.toast.undone') });
      await load(true);
    } catch {
      showToast({ message: t('invoices.toast.failed'), error: true });
    }
  };

  const mark = async (ids: number[]) => {
    setMarking(true);
    try {
      await markInvoices(ids, true);
      setOpen(null);
      setSelected(new Set());
      showToast({ message: t('invoices.toast.marked', { count: ids.length }), undo: ids });
      await load(true);
    } catch {
      showToast({ message: t('invoices.toast.failed'), error: true });
    } finally {
      setMarking(false);
    }
  };

  const monthName = (value: string) => new Date(`${value}-01T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const value = (text: string) => (loading ? null : text);

  return (
    <div className="hc-pi">
      <header className="hc-pi-head">
        <div>
          <h1>{t('invoices.title')}</h1>
          <p>{t('invoices.subtitle')}</p>
        </div>
        <div className="hc-pi-months">
          <div className={`hc-pi-month ${allMonths ? 'is-off' : ''}`}>
            <button type="button" aria-label={t('invoices.month.prev')} disabled={allMonths} onClick={() => setMonth(shiftMonth(month, -1))}><Chevron /></button>
            <strong aria-live="polite">{allMonths ? t('invoices.month.all') : monthName(month)}</strong>
            <button type="button" aria-label={t('invoices.month.next')} disabled={allMonths} className="is-next" onClick={() => setMonth(shiftMonth(month, 1))}><Chevron /></button>
          </div>
          <button type="button" aria-pressed={allMonths} className="hc-pi-all" onClick={() => setMonth(allMonths ? lastMonth.current : ALL_MONTHS)}>{t('invoices.month.all')}</button>
        </div>
      </header>

      <div className="hc-tiles hc-tiles-filter hc-pi-tiles">
        <StatTile tone="total" art={<HomeArt name="tasks" className="hc-tile-art" />} label={t('invoices.tiles.pending')} sub={t('invoices.tiles.pendingSub')} value={value(String(totals.count))} pressed={filter === 'all'} onPress={() => setFilter('all')} />
        <StatTile tone="balance" art={<HomeArt name="wallet" className="hc-tile-art" />} label={t('invoices.tiles.total')} sub={t('invoices.tiles.totalSub')} value={value(lira(totals.total))} pressed={filter === 'ready'} onPress={() => setFilter('ready')} />
        <StatTile tone="paid" art={<HomeArt name="custody" className="hc-tile-art" />} label={t('invoices.tiles.net')} sub={t('invoices.tiles.netSub')} value={value(lira(totals.net))} />
        <StatTile tone="paid" art={<HomeArt name="operations" className="hc-tile-art" />} label={t('invoices.tiles.vat')} sub={t('invoices.tiles.vatSub')} value={value(lira(totals.vat))} />
        <StatTile tone="warn" art={<ComplianceTriangle severity="missing" size={40} className="hc-tile-art" />} label={t('invoices.tiles.missing')} sub={t('invoices.tiles.missingSub')} value={value(String(totals.missing))} pressed={filter === 'missing'} onPress={() => setFilter('missing')} />
      </div>

      <div className="hc-pi-tools">
        <input type="search" className="hc-input !mt-0" placeholder={t('invoices.search')} aria-label={t('invoices.search')} value={search} onChange={e => setSearch(e.target.value)} />
        <Button variant="secondary" disabled={rows.length === 0} onClick={() => downloadCsv(`pending-invoices-${month}`, invoiceCsvRows(rows))}>{t(allMonths ? 'invoices.exportAll' : 'invoices.export')}</Button>
      </div>

      {error ? (
        <div className="hc-pi-state surface-depth">
          <p role="alert">{error === 'forbidden' ? t('invoices.notAllowed') : t('invoices.loadFailed')}</p>
          {error === 'failed' && <Button variant="secondary" onClick={() => void load()}>{t('invoices.retry')}</Button>}
        </div>
      ) : loading ? (
        <p role="status" className="hc-pi-state surface-depth">{t('invoices.loading')}</p>
      ) : shown.length === 0 ? (
        <div className="hc-pi-state surface-depth">
          {rows.length > 0 ? <p>{t('invoices.noMatch')}</p> : (
            <>
              <p><strong>{allMonths ? t('invoices.noneAll') : t('invoices.noneMonth', { month: monthName(month) })}</strong></p>
              {!allMonths && allRows.length > 0 && <Button variant="secondary" onClick={() => setMonth(ALL_MONTHS)}>{t('invoices.showAll', { count: allRows.length })}</Button>}
            </>
          )}
        </div>
      ) : (
        <>
          <label className="hc-pi-selectall">
            <input type="checkbox" className="hc-appr-check" checked={allPicked} onChange={() => setSelected(allPicked ? new Set() : new Set(shownIds))} />
            {t('invoices.selectAll', { count: shownIds.length })}
          </label>
          <div className="hc-pi-list">
            <div className="hc-pi-grid">
              {shown.map(row => (
                <article key={row.booking_id} className={`hc-pi-card surface-depth ${selected.has(row.booking_id) ? 'is-picked' : ''}`}>
                  <label className="hc-pi-pick">
                    <input type="checkbox" className="hc-appr-check" aria-label={t('invoices.select', { name: row.booking_number })} checked={selected.has(row.booking_id)} onChange={() => toggle(row.booking_id)} />
                  </label>
                  <button type="button" className="hc-pi-open" onClick={() => setOpen(row)}>
                    <span className="hc-pi-who">
                      <CustomerAvatar size={44} />
                      <span>
                        <strong><bdi dir="auto">{row.customer_name || '—'}</bdi></strong>
                        <small className="hc-pi-num">{row.booking_number}</small>
                      </span>
                    </span>
                    <span className="hc-pi-car">
                      {row.plate && <PlateChip plate={row.plate} />}
                      <bdi dir="auto">{carName(row)}</bdi>
                    </span>
                    <span className="hc-pi-dates">{formatDay(row.start_date, locale)} – {formatDay(row.end_date, locale)} · {t('invoices.days', { count: row.days })}</span>
                    <span className="hc-pi-money">
                      {isMissingAmount(row) && <span className="hc-pi-noamount">{t('invoices.card.noAmount')}</span>}
                      {hasNoRental(row) && <span className="hc-pi-noamount">{t('invoices.card.noRental')}</span>}
                      <b className="hc-pi-num" dir="ltr">{lira(row.invoice_total)}</b>
                      <small>{t('invoices.card.net')} <bdi dir="ltr" className="hc-pi-num">{lira(row.net_amount)}</bdi> · {t('invoices.card.vat')} <bdi dir="ltr" className="hc-pi-num">{lira(row.vat_amount)}</bdi></small>
                    </span>
                  </button>
                </article>
              ))}
            </div>
          </div>
        </>
      )}

      {picked.length > 0 && (
        <div className="hc-pi-bulk surface-depth surface-float">
          <span>{t('invoices.selected', { count: picked.length })}</span>
          <Button disabled={marking} onClick={() => void mark(picked)}>{marking ? t('invoices.drawer.marking') : t('invoices.bulk')}</Button>
        </div>
      )}

      {open && <InvoiceDrawer invoice={open} marking={marking} onMark={() => void mark([open.booking_id])} onClose={() => setOpen(null)} />}

      {toast && ReactDOM.createPortal(
        <div role="status" className={`hc-pi-toast surface-depth surface-float ${toast.error ? 'is-error' : ''}`}>
          <span>{toast.message}</span>
          {toast.undo && <button type="button" onClick={() => void undo(toast.undo as number[])}>{t('invoices.toast.undo')}</button>}
        </div>,
        document.body,
      )}
    </div>
  );
};

export default PendingInvoicesPage;
