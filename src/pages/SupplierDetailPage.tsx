import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import Button from '../components/Button';
import PlateChip from '../components/booking/PlateChip';
import ReasonDialog from '../components/custody/ReasonDialog';
import { CategoryChip, ContactLinks } from '../components/suppliers/parts';
import SupplierForm from '../components/suppliers/SupplierForm';
import TransactionForm from '../components/suppliers/TransactionForm';
import { ReceiptThumb, selectClass } from '../components/WalletParts';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { formatDay, useDateLocale } from '../hooks/useDateLocale';
import { downloadCsv } from '../lib/csv';
import { getSupplier, getSupplierLedger, voidSupplierTx } from '../lib/queries/suppliers';
import { formatMoney, ledgerTotals, withRunning, type Supplier, type SupplierTx, type SupplierTxWithRunning } from '../lib/suppliers';
import { ReceiptLightbox } from './AccountingPage';

const SupplierDetailPage: React.FC = () => {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const locale = useDateLocale();
  const { userId } = useCurrentUser();
  const { id } = useParams();
  const supplierId = Number(id);

  const [supplier, setSupplier] = useState<Supplier | null | undefined>(undefined);
  const [ledger, setLedger] = useState<SupplierTx[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [month, setMonth] = useState('all');
  const [car, setCar] = useState('all');
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState<SupplierTx['kind'] | null>(null);
  const [voiding, setVoiding] = useState<SupplierTx | null>(null);
  const [voidBusy, setVoidBusy] = useState(false);
  const [voidError, setVoidError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [toast, setToast] = useState<{ text: string; failed: boolean } | null>(null);
  const toastTimer = useRef(0);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    Promise.all([getSupplier(supplierId), getSupplierLedger(supplierId)])
      .then(([found, rows]) => {
        if (cancelled) return;
        setSupplier(found);
        setLedger(rows);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [supplierId, attempt]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const showToast = useCallback((text: string, bad = false) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, failed: bad });
    toastTimer.current = window.setTimeout(() => setToast(null), 3200);
  }, []);

  const reload = useCallback(() => getSupplierLedger(supplierId).then(setLedger).catch(() => setFailed(true)), [supplierId]);

  // Worked out over everything first, so a filtered row still shows the true balance then.
  const running = useMemo(() => withRunning(ledger), [ledger]);
  const shown = useMemo(() => running
    .filter(row => month === 'all' || row.tx_date.startsWith(month))
    .filter(row => car === 'all' || String(row.car_id) === car)
    .reverse(), [running, month, car]);
  const totals = useMemo(() => ledgerTotals(shown), [shown]);

  const months = useMemo(() => Array.from(new Set(ledger.map(row => row.tx_date.slice(0, 7)))).sort().reverse(), [ledger]);
  const cars = useMemo(() => {
    const plates = new Map<number, string>();
    ledger.forEach(row => { if (row.car_id !== null && row.car) plates.set(row.car_id, row.car.plate_number); });
    return Array.from(plates, ([carId, plate]) => ({ id: carId, plate })).sort((a, b) => a.plate.localeCompare(b.plate, 'en', { numeric: true }));
  }, [ledger]);

  const monthLabel = (key: string) => new Date(`${key}-15T12:00:00Z`).toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });

  const confirmVoid = async (reason: string) => {
    if (!voiding) return;
    setVoidBusy(true);
    setVoidError(null);
    try {
      await voidSupplierTx(voiding.id, reason);
      setVoiding(null);
      showToast(t('ledger.voided'));
      await reload();
    } catch {
      setVoidError(t('ledger.voidFailed'));
    }
    setVoidBusy(false);
  };

  const exportCsv = () => {
    if (!supplier) return;
    downloadCsv(`supplier-${supplier.name}`, [
      [t('ledger.date'), t('ledger.type'), t('ledger.car'), t('ledger.description'), t('ledger.amount'), t('tx.currency'), t('ledger.running'), t('tx.paidFrom'), t('ledger.status')],
      ...shown.map(row => [
        row.tx_date, t(`ledger.${row.kind}`), row.car?.plate_number ?? null, row.description, row.amount, row.currency, row.running,
        row.account?.name ?? null, row.voided_at ? `${t('ledger.void')}: ${row.void_reason ?? ''}` : null,
      ]),
    ]);
  };

  const onTxSaved = (kind: SupplierTx['kind']) => {
    setAdding(null);
    showToast(t(`tx.${kind}Saved`));
    void reload();
  };

  if (failed) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <p role="alert" className="text-sm text-gray-600">{t('ledger.loadFailed')}</p>
        <Button onClick={() => setAttempt(n => n + 1)}>{tc('actions.tryAgain')}</Button>
      </div>
    );
  }

  if (supplier === null) {
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm text-gray-600">{t('ledger.notFound')}</p>
        <Link to="/dashboard/suppliers" className="font-semibold text-[var(--accent-strong)]">{t('ledger.back')}</Link>
      </div>
    );
  }

  const filtered = month !== 'all' || car !== 'all';
  const money = (row: SupplierTxWithRunning) => <bdi dir="ltr">{row.kind === 'bill' ? '+' : '−'}{formatMoney(row.amount, row.currency)}</bdi>;

  return (
    <div className="hc-records-page">
      <Link to="/dashboard/suppliers" className="hc-sup-back">
        <svg className="hc-trk-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        {t('ledger.back')}
      </Link>

      <header className="hc-records-head">
        <div className="min-w-0">
          {supplier ? (
            <>
              <h1 dir="auto">{supplier.name}</h1>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <CategoryChip category={supplier.category} />
                {!supplier.is_active && <span className="hc-pill is-red">{t('suppliers.inactive')}</span>}
                <ContactLinks supplier={supplier} />
              </div>
              {supplier.contact_person && <p dir="auto">{supplier.contact_person}</p>}
              {supplier.iban && <p dir="ltr" className="text-start">{[supplier.bank_name, supplier.iban].filter(Boolean).join(' · ')}</p>}
            </>
          ) : <div className="h-16 w-56 animate-pulse rounded-lg bg-black/[0.05]" />}
        </div>
        {supplier && (
          <div className="hc-sup-head-actions">
            <Button variant="secondary" onClick={() => setEditing(true)}>{tc('actions.edit')}</Button>
            <Button variant="secondary" disabled={shown.length === 0} onClick={exportCsv}>{t('ledger.export')}</Button>
            <Button variant="secondary" onClick={() => setAdding('payment')}>{t('ledger.addPayment')}</Button>
            <Button onClick={() => setAdding('bill')}>{t('ledger.addBill')}</Button>
          </div>
        )}
      </header>

      <section className="hc-sup-totals" aria-label={t('ledger.totals')}>
        {totals.length === 0 ? (
          <div className="hc-sup-total surface-depth"><span>{t('ledger.balance')}</span><strong><bdi dir="ltr">{formatMoney(0, 'TRY')}</bdi></strong></div>
        ) : totals.map(row => (
          <div key={row.currency} className="hc-sup-total surface-depth">
            <span>{filtered ? t('ledger.balanceFiltered') : t('ledger.balance')}</span>
            <strong className={row.balance > 0 ? 'is-owed' : undefined}><bdi dir="ltr">{formatMoney(row.balance, row.currency)}</bdi></strong>
            <small>{t('ledger.billsPaid', { bills: formatMoney(row.bills, row.currency), paid: formatMoney(row.paid, row.currency) })}</small>
          </div>
        ))}
      </section>

      <div className="hc-records-tools">
        <div className="hc-records-row">
          <select className={selectClass} value={month} aria-label={t('ledger.month')} onChange={e => setMonth(e.target.value)}>
            <option value="all">{t('ledger.allMonths')}</option>
            {months.map(key => <option key={key} value={key}>{monthLabel(key)}</option>)}
          </select>
          <select className={selectClass} value={car} aria-label={t('ledger.car')} onChange={e => setCar(e.target.value)}>
            <option value="all">{t('ledger.allCars')}</option>
            {cars.map(item => <option key={item.id} value={item.id}>{item.plate}</option>)}
          </select>
        </div>
      </div>

      {supplier === undefined ? (
        <div role="status" aria-label={t('review.loading')} className="hc-fine-list">
          {[0, 1, 2].map(row => <div key={row} className="hc-fine-skeleton" />)}
        </div>
      ) : shown.length === 0 ? (
        <p className="hc-records-empty">{ledger.length === 0 ? t('ledger.empty') : t('ledger.noMatch')}</p>
      ) : (
        <div className="hc-sup-ledger">
          <table>
            <thead>
              <tr>
                <th scope="col">{t('ledger.date')}</th>
                <th scope="col">{t('ledger.type')}</th>
                <th scope="col">{t('ledger.car')}</th>
                <th scope="col">{t('ledger.description')}</th>
                <th scope="col">{t('tx.paidFrom')}</th>
                <th scope="col" className="is-num">{t('ledger.amount')}</th>
                <th scope="col" className="is-num">{t('ledger.running')}</th>
                <th scope="col">{t('ledger.receipt')}</th>
                <th scope="col"><span className="sr-only">{t('ledger.actions')}</span></th>
              </tr>
            </thead>
            <tbody>
              {shown.map(row => (
                <tr key={row.id} className={`surface-depth ${row.voided_at ? 'is-void' : ''}`}>
                  <td className="hc-sup-cell-date">{formatDay(row.tx_date, locale)}</td>
                  <td className="hc-sup-cell-type">
                    <span className={`hc-pill ${row.kind === 'bill' ? 'is-amber' : 'is-green'}`}>{t(`ledger.${row.kind}`)}</span>
                    {row.custody_expense_id !== null && <small>{t('ledger.fromCustody')}</small>}
                  </td>
                  <td data-label={t('ledger.car')} className="hc-sup-cell-car">{row.car ? <PlateChip plate={row.car.plate_number} /> : '—'}</td>
                  <td data-label={t('ledger.description')} className="hc-sup-cell-desc" dir="auto">
                    {row.description || '—'}
                    {row.voided_at && <span className="hc-sup-void-reason">{t('ledger.voidReason', { reason: row.void_reason ?? '' })}</span>}
                  </td>
                  <td data-label={t('tx.paidFrom')}>{row.account?.name ?? '—'}</td>
                  <td data-label={t('ledger.amount')} className={`is-num hc-sup-cell-amount ${row.kind === 'bill' ? 'is-bill' : 'is-paid'}`}>{money(row)}</td>
                  <td data-label={t('ledger.running')} className="is-num">{row.running === null ? '—' : <bdi dir="ltr">{formatMoney(row.running, row.currency)}</bdi>}</td>
                  <td className="hc-sup-cell-receipt"><ReceiptThumb url={row.receipt_url} label={t('ledger.receipt')} onOpen={setReceipt} /></td>
                  <td className="hc-sup-cell-actions">
                    {/* A custody row is undone by undoing the approval, which also fixes the car sheet. */}
                    {!row.voided_at && row.custody_expense_id === null && (
                      <button type="button" className="hc-sup-void" onClick={() => { setVoidError(null); setVoiding(row); }}>{t('ledger.void')}</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && supplier && (
        <SupplierForm supplier={supplier} userId={userId} onClose={() => setEditing(false)} onSaved={saved => { setSupplier(saved); setEditing(false); showToast(t('form.saved')); }} />
      )}
      {adding && supplier && userId && (
        <TransactionForm supplier={supplier} kind={adding} userId={userId} onClose={() => setAdding(null)} onSaved={() => onTxSaved(adding)} />
      )}
      {voiding && (
        <ReasonDialog
          title={t('ledger.voidTitle')}
          body={t('ledger.voidBody', { amount: formatMoney(voiding.amount, voiding.currency) })}
          label={t('ledger.voidLabel')}
          confirmLabel={t('ledger.void')}
          busy={voidBusy}
          error={voidError}
          onConfirm={reason => void confirmVoid(reason)}
          onCancel={() => setVoiding(null)}
        />
      )}
      {receipt && <ReceiptLightbox url={receipt} onClose={() => setReceipt(null)} />}
      {toast && ReactDOM.createPortal(<div role="status" className={`hc-page-toast ${toast.failed ? 'is-error' : ''}`}>{toast.text}</div>, document.body)}
    </div>
  );
};

export default SupplierDetailPage;
