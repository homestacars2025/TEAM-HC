import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

const split = (value: string) => {
  const [hour = '', minute = ''] = value.split(':');
  return { hour, minute };
};

const compose = (hour: string, minute: string) => {
  if (!hour || !minute || Number(hour) > 23 || Number(minute) > 59) return '';
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
};

/** Hours and minutes in that order in both languages, as a clock reads. */
const TimeParts: React.FC<{ value: string; onChange: (value: string) => void; label: string }> = ({ value, onChange, label }) => {
  const { t } = useTranslation('common');
  const [parts, setParts] = useState(() => split(value));

  useEffect(() => {
    setParts(current => (compose(current.hour, current.minute) === value ? current : split(value)));
  }, [value]);

  const update = (next: Partial<typeof parts>) => {
    const merged = { ...parts, ...next };
    setParts(merged);
    onChange(compose(merged.hour, merged.minute));
  };

  return (
    <div role="group" aria-label={label} dir="ltr" className="hc-time-parts">
      <input className="hc-input" inputMode="numeric" maxLength={2} placeholder="--" aria-label={t('time.hour')} value={parts.hour} onChange={e => update({ hour: e.target.value.replace(/\D/g, '') })} />
      <span aria-hidden="true">:</span>
      <input className="hc-input" inputMode="numeric" maxLength={2} placeholder="--" aria-label={t('time.minute')} value={parts.minute} onChange={e => update({ minute: e.target.value.replace(/\D/g, '') })} />
    </div>
  );
};

export default TimeParts;
