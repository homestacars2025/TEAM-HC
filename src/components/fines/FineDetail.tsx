import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { useCurrency } from '../../lib/CurrencyContext';
import { fineDocuments, type Fine } from '../../lib/fines';
import type { FineCar } from '../../lib/queries/fines';
import Button from '../Button';
import BookingSheet from '../booking/BookingSheet';
import { FormCard } from '../booking/FormParts';
import PlateChip from '../booking/PlateChip';
import { PdfBadge } from '../forms/FileDrop';
import Lightbox, { isPdfLink } from '../forms/Lightbox';
import { FINE_ICONS } from './parts';

interface FineDetailProps {
  fine: Fine;
  car?: FineCar;
  onClose: () => void;
  onPay: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

const FineDetail: React.FC<FineDetailProps> = ({ fine, car, onClose, onPay, onEdit, onDelete }) => {
  const { t } = useTranslation('fines');
  const { t: tc } = useTranslation('common');
  const locale = useDateLocale();
  const { fmt } = useCurrency();
  const closeRef = useRef<(() => void) | null>(null);
  const [viewing, setViewing] = useState<number | null>(null);

  const documents = fineDocuments(fine).map(document => ({
    url: document.url,
    label: t(document.label === 'image' ? 'form.fineImage' : document.label === 'pdf' ? 'form.finePdf' : 'view.paymentReceipt'),
  }));
  const paid = fine.status === 'paid';
  const lead = documents[0];

  const rows: [string, React.ReactNode][] = [
    [t('form.violationNumber'), <bdi dir="ltr">{fine.violation_number ?? '—'}</bdi>],
    [t('form.violationCode'), <bdi dir="ltr">{fine.violation_code ?? '—'}</bdi>],
    [tc('fields.car'), <span className="inline-flex flex-wrap items-center justify-end gap-2"><PlateChip plate={fine.plate_number} />{car?.model}</span>],
    [tc('fields.customer'), fine.customer_name || <span className="hc-issue is-missing">{t('row.noCustomer')}</span>],
    [t('table.amount'), <bdi dir="ltr">{fmt(Number(fine.amount) || 0)}</bdi>],
    [t('form.violationDate'), `${formatDay(fine.violation_date, locale)}${fine.violation_time ? ` · ${fine.violation_time}` : ''}`],
    [t('table.location'), fine.location ?? '—'],
    [t('form.article'), fine.article ?? '—'],
    [tc('fields.description'), fine.description ?? '—'],
  ];

  const steps = [
    { key: 'violation', done: !!fine.violation_date, note: formatDay(fine.violation_date, locale) },
    { key: 'notified', done: !!fine.notification_date, note: fine.notification_date ? formatDay(fine.notification_date, locale) : t('detail.notRecorded') },
    { key: 'paid', done: paid, note: paid ? t('status.paid') : t('status.unpaid') },
  ];

  return (
    <>
      <BookingSheet
        narrow
        title={t('detail.title')}
        subtitle={fine.violation_number ?? undefined}
        chip={<span className={`hc-pill ${paid ? 'is-green' : 'is-red'}`}>{t(`status.${fine.status}`)}</span>}
        dirty={false}
        busy={false}
        onClose={onClose}
        onSubmit={e => e.preventDefault()}
        closeRef={closeRef}
        footer={(
          <div className="hc-detail-actions">
            <Button variant="destructive" onClick={onDelete}>{tc('actions.delete')}</Button>
            <Button variant="secondary" onClick={onEdit}>{fine.customer_id ? tc('actions.edit') : t('detail.linkCustomer')}</Button>
            {!paid && <Button onClick={onPay}>{t('table.markPaid')}</Button>}
          </div>
        )}
      >
        {lead ? (
          <button type="button" className="hc-doc-lead" onClick={() => setViewing(0)} aria-label={lead.label}>
            {isPdfLink(lead.url) ? <span className="hc-doc-lead-pdf"><PdfBadge />{lead.label}</span> : <img src={lead.url} alt="" />}
          </button>
        ) : <p className="hc-doc-empty">{t('detail.noDocuments')}</p>}

        {documents.length > 1 && (
          <div className="hc-doc-strip">
            {documents.map((document, index) => (
              <button key={document.url} type="button" onClick={() => setViewing(index)}>
                {isPdfLink(document.url) ? <PdfBadge /> : <img src={document.url} alt="" />}
                <span>{document.label}</span>
              </button>
            ))}
          </div>
        )}

        <FormCard icon={FINE_ICONS.fine} title={t('form.sectionViolation')}>
          <dl className="hc-review hc-field-wide">
            {rows.map(([label, value], index) => <div key={index}><dt>{label}</dt><dd dir="auto">{value}</dd></div>)}
          </dl>
        </FormCard>

        <FormCard icon={FINE_ICONS.timeline} title={t('detail.timeline')}>
          <ol className="hc-steps-line hc-field-wide">
            {steps.map(step => (
              <li key={step.key} className={step.done ? 'is-done' : undefined}>
                <strong>{t(`detail.step.${step.key}`)}</strong>
                <span>{step.note}</span>
              </li>
            ))}
          </ol>
        </FormCard>
      </BookingSheet>
      {viewing !== null && <Lightbox items={documents} start={viewing} onClose={() => setViewing(null)} />}
    </>
  );
};

export default FineDetail;
