import React from 'react';

const Chevron: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M15 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

interface MonthSwitcherProps {
  label: string;
  prevLabel: string;
  nextLabel: string;
  onPrev: () => void;
  onNext: () => void;
  disabled?: boolean;
}

/** The arrows point away from the name, so they mirror in Arabic. */
const MonthSwitcher: React.FC<MonthSwitcherProps> = ({ label, prevLabel, nextLabel, onPrev, onNext, disabled = false }) => (
  <div className={`hc-month ${disabled ? 'is-off' : ''}`}>
    <button type="button" aria-label={prevLabel} disabled={disabled} onClick={onPrev}><Chevron /></button>
    <strong aria-live="polite">{label}</strong>
    <button type="button" aria-label={nextLabel} disabled={disabled} className="is-next" onClick={onNext}><Chevron /></button>
  </div>
);

export default MonthSwitcher;
