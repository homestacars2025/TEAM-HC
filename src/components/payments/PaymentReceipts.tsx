import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import type { PaymentReceipt } from '../../lib/payments';
import { formatMoney } from '../../lib/suppliers';
import PlateChip from '../booking/PlateChip';
import Button from '../Button';

const CopyMark: React.FC<{ done: boolean }> = ({ done }) => (done ? (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /></svg>
) : (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><rect x="9" y="9" width="11" height="11" rx="2.5" stroke="currentColor" strokeWidth="2" /><path d="M15 5.5A1.5 1.5 0 0 0 13.5 4h-8A1.5 1.5 0 0 0 4 5.5v8A1.5 1.5 0 0 0 5.5 15" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
));

/**
 * After cash: everything that goes on the envelope. It can't be dismissed, because until
 * the envelope is written the money in the safe has nothing tying it to this booking.
 */
const PaymentReceipts: React.FC<{ receipts: PaymentReceipt[]; onClose: () => void }> = ({ receipts, onClose }) => {
  const { t } = useTranslation('finance');
  const locale = useDateLocale();
  const dialog = useRef<HTMLDivElement>(null);
  const done = useRef<HTMLButtonElement>(null);
  const [index, setIndex] = useState(0);
  const [copied, setCopied] = useState<string | null>(null);
  const receipt = receipts[index];

  useEffect(() => { done.current?.focus(); }, [index]);

  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(key);
    } catch {
      setCopied(null);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const stops = Array.from(dialog.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
    const edge = e.shiftKey ? stops[0] : stops[stops.length - 1];
    if (document.activeElement !== edge) return;
    e.preventDefault();
    (e.shiftKey ? stops[stops.length - 1] : stops[0])?.focus();
  };

  const fields = [
    { key: 'plate', value: receipt.plate },
    { key: 'customer', value: receipt.customer },
    { key: 'booking', value: receipt.booking_number },
    { key: 'date', value: `${formatDay(receipt.date.slice(0, 10), locale)} ${receipt.date.slice(11)}` },
    { key: 'amount', value: formatMoney(Number(receipt.amount), receipt.currency) },
    { key: 'safe', value: receipt.safe },
  ];
  const label = (key: string) => t(`payment.fields.${key}`);
  const allText = [`${label('ref')}: ${receipt.ref}`, ...fields.filter(field => field.value).map(field => `${label(field.key)}: ${field.value}`)].join('\n');

  const next = () => {
    setCopied(null);
    if (index < receipts.length - 1) setIndex(index + 1);
    else onClose();
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9200] flex items-center justify-center bg-[rgba(15,17,23,0.45)] p-4">
      <div ref={dialog} role="alertdialog" aria-modal="true" aria-label={t('payment.envelopeTitle')} className="hc-env surface-depth surface-float" onKeyDown={onKeyDown}>
        <h2>{t('payment.envelopeTitle')}</h2>
        {receipts.length > 1 && <p className="hc-env-step">{t('payment.envelopeStep', { current: index + 1, total: receipts.length })}</p>}
        <div className="hc-env-ref">
          <p dir="ltr">{receipt.ref}</p>
          <button type="button" aria-label={t('payment.copyField', { field: label('ref') })} onClick={() => void copy('ref', receipt.ref)}><CopyMark done={copied === 'ref'} /></button>
        </div>
        <p className="hc-env-write">{t('payment.writeIt', { safe: `\u2068${receipt.safe}\u2069` })}</p>
        <dl className="hc-env-fields">
          {fields.map(field => (
            <div key={field.key}>
              <dt>{label(field.key)}</dt>
              <dd>
                {field.key === 'plate' && field.value ? <PlateChip plate={field.value} /> : <bdi dir={field.key === 'amount' ? 'ltr' : 'auto'}>{field.value || '—'}</bdi>}
              </dd>
              {field.value && (
                <button type="button" aria-label={t('payment.copyField', { field: label(field.key) })} onClick={() => void copy(field.key, field.value as string)}><CopyMark done={copied === field.key} /></button>
              )}
            </div>
          ))}
        </dl>
        <Button variant="secondary" onClick={() => void copy('all', allText)}>{copied === 'all' ? t('payment.copied') : t('payment.copyAll')}</Button>
        <Button ref={done} onClick={next}>{t('payment.wroteIt')}</Button>
      </div>
    </div>,
    document.body,
  );
};

export default PaymentReceipts;
