import React, { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { addSupplier, updateSupplier, type SupplierDraft } from '../../lib/queries/suppliers';
import { SUPPLIER_CATEGORIES, type Supplier } from '../../lib/suppliers';
import Button from '../Button';
import BookingSheet from '../booking/BookingSheet';
import { Field, FormCard, FormError } from '../booking/FormParts';
import { CategoryIcon } from './parts';

const blank: SupplierDraft = {
  name: '', category: 'other', contact_person: null, phone: null, whatsapp: null, address: null,
  district: null, tax_number: null, iban: null, bank_name: null, notes: null, is_active: true,
};

const TEXT_FIELDS = ['contact_person', 'phone', 'whatsapp', 'district', 'address', 'tax_number', 'bank_name', 'iban'] as const;
const LATIN = new Set<string>(['phone', 'whatsapp', 'tax_number', 'iban']);

interface SupplierFormProps {
  supplier: Supplier | null;
  userId: string | null;
  onClose: () => void;
  onSaved: (supplier: Supplier) => void;
}

const SupplierForm: React.FC<SupplierFormProps> = ({ supplier, userId, onClose, onSaved }) => {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const closeRef = useRef<(() => void) | null>(null);
  const [draft, setDraft] = useState<SupplierDraft>(() => {
    if (!supplier) return blank;
    const { id, ...fields } = supplier;
    return fields;
  });
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);

  const set = <K extends keyof SupplierDraft>(key: K, value: SupplierDraft[K]) => {
    setDraft(current => ({ ...current, [key]: value }));
    setDirty(true);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim() || saving) return;
    setSaving(true);
    setFailed(false);
    const clean = { ...draft, name: draft.name.trim() };
    TEXT_FIELDS.forEach(key => { clean[key] = clean[key]?.trim() || null; });
    clean.notes = clean.notes?.trim() || null;
    try {
      onSaved(supplier ? await updateSupplier(supplier.id, clean) : await addSupplier(clean, userId));
    } catch {
      setFailed(true);
      setSaving(false);
    }
  };

  return (
    <BookingSheet
      title={supplier ? t('form.editTitle') : t('form.addTitle')}
      narrow
      dirty={dirty}
      busy={saving}
      onClose={onClose}
      onSubmit={submit}
      closeRef={closeRef}
      alerts={failed ? <FormError>{t('form.saveFailed')}</FormError> : undefined}
      footer={(
        <div className="hc-detail-actions">
          <Button variant="secondary" disabled={saving} onClick={() => closeRef.current?.()}>{tc('actions.cancel')}</Button>
          <Button type="submit" disabled={saving || !draft.name.trim()}>{saving ? tc('actions.saving') : t('form.save')}</Button>
        </div>
      )}
    >
      <FormCard icon={<CategoryIcon category={draft.category} />} title={t('form.section')}>
        <Field label={t('form.name')} required wide>
          <input className="hc-input" value={draft.name} maxLength={120} autoComplete="off" onChange={e => set('name', e.target.value)} />
        </Field>
        <Field label={t('form.category')} required wide>
          <select className="hc-input" value={draft.category} onChange={e => set('category', e.target.value as SupplierDraft['category'])}>
            {SUPPLIER_CATEGORIES.map(option => <option key={option} value={option}>{t(`suppliers.categories.${option}`)}</option>)}
          </select>
        </Field>
        {TEXT_FIELDS.map(key => (
          <Field key={key} label={t(`form.${key}`)}>
            <input className="hc-input" dir={LATIN.has(key) ? 'ltr' : undefined} inputMode={key === 'phone' || key === 'whatsapp' ? 'tel' : undefined} autoComplete="off" value={draft[key] ?? ''} onChange={e => set(key, e.target.value)} />
          </Field>
        ))}
        <Field label={t('form.notes')} wide>
          <textarea className="hc-input" rows={3} value={draft.notes ?? ''} onChange={e => set('notes', e.target.value)} />
        </Field>
        {supplier && (
          <label className="hc-field-wide flex min-h-11 cursor-pointer items-center gap-2 text-sm text-gray-700">
            <input type="checkbox" className="hc-appr-check" checked={draft.is_active} onChange={e => set('is_active', e.target.checked)} />
            {t('form.active')}
          </label>
        )}
      </FormCard>
    </BookingSheet>
  );
};

export default SupplierForm;
