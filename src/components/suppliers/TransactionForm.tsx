import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { parseAmount, type ExpenseCar } from '../../lib/custodyExpense';
import { istanbulDate } from '../../lib/istanbulTime';
import { getActiveCars, uploadCustodyReceipt } from '../../lib/queries/custody';
import { addSupplierTx, getCashAccounts } from '../../lib/queries/suppliers';
import { prepareReceipt, receiptRejection } from '../../lib/receiptImage';
import { accountsFor, SUPPLIER_CURRENCIES, type CashAccount, type Supplier, type SupplierCurrency, type SupplierTx } from '../../lib/suppliers';
import { CURRENCY_SYMBOLS } from '../../lib/CurrencyContext';
import Button from '../Button';
import BookingSheet from '../booking/BookingSheet';
import CarPicker from '../booking/CarPicker';
import { Field, FieldError, FormCard, FormError } from '../booking/FormParts';
import ReceiptField from '../custody/ReceiptField';
import { CategoryIcon } from './parts';

interface TransactionFormProps {
  supplier: Supplier;
  kind: SupplierTx['kind'];
  userId: string;
  onClose: () => void;
  onSaved: () => void;
}

/** A bill we received or a payment we made. Both are in the money they were really in. */
const TransactionForm: React.FC<TransactionFormProps> = ({ supplier, kind, userId, onClose, onSaved }) => {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const { t: tu } = useTranslation('custody');
  const closeRef = useRef<(() => void) | null>(null);
  const today = useMemo(() => istanbulDate(), []);
  const uploaded = useRef<{ file: File; url: string } | null>(null);

  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState<SupplierCurrency>('TRY');
  const [date, setDate] = useState(today);
  const [carId, setCarId] = useState<number | null>(null);
  const [description, setDescription] = useState('');
  const [accountId, setAccountId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [cars, setCars] = useState<ExpenseCar[] | null>(null);
  const [carsFailed, setCarsFailed] = useState(false);
  const [carsAttempt, setCarsAttempt] = useState(0);
  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);

  const parsed = parseAmount(amount);
  const amountInvalid = !!amount && parsed === null;
  const dateInvalid = !/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today;
  const ready = parsed !== null && !dateInvalid && !preparing;
  const dirty = !!amount || carId !== null || !!description || !!accountId || !!file || date !== today || currency !== 'TRY';

  useEffect(() => {
    let cancelled = false;
    setCarsFailed(false);
    getActiveCars()
      .then(data => { if (!cancelled) setCars(data); })
      .catch(() => { if (!cancelled) setCarsFailed(true); });
    return () => { cancelled = true; };
  }, [carsAttempt]);

  useEffect(() => {
    if (kind !== 'payment') return undefined;
    let cancelled = false;
    getCashAccounts().then(data => { if (!cancelled) setAccounts(data); }).catch(() => {});
    return () => { cancelled = true; };
  }, [kind]);

  const usable = useMemo(() => accountsFor(accounts, currency), [accounts, currency]);

  const pickCurrency = (next: SupplierCurrency) => {
    setCurrency(next);
    // A safe that doesn't hold this currency can't have paid in it.
    if (!accountsFor(accounts, next).some(account => String(account.id) === accountId)) setAccountId('');
  };

  const pickReceipt = async (picked: File) => {
    const rejection = receiptRejection(picked);
    if (rejection) { setReceiptError(tu(`expense.errors.${rejection}`)); return; }
    setReceiptError(null);
    setPreparing(true);
    try {
      setFile(await prepareReceipt(picked));
    } catch {
      setReceiptError(tu('expense.errors.receiptUnreadable'));
    }
    setPreparing(false);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || parsed === null || saving) return;
    setSaving(true);
    setFailed(null);
    let step: 'upload' | 'save' = 'upload';
    try {
      let receiptUrl = uploaded.current?.file === file ? uploaded.current?.url ?? null : null;
      if (file && !receiptUrl) {
        setProgress(0);
        receiptUrl = await uploadCustodyReceipt(userId, file, setProgress);
        uploaded.current = { file, url: receiptUrl };
        setProgress(null);
      }
      step = 'save';
      await addSupplierTx({
        supplier_id: supplier.id,
        kind,
        tx_date: date,
        amount: parsed,
        currency,
        car_id: carId,
        description: description.trim() || null,
        receipt_url: receiptUrl,
        paid_from_account_id: kind === 'payment' && accountId ? Number(accountId) : null,
      }, userId);
      onSaved();
    } catch {
      setProgress(null);
      setFailed(t(step === 'upload' ? 'tx.uploadFailed' : 'tx.saveFailed'));
      setSaving(false);
    }
  };

  return (
    <BookingSheet
      title={t(`tx.${kind}Title`)}
      subtitle={supplier.name}
      narrow
      dirty={dirty}
      busy={saving}
      onClose={onClose}
      onSubmit={submit}
      closeRef={closeRef}
      alerts={failed ? <FormError>{failed}</FormError> : undefined}
      footer={(
        <div className="hc-detail-actions">
          <Button variant="secondary" disabled={saving} onClick={() => closeRef.current?.()}>{tc('actions.cancel')}</Button>
          <Button type="submit" disabled={saving || !ready}>{saving ? tc('actions.saving') : t(`tx.${kind}Save`)}</Button>
        </div>
      )}
    >
      <FormCard icon={<CategoryIcon category={supplier.category} />} title={t('tx.section')}>
        <Field label={t('tx.amount')} required>
          <input className="hc-input" dir="ltr" inputMode="decimal" autoComplete="off" value={amount} aria-invalid={amountInvalid} onChange={e => setAmount(e.target.value)} />
          <FieldError>{amountInvalid ? t('tx.amountInvalid') : null}</FieldError>
        </Field>
        <Field label={t('tx.currency')} required>
          <div className="hc-seg hc-seg-full">
            {SUPPLIER_CURRENCIES.map(option => (
              <button key={option} type="button" aria-pressed={currency === option} onClick={() => pickCurrency(option)}>{CURRENCY_SYMBOLS[option]} {option}</button>
            ))}
          </div>
        </Field>
        <Field label={t('tx.date')} required>
          <input className="hc-input" type="date" max={today} value={date} aria-invalid={dateInvalid} onChange={e => setDate(e.target.value)} />
          <FieldError>{date && dateInvalid ? t('tx.dateInvalid') : null}</FieldError>
        </Field>
        {kind === 'payment' && (
          <Field label={t('tx.paidFrom')}>
            <select className="hc-input" value={accountId} onChange={e => setAccountId(e.target.value)}>
              <option value="">{t('tx.noAccount')}</option>
              {usable.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
            </select>
          </Field>
        )}
        <Field label={t('tx.description')} wide>
          <input className="hc-input" maxLength={200} autoComplete="off" value={description} onChange={e => setDescription(e.target.value)} />
        </Field>
        <Field label={t('tx.car')} wide>
          <CarPicker labelId="hc-sup-car" cars={cars} failed={carsFailed} onRetry={() => setCarsAttempt(n => n + 1)} recent={[]} value={carId} onChange={setCarId} disabled={saving} />
        </Field>
        <Field label={t('tx.receipt')} wide>
          <ReceiptField labelId="hc-sup-receipt" file={file} preparing={preparing} progress={progress} disabled={saving} onPick={pickReceipt} onRemove={() => { setFile(null); setReceiptError(null); }} />
          <FieldError>{receiptError}</FieldError>
        </Field>
      </FormCard>
    </BookingSheet>
  );
};

export default TransactionForm;
