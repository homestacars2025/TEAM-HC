import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrency } from '../../lib/CurrencyContext';
import type { Fine } from '../../lib/fines';
import { markFinePaid } from '../../lib/queries/fines';
import Button from '../Button';
import BookingSheet from '../booking/BookingSheet';
import { FormCard, FormError } from '../booking/FormParts';
import PlateChip from '../booking/PlateChip';
import FileDrop from '../forms/FileDrop';
import { FINE_ICONS } from './parts';

/** The only way a fine becomes paid. See `lib/queries/fines.ts` for why. */
const PayFineSheet: React.FC<{ fine: Fine; onClose: () => void; onPaid: () => void }> = ({ fine, onClose, onPaid }) => {
  const { t } = useTranslation('fines');
  const { t: tc } = useTranslation('common');
  const { fmt } = useCurrency();
  const closeRef = useRef<(() => void) | null>(null);
  const submitting = useRef(false);
  const [receipt, setReceipt] = useState<File | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current) return;
    submitting.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await markFinePaid(fine, receipt, setProgress);
      onPaid();
    } catch {
      setFailed(true);
      setProgress(null);
    } finally {
      submitting.current = false;
      setSaving(false);
    }
  };

  return (
    <BookingSheet
      narrow
      title={t('payment.title')}
      subtitle={fine.violation_number ?? undefined}
      alerts={failed ? <FormError>{t('payment.error')}</FormError> : undefined}
      dirty={!!receipt}
      busy={saving}
      onClose={onClose}
      onSubmit={onSubmit}
      closeRef={closeRef}
      footer={(
        <>
          <Button variant="secondary" disabled={saving} onClick={() => closeRef.current?.()}>{tc('actions.cancel')}</Button>
          <Button type="submit" className="hc-bs-primary" disabled={saving}>{saving ? t('payment.confirming') : t('payment.title')}</Button>
        </>
      )}
    >
      <FormCard icon={FINE_ICONS.money} title={t('payment.fineAmount')}>
        <div className="hc-field-wide flex flex-wrap items-center justify-between gap-3">
          <PlateChip plate={fine.plate_number} />
          <strong dir="ltr" className="text-2xl font-semibold text-[#0f1117]">{fmt(Number(fine.amount) || 0)}</strong>
        </div>
      </FormCard>
      <FormCard icon={FINE_ICONS.receipt} title={t('view.paymentReceipt')}>
        <div className="hc-field-wide">
          <FileDrop label={t('payment.receipt')} kind="any" file={receipt} onChange={setReceipt} progress={progress} disabled={saving} />
        </div>
      </FormCard>
    </BookingSheet>
  );
};

export default PayFineSheet;
