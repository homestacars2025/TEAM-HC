import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useMediaQuery } from '../hooks/useMediaQuery';
import Button from './Button';

export interface FilterField {
  key: string;
  label: string;
  control: React.ReactNode;
  /** What the filter is set to, or `null` when it isn't filtering anything. */
  activeLabel?: string | null;
  onClear?: () => void;
}

/**
 * A computer shows the controls inline, exactly where the page puts them. Below 640px
 * they would fill the screen, so they move into a sheet and only what is switched on
 * stays visible, as chips. The controls apply as they change, so Apply just closes it.
 */
const FilterBar: React.FC<{ fields: FilterField[] }> = ({ fields }) => {
  const { t } = useTranslation('common');
  const inline = useMediaQuery('(min-width: 640px)');
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const active = fields.filter(field => field.activeLabel);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    panelRef.current?.querySelector<HTMLElement>('select, button')?.focus();
    return () => opener?.focus?.();
  }, [open]);

  // Rotating a phone to landscape can cross the breakpoint with the sheet open.
  useEffect(() => { if (inline) setOpen(false); }, [inline]);

  if (inline) return <>{fields.map(field => <React.Fragment key={field.key}>{field.control}</React.Fragment>)}</>;

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); }
    if (e.key !== 'Tab') return;
    const focusable = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('select, button:not(:disabled)'));
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };

  return (
    <div className="hc-filterbar">
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-haspopup="dialog"
        aria-label={active.length > 0 ? t('filterBar.openActive', { count: active.length }) : t('filterBar.open')}
        className="hc-filter-open"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h16M7 12h10M10 17h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        </svg>
        {t('filterBar.open')}
        {active.length > 0 && <span aria-hidden="true" className="hc-filter-count">{active.length}</span>}
      </button>

      {active.length > 0 && (
        <div className="hc-filter-chips">
          {active.map(field => (
            <button
              key={field.key}
              type="button"
              onClick={field.onClear}
              aria-label={t('filterBar.remove', { label: field.activeLabel })}
              className="hc-filter-chip"
            >
              <span>{field.activeLabel}</span>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
              </svg>
            </button>
          ))}
        </div>
      )}

      {open && ReactDOM.createPortal(
        <div className="fixed inset-0 z-[9000] flex items-end bg-[rgba(15,17,23,0.45)]" onMouseDown={e => { if (e.target === e.currentTarget) setOpen(false); }}>
          <div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-label={t('filterBar.open')}
            onKeyDown={onKeyDown}
            className="hc-filter-sheet surface-depth surface-float"
          >
            <span aria-hidden="true" className="mx-auto mb-3 block h-1 w-10 rounded-full bg-gray-200" />
            <h2 className="mb-4 text-[17px] font-semibold text-[#0f1117]">{t('filterBar.open')}</h2>
            <div className="flex flex-col gap-3">
              {fields.map(field => (
                <label key={field.key} className="hc-filter-field">
                  <span className="mb-1.5 block text-[13px] font-medium text-gray-600">{field.label}</span>
                  {field.control}
                </label>
              ))}
            </div>
            <Button onClick={() => setOpen(false)} className="mt-5 w-full">{t('filterBar.apply')}</Button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
};

export default FilterBar;
