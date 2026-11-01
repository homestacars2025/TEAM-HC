import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { ExpenseCar } from '../../lib/custodyExpense';
import { carSheetCategory, matchDefaults, type MatchTarget, type ReviewExpense } from '../../lib/expenseReview';
import type { ExpenseMatch } from '../../lib/queries/expenseReview';
import CarPicker from '../booking/CarPicker';
import Button from '../Button';
import { categoryLabel, CAR_CATEGORIES, COMPANY_CATEGORIES } from '../../pages/AccountingPage';

const TARGETS: MatchTarget[] = ['car', 'company', 'other'];
const WIDTH = 340;
const GAP = 8;

interface MatchPopoverProps {
  row: ReviewExpense;
  anchor: DOMRect;
  /** `null` while loading. */
  cars: ExpenseCar[] | null;
  carsFailed: boolean;
  onRetryCars: () => void;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: (match: ExpenseMatch) => void;
}

/** Where a pending expense goes, opened on what the expense itself suggests. */
const MatchPopover: React.FC<MatchPopoverProps> = ({ row, anchor, cars, carsFailed, onRetryCars, busy, error, onClose, onConfirm }) => {
  const { t } = useTranslation('finance');
  const { t: ta } = useTranslation('accounting');
  const { t: tc } = useTranslation('common');
  const box = useRef<HTMLFormElement>(null);
  const initial = useMemo(() => matchDefaults(row), [row]);
  const [target, setTarget] = useState<MatchTarget>(initial.target);
  const [carId, setCarId] = useState<number | null>(initial.carId);
  const [category, setCategory] = useState(initial.category);
  const [note, setNote] = useState('');
  const [place, setPlace] = useState<React.CSSProperties>({ visibility: 'hidden' });

  // Never the list a value isn't in: a custody category can be missing from both.
  const options = useMemo(() => {
    const list = target === 'car' ? CAR_CATEGORIES.OUT : COMPANY_CATEGORIES.OUT;
    return list.includes(category) ? list : [category, ...list];
  }, [target, category]);

  const pickTarget = (next: MatchTarget) => {
    setTarget(next);
    if (next === 'car') setCategory(carSheetCategory(row.category));
    if (next === 'company') setCategory(row.category || 'Other');
  };

  useLayoutEffect(() => {
    if (!box.current) return;
    const { innerWidth: width, innerHeight: height } = window;
    const rtl = document.documentElement.dir === 'rtl';
    const left = Math.min(Math.max(GAP, rtl ? anchor.left : anchor.right - WIDTH), width - WIDTH - GAP);
    const tall = box.current.offsetHeight;
    const below = anchor.bottom + GAP;
    setPlace({ left, top: below + tall <= height - GAP ? below : Math.max(GAP, anchor.top - tall - GAP) });
  }, [anchor, target, cars]);

  useEffect(() => {
    const onPointer = (e: PointerEvent) => { if (!busy && !box.current?.contains(e.target as Node)) onClose(); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && !busy) onClose(); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [busy, onClose]);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    box.current?.querySelector<HTMLElement>('button')?.focus();
    return () => opener?.focus?.();
  }, []);

  const ready = target !== 'car' || carId !== null;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!ready || busy) return;
    onConfirm({ target, carId: target === 'car' ? carId : null, category: target === 'other' ? null : category, note: note.trim() || null });
  };

  return ReactDOM.createPortal(
    <form ref={box} role="dialog" aria-label={t('match.title')} onSubmit={submit} className="hc-match surface-depth surface-float" style={place}>
      <div className="hc-match-field">
        <span className="hc-field-label">{t('match.target')}</span>
        <div className="hc-seg hc-seg-full">
          {TARGETS.map(option => (
            <button key={option} type="button" aria-pressed={target === option} disabled={busy} onClick={() => pickTarget(option)}>{t(`match.${option}`)}</button>
          ))}
        </div>
      </div>

      {target === 'car' && (
        <div className="hc-match-field">
          <span id="hc-match-car" className="hc-field-label">{t('match.car')}</span>
          <CarPicker labelId="hc-match-car" cars={cars} failed={carsFailed} onRetry={onRetryCars} recent={[]} value={carId} onChange={setCarId} disabled={busy} />
        </div>
      )}

      {target !== 'other' && (
        <label className="hc-match-field">
          <span className="hc-field-label">{t('match.category')}</span>
          <select className="hc-input !mt-0" value={category} disabled={busy} onChange={e => setCategory(e.target.value)}>
            {options.map(option => <option key={option} value={option}>{categoryLabel(ta, option)}</option>)}
          </select>
        </label>
      )}

      <label className="hc-match-field">
        <span className="hc-field-label">{t('match.note')}</span>
        <input className="hc-input !mt-0" maxLength={200} value={note} disabled={busy} onChange={e => setNote(e.target.value)} />
      </label>

      {error && <p role="alert" className="text-[13px] text-red-600">{error}</p>}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" disabled={busy} onClick={onClose}>{tc('actions.cancel')}</Button>
        <Button type="submit" disabled={busy || !ready}>{t('match.confirm')}</Button>
      </div>
    </form>,
    document.body,
  );
};

export default MatchPopover;
