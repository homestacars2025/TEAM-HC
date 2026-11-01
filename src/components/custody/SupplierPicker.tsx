import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addSupplierQuick, getSupplierOptions } from '../../lib/queries/suppliers';
import { matchesSupplier, SUPPLIER_CATEGORIES, type SupplierCategory, type SupplierOption } from '../../lib/suppliers';
import Button from '../Button';
import { CategoryChip } from '../suppliers/parts';

interface SupplierPickerProps {
  labelId: string;
  value: SupplierOption | null;
  onChange: (supplier: SupplierOption | null) => void;
  disabled: boolean;
  /** Only finance can add one. */
  canAdd: boolean;
  userId: string;
}

/**
 * Optional, so it never gets in the way of the expense: the list loads on first
 * use, and a failure here leaves the rest of the form working. The list stays open
 * under the search box for the same reason as the car picker: a popup would be
 * clipped by the scrolling sheet.
 */
const SupplierPicker: React.FC<SupplierPickerProps> = ({ labelId, value, onChange, disabled, canAdd, userId }) => {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<SupplierOption[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [query, setQuery] = useState('');
  const [adding, setAdding] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<SupplierCategory>('other');
  const [saving, setSaving] = useState(false);
  const [saveFailed, setSaveFailed] = useState(false);

  useEffect(() => {
    if (!open || options) return undefined;
    let cancelled = false;
    setFailed(false);
    getSupplierOptions()
      .then(rows => { if (!cancelled) setOptions(rows); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [open, options, attempt]);

  const shown = useMemo(() => (options ?? []).filter(option => matchesSupplier(option, query)), [options, query]);

  const choose = (supplier: SupplierOption) => {
    onChange(supplier);
    setOpen(false);
    setQuery('');
    setAdding(false);
  };

  const startAdding = () => {
    setName(query.trim());
    setCategory('other');
    setSaveFailed(false);
    setAdding(true);
  };

  const save = async () => {
    const trimmed = name.trim();
    if (!trimmed || saving) return;
    setSaving(true);
    setSaveFailed(false);
    try {
      const added = await addSupplierQuick(trimmed, category, userId);
      setOptions(current => [...(current ?? []), added].sort((a, b) => a.name.localeCompare(b.name, 'tr')));
      choose(added);
    } catch {
      setSaveFailed(true);
    }
    setSaving(false);
  };

  if (value) {
    return (
      <div aria-labelledby={labelId} role="group" className="hc-sup-picked">
        <span className="min-w-0 truncate text-sm font-semibold text-[#0f1117]" dir="auto">{value.name}</span>
        <CategoryChip category={value.category} />
        <button type="button" disabled={disabled} aria-label={t('picker.clear')} onClick={() => onChange(null)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
        </button>
      </div>
    );
  }

  if (!open) {
    return <button type="button" disabled={disabled} className="hc-sup-open" aria-labelledby={labelId} onClick={() => setOpen(true)}>{t('picker.choose')}</button>;
  }

  return (
    <div role="group" aria-labelledby={labelId} className="hc-sup-picker">
      {adding ? (
        <div className="flex flex-col gap-2 p-2">
          <input type="text" autoFocus maxLength={120} value={name} disabled={saving} aria-label={t('form.name')} placeholder={t('form.name')} onChange={e => setName(e.target.value)} className="hc-input" />
          <select value={category} disabled={saving} aria-label={t('form.category')} onChange={e => setCategory(e.target.value as SupplierCategory)} className="hc-input !mt-0">
            {SUPPLIER_CATEGORIES.map(option => <option key={option} value={option}>{t(`suppliers.categories.${option}`)}</option>)}
          </select>
          {saveFailed && <p role="alert" className="text-[13px] text-red-600">{t('form.saveFailed')}</p>}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" disabled={saving} onClick={() => setAdding(false)}>{tc('actions.cancel')}</Button>
            <Button disabled={saving || !name.trim()} onClick={() => void save()}>{t('picker.add')}</Button>
          </div>
        </div>
      ) : (
        <>
          <input type="search" autoFocus value={query} aria-label={t('picker.search')} placeholder={t('picker.search')} onChange={e => setQuery(e.target.value)} className="hc-input" />
          {failed ? (
            <p role="alert" className="flex items-center justify-between gap-2 p-2 text-[13px] text-gray-600">
              {t('picker.failed')}
              <button type="button" className="font-semibold text-[var(--accent-strong)]" onClick={() => setAttempt(n => n + 1)}>{tc('actions.tryAgain')}</button>
            </p>
          ) : options === null ? (
            <div className="h-11 animate-pulse rounded-lg bg-black/[0.05]" aria-busy />
          ) : (
            <ul className="hc-sup-options">
              {shown.map(option => (
                <li key={option.id}>
                  <button type="button" onClick={() => choose(option)}>
                    <span dir="auto" className="min-w-0 truncate">{option.name}</span>
                    <CategoryChip category={option.category} />
                  </button>
                </li>
              ))}
              {shown.length === 0 && <li className="p-2 text-[13px] text-gray-500">{t('picker.none')}</li>}
            </ul>
          )}
          <div className="flex items-center justify-between gap-2">
            {canAdd ? <button type="button" className="hc-sup-add" onClick={startAdding}>{t('picker.new')}</button> : <span />}
            <button type="button" className="hc-sup-add is-quiet" onClick={() => { setOpen(false); setQuery(''); }}>{t('picker.notNow')}</button>
          </div>
        </>
      )}
    </div>
  );
};

export default SupplierPicker;
