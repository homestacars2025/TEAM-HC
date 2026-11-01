import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import Button from '../components/Button';
import { StatTile } from '../components/WalletParts';
import PlateChip from '../components/booking/PlateChip';
import ConfirmDialog from '../components/custody/ConfirmDialog';
import { initialsOf } from '../components/customers/CustomerSearch';
import FineDetail from '../components/fines/FineDetail';
import FineForm from '../components/fines/FineForm';
import PayFineSheet from '../components/fines/PayFineSheet';
import { FINE_ICONS } from '../components/fines/parts';
import Lightbox from '../components/forms/Lightbox';
import { formatDay, useDateLocale } from '../hooks/useDateLocale';
import { useCurrency } from '../lib/CurrencyContext';
import { FINE_SEGMENTS, fineDocuments, fineStats, inSegment, matchesFine, type Fine, type FineSegment } from '../lib/fines';
import { istanbulDate } from '../lib/istanbulTime';
import { deleteFine, getFineCars, getFines, type FineCar } from '../lib/queries/fines';

interface ToastState { message: string; type: 'success' | 'error' }

const Toast: React.FC<ToastState> = ({ message, type }) => ReactDOM.createPortal(
  <div role="status" className={`hc-page-toast ${type === 'error' ? 'is-error' : ''}`}>{message}</div>,
  document.body,
);

type Panel =
  | { type: 'add' }
  | { type: 'edit'; fine: Fine }
  | { type: 'view'; fine: Fine }
  | { type: 'pay'; fine: Fine }
  | { type: 'delete'; fine: Fine }
  | null;

const DOC_ICON = { image: FINE_ICONS.image, pdf: FINE_ICONS.document, receipt: FINE_ICONS.receipt };

