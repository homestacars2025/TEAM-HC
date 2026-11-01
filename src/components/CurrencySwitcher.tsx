import React, { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { CURRENCIES, CURRENCY_SYMBOLS, useCurrency, type Currency } from '../lib/CurrencyContext';

/**
 * Saves through the same call as the Settings page, so the two can never disagree
 * and the choice follows the person. Pages that are lira by rule format with
 * `formatTRY`, which ignores this.
 */
const CurrencySwitcher: React.FC = () => {
  const { t } = useTranslation('settings');
  const { currency } = useCurrency();
  const { updateSettings, settings } = useCurrentUser();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return undefined;
    root.current?.querySelector<HTMLElement>('[aria-pressed="true"]')?.focus();
    const onPointer = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setOpen(false);
      toggle.current?.focus();
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const choose = (option: Currency) => {
    updateSettings({ currency: option });
    setOpen(false);
    toggle.current?.focus();
  };

  return (
    <div ref={root} className="relative shrink-0">
      <button
        ref={toggle}
        type="button"
        disabled={!settings}
        aria-label={`${t('currency.label')}: ${currency}`}
        aria-expanded={open}
        aria-haspopup="true"
        title={t('currency.label')}
        onClick={() => setOpen(current => !current)}
        className="flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1.5 rounded-xl border border-[var(--border-subtle)] px-2 text-[13px] font-semibold text-gray-600 transition-colors hover:border-[var(--accent)] sm:px-3 lg:h-10"
      >
        <bdi dir="ltr" className="hc-num">
          {CURRENCY_SYMBOLS[currency]}
          <span className="hidden sm:inline"> {currency}</span>
        </bdi>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" className="hidden text-gray-400 sm:block" aria-hidden="true">
          <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && (
        <div role="group" aria-label={t('currency.label')} className="surface-depth surface-float absolute end-0 top-[52px] z-[400] w-40 rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
          {CURRENCIES.map(option => (
            <button
              key={option}
              type="button"
              aria-pressed={option === currency}
              onClick={() => choose(option)}
              className={`flex min-h-11 w-full cursor-pointer items-center justify-between gap-2 rounded-xl px-3 text-sm transition-colors hover:bg-black/[0.04] lg:min-h-10 ${option === currency ? 'font-semibold text-[var(--accent-strong)]' : 'text-gray-700'}`}
            >
              <bdi dir="ltr" className="hc-num">{CURRENCY_SYMBOLS[option]} {option}</bdi>
              {option === currency && (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default CurrencySwitcher;
