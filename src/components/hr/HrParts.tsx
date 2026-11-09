import React from 'react';
import { useTranslation } from 'react-i18next';
import type { Applicant } from '../../lib/recruitment/hr';
import {
  CONFIRMATION_TONES,
  PRIORITY_TONES,
  SETTABLE_CONFIRMATIONS,
  STAGE_TONES,
  type InterviewConfirmation,
  type Priority,
  type RecruitmentStage,
} from '../../lib/recruitment/model';

/** A candidate's answer to the interview invitation. */
export const ConfirmationChip: React.FC<{ status: InterviewConfirmation }> = ({ status }) => {
  const { t } = useTranslation('hr');
  const tone = CONFIRMATION_TONES[status];
  return (
    <span className="hc-hr-chip" style={{ background: tone.bg, color: tone.ink }}>
      <i aria-hidden="true" style={{ background: tone.dot }} />
      {t(`confirmation.${status}`)}
    </span>
  );
};

/** Coming / Not coming / No response, as pressed buttons; `pending` presses none. */
export const ConfirmationPicker: React.FC<{ value: InterviewConfirmation; onChange: (next: InterviewConfirmation) => void; disabled?: boolean; label: string }> = ({ value, onChange, disabled, label }) => {
  const { t } = useTranslation('hr');
  return (
    <div role="group" aria-label={label} className="hc-hr-confirm">
      {SETTABLE_CONFIRMATIONS.map(status => {
        const tone = CONFIRMATION_TONES[status];
        const on = value === status;
        return (
          <button key={status} type="button" aria-pressed={on} disabled={disabled} onClick={() => onChange(status)}
            style={on ? { background: tone.bg, color: tone.ink, borderColor: tone.dot } : undefined}>
            <i aria-hidden="true" style={{ background: tone.dot }} />
            {t(`confirmation.${status}`)}
          </button>
        );
      })}
    </div>
  );
};

export const StageChip: React.FC<{ stage: RecruitmentStage }> = ({ stage }) => {
  const { t } = useTranslation('hr');
  const tone = STAGE_TONES[stage];
  return (
    <span className="hc-hr-chip" style={{ background: tone.bg, color: tone.ink }}>
      <i aria-hidden="true" style={{ background: tone.rail }} />
      {t(`stage.${stage}`)}
    </span>
  );
};

export const PriorityChip: React.FC<{ priority: Priority }> = ({ priority }) => {
  const { t } = useTranslation('hr');
  const tone = PRIORITY_TONES[priority];
  return <span className="hc-hr-chip" style={{ background: tone.bg, color: tone.ink }}>{t(`priority.${priority}`)}</span>;
};

const Star: React.FC<{ on: boolean }> = ({ on }) => (
  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 3.5l2.6 5.3 5.9.9-4.3 4.1 1 5.8L12 16.9l-5.2 2.7 1-5.8-4.3-4.1 5.9-.9z" fill={on ? '#F5B301' : 'none'} stroke={on ? '#F5B301' : '#CBD5E1'} strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
);

/** 1 to 5 stars; pressing the current star clears it. */
export const StarRating: React.FC<{ value: number | null; onChange?: (next: number | null) => void; label: string }> = ({ value, onChange, label }) => {
  const { t } = useTranslation('hr');
  if (!onChange) {
    return <span role="img" aria-label={value ? t('applicant.ratingStars', { count: value }) : label} className="hc-hr-stars">{[1, 2, 3, 4, 5].map(n => <Star key={n} on={(value ?? 0) >= n} />)}</span>;
  }
  return (
    <span role="group" aria-label={label} className="hc-hr-stars">
      {[1, 2, 3, 4, 5].map(n => (
        <button key={n} type="button" aria-pressed={value === n} aria-label={value === n ? t('applicant.clearRating') : t('applicant.ratingStars', { count: n })} onClick={() => onChange(value === n ? null : n)}>
          <Star on={(value ?? 0) >= n} />
        </button>
      ))}
    </span>
  );
};

/** A 1–5 score for one criterion, as pressed buttons. */
export const ScorePicker: React.FC<{ value: number | null; onChange: (next: number | null) => void; label: string; disabled?: boolean }> = ({ value, onChange, label, disabled }) => (
  <span role="group" aria-label={label} className="hc-hr-score">
    {[1, 2, 3, 4, 5].map(n => (
      <button key={n} type="button" aria-pressed={value === n} disabled={disabled} onClick={() => onChange(value === n ? null : n)}>{n}</button>
    ))}
  </span>
);

/**
 * What the application endpoint flagged: auto-rejected by a knock-out rule (the reasons
 * in its tooltip), a possible duplicate (a link to the earlier applicant), and the
 * language they applied in.
 */
export const ApplicantFlags: React.FC<{
  applicant: Pick<Applicant, 'knockoutFailed' | 'knockoutReasons' | 'duplicateOf' | 'language'>;
  duplicateName?: string | null;
  /** Null when the earlier applicant isn't on screen; the badge then only says so. */
  onOpenDuplicate?: (() => void) | null;
  compact?: boolean;
}> = ({ applicant, duplicateName, onOpenDuplicate, compact = false }) => {
  const { t } = useTranslation('hr');
  const reasons = applicant.knockoutReasons.join(' · ');
  return (
    <>
      {applicant.knockoutFailed && (
        <span className="hc-hr-chip hc-hr-flag is-rejected" title={reasons || undefined} tabIndex={reasons ? 0 : undefined}
          aria-label={reasons ? `${t('flags.autoRejected')}: ${reasons}` : t('flags.autoRejected')}>
          {t('flags.autoRejected')}
        </span>
      )}
      {applicant.duplicateOf && (onOpenDuplicate && !compact ? (
        <button type="button" className="hc-hr-chip hc-hr-flag is-duplicate" onClick={onOpenDuplicate}
          title={duplicateName ? t('flags.duplicateOf', { name: duplicateName }) : undefined}>
          {t('flags.duplicate')}{duplicateName ? <span className="opacity-75"> · <bdi dir="auto">{duplicateName}</bdi></span> : null}
        </button>
      ) : (
        <span className="hc-hr-chip hc-hr-flag is-duplicate" title={duplicateName ? t('flags.duplicateOf', { name: duplicateName }) : undefined}>{t('flags.duplicate')}</span>
      ))}
      {applicant.language && <span className="hc-hr-chip hc-hr-lang" title={t(`flags.language.${applicant.language}`, { defaultValue: applicant.language })}>{applicant.language.toUpperCase()}</span>}
    </>
  );
};
