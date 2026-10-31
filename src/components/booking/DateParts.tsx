import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

interface Parts {
  day: string;
  month: string;
  year: string;
}

const split = (value: string): Parts => {
  const [year = '', month = '', day = ''] = value.split('-');
  return { day: day.replace(/^0/, ''), month, year };
};

/** A real calendar date, or empty: the 31st of February is not half a date. */
function compose({ day, month, year }: Parts): string {
  if (year.length !== 4 || !month || !day) return '';
  const iso = `${year}-${month}-${day.padStart(2, '0')}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === iso ? iso : '';
}

interface DatePartsProps {
  value: string;
  onChange: (value: string) => void;
  locale: string;
  invalid?: boolean;
  label: string;
}

/**
 * For a date copied off a document, years back, where paging through a calendar would
 * take longer than typing it. It also reads the same in both languages, which the
 * browser's own date box doesn't.
 */
const DateParts: React.FC<DatePartsProps> = ({ value, onChange, locale, invalid = false, label }) => {
  const { t } = useTranslation('bookings');
  const [parts, setParts] = useState<Parts>(() => split(value));

  useEffect(() => {
    setParts(current => (compose(current) === value ? current : split(value)));
  }, [value]);

  const months = useMemo(() => Array.from({ length: 12 }, (_, index) => ({
    value: String(index + 1).padStart(2, '0'),
    label: new Date(Date.UTC(2024, index, 1)).toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' }),
  })), [locale]);

  const update = (next: Partial<Parts>) => {
    const merged = { ...parts, ...next };
    setParts(merged);
    onChange(compose(merged));
  };

  const field = invalid ? 'hc-input is-invalid' : 'hc-input';

  return (
    <div role="group" aria-label={label} className="hc-date-parts">
      <input
        className={field}
        inputMode="numeric"
        dir="ltr"
        maxLength={2}
        placeholder={t('dateParts.day')}
        aria-label={t('dateParts.day')}
        value={parts.day}
        onChange={e => update({ day: e.target.value.replace(/\D/g, '') })}
      />
      <select className={field} aria-label={t('dateParts.month')} value={parts.month} onChange={e => update({ month: e.target.value })}>
        <option value="">{t('dateParts.month')}</option>
        {months.map(month => <option key={month.value} value={month.value}>{month.label}</option>)}
      </select>
      <input
        className={field}
        inputMode="numeric"
        dir="ltr"
        maxLength={4}
        placeholder={t('dateParts.year')}
        aria-label={t('dateParts.year')}
        value={parts.year}
        onChange={e => update({ year: e.target.value.replace(/\D/g, '') })}
      />
    </div>
  );
};

export default DateParts;
