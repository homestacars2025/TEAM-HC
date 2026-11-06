import React, { useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import PlateChip from '../booking/PlateChip';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { formatPlate } from '../../lib/custodyExpense';
import type { Conflict, Severity } from '../../lib/fleetCalendar';

const Chevron: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="hc-fc-issues-chevron"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

/**
 * This month's problems from `calendar_conflicts`, most serious first. Hidden when
 * there are none; open by default only when one is serious.
 */
const ConflictsPanel: React.FC<{ conflicts: Conflict[]; onJump: (conflict: Conflict) => void }> = ({ conflicts, onJump }) => {
  const { t } = useTranslation(['calendar', 'common']);
  const locale = useDateLocale();
  const listId = useId();
  const high = conflicts.filter(c => c.severity === 'high').length;
  const [open, setOpen] = useState(high > 0);
  if (conflicts.length === 0) return null;
  const counts = (['high', 'medium', 'low'] as Severity[]).map(severity => [severity, conflicts.filter(c => c.severity === severity).length] as const).filter(([, n]) => n > 0);

  const blockLabel = (ref: string | null) => (ref ? t(`common:carStatus.${ref}`, { defaultValue: ref }) : '');

  return (
    <section className={`hc-fc-issues ${high > 0 ? 'is-high' : 'is-medium'}`} aria-label={t('conflicts.title', { count: conflicts.length })}>
      <button type="button" className="hc-fc-issues-head" aria-expanded={open} aria-controls={listId} onClick={() => setOpen(value => !value)}>
        <img src={`/illustrations/alerts/${high > 0 ? 'triangle-red' : 'triangle-amber'}.webp`} alt="" width={30} height={30} className="hc-fc-issues-art" />
        <strong>{t('conflicts.title', { count: conflicts.length })}</strong>
        <span className="hc-fc-issues-counts">
          {counts.map(([severity, n]) => <span key={severity} className={`hc-fc-sev is-${severity}`}>{t(`conflicts.severity.${severity}`)} <b className="hc-num">{n}</b></span>)}
        </span>
        <span className="hc-fc-issues-toggle">{open ? t('conflicts.hide') : t('conflicts.show')}<Chevron /></span>
      </button>
      {open && (
        <ul id={listId} className="hc-fc-issues-list">
          {conflicts.map((conflict, index) => (
            <li key={`${conflict.kind}:${conflict.booking_id}:${conflict.other_ref}:${index}`}>
              <button type="button" className={`hc-fc-issue is-${conflict.severity}`} onClick={() => onJump(conflict)} title={conflict.plate ? t('conflicts.jump', { plate: formatPlate(conflict.plate) }) : undefined}>
                <span className="hc-fc-sev-dot" aria-hidden="true" />
                {conflict.plate && <PlateChip plate={conflict.plate} />}
                <span className="hc-fc-issue-text">
                  <span>{t(`conflicts.kinds.${conflict.kind}`, {
                    number: conflict.booking_number ?? '—',
                    other: conflict.other_ref ?? '—',
                    block: blockLabel(conflict.other_ref),
                    defaultValue: conflict.message ?? conflict.kind,
                  })}</span>
                  {conflict.date_from && (
                    <small>{formatDay(conflict.date_from, locale)}{conflict.date_to && conflict.date_to !== conflict.date_from ? ` → ${formatDay(conflict.date_to, locale)}` : ''}</small>
                  )}
                </span>
                <span className={`hc-fc-sev is-${conflict.severity}`}>{t(`conflicts.severity.${conflict.severity}`)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};

export default ConflictsPanel;
