import React, { useCallback, useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import { useBlockedPage } from '../../hooks/useBlockedPage';
import { useDateLocale } from '../../hooks/useDateLocale';
import {
  NOTE_TYPES,
  addNote,
  finishInterview,
  listActivities,
  markNoShow,
  moveStage,
  saveScore,
  setShortlisted,
  signedFileUrl,
  startInterview,
  updateApplicant,
  type Activity,
  type Applicant,
  type HrSlot,
  type Interview,
  type NoteType,
  type Opening,
} from '../../lib/recruitment/hr';
import { setConfirmation } from '../../lib/recruitment/interviews';
import {
  PRIORITIES,
  RECOMMENDATIONS,
  RECOMMENDATION_STAGE,
  RECRUITMENT_STAGES,
  answerToStrings,
  applicantFiles,
  formatDayLabel,
  optionLabel,
  optionValue,
  pickLabel,
  type FormField,
  formatTime,
  istanbulDay,
  readStage,
  weightedScore,
  type InterviewConfirmation,
  type Priority,
  type Recommendation,
  type RecruitmentStage,
} from '../../lib/recruitment/model';
import { ApplicantFlags, ConfirmationPicker, PriorityChip, ScorePicker, StageChip, StarRating } from './HrParts';

const CloseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);
const FileIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8l-5-5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /><path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" /></svg>
);

const Section: React.FC<{ title: string; aside?: React.ReactNode; children: React.ReactNode }> = ({ title, aside, children }) => (
  <section className="hc-ce-section surface-depth">
    <header className="hc-ce-section-head">
      <div className="hc-ce-section-title"><h3>{title}</h3></div>
      {aside && <div className="ms-auto">{aside}</div>}
    </header>
    {children}
  </section>
);

/** wa.me wants digits only, with the country code; a Turkish 05… number gets 90. */
const whatsappLink = (phone: string) => {
  const digits = phone.replace(/\D/g, '');
  return `https://wa.me/${digits.startsWith('0') ? `90${digits.slice(1)}` : digits}`;
};

// ─── Live scorecard ───────────────────────────────────────────────────────────

