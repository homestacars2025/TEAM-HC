import React from 'react';
import { useTranslation } from 'react-i18next';

const QUARTERS = ['0', '¼', '½', '¾', '1'];

interface FuelSliderProps {
  /** As stored: empty, a number, or older free text. */
  value: string;
  onChange: (value: string) => void;
  ariaLabel: string;
}

/**
 * Empty is its own state, not zero: most bookings have no fuel recorded. Older records
 * also hold values above 100 and free text like "3/4", which the slider can't show, so
 * they are left alone until someone actually moves it.
 */
const FuelSlider: React.FC<FuelSliderProps> = ({ value, onChange, ariaLabel }) => {
  const { t } = useTranslation('bookings');
  const number = Number(value);
  const empty = value.trim() === '';
  const onScale = !empty && Number.isFinite(number) && number >= 0 && number <= 100;

  return (
    <div className={`hc-fuel ${onScale ? '' : 'is-unset'}`}>
      <div className="hc-fuel-top">
        <span className="text-[13px] font-semibold text-[#0f1117]">
          {empty ? t('fuel.notRecorded') : onScale ? <bdi dir="ltr">{number}%</bdi> : t('fuel.stored', { value })}
        </span>
        {!empty && <button type="button" onClick={() => onChange('')}>{t('fuel.clear')}</button>}
      </div>
      <input type="range" min={0} max={100} step={1} aria-label={ariaLabel} value={onScale ? number : 0} onChange={e => onChange(e.target.value)} className="hc-fuel-range" />
      <div className="hc-fuel-marks" aria-hidden="true">
        {QUARTERS.map(mark => <span key={mark}>{mark}</span>)}
      </div>
    </div>
  );
};

export default FuelSlider;
