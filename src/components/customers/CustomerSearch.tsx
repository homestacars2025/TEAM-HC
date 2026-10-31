import React, { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatTRY } from '../../lib/CurrencyContext';
import { findCustomers, type CustomerMatch } from '../../lib/queries/customers';
import BannedBadge from './BannedBadge';

const DEBOUNCE_MS = 250;
const MIN_CHARS = 2;

interface CustomerSearchProps {
  onSelect: (customer: CustomerMatch) => void;
  onNew: (typed: string) => void;
  flagFor: (nationality: string | null) => string;
  formatDate: (date: string) => string;
  /** Set when saving was tried with no customer chosen. */
  required: boolean;
}

const initialsOf = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map(word => word[0]).join('').toLocaleUpperCase('tr');

const CustomerSearch: React.FC<CustomerSearchProps> = ({ onSelect, onNew, flagFor, formatDate, required }) => {
  const { t } = useTranslation('bookings');
  const { t: tc } = useTranslation('common');
  const baseId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CustomerMatch[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(-1);

  const term = query.trim();

  useEffect(() => {
    setActive(-1);
    setFailed(false);
    if (term.length < MIN_CHARS) {
      setResults(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(() => {
      findCustomers(term)
        .then(rows => { if (!cancelled) setResults(rows); })
        .catch(() => { if (!cancelled) { setResults(null); setFailed(true); } })
        .finally(() => { if (!cancelled) setSearching(false); });
    }, DEBOUNCE_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term]);

  // This field sits low in a long form, so the answers can land below the fold.
  useEffect(() => {
    if (results && results.length > 0) listRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, [results]);

  const selectable = (results ?? []).map((row, index) => ({ row, index })).filter(({ row }) => !row.is_banned);
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const move = (step: number) => {
    if (selectable.length === 0) return;
    const at = selectable.findIndex(({ index }) => index === active);
    const next = selectable[(at + step + selectable.length) % selectable.length].index;
    setActive(next);
    listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(-1); }
    else if (e.key === 'Enter') {
      // Never the form's submit: Enter here means "this one".
      e.preventDefault();
      const chosen = results?.[active];
      if (chosen && !chosen.is_banned) onSelect(chosen);
    }
  };

  return (
    <div className="hc-cust-search">
      <label htmlFor={`${baseId}-input`} className="mb-1.5 block text-xs font-semibold text-gray-700">{t('customerStep.searchLabel')}</label>
      <input
        id={`${baseId}-input`}
        type="text"
        role="combobox"
        aria-expanded={results !== null}
        aria-controls={`${baseId}-list`}
        aria-autocomplete="list"
        aria-activedescendant={active >= 0 ? optionId(active) : undefined}
        aria-invalid={required}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        value={query}
        placeholder={t('customerStep.searchPlaceholder')}
        onChange={e => setQuery(e.target.value)}
        onKeyDown={onKeyDown}
        className="hc-cust-input"
      />
      {required && !results && <p role="alert" className="mt-1.5 text-[13px] text-red-600">{t('customerStep.required')}</p>}

      <div aria-live="polite" className="mt-2">
        {searching && <p className="py-2 text-[13px] text-gray-500">{t('customerStep.searching')}</p>}
        {failed && <p role="alert" className="py-2 text-[13px] text-red-600">{t('customerStep.searchFailed')}</p>}
        {!searching && results?.length === 0 && <p className="py-2 text-[13px] text-gray-500">{t('customerStep.noResults')}</p>}
      </div>

      {results && results.length > 0 && (
        <div ref={listRef} id={`${baseId}-list`} role="listbox" aria-label={t('customerStep.searchLabel')} className="hc-cust-list">
          {results.map((row, index) => {
            const flag = flagFor(row.nationality);
            const exact = row.match_type !== 'name';
            return (
              <div
                key={row.id}
                id={optionId(index)}
                data-index={index}
                role="option"
                aria-selected={index === active}
                aria-disabled={row.is_banned}
                title={row.is_banned ? row.ban_reason ?? undefined : undefined}
                onMouseDown={e => e.preventDefault()}
                onClick={() => { if (!row.is_banned) onSelect(row); }}
                className={`hc-cust-row ${row.is_banned ? 'is-banned' : ''} ${index === active ? 'is-active' : ''}`}
              >
                <span aria-hidden="true" className="hc-cust-avatar">{initialsOf(row.full_name) || '?'}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                    <span className="truncate text-sm font-semibold text-[#0f1117]">{row.full_name || '—'}</span>
                    {flag && <span aria-hidden="true">{flag}</span>}
                    {exact && !row.is_banned && <span className="hc-cust-exact">{t('customerStep.exact')}</span>}
                    {row.is_banned && <BannedBadge reason={row.ban_reason} />}
                  </span>
                  <span className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-gray-500">
                    {row.phone && <bdi dir="ltr" className="hc-num">{row.phone}</bdi>}
                    {row.id_number && <bdi dir="ltr" className="hc-num">{row.id_number}</bdi>}
                  </span>
                  {row.is_banned && row.ban_reason && <span className="mt-0.5 block text-xs font-medium text-red-700">{row.ban_reason}</span>}
                  <span className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                    <span>{t('customerStep.bookings', { count: row.bookings_count })}</span>
                    {row.last_booking && <span>{t('customerStep.lastBooking', { date: formatDate(row.last_booking) })}</span>}
                    {row.balance !== 0 && (
                      <span className={`hc-cust-balance ${row.balance > 0 ? 'owes' : 'credit'}`}>
                        {row.balance > 0 ? tc('customer.owes') : tc('customer.credit')} <bdi dir="ltr">{formatTRY(row.balance)}</bdi>
                      </span>
                    )}
                  </span>
                </span>
              </div>
            );
          })}
        </div>
      )}

      <button type="button" onClick={() => onNew(query)} className="hc-cust-new">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        </svg>
        {t('customerStep.newCustomer')}
      </button>
    </div>
  );
};

export default CustomerSearch;