const FinesPage: React.FC = () => {
  const { t } = useTranslation('fines');
  const { t: tc } = useTranslation('common');
  const locale = useDateLocale();
  const { fmt } = useCurrency();
  const [fines, setFines] = useState<Fine[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [cars, setCars] = useState<FineCar[] | null>(null);
  const [carsFailed, setCarsFailed] = useState(false);
  const [carsAttempt, setCarsAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [segment, setSegment] = useState<FineSegment>('all');
  const [panel, setPanel] = useState<Panel>(null);
  const [viewing, setViewing] = useState<{ fine: Fine; index: number } | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const fetchFines = useCallback(async () => {
    setFailed(false);
    try {
      setFines(await getFines());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { void fetchFines(); }, [fetchFines]);

  useEffect(() => {
    let active = true;
    setCarsFailed(false);
    getFineCars().then(rows => { if (active) setCars(rows); }).catch(() => { if (active) setCarsFailed(true); });
    return () => { active = false; };
  }, [carsAttempt]);

  const today = useMemo(() => istanbulDate(), []);
  const stats = useMemo(() => fineStats(fines ?? [], today), [fines, today]);
  const carById = useMemo(() => new Map((cars ?? []).map(car => [car.id, car])), [cars]);
  const carFor = (fine: Fine) => (fine.car_id ? carById.get(fine.car_id) : undefined) ?? cars?.find(car => car.plate_number === fine.plate_number);

  const shown = useMemo(
    () => (fines ?? []).filter(fine => inSegment(fine, segment, today) && matchesFine(fine, search)),
    [fines, segment, search, today],
  );

  const loading = fines === null && !failed;
  const amount = (value: number) => (loading ? null : fmt(value));

  const documentsOf = (fine: Fine) => fineDocuments(fine).map(document => ({
    ...document,
    label: t(document.label === 'image' ? 'form.fineImage' : document.label === 'pdf' ? 'form.finePdf' : 'view.paymentReceipt'),
    kind: document.label,
  }));

  const onDelete = async (fine: Fine) => {
    setDeleting(true);
    try {
      await deleteFine(fine.id);
      setPanel(null);
      showToast(t('toast.deleted'));
      void fetchFines();
    } catch {
      showToast(t('delete.failed'), 'error');
    } finally {
      setDeleting(false);
    }
  };

  const open = (fine: Fine) => setPanel({ type: 'view', fine });
  const close = () => setPanel(null);
  const saved = (message: string) => { close(); showToast(message); void fetchFines(); };

  return (
    <div className="hc-records-page">
      <header className="hc-records-head">
        <div className="min-w-0">
          <p className="hc-eyebrow">{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </div>
        <Button onClick={() => setPanel({ type: 'add' })}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          {t('form.addTitle')}
        </Button>
      </header>

      {failed && (
        <div role="alert" className="hc-form-error mb-4 flex flex-wrap items-center justify-between gap-2">
          {t('loadFailed')}
          <Button variant="secondary" onClick={() => void fetchFines()}>{tc('actions.tryAgain')}</Button>
        </div>
      )}

      <div className="hc-tiles hc-tiles-four">
        <StatTile tone="negative" label={t('tiles.unpaid')} value={amount(stats.unpaid.total)} sub={t('tiles.count', { count: stats.unpaid.count })} />
        <StatTile tone="received" label={t('tiles.paid')} value={amount(stats.paid.total)} sub={t('tiles.count', { count: stats.paid.count })} />
        <StatTile tone="balance" label={t('tiles.month')} value={amount(stats.month.total)} sub={t('tiles.count', { count: stats.month.count })} />
        <StatTile
          tone={stats.unassigned > 0 ? 'warn' : 'received'}
          label={t('tiles.linked')}
          value={loading ? null : `${stats.linked}/${(fines ?? []).length}`}
          sub={stats.unassigned > 0 ? t('tiles.unassigned', { count: stats.unassigned }) : t('tiles.allLinked')}
        />
      </div>

      <div className="hc-records-tools">
        <div role="group" aria-label={tc('fields.status')} className="hc-chip-row">
          {FINE_SEGMENTS.map(option => (
            <button key={option} type="button" className="hc-chip" aria-pressed={segment === option} onClick={() => setSegment(option)}>
              {t(`segments.${option}`)}
              <span>{(fines ?? []).filter(fine => inSegment(fine, option, today)).length}</span>
            </button>
          ))}
        </div>
        <input className="hc-input hc-records-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('table.search')} aria-label={t('table.search')} />
      </div>

      {loading ? (
        <div role="status" className="hc-fine-list" aria-label={t('form.loading')}>
          {[0, 1, 2, 3, 4].map(row => <div key={row} className="hc-fine-skeleton" />)}
        </div>
      ) : shown.length === 0 ? (
        <p className="hc-records-empty">{search || segment !== 'all' ? t('table.empty') : t('table.emptyNone')}</p>
      ) : (
        <div className="hc-fine-list">
          {shown.map(fine => {
            const documents = documentsOf(fine);
            const paid = fine.status === 'paid';
            return (
              <article key={fine.id} className="hc-fine-row surface-depth">
                <button type="button" className="hc-row-open" aria-label={`${t('table.view')} ${fine.violation_number ?? fine.plate_number}`} onClick={() => open(fine)} />
                <div className="hc-fine-car">
                  <PlateChip plate={fine.plate_number} />
                  <span dir="auto">{carFor(fine)?.model}</span>
                </div>
                <div className="hc-fine-customer">
                  {fine.customer_name ? (
                    <>
                      <span aria-hidden="true" className="hc-cust-avatar">{initialsOf(fine.customer_name) || '?'}</span>
                      <span dir="auto" className="truncate">{fine.customer_name}</span>
                    </>
                  ) : <span className="hc-issue is-missing">{t('row.noCustomer')}</span>}
                </div>
                <div className="hc-fine-when">
                  <span>{formatDay(fine.violation_date, locale)}{fine.violation_time ? ` · ${fine.violation_time}` : ''}</span>
                  <small dir="auto">{fine.location ?? '—'}</small>
                </div>
                <p dir="auto" className="hc-fine-what">{fine.article || fine.description || fine.violation_number}</p>
                <strong dir="ltr" className="hc-fine-amount">{fmt(Number(fine.amount) || 0)}</strong>
                <span className={`hc-pill ${paid ? 'is-green' : 'is-red'}`}>{t(`status.${fine.status}`)}</span>
                <div className="hc-fine-docs">
                  {documents.map((document, index) => (
                    <button key={document.url} type="button" aria-label={document.label} title={document.label} onClick={() => setViewing({ fine, index })}>
                      {DOC_ICON[document.kind]}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}
      {!loading && <p className="mt-3 text-[13px] text-gray-500">{t('showing', { shown: shown.length, count: (fines ?? []).length })}</p>}

      {panel?.type === 'view' && (
        <FineDetail
          fine={panel.fine}
          car={carFor(panel.fine)}
          onClose={close}
          onPay={() => setPanel({ type: 'pay', fine: panel.fine })}
          onEdit={() => setPanel({ type: 'edit', fine: panel.fine })}
          onDelete={() => setPanel({ type: 'delete', fine: panel.fine })}
        />
      )}
      {panel?.type === 'add' && <FineForm cars={cars} carsFailed={carsFailed} onRetryCars={() => setCarsAttempt(n => n + 1)} onClose={close} onSaved={() => saved(t('toast.added'))} />}
      {panel?.type === 'edit' && <FineForm fine={panel.fine} cars={cars} carsFailed={carsFailed} onRetryCars={() => setCarsAttempt(n => n + 1)} onClose={close} onSaved={() => saved(t('toast.updated'))} />}
      {panel?.type === 'pay' && <PayFineSheet fine={panel.fine} onClose={close} onPaid={() => saved(t('toast.paid'))} />}
      {panel?.type === 'delete' && (
        <ConfirmDialog
          title={t('delete.title')}
          body={t('delete.body', { number: panel.fine.violation_number ?? '—', plate: panel.fine.plate_number })}
          confirmLabel={deleting ? t('delete.deleting') : tc('actions.delete')}
          cancelLabel={tc('actions.cancel')}
          busy={deleting}
          onConfirm={() => void onDelete(panel.fine)}
          onCancel={close}
        />
      )}
      {viewing && (
        <Lightbox items={documentsOf(viewing.fine)} start={viewing.index} onClose={() => setViewing(null)} />
      )}
      {toast && <Toast {...toast} />}
    </div>
  );
};

export default FinesPage;
