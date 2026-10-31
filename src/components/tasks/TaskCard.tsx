import React, { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { BUSINESS_TIME_ZONE } from '../../lib/istanbulTime';
import { useTimeFormat } from '../../lib/relative-time';
import type { StaffAvatarProfile } from '../../lib/staffAvatar';
import { dueTone } from '../../lib/taskGroups';
import type { MyTask, TaskPriority } from '../../lib/types/tasks';
import { useDateLocale } from '../../pages/AccountingPage';
import StaffAvatar from '../StaffAvatar';
import { ReceiptThumb } from '../WalletParts';

const DESCRIPTION_PREVIEW = 110;

/** Normal priority has no stripe: most tasks are normal, and an edge on all means nothing. */
const STRIPE: Partial<Record<TaskPriority, string>> = {
  urgent: 'bg-red-500',
  high: 'bg-amber-400',
  low: 'bg-gray-300',
};

const TONE_CLASS = { overdue: 'font-semibold text-red-600', soon: 'font-semibold text-amber-600', calm: 'text-gray-500' };

export function useDateTime(): (iso: string) => string {
  const locale = useDateLocale();
  return useCallback((iso: string) => new Date(iso).toLocaleString(locale, {
    day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23', timeZone: BUSINESS_TIME_ZONE,
  }), [locale]);
}

const CheckCircle: React.FC<{ task: MyTask; done: boolean; onTap: () => void }> = ({ task, done, onTap }) => {
  const { t } = useTranslation('tasks');
  return (
    <button
      type="button"
      onClick={onTap}
      disabled={done}
      aria-label={t(task.requires_proof ? 'card.completeWithProof' : 'card.complete', { title: task.title })}
      className="-m-2 flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full disabled:cursor-default"
    >
      <span
        data-done={done}
        className={`hc-task-circle relative flex size-[26px] items-center justify-center rounded-full border-2 ${done ? 'border-[var(--accent-strong)] bg-[var(--accent-strong)]' : 'border-gray-300 hover:border-[var(--accent)]'}`}
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path className="hc-task-tick" d="M5 12.5l4.5 4.5L19 7.5" stroke={done ? '#fff' : 'transparent'} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        {task.requires_proof && !done && (
          <span className="absolute -bottom-1.5 -end-1.5 flex size-4 items-center justify-center rounded-full bg-[var(--accent-strong)] text-white ring-2 ring-[var(--surface)]">
            <svg width="9" height="9" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M4 8.5A1.5 1.5 0 015.5 7H8l1.5-2.5h5L16 7h2.5A1.5 1.5 0 0120 8.5v9a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 014 17.5v-9z" fill="currentColor" />
            </svg>
          </span>
        )}
      </span>
    </button>
  );
};

const Chip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2 py-0.5 text-[11.5px] font-medium text-gray-600">{children}</span>
);

interface TaskCardProps {
  task: MyTask;
  now: Date;
  /** The check is landing and the card is about to fold away. */
  leaving?: boolean;
  highlighted?: boolean;
  /** Who gave it, for the small avatar. */
  from?: StaffAvatarProfile | null;
  onComplete?: (task: MyTask) => void;
  onOpenProof?: (url: string) => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, now, leaving = false, highlighted, from, onComplete, onOpenProof }) => {
  const { t } = useTranslation('tasks');
  const { due } = useTimeFormat();
  const dateTime = useDateTime();
  const [expanded, setExpanded] = useState(false);

  const isActive = task.status === 'open' || task.status === 'claimed';
  const isMissed = task.status === 'missed';
  const description = task.description ?? '';
  const isLong = description.length > DESCRIPTION_PREVIEW;
  const stripe = STRIPE[task.priority];

  return (
    <div className="hc-task-fold" data-leaving={leaving}>
      <div className="min-h-0 overflow-hidden p-px">
        <article
          data-task={task.id}
          className={`hc-task-card surface-depth relative flex gap-3 overflow-hidden rounded-[16px] border bg-[var(--surface)] p-4 ${highlighted ? 'border-[var(--accent)]' : 'border-[var(--border-subtle)]'} ${isMissed ? 'opacity-60' : ''}`}
        >
          {stripe && <span data-priority={task.priority} className={`absolute inset-y-0 start-0 w-1 ${stripe}`} />}

          {isActive && <CheckCircle task={task} done={leaving} onTap={() => onComplete?.(task)} />}

          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold leading-snug text-[#0f1117]">{task.title}</h3>

            {description && (
              <div className="mt-1 text-[13px] leading-relaxed text-gray-600">
                <p className={expanded || !isLong ? 'whitespace-pre-wrap' : 'line-clamp-2'}>{description}</p>
                {isLong && (
                  <button type="button" onClick={() => setExpanded(open => !open)} aria-expanded={expanded} className="min-h-7 cursor-pointer font-medium text-[var(--accent-strong)]">
                    {t(expanded ? 'card.less' : 'card.more')}
                  </button>
                )}
              </div>
            )}

            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-gray-500">
              {isActive && task.due_at && (
                <span title={dateTime(task.due_at)} className={`inline-flex items-center gap-1 ${TONE_CLASS[dueTone(task.due_at, now)]}`}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.9" />
                    <path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {due(task.due_at).text}
                </span>
              )}
              {task.status === 'done' && task.completed_at && <span>{t('card.completedOn', { date: dateTime(task.completed_at) })}</span>}
              {isMissed && task.due_at && <span>{t('card.missedOn', { date: dateTime(task.due_at) })}</span>}
              {task.kind === 'recurring' && (
                <Chip>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M4 12a8 8 0 0113.7-5.6L20 9M20 4v5h-5M20 12a8 8 0 01-13.7 5.6L4 15M4 20v-5h5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                  {t('card.recurring')}
                </Chip>
              )}
              {isActive && task.requires_proof && <Chip>📷 {t('card.proof')}</Chip>}
              {task.created_by_name && (
                <span className="inline-flex items-center gap-1.5">
                  <StaffAvatar profile={from} size={18} />
                  {t('card.from', { name: task.created_by_name })}
                </span>
              )}
            </div>

            {task.status === 'done' && (task.completion_notes || task.proof_url) && (
              <div className="mt-3 flex items-start gap-3 rounded-xl bg-black/[0.03] p-3">
                {task.proof_url && <ReceiptThumb url={task.proof_url} label={t('card.viewProof')} onOpen={url => onOpenProof?.(url)} />}
                {task.completion_notes && <p className="min-w-0 whitespace-pre-wrap text-[13px] leading-relaxed text-gray-600">{task.completion_notes}</p>}
              </div>
            )}
          </div>
        </article>
      </div>
    </div>
  );
};

export default TaskCard;
