import React, { useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { filterCars, groupCars, type ExpenseCar } from '../../lib/custodyExpense';
import PlateChip from './PlateChip';

interface CarPickerProps {
  labelId: string;
  /** `null` while loading. */
  cars: ExpenseCar[] | null;
  failed: boolean;
  onRetry: () => void;
  recent: ExpenseCar[];
  value: number | null;
  onChange: (id: number | null) => void;
  disabled: boolean;
}

interface Section {
  key: string;
  label: string;
  cars: ExpenseCar[];
}

/**
 * The list stays open under the search box rather than floating over it: inside a
 * scrolling sheet a popup gets clipped, and on a phone the thumb can scroll and tap
 * without typing at all.
 */
const CarPicker: React.FC<CarPickerProps> = ({ labelId, cars, failed, onRetry, recent, value, onChange, disabled }) => {
  const { t } = useTranslation('custody');
  const { t: tc } = useTranslation('common');
  const baseId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState('');
  // Nothing is marked until the keyboard is used: a marked row reads as already chosen.
  const [active, setActive] = useState(-1);

  const sections = useMemo<Section[]>(() => {
    if (!cars) return [];
    const found = groupCars(filterCars(cars, query)).map(group => ({
      key: group.model ?? 'none',
      label: group.model ?? t('expense.car.noModel'),
      cars: group.cars,
    }));
    return !query.trim() && recent.length > 0
      ? [{ key: 'recent', label: t('expense.car.recent'), cars: recent }, ...found]
      : found;
  }, [cars, query, recent, t]);

  const options = useMemo(() => sections.flatMap(section => section.cars.map(car => ({ section: section.key, car }))), [sections]);
  const optionId = (index: number) => `${baseId}-option-${index}`;

  const move = (index: number) => {
    const next = Math.max(0, Math.min(options.length - 1, index));
    setActive(next);
    listRef.current?.querySelector(`[data-index="${next}"]`)?.scrollIntoView({ block: 'nearest' });
  };

  const choose = (id: number) => {
    onChange(id);
    setQuery('');
    setActive(-1);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); move(active + 1); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); move(active - 1); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (options[active]) choose(options[active].car.id);
    } else if (e.key === 'Escape' && query) {
      // Clears the search; only a second Esc reaches the sheet.
      e.stopPropagation();
      setQuery('');
      setActive(-1);
    }
  };

  const selected = cars?.find(car => car.id === value);
  if (selected) {
    return (
      <div className="flex min-h-14 items-center justify-between gap-3 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          <PlateChip plate={selected.plate_number} />
          {selected.model && <span className="truncate text-sm text-gray-600">{selected.model}</span>}
        </div>
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            onChange(null);
            window.requestAnimationFrame(() => inputRef.current?.focus());
          }}
          className="min-h-11 shrink-0 cursor-pointer px-1 text-[13px] font-semibold text-[var(--accent-strong)]"
        >
          {t('expense.car.change')}
        </button>
      </div>
    );
  }

  if (failed) {
    return (
      <div className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-subtle)] p-3 text-sm text-gray-600">
        <span role="alert">{t('expense.car.failed')}</span>
        <button type="button" onClick={onRetry} className="min-h-11 cursor-pointer font-semibold text-[var(--accent-strong)]">{tc('actions.tryAgain')}</button>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-[var(--border-subtle)] focus-within:border-[var(--accent)]">
      <input
        ref={inputRef}
        type="text"
        role="combobox"
        aria-labelledby={labelId}
        aria-expanded="true"
        aria-controls={`${baseId}-list`}
        aria-autocomplete="list"
        aria-activedescendant={options[active] ? optionId(active) : undefined}
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        disabled={disabled}
        value={query}
        placeholder={t('expense.car.search')}
        onChange={e => { setQuery(e.target.value); setActive(e.target.value.trim() ? 0 : -1); }}
        onKeyDown={onKeyDown}
        className="h-12 w-full border-b border-[var(--border-subtle)] bg-transparent px-3 text-base text-[#0f1117] outline-none sm:text-sm"
      />
      <div ref={listRef} id={`${baseId}-list`} role="listbox" aria-labelledby={labelId} className="max-h-64 overflow-y-auto overscroll-contain">
        {!cars ? (
          <p className="p-4 text-center text-sm text-gray-500">{t('expense.car.loading')}</p>
        ) : options.length === 0 ? (
          <p className="p-4 text-center text-sm text-gray-500">{t('expense.car.empty')}</p>
        ) : sections.map(section => (
          <div key={section.key} role="group" aria-label={section.label}>
            <div className="sticky top-0 bg-[var(--surface)] px-3 pb-1 pt-2.5 text-xs font-semibold text-gray-500">{section.label}</div>
            {section.cars.map(car => {
              const index = options.findIndex(option => option.section === section.key && option.car.id === car.id);
              return (
                <div
                  key={car.id}
                  id={optionId(index)}
                  role="option"
                  aria-selected={index === active}
                  data-index={index}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { if (!disabled) choose(car.id); }}
                  className={`flex min-h-12 cursor-pointer items-center gap-3 px-3 py-1.5 ${index === active ? 'bg-[var(--accent-soft)]' : 'hover:bg-black/[0.03]'}`}
                >
                  <PlateChip plate={car.plate_number} />
                  {car.model && <span className="min-w-0 truncate text-sm text-gray-600">{car.model}</span>}
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
};

export default CarPicker;
