import React, { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import { istanbulDate } from '../../lib/istanbulTime';
import { RANGE_PRESETS, presetOf, presetRange, rangeLabel, readRange, type DayRange } from '../../lib/hgs';

/**
 * A range of days for the HGS page, on one car or on every car: four presets and a
 * custom from / to. It opens in a layer of its own, since the car cards clip what
 * hangs out of them; a phone gets it as a sheet from the bottom.
 */

export const CalendarIcon: React.FC<{ size?: number }> = ({ size = 15 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <rect x="3.5" y="5" width="17" height="15.5" rx="3" stroke="currentColor" strokeWidth="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
  </svg>
);

const POP_WIDTH = 320;
const GAP = 6;

interface HgsRangePickerProps {
  range: DayRange | null;
  onChange: (range: DayRange | null) => void;
  /** The popover's heading, which names what the range applies to. */
  title: string;
  /** `row` is the small button on a car; `global` the one beside the month. */
  variant: 'row' | 'global';
  /** What the button says when no range is set. */
  label: string;
}

const HgsRangePicker: React.FC<HgsRangePickerProps> = ({ range, onChange, title, variant, label }) => {
  const { t } = useTranslation('hgs');
  const sheet = !useMediaQuery('(min-width: 640px)');
  const titleId = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const pop = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [place, setPlace] = useState<{ top: number; left: number } | null>(null);
  const today = istanbulDate();
  const active = presetOf(range, today);
  const [custom, setCustom] = useState(false);
  const [draft, setDraft] = useState<DayRange>(() => range ?? presetRange('thisMonth', today));

  const show = () => {
    setCustom(!!range && !active);
    setDraft(range ?? presetRange('thisMonth', today));
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) trigger.current?.focus();
  };
  const apply = (next: DayRange | null) => {
    onChange(next);
    close(true);
  };

  // Under the button, its end edge on the button's end edge, kept on screen.
  useLayoutEffect(() => {
    if (!open || sheet) return undefined;
    const measure = () => {
      const box = trigger.current?.getBoundingClientRect();
      if (!box) return;
      const rtl = getComputedStyle(trigger.current!).direction === 'rtl';
      const width = Math.min(POP_WIDTH, window.innerWidth - 16);
      const left = Math.min(Math.max(rtl ? box.left : box.right - width, 8), window.innerWidth - width - 8);
      const height = pop.current?.offsetHeight ?? 0;
      const below = box.bottom + GAP;
      const top = below + height > window.innerHeight - 8 && box.top - GAP - height > 8 ? box.top - GAP - height : below;
      setPlace({ top, left });
    };
    measure();
    window.addEventListener('resize', measure);
    window.addEventListener('scroll', measure, true);
    return () => {
      window.removeEventListener('resize', measure);
      window.removeEventListener('scroll', measure, true);
    };
  }, [open, sheet, custom]);

  useEffect(() => {
    if (!open) return undefined;
    pop.current?.querySelector<HTMLElement>('button[aria-pressed="true"], button')?.focus({ preventScroll: true });
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!pop.current?.contains(target) && !trigger.current?.contains(target)) close(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close(true); } };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const valid = readRange(draft.from, draft.to);

  const panel = (
    <div
      ref={pop}
      role="dialog"
      aria-labelledby={titleId}
      className={`hc-hgs-range-pop surface-depth surface-float ${sheet ? 'is-sheet' : ''}`}
      style={sheet ? undefined : { top: place?.top ?? -9999, left: place?.left ?? -9999, width: Math.min(POP_WIDTH, window.innerWidth - 16) }}
    >
      <h3 id={titleId}>{title}</h3>
      <div role="group" aria-label={t('range.presets')} className="hc-hgs-range-presets">
        {RANGE_PRESETS.map(preset => (
          <button key={preset} type="button" aria-pressed={!custom && active === preset} onClick={() => apply(presetRange(preset, today))}>
            {t(`range.${preset}`)}
          </button>
        ))}
        <button type="button" aria-pressed={custom} aria-expanded={custom} onClick={() => setCustom(true)}>{t('range.custom')}</button>
      </div>
      {custom && (
        <form className="hc-hgs-range-custom" noValidate onSubmit={e => { e.preventDefault(); if (valid) apply(valid); }}>
          <label>
            <span>{t('range.from')}</span>
            <input type="date" className="hc-input !mt-0" value={draft.from} max={today} onChange={e => setDraft(current => ({ ...current, from: e.target.value }))} />
          </label>
          <label>
            <span>{t('range.to')}</span>
            <input type="date" className="hc-input !mt-0" value={draft.to} max={today} onChange={e => setDraft(current => ({ ...current, to: e.target.value }))} />
          </label>
          <Button type="submit" disabled={!valid}>{t('range.apply')}</Button>
        </form>
      )}
      {range && (
        <button type="button" className="hc-hgs-range-clear" onClick={() => apply(null)}>
          {t(variant === 'row' ? 'range.clearRow' : 'range.clearGlobal')}
        </button>
      )}
    </div>
  );

  const set = !!range;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        className={variant === 'row' ? `hc-hgs-dates ${set ? 'is-set' : ''}` : `hc-hgs-range-open ${set ? 'is-set' : ''}`}
        title={variant === 'row' ? title : undefined}
        aria-label={variant === 'row' ? title : undefined}
        onClick={() => (open ? close(false) : show())}
      >
        <CalendarIcon />
        <span className={variant === 'row' ? 'hc-hgs-dates-label' : undefined}>
          {variant === 'global' && range ? <bdi dir="ltr">{rangeLabel(range, today)}</bdi> : label}
        </span>
      </button>
      {open && ReactDOM.createPortal(
        sheet ? (
          <div className="hc-hgs-range-backdrop" onPointerDown={e => { if (e.target === e.currentTarget) close(false); }}>{panel}</div>
        ) : panel,
        document.body,
      )}
    </>
  );
};

export default HgsRangePicker;
