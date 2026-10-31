import React, { useId } from 'react';
import { useTranslation } from 'react-i18next';

/** A soft card holding one part of a booking. */
export const FormCard: React.FC<{ icon: React.ReactNode; title: string; action?: React.ReactNode; children: React.ReactNode }> = ({ icon, title, action, children }) => (
  <section className="hc-form-card surface-depth">
    <header className="hc-form-card-head">
      <span aria-hidden="true" className="hc-form-card-icon">{icon}</span>
      <h3 className="min-w-0 flex-1 text-[14px] font-semibold text-[#0f1117]">{title}</h3>
      {action}
    </header>
    <div className="hc-form-grid">{children}</div>
  </section>
);

interface FieldProps {
  label: string;
  required?: boolean;
  /** Edit mode's blue dot. */
  changed?: boolean;
  wide?: boolean;
  children: React.ReactNode;
}

/** Not a `<label>`: several of these hold more than one control. */
export const Field: React.FC<FieldProps> = ({ label, required, changed, wide, children }) => {
  const { t } = useTranslation('bookings');
  const labelId = useId();
  return (
    <div role="group" aria-labelledby={labelId} className={wide ? 'hc-field-wide min-w-0' : 'min-w-0'}>
      <div id={labelId} className="hc-field-label">
        {label}
        {required && <span aria-hidden="true" className="text-red-500"> *</span>}
        {changed && <span role="img" aria-label={t('sheet.changed')} title={t('sheet.changed')} className="hc-field-dot" />}
      </div>
      {children}
    </div>
  );
};

export const FieldError: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  children ? <p role="alert" className="hc-field-error">{children}</p> : null;

export const FormNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div role="status" className="hc-form-note">{children}</div>
);

export const FormError: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  children ? <div role="alert" className="hc-form-error">{children}</div> : null;

interface ChoiceCardProps {
  selected: boolean;
  onClick: () => void;
  title: string;
  description?: string;
}

/** A tick-box the size of a card. Pressing a chosen one lets go of it. */
export const ChoiceCard: React.FC<ChoiceCardProps> = ({ selected, onClick, title, description }) => (
  <button type="button" aria-pressed={selected} onClick={onClick} className="hc-choice">
    <span aria-hidden="true" className="hc-choice-mark">
      {selected && (
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none">
          <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </span>
    <span className="min-w-0">
      <span className="block text-[13.5px] font-semibold text-[#0f1117]">{title}</span>
      {description && <span className="mt-0.5 block text-xs text-gray-500">{description}</span>}
    </span>
  </button>
);

export interface Step {
  key: string;
  label: string;
  /** Five full names don't fit across the sheet, so only the current step uses its own. */
  short: string;
}

interface StepperProps {
  steps: Step[];
  current: number;
  /** The furthest step reached. Anything up to it can be jumped to. */
  reached: number;
  onJump: (index: number) => void;
}

export const Stepper: React.FC<StepperProps> = ({ steps, current, reached, onJump }) => (
  <ol className="hc-stepper">
    {steps.map((step, index) => {
      const done = index < current;
      return (
        <li key={step.key} className={`hc-step ${index === current ? 'is-current' : ''} ${done ? 'is-done' : ''}`}>
          <button type="button" disabled={index > reached} aria-current={index === current ? 'step' : undefined} onClick={() => onJump(index)}>
            <span className="hc-step-dot">
              {done ? (
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              ) : index + 1}
            </span>
            <span className="hc-step-label">{index === current ? step.label : step.short}</span>
          </button>
        </li>
      );
    })}
  </ol>
);

export interface SummaryRow {
  label: string;
  value: React.ReactNode;
}

interface SummaryBarProps {
  rows: SummaryRow[];
  /** The one figure a phone keeps showing when the bar is closed. */
  headline: SummaryRow;
}

export const SummaryBar: React.FC<SummaryBarProps> = ({ rows, headline }) => {
  const { t } = useTranslation('bookings');
  const [open, setOpen] = React.useState(false);
  return (
    <div className={`hc-summary ${open ? 'is-open' : ''}`}>
      <button type="button" className="hc-summary-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span className="text-[13px] font-semibold text-gray-600">{t('sheet.summary')}</span>
        <span className="flex items-center gap-2 text-[14px] font-semibold text-[#0f1117]">
          {headline.value}
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="hc-summary-chevron">
            <path d="M6 15l6-6 6 6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>
      <dl className="hc-summary-rows">
        {rows.map(row => (
          <div key={row.label}>
            <dt>{row.label}</dt>
            <dd>{row.value}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
};
