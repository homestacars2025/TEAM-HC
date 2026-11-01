import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useBlockedPage } from '../../hooks/useBlockedPage';
import type { CarCompliance, ComplianceField } from '../../lib/carCompliance';
import { saveCarDates, type CarDatesChange } from '../../lib/queries/carCompliance';
import Button from '../Button';
import DateParts from '../booking/DateParts';
import { FormError } from '../booking/FormParts';
import PlateChip from '../booking/PlateChip';
import { useIssueText } from './Compliance';

const COLUMN: Record<ComplianceField, keyof CarDatesChange> = {
  insurance: 'insurance_expiry',
  inspection: 'inspection_expiry',
};

interface CarDatesSheetProps {
  car: CarCompliance;
  locale: string;
  onClose: () => void;
  onSaved: () => void;
}

/** The two dates and nothing else. Everything else on a registration is managed in Admin. */
const CarDatesSheet: React.FC<CarDatesSheetProps> = ({ car, locale, onClose, onSaved }) => {
  const { t } = useTranslation('cars');
  const { t: tc } = useTranslation('common');
  const issueText = useIssueText();
  const formRef = useRef<HTMLFormElement>(null);
  const submitting = useRef(false);
  const [insurance, setInsurance] = useState(car.insuranceExpiry ?? '');
  const [inspection, setInspection] = useState(car.inspectionExpiry ?? '');
  const [saving, setSaving] = useState(false);
  const [failed, setFailed] = useState(false);
  useBlockedPage();

  const stored: Record<ComplianceField, string | null> = { insurance: car.insuranceExpiry, inspection: car.inspectionExpiry };
  const typed: Record<ComplianceField, string> = { insurance, inspection };
  const setters: Record<ComplianceField, (value: string) => void> = { insurance: setInsurance, inspection: setInspection };

  // Only a complete, new date is sent, so half a date can never wipe the one on file.
  const change: CarDatesChange = {};
  (['insurance', 'inspection'] as const).forEach(field => {
    if (typed[field] && typed[field] !== stored[field]) change[COLUMN[field]] = typed[field];
  });
  const hasChange = Object.keys(change).length > 0;

  useEffect(() => {
    const field = car.issues[0]?.field ?? 'insurance';
    formRef.current?.querySelector<HTMLInputElement>(`[data-field="${field}"] input`)?.focus();
  }, [car.issues]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submitting.current || !hasChange) return;
    submitting.current = true;
    setSaving(true);
    setFailed(false);
    try {
      await saveCarDates(car.id, change);
      onSaved();
    } catch {
      setFailed(true);
      setSaving(false);
    } finally {
      submitting.current = false;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && !saving) { e.stopPropagation(); onClose(); }
  };

  return ReactDOM.createPortal(
    <div className="hc-compliance-backdrop is-top" onMouseDown={e => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <form ref={formRef} role="dialog" aria-modal="true" aria-label={t('compliance.datesTitle')} noValidate onSubmit={onSubmit} onKeyDown={onKeyDown} className="hc-car-dates surface-depth surface-float">
        <header className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="w-full text-[17px] font-semibold text-[#0f1117]">{t('compliance.datesTitle')}</h2>
          <PlateChip plate={car.plate} />
          <span dir="auto" className="text-sm text-gray-600">{car.model}</span>
        </header>

        {(['insurance', 'inspection'] as const).map(field => {
          const issue = car.issues.find(item => item.field === field);
          return (
            <div key={field} data-field={field} role="group" aria-label={t(`compliance.fields.${field}`)} className={`hc-car-date ${issue ? 'has-issue' : ''}`}>
              <div className="hc-field-label">{t(`compliance.fields.${field}`)}</div>
              <DateParts label={t(`compliance.fields.${field}`)} locale={locale} value={typed[field]} onChange={setters[field]} />
              {issue && <p className={`mt-1.5 text-xs font-medium ${issue.kind === 'expired' ? 'text-red-700' : 'text-amber-700'}`}>{issueText(issue)}</p>}
            </div>
          );
        })}

        {failed && <FormError>{t('compliance.saveFailed')}</FormError>}

        <footer className="hc-car-dates-foot">
          <Button variant="secondary" disabled={saving} onClick={onClose}>{tc('actions.cancel')}</Button>
          <Button type="submit" disabled={saving || !hasChange}>{saving ? tc('actions.saving') : tc('actions.saveChanges')}</Button>
        </footer>
      </form>
    </div>,
    document.body,
  );
};

export default CarDatesSheet;
