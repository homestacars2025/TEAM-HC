import React, { useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { usePageAccess } from '../../contexts/PageAccessContext';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { carName, dottedDate, hasNoRental, idTypeKey, invoiceTable, isMissingAmount, lineLabel, linesDisagree, linesTotal, type PendingInvoice } from '../../lib/pendingInvoices';
import { formatMoney } from '../../lib/suppliers';
import BookingSheet from '../booking/BookingSheet';
import Button from '../Button';
import CopyButton, { useCopy } from '../CopyButton';
import CustomerAvatar from '../CustomerAvatar';
import PlateChip from '../booking/PlateChip';

const lira = (amount: number) => formatMoney(amount, 'TRY');
/** Keeps the ₺ on the left of the figure inside an Arabic sentence. */
const isolated = (amount: number) => `\u2066${lira(amount)}\u2069`;

interface Field {
  label: string;
  value: string | null;
  /** What goes on the clipboard, when it differs from what is shown. */
  copy?: string;
  mono?: boolean;
  /** Customer details are owed to the invoice, so a gap is called out. */
  required?: boolean;
}

interface InvoiceDrawerProps {
  invoice: PendingInvoice;
  marking: boolean;
  onMark: () => void;
  onClose: () => void;
}

/** Everything needed to raise the invoice, without leaving the page. */
const InvoiceDrawer: React.FC<InvoiceDrawerProps> = ({ invoice, marking, onMark, onClose }) => {
  const { t } = useTranslation('finance');
  const locale = useDateLocale();
  const { canAccessPage } = usePageAccess();
  const closeRef = useRef<(() => void) | null>(null);
  const [textCopied, copyText] = useCopy();
  const [tableCopied, copyTable] = useCopy();

  const idType = idTypeKey(invoice.id_type);
  const period = `${formatDay(invoice.start_date, locale)} – ${formatDay(invoice.end_date, locale)}`;
  const car = carName(invoice);
  const editLink = `/dashboard/bookings?month=${invoice.start_date.slice(0, 7)}&edit=${invoice.booking_id}`;

  const customer: Field[] = [
    { label: t('invoices.drawer.name'), value: invoice.customer_name || null, required: true },
    { label: t('invoices.drawer.nationality'), value: invoice.nationality, required: true },
    { label: idType ? t(`invoices.idTypes.${idType}`) : t('invoices.drawer.idNumber'), value: invoice.id_number, mono: true, required: true },
    { label: t('invoices.drawer.birthDate'), value: invoice.birth_date ? formatDay(invoice.birth_date, locale) : null, copy: dottedDate(invoice.birth_date), required: true },
    { label: t('invoices.drawer.phone'), value: invoice.phone, mono: true, required: true },
    { label: t('invoices.drawer.email'), value: invoice.email, required: true },
    { label: t('invoices.drawer.address'), value: invoice.address, required: true },
  ];
  const service: Field[] = [
    { label: t('invoices.drawer.car'), value: car || null },
    { label: t('invoices.drawer.period'), value: period, copy: `${dottedDate(invoice.start_date)} - ${dottedDate(invoice.end_date)}` },
    { label: t('invoices.drawer.days'), value: String(invoice.days), mono: true },
    { label: t('invoices.drawer.booking'), value: invoice.booking_number, mono: true },
  ];

  const table = invoiceTable([
    ...[...customer, ...service].map((field): [string, string | null] => [field.label, field.copy ?? field.value]),
    [t('invoices.drawer.plate'), invoice.plate],
    ...invoice.lines.map((line): [string, number] => [lineLabel(line), line.amount]),
    [t('invoices.card.net'), invoice.net_amount],
    [t('invoices.drawer.vat'), invoice.vat_amount],
    [t('invoices.drawer.total'), invoice.invoice_total],
  ]);

  const row = (field: Field) => (
    <div key={field.label} className="hc-pi-field">
      <dt>{field.label}</dt>
      {field.value ? (
        <dd className={field.mono ? 'hc-pi-num' : undefined}><bdi dir="auto">{field.value}</bdi></dd>
      ) : field.required ? (
        <dd className="hc-pi-missing">
          {canAccessPage('bookings') ? <Link to={editLink}>{t('invoices.drawer.missing')}</Link> : t('invoices.drawer.missing')}
        </dd>
      ) : <dd>—</dd>}
      {field.value && <CopyButton text={field.copy ?? field.value} label={t('invoices.drawer.copyField', { field: field.label })} className="hc-pi-copy" />}
    </div>
  );

  return (
    <BookingSheet
      title={t('invoices.drawer.title')}
      subtitle={invoice.customer_name}
      chip={<span className="hc-pi-chip hc-pi-num">{invoice.booking_number}</span>}
      narrow
      dirty={false}
      busy={marking}
      closeRef={closeRef}
      onClose={onClose}
      onSubmit={e => e.preventDefault()}
      summary={(
        <div className="hc-pi-copybar">
          <Button onClick={() => void copyText(invoice.invoice_text)}>{textCopied ? t('invoices.drawer.copied') : t('invoices.drawer.copyText')}</Button>
          <Button variant="secondary" onClick={() => void copyTable(table)}>{tableCopied ? t('invoices.drawer.copied') : t('invoices.drawer.copyTable')}</Button>
        </div>
      )}
      footer={(
        <>
          <Button variant="secondary" disabled={marking} onClick={() => closeRef.current?.()}>{t('invoices.drawer.close')}</Button>
          <Button className="hc-bs-primary" disabled={marking} onClick={onMark}>{marking ? t('invoices.drawer.marking') : t('invoices.drawer.mark')}</Button>
        </>
      )}
    >
      {linesDisagree(invoice) ? (
        <p role="alert" className="hc-pi-warn">{t('invoices.drawer.linesOff', { lines: isolated(linesTotal(invoice)), total: isolated(invoice.invoice_total) })}</p>
      ) : hasNoRental(invoice) ? (
        <p role="alert" className="hc-pi-warn">{t('invoices.drawer.noRental')}</p>
      ) : isMissingAmount(invoice) && <p role="alert" className="hc-pi-warn">{t('invoices.drawer.zero')}</p>}

      <section className="hc-pi-block surface-depth">
        <h3><CustomerAvatar size={32} />{t('invoices.drawer.customer')}</h3>
        <dl>{customer.map(row)}</dl>
      </section>

      <section className="hc-pi-block surface-depth">
        <h3>{t('invoices.drawer.service')}</h3>
        {invoice.plate && (
          <div className="hc-pi-field">
            <dt>{t('invoices.drawer.plate')}</dt>
            <dd><PlateChip plate={invoice.plate} /></dd>
            <CopyButton text={invoice.plate} label={t('invoices.drawer.copyField', { field: t('invoices.drawer.plate') })} className="hc-pi-copy" />
          </div>
        )}
        <dl>{service.map(row)}</dl>
      </section>

      <section className="hc-pi-block surface-depth">
        <h3>{t('invoices.drawer.lines')}</h3>
        {invoice.lines.length === 0 ? <p className="hc-pi-empty-line">{t('invoices.drawer.noLines')}</p> : (
          <ul className="hc-pi-lines">
            {invoice.lines.map((line, index) => (
              // eslint-disable-next-line react/no-array-index-key
              <li key={index}>
                <span>
                  <bdi dir="auto">{lineLabel(line)}</bdi>
                  <small>{formatDay(line.date, locale)}</small>
                </span>
                <b className="hc-pi-num" dir="ltr">{lira(line.amount)}</b>
              </li>
            ))}
          </ul>
        )}
        <dl className="hc-pi-sums">
          <div><dt>{t('invoices.card.net')}</dt><dd className="hc-pi-num" dir="ltr">{lira(invoice.net_amount)}</dd></div>
          <div><dt>{t('invoices.drawer.vat')}</dt><dd className="hc-pi-num" dir="ltr">{lira(invoice.vat_amount)}</dd></div>
          <div className="is-total"><dt>{t('invoices.drawer.total')}</dt><dd className="hc-pi-num" dir="ltr">{lira(invoice.invoice_total)}</dd></div>
        </dl>
        <p className="hc-pi-paid">{t('invoices.drawer.paid')} <bdi dir="ltr" className="hc-pi-num">{lira(invoice.paid_total)}</bdi> / <bdi dir="ltr" className="hc-pi-num">{lira(invoice.invoice_total)}</bdi></p>
      </section>
    </BookingSheet>
  );
};

export default InvoiceDrawer;
