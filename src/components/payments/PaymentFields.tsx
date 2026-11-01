import React, { useId, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CURRENCY_SYMBOLS, useCurrency } from '../../lib/CurrencyContext';
import { accountsForMethod, hasPayment, PAY_CURRENCIES, PAY_METHODS, rateOf, toLira, type PaymentAccount, type PaymentDraft, type PayMethod } from '../../lib/payments';
import { formatMoney } from '../../lib/suppliers';

const METHOD_MARK: Record<PayMethod, string> = { cash: '💵', bank_transfer: '🏦', card: '💳', online: '🌐' };

interface PaymentFieldsProps {
  label: string;
  value: PaymentDraft;
  onChange: (next: PaymentDraft) => void;
  /** `null` while loading. */
  accounts: PaymentAccount[] | null;
  disabled?: boolean;
  /** Shown under the amount. */
  hint?: string;
}

/**
 * One payment: how much, in what, and how it reached us. Method and account stay out of
 * the way until there is an amount, because most bookings leave one of these two empty.
 */
const PaymentFields: React.FC<PaymentFieldsProps> = ({ label, value, onChange, accounts, disabled = false, hint }) => {
  const { t } = useTranslation('finance');
  const { rates } = useCurrency();
  const id = useId();
  const usable = useMemo(() => accountsForMethod(accounts ?? [], value.method), [accounts, value.method]);
  const rate = rateOf(value.currency, rates);
  const entered = hasPayment(value);

  const pickMethod = (method: PayMethod) => {
    const options = accountsForMethod(accounts ?? [], method);
    // With one place it can go there is nothing to ask.
    onChange({ ...value, method, accountId: options.length === 1 ? options[0].id : null });
  };

  return (
    <div className="hc-pay hc-field-wide">
      <label htmlFor={`${id}-amount`} className="hc-field-label">{label}</label>
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
      {hint && <p className="hc-pay-hint">{hint}</p>}

      {entered && (
        <>
          <div role="radiogroup" aria-label={t('payment.method')} className="hc-pay-methods">
            {PAY_METHODS.map(method => (
              <button key={method} type="button" role="radio" aria-checked={value.method === method} disabled={disabled} onClick={() => pickMethod(method)}>
                <span aria-hidden="true">{METHOD_MARK[method]}</span>
                {t(`payment.methods.${method}`)}
              </button>
            ))}
          </div>
          {value.method === 'cash' && <p className="hc-pay-note">{t('payment.cashNote')}</p>}
          {value.method && value.method !== 'cash' && (usable.length > 0 ? (
            <label className="hc-pay-account">
              <span className="hc-field-label">{t('payment.account')}</span>
              <select className="hc-input !mt-0" value={value.accountId ?? ''} disabled={disabled} onChange={e => onChange({ ...value, accountId: e.target.value ? Number(e.target.value) : null })}>
                <option value="">{t('payment.chooseAccount')}</option>
                {usable.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
              </select>
            </label>
          ) : accounts !== null && <p role="alert" className="hc-pay-missing">{t('payment.noAccount')}</p>)}
        </>
      )}
    </div>
  );
};

export default PaymentFields;