const ScorecardSheet: React.FC<{
  applicant: Applicant;
  opening: Opening;
  interview: Interview;
  profileId: string | null;
  onClose: () => void;
  onFinished: () => void;
  onError: (message: string) => void;
}> = ({ applicant, opening, interview, profileId, onClose, onFinished, onError }) => {
  const { t } = useTranslation('hr');
  useBlockedPage();
  const [scores, setScores] = useState(() => new Map(interview.scores.map(s => [s.criterion, { score: s.score, note: s.note ?? '' }])));
  const [notes, setNotes] = useState(interview.overallNotes ?? '');
  const [recommendation, setRecommendation] = useState<Recommendation | null>(interview.recommendation);
  const [busy, setBusy] = useState(false);
  const total = weightedScore(opening.interviewCriteria, Array.from(scores, ([criterion, v]) => ({ criterion, score: v.score })));

  const put = async (criterion: string, score: number | null, note: string) => {
    setScores(current => new Map(current).set(criterion, { score, note }));
    try { await saveScore(interview.id, criterion, score, note); } catch (reason) { onError(reason instanceof Error ? reason.message : String(reason)); }
  };

  const finish = async () => {
    setBusy(true);
    try {
      await finishInterview(interview.id, applicant.id, recommendation, notes, profileId);
      onFinished();
    } catch (reason) {
      setBusy(false);
      onError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return ReactDOM.createPortal(
    <div className="hc-ce-backdrop hc-hr-layer2" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="hc-sc-title" className="hc-ce hc-hr-drawer surface-float" onKeyDown={e => { if (e.key === 'Escape' && !busy) { e.stopPropagation(); onClose(); } }}>
        <header className="hc-ce-head">
          <div className="hc-ce-head-text">
            <h2 id="hc-sc-title"><bdi dir="auto">{t('scorecard.title', { name: applicant.fullName })}</bdi></h2>
            <p className="mt-0.5 text-[12.5px] text-black/50">{t('scorecard.savedAuto')}</p>
          </div>
          {total && <span className="hc-hr-score-total hc-num">{t('applicant.score', { total: total.total })}</span>}
          <button type="button" className="hc-ce-close" onClick={onClose} disabled={busy} aria-label={t('common:actions.close')}><CloseIcon /></button>
        </header>
        <div className="hc-ce-body">
          {opening.interviewQuestions.length > 0 && (
            <Section title={t('scorecard.prompts')}>
              <ol className="hc-hr-prompts">{opening.interviewQuestions.map(q => <li key={q} dir="auto">{q}</li>)}</ol>
            </Section>
          )}
          <Section title={t('scorecard.criteria')}>
            {opening.interviewCriteria.length === 0 ? <p className="text-[13px] text-black/50">{t('applicant.noCriteria')}</p> : (
              <ul className="hc-hr-criteria">
                {opening.interviewCriteria.map(c => {
                  const entry = scores.get(c.key) ?? { score: null, note: '' };
                  return (
                    <li key={c.key}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <strong dir="auto">{c.label}{c.weight !== null && <small className="hc-num ms-1.5 text-black/40">{c.weight}%</small>}</strong>
                        <ScorePicker value={entry.score} label={c.label} onChange={score => put(c.key, score, entry.note)} />
                      </div>
                      <input dir="auto" className="hc-input mt-2" placeholder={t('scorecard.note')} aria-label={`${t('scorecard.note')} · ${c.label}`} defaultValue={entry.note}
                        onBlur={e => { if (e.target.value !== entry.note) put(c.key, entry.score, e.target.value); }} />
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>
          <Section title={t('scorecard.overall')}>
            <textarea dir="auto" rows={4} className="hc-input" aria-label={t('scorecard.overall')} value={notes} onChange={e => setNotes(e.target.value)} />
            <div className="mt-3">
              <span className="hc-field-label">{t('scorecard.recommendation')}</span>
              <div role="group" aria-label={t('scorecard.recommendation')} className="hc-seg hc-seg-full">
                <button type="button" aria-pressed={recommendation === null} onClick={() => setRecommendation(null)}>{t('scorecard.noRecommendation')}</button>
                {RECOMMENDATIONS.map(r => <button key={r} type="button" aria-pressed={recommendation === r} onClick={() => setRecommendation(r)}>{t(`recommendation.${r}`)}</button>)}
              </div>
              {recommendation && <p className="mt-1.5 text-[12px] text-black/50">{t('scorecard.stageHint', { stage: t(`stage.${RECOMMENDATION_STAGE[recommendation]}`) })}</p>}
            </div>
          </Section>
        </div>
        <footer className="hc-ce-foot">
          <span />
          <Button onClick={finish} disabled={busy} aria-busy={busy}>{busy ? t('scorecard.finishing') : t('scorecard.finish')}</Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
};

// ─── Drawer ───────────────────────────────────────────────────────────────────

export const ApplicantDrawer: React.FC<{
  applicant: Applicant;
  opening: Opening;
  interviews: Interview[];
  slot: HrSlot | null;
  location: string | null;
  profileId: string | null;
  /** The earlier applicant this one may duplicate, when the page has them. */
  duplicate: Applicant | null;
  onOpenApplicant: (id: string) => void;
  onClose: () => void;
  /** After a write, so the page reads the applicant again. */
  onChanged: (message?: string) => void;
  onError: (message: string) => void;
}> = ({ applicant, opening, interviews, slot, location, profileId, duplicate, onOpenApplicant, onClose, onChanged, onError }) => {
  const { t, i18n } = useTranslation(['hr', 'common']);
  const lang = i18n.resolvedLanguage ?? 'en';
  const locale = useDateLocale();
  useBlockedPage();
  const [activities, setActivities] = useState<Activity[] | null>(null);
  const [noteType, setNoteType] = useState<NoteType>('note');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [scoring, setScoring] = useState<Interview | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const loadActivities = useCallback(() => {
    let active = true;
    listActivities(applicant.id).then(rows => { if (active) setActivities(rows); }).catch(() => { if (active) setActivities([]); });
    return () => { active = false; };
  }, [applicant.id]);
  useEffect(() => loadActivities(), [loadActivities, applicant]);
  useEffect(() => { closeRef.current?.focus(); }, []);

  const run = async (work: () => Promise<unknown>, message?: string) => {
    setBusy(true);
    try {
      await work();
      onChanged(message);
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const openFile = async (path: string) => {
    // A tab opened before the await keeps the browser from blocking it as a popup.
    // `noopener` would hand back no window to point at the file, so the link back is cut by hand.
    const tab = window.open('', '_blank');
    if (tab) tab.opener = null;
    const url = await signedFileUrl(path);
    if (!url) { tab?.close(); onError(t('applicant.fileMissing')); return; }
    if (tab) tab.location.href = url; else window.open(url, '_blank', 'noopener');
  };

  const openInterview = interviews.find(i => i.recommendation === null) ?? null;
  const start = async () => {
    setBusy(true);
    try {
      const id = await startInterview(applicant.id, profileId);
      setScoring(openInterview && openInterview.id === id ? openInterview : { id, applicantId: applicant.id, heldAt: new Date().toISOString(), interviewerProfileId: profileId, recommendation: null, overallNotes: null, createdAt: new Date().toISOString(), scores: [] });
      onChanged();
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setBusy(false);
    }
  };

  const files = applicantFiles(applicant.attachments, applicant.cvPath);
  const fileName = (file: { slot: string | null; name: string }) => (file.slot ? t(`applicant.slot.${file.slot}`) : file.name);
  const schemaKeys = new Set(opening.formSchema.map(field => field.key));
  const extraAnswers = Object.keys(applicant.answers).filter(key => !schemaKeys.has(key) && answerToStrings(applicant.answers[key]).length > 0);
  /** Yes/no as words, a choice by its label in the reader's language, anything else as given. */
  const answerLines = (value: unknown, field?: FormField) => {
    if (typeof value === 'boolean') return [value ? t('applicant.yes') : t('applicant.no')];
    return answerToStrings(value).map(line => {
      if (line === 'true' || line === 'false') return line === 'true' ? t('applicant.yes') : t('applicant.no');
      const option = field?.options.find(o => optionValue(o) === line);
      return option ? optionLabel(option, lang) : line;
    });
  };

  const activityText = (activity: Activity): string => {
    const kind = activity.meta.kind;
    if (kind === 'stage') {
      const text = t('applicant.activity.stage', { from: t(`stage.${readStage(activity.meta.from)}`), to: t(`stage.${readStage(activity.meta.to)}`) });
      return activity.auto ? `${text} · ${t('applicant.activity.auto')}` : text;
    }
    if (kind === 'shortlisted' || kind === 'unshortlisted' || kind === 'interview_started') return t(`applicant.activity.${kind}`);
    return activity.body ?? '';
  };

  return ReactDOM.createPortal(
    <div className="hc-ce-backdrop" onMouseDown={e => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="hc-ap-title" className="hc-ce hc-hr-drawer surface-float" onKeyDown={e => { if (e.key === 'Escape' && !scoring) { e.stopPropagation(); onClose(); } }}>
        <header className="hc-ce-head">
          <div className="hc-ce-head-text">
            <h2 id="hc-ap-title" dir="auto">{applicant.fullName}</h2>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <StageChip stage={applicant.stage} />
              <PriorityChip priority={applicant.priority} />
              <ApplicantFlags applicant={applicant} duplicateName={duplicate?.fullName ?? null} onOpenDuplicate={duplicate ? () => onOpenApplicant(duplicate.id) : null} />
              <span className="text-[12.5px] text-black/45">{t('applicant.applied', { date: new Date(applicant.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' }) })}</span>
            </div>
          </div>
          <button ref={closeRef} type="button" className="hc-ce-close" onClick={onClose} aria-label={t('common:actions.close')}><CloseIcon /></button>
        </header>

        <div className="hc-ce-body">
          <Section title={t('applicant.stage')}>
            <div className="hc-ce-grid">
              <label className="hc-ce-field">
                <span className="hc-field-label">{t('applicant.stage')}</span>
                <select className="hc-input" value={applicant.stage} disabled={busy} onChange={e => run(() => moveStage(applicant.id, e.target.value as RecruitmentStage, profileId))}>
                  {RECRUITMENT_STAGES.map(stage => <option key={stage} value={stage}>{t(`stage.${stage}`)}</option>)}
                </select>
              </label>
              <label className="hc-ce-field">
                <span className="hc-field-label">{t('applicant.priority')}</span>
                <select className="hc-input" value={applicant.priority} disabled={busy} onChange={e => run(() => updateApplicant(applicant.id, { priority: e.target.value as Priority }))}>
                  {PRIORITIES.map(p => <option key={p} value={p}>{t(`priority.${p}`)}</option>)}
                </select>
              </label>
              <div className="hc-ce-field">
                <span className="hc-field-label">{t('applicant.rating')}</span>
                <StarRating value={applicant.rating} label={t('applicant.rating')} onChange={rating => run(() => updateApplicant(applicant.id, { rating }))} />
              </div>
              <div className="hc-ce-field justify-end">
                <label className="hc-hr-check">
                  <input type="checkbox" checked={applicant.shortlisted} disabled={busy} onChange={e => run(() => setShortlisted(applicant.id, e.target.checked, profileId))} />
                  {t('applicant.shortlist')}
                </label>
              </div>
            </div>
            {applicant.shortlisted && (
              <div className="mt-4 border-t border-black/[0.06] pt-4">
                <span className="hc-field-label">{t('applicant.attendance')}</span>
                <ConfirmationPicker value={applicant.confirmation} disabled={busy} label={t('applicant.attendance')}
                  onChange={(status: InterviewConfirmation) => run(() => setConfirmation(applicant.id, status))} />
                <p className="mt-2 text-[13px] text-black/60">
                  {t('applicant.slot')}: {slot ? <bdi className="font-medium text-foreground">{formatDayLabel(istanbulDay(slot.startsAt), locale)} · <span className="hc-num">{formatTime(slot.startsAt, locale)}</span>{location ? ` · ${location}` : ''}</bdi> : t('interviews.noSlot')}
                </p>
                {applicant.stage !== 'no_show' && (
                  <Button variant="secondary" className="hc-mg-small mt-2" disabled={busy} onClick={() => run(() => markNoShow(applicant.id, profileId), t('applicant.noShowDone'))}>{t('applicant.noShow')}</Button>
                )}
              </div>
            )}
            {(applicant.stage === 'rejected' || applicant.stage === 'on_hold') && (
              <label className="hc-ce-field mt-3">
                <span className="hc-field-label">{t('applicant.lostReason')}</span>
                <input dir="auto" className="hc-input" defaultValue={applicant.lostReason ?? ''} onBlur={e => { if (e.target.value !== (applicant.lostReason ?? '')) run(() => updateApplicant(applicant.id, { lostReason: e.target.value })); }} />
              </label>
            )}
          </Section>

          <Section title={t('applicant.contact')}>
            <dl className="hc-hr-facts">
              <div><dt>{t('applicant.phone')}</dt><dd>{applicant.phone ? (
                <span className="flex flex-wrap items-center gap-2">
                  <bdi dir="ltr" className="hc-num">{applicant.phone}</bdi>
                  <a className="hc-hr-link" href={`tel:${applicant.phone.replace(/\s/g, '')}`}>{t('applicant.call')}</a>
                  <a className="hc-hr-link" href={whatsappLink(applicant.phone)} target="_blank" rel="noreferrer">{t('applicant.whatsapp')}</a>
                </span>
              ) : '—'}</dd></div>
              <div><dt>{t('applicant.email')}</dt><dd>{applicant.email ? <a className="hc-hr-link" dir="ltr" href={`mailto:${applicant.email}`}>{applicant.email}</a> : '—'}</dd></div>
              <div><dt>{t('applicant.nationality')}</dt><dd dir="auto">{applicant.nationality ?? '—'}</dd></div>
              <div><dt>{t('applicant.residence')}</dt><dd dir="auto">{[applicant.residenceDistrict, applicant.residenceCity].filter(Boolean).join(', ') || '—'}</dd></div>
              <div><dt>{t('applicant.source')}</dt><dd>{applicant.source ? t(`source.${applicant.source}`, { defaultValue: applicant.source }) : '—'}</dd></div>
              {applicant.age !== null && <div><dt>{t('pipeline.columns.age')}</dt><dd className="hc-num">{applicant.age}</dd></div>}
            </dl>
            {applicant.knockoutFailed && (
              <p className="mt-3 rounded-[10px] bg-[#FFF1F2] px-3 py-2 text-[12.5px] text-[#BE123C]">
                {t('pipeline.knockout')}{applicant.knockoutReasons.length ? `: ${applicant.knockoutReasons.join(' · ')}` : ''}
              </p>
            )}
          </Section>

          <Section title={t('applicant.files')}>
            {files.length === 0 ? <p className="text-[13px] text-black/50">{t('applicant.noFiles')}</p> : (
              <ul className="hc-hr-files">
                {files.map(file => (
                  <li key={file.path}>
                    <FileIcon />
                    <span dir="auto" className="min-w-0 flex-1 truncate">{fileName(file)}</span>
                    <button type="button" className="hc-hr-link" onClick={() => openFile(file.path)}>{t('applicant.open')}</button>
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <Section title={t('applicant.answers')}>
            <dl className="hc-hr-answers">
              {opening.formSchema.filter(field => field.type !== 'file').map(field => {
                const lines = answerLines(applicant.answers[field.key], field);
                return (
                  <div key={field.key}>
                    <dt dir="auto">{pickLabel(field.label, lang)}</dt>
                    <dd dir="auto">{lines.length ? lines.map(line => <span key={line} className="block">{line}</span>) : <span className="text-black/35">{t('applicant.noAnswer')}</span>}</dd>
                  </div>
                );
              })}
              {extraAnswers.map(key => (
                <div key={key}>
                  <dt className="hc-num">{key}</dt>
                  <dd dir="auto">{answerLines(applicant.answers[key]).map(line => <span key={line} className="block">{line}</span>)}</dd>
                </div>
              ))}
            </dl>
          </Section>

          <Section title={t('applicant.interviews')} aside={
            <Button className="hc-mg-small" disabled={busy} onClick={openInterview ? () => setScoring(openInterview) : start}>
              {openInterview ? t('applicant.resumeInterview') : t('applicant.startInterview')}
            </Button>
          }>
            {interviews.length === 0 ? <p className="text-[13px] text-black/50">{t('applicant.noInterviews')}</p> : (
              <ul className="hc-hr-interviews">
                {interviews.map(interview => {
                  const score = weightedScore(opening.interviewCriteria, interview.scores);
                  return (
                    <li key={interview.id}>
                      <span className="text-[13px] text-black/60">{new Date(interview.heldAt ?? interview.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</span>
                      {score ? <strong className="hc-num">{t('applicant.score', { total: score.total })}</strong> : <span className="text-black/35">—</span>}
                      {score && score.scoredCount < score.criteriaCount && <small className="text-[#B45309]">{t('applicant.partial', { scored: score.scoredCount, all: score.criteriaCount })}</small>}
                      <span className="ms-auto">{interview.recommendation ? <span className="hc-hr-chip">{t(`recommendation.${interview.recommendation}`)}</span> : <button type="button" className="hc-hr-link" onClick={() => setScoring(interview)}>{t('applicant.resumeInterview')}</button>}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </Section>

          <Section title={t('applicant.notes')}>
            <textarea dir="auto" rows={3} className="hc-input" placeholder={t('applicant.notesPlaceholder')} aria-label={t('applicant.notes')} defaultValue={applicant.notes ?? ''}
              onBlur={e => { if (e.target.value !== (applicant.notes ?? '')) run(() => updateApplicant(applicant.id, { notes: e.target.value }), t('common.saved')); }} />
          </Section>

          <Section title={t('applicant.timeline')}>
            <form className="hc-hr-noteform" onSubmit={e => { e.preventDefault(); if (!note.trim()) return; const body = note; setNote(''); run(async () => { await addNote(applicant.id, noteType, body, profileId); loadActivities(); }); }}>
              <select className="hc-input" aria-label={t('applicant.timeline')} value={noteType} onChange={e => setNoteType(e.target.value as NoteType)}>
                {NOTE_TYPES.map(type => <option key={type} value={type}>{t(`applicant.noteType.${type}`)}</option>)}
              </select>
              <input dir="auto" className="hc-input min-w-0 flex-1" placeholder={t('applicant.notePlaceholder')} aria-label={t('applicant.notePlaceholder')} value={note} onChange={e => setNote(e.target.value)} />
              <Button type="submit" disabled={busy || !note.trim()}>{t('applicant.addNote')}</Button>
            </form>
            {activities === null ? <div className="hc-fin-skeleton mt-3" /> : activities.length === 0 ? <p className="mt-3 text-[13px] text-black/50">{t('applicant.noActivity')}</p> : (
              <ol className="hc-hr-timeline">
                {activities.map(activity => (
                  <li key={activity.id}>
                    <span className="hc-hr-chip">{t(`applicant.noteType.${activity.type}`, { defaultValue: activity.type })}</span>
                    <span dir="auto" className="min-w-0 flex-1">{activityText(activity)}</span>
                    <time className="hc-num shrink-0 text-[12px] text-black/40">{new Date(activity.createdAt).toLocaleString(locale, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false })}</time>
                  </li>
                ))}
              </ol>
            )}
          </Section>
        </div>
      </div>

      {scoring && (
        <ScorecardSheet applicant={applicant} opening={opening} interview={scoring} profileId={profileId}
          onClose={() => { setScoring(null); onChanged(); }}
          onFinished={() => { setScoring(null); onChanged(t('scorecard.finished')); }}
          onError={onError} />
      )}
    </div>,
    document.body,
  );
};

export default ApplicantDrawer;
