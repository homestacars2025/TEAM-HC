import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatTRY } from '../../lib/CurrencyContext';
import {
  EXPENSE_CATEGORIES, expenseErrorKey, expenseProblems, parseAmount, recentCars,
  type ExpenseCar, type ExpenseScope,
} from '../../lib/custodyExpense';
import { istanbulDate } from '../../lib/istanbulTime';
import { addCustodyExpense, getActiveCars, uploadCustodyReceipt, type CustodyMovement } from '../../lib/queries/custody';
import { prepareReceipt, receiptRejection } from '../../lib/receiptImage';
import { addDays } from '../../lib/taskGroups';
import Button from '../Button';
import CarPicker from '../booking/CarPicker';
import { usePageAccess } from '../../contexts/PageAccessContext';
import type { SupplierOption } from '../../lib/suppliers';
import ConfirmDialog from './ConfirmDialog';
import ReceiptField from './ReceiptField';
import SupplierPicker from './SupplierPicker';

type DateMode = 'today' | 'yesterday' | 'other';
type Stage = 'idle' | 'uploading' | 'saving';

const FOCUSABLE = 'button:not(:disabled), input:not(:disabled):not([type="file"]), select:not(:disabled)';

const textInput = 'h-12 w-full rounded-xl border border-[var(--border-subtle)] bg-[var(--surface)] px-3 text-base text-[#0f1117] outline-none transition-colors focus:border-[var(--accent)] sm:text-sm';
const fieldError = 'mt-1.5 text-[13px] text-red-600';

const Field: React.FC<{ id: string; label: string; children: React.ReactNode }> = ({ id, label, children }) => (
  <div>
    <div id={id} className="mb-2 text-[13px] font-semibold text-gray-700">{label}</div>
    {children}
  </div>
);

interface ChoiceProps {
  name: string;
  checked: boolean;
  disabled: boolean;
  onChange: () => void;
  children: React.ReactNode;
  className: string;
}

/** A real radio, so arrow keys and screen readers work with no extra code. */
const Choice: React.FC<ChoiceProps> = ({ name, checked, disabled, onChange, children, className }) => (
  <label className="relative cursor-pointer">
    <input type="radio" name={name} checked={checked} disabled={disabled} onChange={onChange} className="peer sr-only" />
    <span className={`flex items-center justify-center border text-center transition-colors peer-focus-visible:outline peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-[var(--accent-strong)] ${checked ? 'border-[var(--accent)] bg-[var(--accent-soft)] font-semibold text-[var(--accent-strong)]' : 'border-[var(--border-subtle)] text-gray-700 hover:bg-black/[0.03]'} ${className}`}>
      {children}
    </span>
  </label>
);

interface AddExpenseSheetProps {
  userId: string;
  balance: number;
  rows: CustodyMovement[];
  onClose: () => void;
  onSaved: (row: CustodyMovement) => void;
}

