import React, { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { PaymentAccountsState } from '../../hooks/usePaymentAccounts';
import { CURRENCY_SYMBOLS, useCurrency } from '../../lib/CurrencyContext';
import { accountsForMethod, emptyPayment, hasPayment, PAY_CURRENCIES, PAY_METHODS, paymentProblem, rateOf, toLira, type PaymentDraft, type PayMethod } from '../../lib/payments';
import { formatMoney } from '../../lib/suppliers';

const METHOD_MARK: Record<PayMethod, string> = { cash: '💵', bank_transfer: '🏦', card: '💳', online: '🌐' };

const Required = () => <span aria-hidden="true" className="text-red-500"> *</span>;

interface PaymentFieldsProps {
  label: string;
  value: PaymentDraft;
  onChange: (next: PaymentDraft) => void;
  accounts: PaymentAccountsState;
  disabled?: boolean;
  /** For a form that only exists to record money, where "not paid yet" means nothing. */
  required?: boolean;
}

/**
 * One payment: how much, in what, how it reached us and where it went. Method and account
 * stay out of the way until there is an amount, because most bookings leave one of these two empty.
 */
const PaymentFields: React.FC<PaymentFieldsProps> = ({ label, value, onChange, accounts, disabled = false, required = false }) => {
  const { t } = useTranslation('finance');
  const { rates } = useCurrency();
  const id = useId();
  const usable = useMemo(() => accountsForMethod(accounts.rows ?? [], value.method), [accounts.rows, value.method]);
  const rate = rateOf(value.currency, rates);
  const entered = hasPayment(value);
  const problem = paymentProblem(value);

  const pickMethod = (method: PayMethod) => {
    const options = accountsForMethod(accounts.rows ?? [], method);
    // With one place it can go there is nothing to ask.
    onChange({ ...value, method, accountId: options.length === 1 ? options[0].id : null });
  };

  return (
    <div className="hc-pay hc-field-wide">
      <label htmlFor={`${id}-amount`} className="hc-field-label">{label}{required && <Required />}</label>
      <div className="hc-pay-amount">
        <input id={`${id}-amount`} className="hc-input" dir="ltr" inputMode="decimal" autoComplete="off" placeholder="0,00" value={value.amount} disabled={disabled} onChange={e => onChange({ ...value, amount: e.target.value })} />
        <div role="group" aria-label={t('payment.currency')} dir="ltr" className="hc-seg">
          {PAY_CURRENCIES.map(currency => (
            <button key={currency} type="button" aria-pressed={value.currency === currency} disabled={disabled} aria-label={currency} onClick={() => onChange({ ...value, currency })}>{CURRENCY_SYMBOLS[currency]}</button>
          ))}
        </div>
      </div>
      {entered && value.currency !== 'TRY' && rate !== null && (
        <p className="hc-pay-rate">= <bdi dir="ltr">{formatMoney(toLira(value, rates), 'TRY')}</bdi> <span dir="ltr">({rate.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})</span></p>
      )}
      {problem === 'amount' && <p role="alert" className="hc-pay-missing">{t('payment.errors.amount')}</p>}
      {!required && !entered && problem === null && <p className="hc-pay-hint">{t('payment.notPaidYet')}</p>}
      {!required && entered && <button type="button" className="hc-pay-skip" disabled={disabled} onClick={() => onChange(emptyPayment())}>{t('payment.notPaidYet')}</button>}

      {entered && (
        <>
          <p id={`${id}-method`} className="hc-field-label">{t('payment.method')}<Required /></p>
          <div role="radiogroup" aria-labelledby={`${id}-method`} aria-required="true" className="hc-pay-methods">
            {PAY_METHODS.map(method => (
              <button key={method} type="button" role="radio" aria-checked={value.method === method} disabled={disabled} onClick={() => pickMethod(method)}>
                <span aria-hidden="true">{METHOD_MARK[method]}</span>
                {t(`payment.methods.${method}`)}
              </button>
            ))}
          </div>
          {value.method && (accounts.failed ? (
            <p role="alert" className="hc-pay-missing">
              {t('payment.accountsFailed')} <button type="button" className="hc-pay-retry" onClick={accounts.retry}>{t('payment.retry')}</button>
            </p>
          ) : accounts.rows !== null && usable.length === 0 ? (
            <p role="alert" className="hc-pay-missing">{t('payment.noAccount')}</p>
          ) : (
            <label className="hc-pay-account">
              <span className="hc-field-label">{t('payment.account')}<Required /></span>
              <select className="hc-input !mt-0" aria-required="true" value={value.accountId ?? ''} disabled={disabled || accounts.rows === null} onChange={e => onChange({ ...value, accountId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{accounts.rows === null ? t('payment.loadingAccounts') : t('payment.chooseAccount')}</option>
                {usable.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
          ))}
          {value.method === 'cash' && <p className="hc-pay-note">{t('payment.cashNote')}</p>}
        </>
      )}
    </div>
  );
};

export default PaymentFields;
