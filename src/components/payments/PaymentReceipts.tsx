import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { PaymentReceipt } from '../../lib/payments';
import { formatMoney } from '../../lib/suppliers';
import PlateChip from '../booking/PlateChip';
import Button from '../Button';

/** After cash: the number that goes on the envelope, big enough to copy down from across a desk. */
const PaymentReceipts: React.FC<{ receipts: PaymentReceipt[]; onClose: () => void }> = ({ receipts, onClose }) => {
  const { t } = useTranslation('finance');
  const done = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => { done.current?.focus(); }, []);

  const copy = async (ref: string) => {
    try {
      await navigator.clipboard.writeText(ref);
      setCopied(ref);
    } catch {
      setCopied(null);
    }
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9200] flex items-center justify-center bg-[rgba(15,17,23,0.45)] p-4" onKeyDown={e => { if (e.key === 'Escape') onClose(); }}>
      <div role="dialog" aria-modal="true" aria-label={t('payment.envelopeTitle')} className="hc-pay-done surface-depth surface-float">
        <h2>{t('payment.envelopeTitle')}</h2>
        {receipts.map(receipt => (
          <section key={receipt.ref}>
            <p className="hc-pay-ref" dir="ltr">{receipt.ref}</p>
            <p className="hc-pay-sum"><bdi dir="ltr">{formatMoney(receipt.amount, receipt.currency)}</bdi></p>
            <div className="hc-pay-who">
              {receipt.plate && <PlateChip plate={receipt.plate} />}
              {receipt.customer && <span dir="auto">{receipt.customer}</span>}
            </div>
            <Button variant="secondary" onClick={() => void copy(receipt.ref)}>{copied === receipt.ref ? t('payment.copied') : t('payment.copy')}</Button>
          </section>
        ))}
        <p className="hc-pay-write">{t('payment.writeIt')}</p>
        <Button ref={done} onClick={onClose}>{t('payment.done')}</Button>
      </div>
    </div>,
    document.body,
  );
};

export default PaymentReceipts;
