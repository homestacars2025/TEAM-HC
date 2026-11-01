import React from 'react';
import { useTranslation } from 'react-i18next';
import { formatDay } from '../../hooks/useDateLocale';
import type { StaffProfiles } from '../../hooks/useStaffProfiles';
import { ageTone, asIssueStatus, asIssueType, daysOpen, photoUrls, type IssueRow, type IssueType } from '../../lib/carIssues';
import PlateChip from '../booking/PlateChip';
import StaffAvatar from '../StaffAvatar';

const stroke = { stroke: 'currentColor', strokeWidth: 1.8, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

export const ISSUE_ICONS: Record<IssueType, React.ReactNode> = {
  accident: <><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" {...stroke} /><path d="M12 9v4M12 17h.01" {...stroke} /></>,
  damage: <path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" {...stroke} />,
  mechanical: <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" {...stroke} />,
  sound: <><path d="M11 5L6 9H2v6h4l5 4V5z" {...stroke} /><path d="M15.5 8.5a5 5 0 010 7M19 5a10 10 0 010 14" {...stroke} /></>,
  maintenance: <><circle cx="12" cy="12" r="3" {...stroke} /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1L7 17M17 7l2.1-2.1" {...stroke} /></>,
  other: <><circle cx="12" cy="12" r="9" {...stroke} /><path d="M9.5 9.5a2.5 2.5 0 115 0c0 1.7-2.5 1.9-2.5 4M12 17.5h.01" {...stroke} /></>,
};

export const IssueIcon: React.FC<{ type: IssueType; size?: number }> = ({ type, size = 14 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">{ISSUE_ICONS[type]}</svg>
);

export const TypeChip: React.FC<{ type: string }> = ({ type }) => {
  const { t } = useTranslation('carIssues');
  const known = asIssueType(type);
  return <span className={`hc-type-chip is-${known}`}><IssueIcon type={known} size={12} />{t(`types.${known}`)}</span>;
};

export const StatusPill: React.FC<{ status: string }> = ({ status }) => {
  const { t } = useTranslation('carIssues');
  const known = asIssueStatus(status);
  return <span className={`hc-pill ${known === 'open' ? 'is-red' : 'is-green'}`}>{t(`status.${known}`)}</span>;
};

interface IssueCardProps {
  issue: IssueRow;
  today: string;
  locale: string;
  profiles: StaffProfiles | null;
  layout: 'board' | 'list';
  draggable: boolean;
  onOpen: () => void;
  onDragStart: () => void;
}

export const IssueCard: React.FC<IssueCardProps> = ({ issue, today, locale, profiles, layout, draggable, onOpen, onDragStart }) => {
  const { t } = useTranslation('carIssues');
  const known = asIssueType(issue.type);
  const open = asIssueStatus(issue.status) === 'open';
  const thumb = photoUrls(issue.damage_photos)[0];
  const age = daysOpen(issue.discovered_at, today);
  const profile = issue.discovered_by ? profiles?.get(issue.discovered_by) : undefined;

  return (
    <article
      className={`hc-issue-card surface-depth ${layout === 'list' ? 'is-row' : ''}`}
      draggable={draggable}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart(); }}
    >
      <button type="button" className="hc-row-open" aria-label={`${t('detail.title')} ${issue.plate_number}`} onClick={onOpen} />
      <div className={`hc-issue-thumb is-${known}`}>
        {thumb ? <img src={thumb} alt="" loading="lazy" /> : <IssueIcon type={known} size={26} />}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <PlateChip plate={issue.plate_number} />
          {issue.model_name && <span dir="auto" className="min-w-0 truncate text-[13px] text-gray-600">{issue.model_name}</span>}
        </div>
        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <TypeChip type={issue.type} />
          {open
            ? <span className={`hc-age is-${ageTone(age)}`}>{t('card.daysOpen', { count: age })}</span>
            : issue.days_to_resolve !== null && <span className="hc-age is-calm">{t('card.resolvedIn', { days: issue.days_to_resolve })}</span>}
        </div>
        <p dir="auto" className="hc-issue-text">{issue.description?.trim() || t('detail.noDescription')}</p>
        <div className="hc-issue-meta">
          <span className="inline-flex min-w-0 items-center gap-1.5">
            <StaffAvatar profile={profile} size={20} />
            <span dir="auto" className="truncate">{issue.discovered_by_name ?? '—'}</span>
          </span>
          <span>{formatDay(issue.discovered_at, locale)}</span>
          {(issue.customer_name || issue.booking_number) && (
            <span dir="auto" className="min-w-0 truncate">{[issue.customer_name, issue.booking_number].filter(Boolean).join(' · ')}</span>
          )}
        </div>
      </div>
    </article>
  );
};
