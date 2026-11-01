import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatFuelRange, MAX_FUEL_RANGE_KM, type FuelRangeProblem } from '../lib/fuelRange';

/** The words for a fuel reading, in the reader's language. */
export function useFuelRange() {
  const { t } = useTranslation('common');
  return {
    label: t('fuelRange.label'),
    short: t('fuelRange.short'),
    format: (value: number | string | null | undefined) => formatFuelRange(value, t('fuelRange.unit')),
    message: (problem: FuelRangeProblem) => t(`fuelRange.${problem}`),
  };
}

interface FuelRangeInputProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> {
  value: string;
  onChange: (value: string) => void;
}

/** The one fuel field, on Operations, bookings and replacement sheets alike. */
const FuelRangeInput: React.FC<FuelRangeInputProps> = ({ value, onChange, ...input }) => {
  const { t } = useTranslation('common');
  return (
    <input
      type="number"
      inputMode="numeric"
      min="0"
      max={MAX_FUEL_RANGE_KM}
      step="1"
      placeholder={t('fuelRange.placeholder')}
      value={value}
      onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
      {...input}
    />
  );
};

export default FuelRangeInput;
