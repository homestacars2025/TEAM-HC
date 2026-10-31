import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePageAccess } from '../../contexts/PageAccessContext';
import type { GoalGap, GoalMetric } from '../../lib/queries/goals';
import { formatDateDisplay, useDateLocale } from '../../pages/AccountingPage';
import { GOAL_COLORS, RingArc, useMetricText } from './GoalRing';

/** The page that can show a gap, or `null` for someone who cannot open it. */
export function gapLink(gap: GoalGap, canOpen: (page: string) => boolean): string | null {
  if (gap.ref_type === 'custody') return canOpen('custody') ? `/dashboard/custody?entry=${gap.ref_id}` : null;
  if (!canOpen('operations')) return null;
  return `/dashboard/operations?op=${gap.ref_id}&month=${gap.ref_date.slice(0, 7)}`;
}

export const useMissingLabel = () => {
  const { t } = useTranslation('goals');
  return (item: string): string => {
    if (item.startsWith('photo:')) {
      const slot = item.slice('photo:'.length);
      return t('missing.photo', { slot: t(`missing.photos.${slot}`, { defaultValue: slot }) });
    }
    return t(`missing.${item}`, { defaultValue: item });
  };
};

const GapRow: React.FC<{ gap: GoalGap }> = ({ gap }) => {
  const { canAccessPage } = usePageAccess();
  const dateLocale = useDateLocale();
  const missingLabel = useMissingLabel();
  const to = gapLink(gap, canAccessPage);

  const content = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[13px] text-gray-500">{formatDateDisplay(gap.ref_date, dateLocale)}</span>
        {gap.plate && <span className="hc-num text-[13px] font-semibold text-[#0f1117]">{gap.plate}</span>}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {gap.missing.map(item => (
          <span key={item} className="rounded-full bg-red-50 px-2.5 py-0.5 text-xs font-medium text-red-700">{missingLabel(item)}</span>
        ))}
      </div>
    </>
  );

  const shell = 'block rounded-xl border border-[var(--border-subtle)] p-3 no-underline';
  return to
    ? <Link to={to} className={`${shell} transition-colors hover:border-[var(--accent)]`}>{content}</Link>
    : <div className={shell}>{content}</div>;
};

interface GoalSheetProps {
  metric: GoalMetric;
  /** `null` when the list failed to load. */
  gaps: GoalGap[] | null;
  onClose: () => void;
}

const GoalSheet: React.FC<GoalSheetProps> = ({ metric, gaps, onClose }) => {
  const { t } = useTranslation('goals');
  const { t: tc } = useTranslation('common');
  const text = useMetricText()(metric);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      opener?.focus?.();
    };
  }, [onClose]);

  const rows = gaps?.filter(gap => gap.metric_key === metric.metric_key) ?? [];
  const hasCustody = rows.some(gap => gap.ref_type === 'custody');

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[9000]">
      <div className="absolute inset-0 bg-[rgba(15,17,23,0.4)]" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={text.label}
        className="hc-sheet absolute inset-y-0 end-0 flex w-full flex-col bg-[var(--surface)] shadow-[0_0_60px_rgba(0,0,0,0.18)] sm:w-[440px]"
      >
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-[var(--border-subtle)] px-5">
          <h2 className="truncate text-[15px] font-semibold text-[#0f1117]">{text.label}</h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={tc('actions.close')}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-400 hover:bg-black/[0.04] hover:text-gray-600"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <div className="flex items-center gap-4">
            <RingArc metric={metric} size={88} />
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 text-[13px] font-semibold" style={{ color: metric.status === 'none' ? '#737373' : GOAL_COLORS[metric.status] }}>
                <span className="size-2 rounded-full" style={{ background: GOAL_COLORS[metric.status] }} />
                {t(`status.${metric.status}`)}
              </div>
              <div className="mt-1 text-[13px] text-gray-500">
                {t('target', { target: metric.kind === 'percent' ? `${metric.target}%` : metric.target })}
              </div>
            </div>
          </div>

          {text.description && <p className="mt-4 text-sm leading-relaxed text-gray-600">{text.description}</p>}

          <h3 className="mb-2 mt-6 text-[13px] font-semibold text-[#0f1117]">{t('gaps.title')}</h3>
          {gaps === null ? (
            <p role="alert" className="text-[13px] text-gray-500">{t('gaps.failed')}</p>
          ) : rows.length === 0 ? (
            <p className="text-[13px] text-gray-500">{t(metric.kind === 'count' ? 'gaps.notApplicable' : 'gaps.none')}</p>
          ) : (
            <div className="flex flex-col gap-2">
              {hasCustody && <p className="mb-1 text-[13px] leading-relaxed text-gray-500">{t('gaps.custodyHint')}</p>}
              {rows.map(gap => <GapRow key={`${gap.ref_type}:${gap.ref_id}`} gap={gap} />)}
            </div>
          )}
        </div>
      </aside>
    </div>,
    document.body,
  );
};

export default GoalSheet;
