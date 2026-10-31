import React from 'react';
import { useTranslation } from 'react-i18next';

export type FormCurrency = 'TRY' | 'USD';

const twoDecimals = (value: number) => value.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const formatRate = twoDecimals;

export const formatMoney = (value: number, currency: FormCurrency): string =>
  `${value < 0 ? '-' : ''}${currency === 'USD' ? '$' : '₺'}${twoDecimals(Math.abs(value))}`;

export const CurrencySwitch: React.FC<{ value: FormCurrency; onChange: (next: FormCurrency) => void; disabled?: boolean; label: string }> = ({ value, onChange, disabled, label }) => (
  <div role="group" aria-label={label} dir="ltr" className="hc-seg">
    {(['TRY', 'USD'] as const).map(currency => (
      <button key={currency} type="button" aria-pressed={value === currency} disabled={disabled && currency === 'USD'} onClick={() => onChange(currency)}>
        {currency === 'TRY' ? '₺ TRY' : '$ USD'}
      </button>
    ))}
  </div>
);

interface MoneyFieldProps {
  id?: string;
  value: string;
  onChange: (value: string) => void;
  currency: FormCurrency;
  /** Today's USD rate, or `null` if it couldn't be read. */
  rate: number | null;
  /** A switch of its own. Without it, a shared one sits elsewhere in the section. */
  onCurrency?: (next: FormCurrency) => void;
  ariaLabel: string;
}

/** The conversion line is only ever a preview: what gets stored is worked out on save. */
const MoneyField: React.FC<MoneyFieldProps> = ({ id, value, onChange, currency, rate, onCurrency, ariaLabel }) => {
  const { t } = useTranslation('bookings');
  const amount = Number(value);
  const converted = currency === 'USD' && rate !== null && value.trim() !== '' && Number.isFinite(amount) ? amount * rate : null;

  return (
    <div className="min-w-0">
      <div dir="ltr" className="hc-money">
        <span aria-hidden="true" className="hc-money-symbol">{currency === 'USD' ? '$' : '₺'}</span>
        <input id={id} type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" aria-label={ariaLabel} value={value} onChange={e => onChange(e.target.value)} className="hc-money-input" />
        {onCurrency && <CurrencySwitch value={currency} onChange={onCurrency} disabled={rate === null} label={ariaLabel} />}
      </div>
      {converted !== null && rate !== null && (
        <div className="mt-1 text-xs text-gray-500">
          {'= '}<bdi dir="ltr" className="font-semibold text-gray-700">{formatMoney(converted, 'TRY')}</bdi>{' '}
          ({t('money.todaysRate', { rate: formatRate(rate) })})
        </div>
      )}
    </div>
  );
};

export default MoneyField;