const AddExpenseSheet: React.FC<AddExpenseSheetProps> = ({ userId, balance, rows, onClose, onSaved }) => {
  const { t } = useTranslation('custody');
  const { t: tc } = useTranslation('common');
  const { t: tf } = useTranslation('finance');
  const { canAccessPage } = usePageAccess();
  const baseId = useId();
  const dialogRef = useRef<HTMLFormElement>(null);
  const amountRef = useRef<HTMLInputElement>(null);
  const submitting = useRef(false);
  // A retry after the save failed must not upload the same file twice.
  const uploaded = useRef<{ file: File; url: string } | null>(null);

  const [amount, setAmount] = useState('');
  const [scope, setScope] = useState<ExpenseScope>('car');
  const [carId, setCarId] = useState<number | null>(null);
  const [category, setCategory] = useState<string | null>(null);
  const [supplier, setSupplier] = useState<SupplierOption | null>(null);
  const [description, setDescription] = useState('');
  const [dateMode, setDateMode] = useState<DateMode>('today');
  const [otherDate, setOtherDate] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);
  const [touched, setTouched] = useState<Record<string, boolean>>({});

  const [cars, setCars] = useState<ExpenseCar[] | null>(null);
  const [carsFailed, setCarsFailed] = useState(false);
  const [carsAttempt, setCarsAttempt] = useState(0);

  const [stage, setStage] = useState<Stage>('idle');
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const busy = stage !== 'idle';
  const today = useMemo(() => istanbulDate(), []);
  const date = dateMode === 'today' ? today : dateMode === 'yesterday' ? addDays(today, -1) : otherDate;
  const parsed = parseAmount(amount);
  const after = parsed === null ? null : balance - parsed;
  const recent = useMemo(() => recentCars(rows, cars ?? []), [rows, cars]);

  const problems = expenseProblems({ amount, scope, carId, category, description, date, hasReceipt: !!file }, today);
  const ready = problems.length === 0 && !preparing;
  const dirty = !!amount || scope !== 'car' || carId !== null || !!category || !!supplier || !!description || dateMode !== 'today' || !!file;

  useEffect(() => {
    let cancelled = false;
    setCarsFailed(false);
    getActiveCars()
      .then(data => { if (!cancelled) setCars(data); })
      .catch(() => { if (!cancelled) setCarsFailed(true); });
    return () => { cancelled = true; };
  }, [carsAttempt]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    amountRef.current?.focus();
    return () => opener?.focus?.();
  }, []);

  const requestClose = useCallback(() => {
    if (busy) return;
    if (dirty) setConfirmingDiscard(true);
    else onClose();
  }, [busy, dirty, onClose]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLFormElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      requestClose();
      return;
    }
    if (e.key !== 'Tab') return;
    // Keep Tab inside: the page behind is covered, not gone.
    const focusable = Array.from(e.currentTarget.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(el => el.offsetParent !== null);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };

  const changeScope = (next: ExpenseScope) => {
    if (next === scope) return;
    setScope(next);
    // The two lists differ, and "Other" in one doesn't carry over a choice made in the other.
    setCategory(null);
  };

  const pickReceipt = async (picked: File) => {
    const rejection = receiptRejection(picked);
    if (rejection) {
      setReceiptError(t(`expense.errors.${rejection}`));
      return;
    }
    setReceiptError(null);
    setPreparing(true);
    try {
      setFile(await prepareReceipt(picked));
    } catch {
      setReceiptError(t('expense.errors.receiptUnreadable'));
    } finally {
      setPreparing(false);
    }
  };

  const removeReceipt = () => {
    setFile(null);
    setReceiptError(null);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || parsed === null || !file || !category || submitting.current) return;
    submitting.current = true;
    setError(null);

    let step: 'upload' | 'save' = 'upload';
    try {
      let receiptUrl = uploaded.current?.file === file ? uploaded.current.url : null;
      if (!receiptUrl) {
        setStage('uploading');
        setProgress(0);
        receiptUrl = await uploadCustodyReceipt(userId, file, setProgress);
        uploaded.current = { file, url: receiptUrl };
      }

      step = 'save';
      setStage('saving');
      setProgress(null);
      const trimmed = description.trim();
      const id = await addCustodyExpense({ amount: parsed, category, description: trimmed, date, scope, carId, receiptUrl, supplierId: supplier?.id ?? null });
      const car = scope === 'car' ? cars?.find(c => c.id === carId) : undefined;
      onSaved({
        id,
        transaction_date: date,
        direction: 'OUT',
        category,
        amount: parsed,
        description: trimmed,
        receipt_url: receiptUrl,
        created_at: new Date().toISOString(),
        created_by: userId,
        expense_scope: scope,
        car_id: car?.id ?? null,
        posted_car_tx_id: null,
        posted_company_expense_id: null,
        review_status: 'pending',
        reviewed_at: null,
        review_note: null,
        car: car ? { plate_number: car.plate_number } : null,
        supplier: supplier ? { name: supplier.name } : null,
      });
    } catch (failure) {
      const message = failure instanceof Error ? failure.message : (failure as { message?: string })?.message;
      setError(t(`expense.errors.${step === 'upload' ? 'upload' : expenseErrorKey(message)}`));
      setProgress(null);
      setStage('idle');
      submitting.current = false;
    }
  };

  const labels = { amount: `${baseId}-amount`, scope: `${baseId}-scope`, car: `${baseId}-car`, category: `${baseId}-category`, supplier: `${baseId}-supplier`, description: `${baseId}-description`, date: `${baseId}-date`, receipt: `${baseId}-receipt`, title: `${baseId}-title` };
  const amountInvalid = !!amount && parsed === null;
  const descriptionInvalid = touched.description && !description.trim();
  const dateInvalid = dateMode === 'other' && touched.date && problems.includes('date');

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9000] bg-[rgba(15,17,23,0.45)]" onMouseDown={e => { if (e.target === e.currentTarget) requestClose(); }}>
      <form
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labels.title}
        noValidate
        onSubmit={submit}
        onKeyDown={onKeyDown}
        className="hc-expense-sheet surface-depth surface-float"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5 py-3">
          <h2 id={labels.title} className="text-[17px] font-semibold text-[#0f1117]">{t('expense.title')}</h2>
          <button type="button" onClick={requestClose} disabled={busy} aria-label={t('expense.close')} className="flex size-11 cursor-pointer items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-black/[0.04] disabled:opacity-50">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto overscroll-contain px-5 py-5">
          <div>
            <label id={labels.amount} htmlFor={`${baseId}-amount-input`} className="sr-only">{t('expense.amount.label')}</label>
            <div dir="ltr" className="flex items-baseline justify-center gap-1 text-[#0f1117]">
              <span aria-hidden="true" className="text-[28px] font-semibold text-gray-400">₺</span>
              <input
                ref={amountRef}
                id={`${baseId}-amount-input`}
                type="text"
                inputMode="decimal"
                autoComplete="off"
                placeholder="0,00"
                value={amount}
                disabled={busy}
                aria-invalid={amountInvalid}
                aria-describedby={`${baseId}-after`}
                onChange={e => setAmount(e.target.value)}
                className="hc-expense-amount"
                style={{ width: `${Math.max(amount.length, 4) + 1}ch` }}
              />
            </div>
            <p id={`${baseId}-after`} aria-live="polite" className={`mt-1 min-h-5 text-center text-[13px] ${amountInvalid || (after !== null && after < 0) ? 'text-red-600' : 'text-gray-500'}`}>
              {amountInvalid ? t('expense.amount.invalid') : after !== null && (
                <>{t('expense.amount.balanceAfter')} <bdi dir="ltr" className="font-semibold">{after < 0 ? '−' : ''}{formatTRY(after)}</bdi></>
              )}
            </p>
          </div>

          <Field id={labels.scope} label={t('expense.scope.label')}>
            <div role="radiogroup" aria-labelledby={labels.scope} className="grid grid-cols-2 gap-2">
              {(['car', 'company'] as ExpenseScope[]).map(option => (
                <Choice key={option} name={`${baseId}-scope-group`} checked={scope === option} disabled={busy} onChange={() => changeScope(option)} className="min-h-[72px] flex-col gap-1 rounded-2xl px-2 text-sm">
                  <span aria-hidden="true" className="text-xl leading-none">{option === 'car' ? '🚗' : '🏢'}</span>
                  {t(`expense.scope.${option}`)}
                </Choice>
              ))}
            </div>
          </Field>

          {scope === 'car' && (
            <Field id={labels.car} label={t('expense.car.label')}>
              <CarPicker
                labelId={labels.car}
                cars={cars}
                failed={carsFailed}
                onRetry={() => setCarsAttempt(n => n + 1)}
                recent={recent}
                value={carId}
                onChange={setCarId}
                disabled={busy}
              />
            </Field>
          )}

          <Field id={labels.category} label={t('expense.category.label')}>
            <div role="radiogroup" aria-labelledby={labels.category} className="flex flex-wrap gap-2">
              {EXPENSE_CATEGORIES[scope].map(option => (
                <Choice key={option.value} name={`${baseId}-category-group`} checked={category === option.value} disabled={busy} onChange={() => setCategory(option.value)} className="min-h-12 rounded-full px-4 text-sm">
                  {t(`expense.categories.${option.key}`)}
                </Choice>
              ))}
            </div>
          </Field>

          <Field id={labels.supplier} label={tf('picker.label')}>
            <SupplierPicker labelId={labels.supplier} value={supplier} onChange={setSupplier} disabled={busy} canAdd={canAccessPage('accounting')} userId={userId} />
          </Field>

          <div>
            <label htmlFor={labels.description} className="mb-2 block text-[13px] font-semibold text-gray-700">{t('expense.description.label')}</label>
            <input
              id={labels.description}
              type="text"
              maxLength={200}
              autoComplete="off"
              value={description}
              disabled={busy}
              placeholder={t('expense.description.placeholder')}
              aria-invalid={descriptionInvalid}
              onChange={e => setDescription(e.target.value)}
              onBlur={() => setTouched(prev => ({ ...prev, description: true }))}
              className={textInput}
            />
            {descriptionInvalid && <p className={fieldError}>{t('expense.description.invalid')}</p>}
          </div>

          <Field id={labels.date} label={t('expense.date.label')}>
            <div role="radiogroup" aria-labelledby={labels.date} className="grid grid-cols-3 gap-2">
              {(['today', 'yesterday', 'other'] as DateMode[]).map(option => (
                <Choice key={option} name={`${baseId}-date-group`} checked={dateMode === option} disabled={busy} onChange={() => setDateMode(option)} className="min-h-12 rounded-full px-2 text-sm">
                  {t(`expense.date.${option}`)}
                </Choice>
              ))}
            </div>
            {dateMode === 'other' && (
              <input
                type="date"
                aria-label={t('expense.date.otherLabel')}
                max={today}
                value={otherDate}
                disabled={busy}
                aria-invalid={dateInvalid}
                onChange={e => { setOtherDate(e.target.value); setTouched(prev => ({ ...prev, date: true })); }}
                onBlur={() => setTouched(prev => ({ ...prev, date: true }))}
                className={`${textInput} mt-2`}
              />
            )}
            {dateInvalid && <p className={fieldError}>{t('expense.date.invalid')}</p>}
          </Field>

          <Field id={labels.receipt} label={`${t('expense.receipt.label')} (${t('expense.receipt.required')})`}>
            <ReceiptField
              labelId={labels.receipt}
              file={file}
              preparing={preparing}
              progress={progress}
              disabled={busy}
              onPick={pickReceipt}
              onRemove={removeReceipt}
            />
            {receiptError && <p role="alert" className={fieldError}>{receiptError}</p>}
          </Field>
        </div>

        <footer className="shrink-0 border-t border-[var(--border-subtle)] px-5 pb-[max(14px,env(safe-area-inset-bottom))] pt-3">
          {error ? (
            <p role="alert" className="mb-2 text-[13px] text-red-600">{error}</p>
          ) : problems.length > 0 && (
            <p className="mb-2 text-xs text-gray-500">
              {t('expense.missing.title')} {problems.map(problem => t(`expense.missing.${problem}`)).join(' · ')}
            </p>
          )}
          <div className="grid grid-cols-[1fr_2fr] gap-2 sm:flex sm:justify-end">
            <Button variant="secondary" onClick={requestClose} disabled={busy} className="hc-expense-action">{tc('actions.cancel')}</Button>
            <Button type="submit" disabled={!ready || busy} aria-busy={busy} className="hc-expense-action">
              {busy && (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" className="animate-spin" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56" />
                </svg>
              )}
              {stage === 'uploading' ? t('expense.uploadingShort', { percent: progress ?? 0 }) : stage === 'saving' ? t('expense.saving') : t('expense.save')}
            </Button>
          </div>
        </footer>
      </form>

      {confirmingDiscard && (
        <ConfirmDialog
          title={t('expense.discard.title')}
          body={t('expense.discard.body')}
          confirmLabel={t('expense.discard.confirm')}
          cancelLabel={t('expense.discard.keep')}
          onConfirm={onClose}
          onCancel={() => setConfirmingDiscard(false)}
        />
      )}
    </div>,
    document.body,
  );
};

export default AddExpenseSheet;
