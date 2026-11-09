import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../../components/Button';
import { useCurrentUser } from '../../contexts/CurrentUserContext';
import { getOpening, openingProblem, saveOpening, setOpeningStatus, slugify, toOpeningDraft, type Opening, type OpeningDraft } from '../../lib/recruitment/hr';
import { CHOICE_TYPES, FILE_SLOTS, FORM_LANGS, QUESTION_TYPES, isFileSlot, labelParts, nextKey, optionValue, pickLabel, type FormField, type InterviewCriterion, type OpeningStatus, type QuestionType } from '../../lib/recruitment/model';
import { KnockoutEditor } from '../../components/hr/KnockoutEditor';
import { PublicLink } from '../../components/hr/PublicLink';
import { BackArrow, HR_BASE, OpeningStatusChip, openingPath } from './HrOpeningsPage';

/**
 * Create or edit an opening: its basics, the application form, the interview
 * scorecard and the read-aloud questions, and whether it's published. Question and
 * criterion keys are never reused, so answers already given stay with their question.
 */

const TOAST_MS = 3200;

const Arrow: React.FC<{ up?: boolean }> = ({ up }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={up ? { transform: 'rotate(180deg)' } : undefined}><path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);
const Trash: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

function move<T>(list: T[], from: number, to: number): T[] {
  if (to < 0 || to >= list.length) return list;
  const next = [...list];
  const [item] = next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

const RowTools: React.FC<{ index: number; count: number; onMove: (to: number) => void; onRemove: () => void }> = ({ index, count, onMove, onRemove }) => {
  const { t } = useTranslation('hr');
  return (
    <div className="hc-hr-rowtools">
      <button type="button" aria-label={t('builder.moveUp')} disabled={index === 0} onClick={() => onMove(index - 1)}><Arrow up /></button>
      <button type="button" aria-label={t('builder.moveDown')} disabled={index === count - 1} onClick={() => onMove(index + 1)}><Arrow /></button>
      <button type="button" aria-label={t('builder.remove')} className="is-danger" onClick={onRemove}><Trash /></button>
    </div>
  );
};

const OpeningBuilderPage: React.FC = () => {
  const { t } = useTranslation(['hr', 'common']);
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { userId } = useCurrentUser();
  const [opening, setOpening] = useState<Opening | null>(null);
  const [draft, setDraft] = useState<OpeningDraft>(() => toOpeningDraft(null));
  const [loading, setLoading] = useState(Boolean(id));
  const [missing, setMissing] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const [saving, setSaving] = useState(false);
  const [slug, setSlug] = useState('');
  const [statusBusy, setStatusBusy] = useState(false);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);

  useEffect(() => {
    if (!id) return undefined;
    let active = true;
    getOpening(id).then(found => {
      if (!active) return;
      setLoading(false);
      if (!found) { setMissing(true); return; }
      setOpening(found);
      setDraft(toOpeningDraft(found));
      setSlug(found.publicSlug ?? slugify(found.title));
    }).catch(() => { if (active) { setLoading(false); setMissing(true); } });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), TOAST_MS);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const problem = openingProblem(draft);
  const set = <K extends keyof OpeningDraft>(key: K, value: OpeningDraft[K]) => setDraft(current => ({ ...current, [key]: value }));
  const setField = (index: number, patch: Partial<FormField>) => set('formSchema', draft.formSchema.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  const setCriterion = (index: number, patch: Partial<InterviewCriterion>) => set('interviewCriteria', draft.interviewCriteria.map((c, i) => (i === index ? { ...c, ...patch } : c)));
  const weightTotal = draft.interviewCriteria.reduce((sum, c) => sum + (c.weight ?? 0), 0);

  const save = async () => {
    setShowErrors(true);
    if (problem) return;
    setSaving(true);
    try {
      const saved = await saveOpening(id ?? null, draft, userId);
      // A new opening has no applicants yet: stay in the builder, where it can be published.
      if (!id) { navigate(`${openingPath(saved)}/edit`, { replace: true }); return; }
      setToast({ text: t('common.saved') });
    } catch (reason) {
      setToast({ text: t('common.saveError', { reason: reason instanceof Error ? reason.message : String(reason) }), bad: true });
    } finally {
      setSaving(false);
    }
  };

  const changeStatus = async (status: OpeningStatus) => {
    if (!opening) return;
    setStatusBusy(true);
    try {
      await setOpeningStatus(opening.id, status, status === 'published' ? slugify(slug) || slugify(draft.title) : null);
      setOpening({ ...opening, status, publicSlug: status === 'published' ? slugify(slug) || slugify(draft.title) : opening.publicSlug });
      setToast({ text: t('builder.statusSaved', { status: t(`openingStatus.${status}`) }) });
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : String(reason);
      setToast({ text: message === 'slug-taken' ? t('builder.slugTaken') : t('common.saveError', { reason: message }), bad: true });
    } finally {
      setStatusBusy(false);
    }
  };

  if (loading) return <div className="hc-pi"><div className="hc-ce-state" role="status"><span className="hc-ce-spinner" aria-hidden="true" /></div></div>;
  if (missing) {
    return (
      <div className="hc-pi">
        <div className="hc-ce-state rounded-[16px] border border-[var(--border-subtle)] bg-white" role="alert">
          <p>{t('pipeline.notFound')}</p>
          <Link to={HR_BASE} className="hc-pi-all inline-flex items-center">{t('common.allOpenings')}</Link>
        </div>
      </div>
    );
  }

  const error = showErrors && problem ? t(`builder.errors.${problem}`) : null;

  return (
    <div className="hc-pi hc-hr hc-hr-builder">
      <header className="hc-pi-head">
        <div>
          <Link to={id ? openingPath(id) : HR_BASE} className="hc-hr-back"><BackArrow /> {id ? draft.title || t('builder.editTitle') : t('common.allOpenings')}</Link>
          <h1>{id ? t('builder.editTitle') : t('builder.newTitle')}</h1>
        </div>
      </header>

      <section className="hc-ce-section surface-depth">
        <header className="hc-ce-section-head"><div className="hc-ce-section-title"><h3>{t('builder.basics')}</h3></div></header>
        <div className="hc-ce-grid">
          <label className="hc-ce-field sm:col-span-2">
            <span className="hc-field-label">{t('builder.title')}</span>
            <input dir="auto" className={`hc-input ${showErrors && problem === 'title' ? 'is-invalid' : ''}`} value={draft.title} onChange={e => set('title', e.target.value)} />
          </label>
          <label className="hc-ce-field">
            <span className="hc-field-label">{t('builder.department')}</span>
            <input dir="auto" className="hc-input" value={draft.department} onChange={e => set('department', e.target.value)} />
          </label>
          <label className="hc-ce-field">
            <span className="hc-field-label">{t('builder.positions')}</span>
            <input dir="ltr" inputMode="numeric" className={`hc-input ${showErrors && problem === 'positions' ? 'is-invalid' : ''}`} value={draft.positionsCount} onChange={e => set('positionsCount', e.target.value)} />
          </label>
          <label className="hc-ce-field sm:col-span-2">
            <span className="hc-field-label">{t('builder.description')}</span>
            <textarea dir="auto" rows={4} className="hc-input" value={draft.description} onChange={e => set('description', e.target.value)} />
          </label>
        </div>
      </section>

      {opening && (
        <section className="hc-ce-section surface-depth">
          <header className="hc-ce-section-head">
            <div className="hc-ce-section-title"><h3>{t('builder.status')}</h3></div>
            <OpeningStatusChip status={opening.status} />
          </header>
          {opening.status !== 'published' && (
            <label className="hc-ce-field mb-3">
              <span className="hc-field-label">{t('builder.slug')}</span>
              <input dir="ltr" className="hc-input" value={slug} onChange={e => setSlug(e.target.value)} />
              <span className="mt-1 text-[12px] text-black/45">{t('builder.slugHint')}</span>
            </label>
          )}
          {opening.status === 'published' && opening.publicSlug && <div className="mb-3"><PublicLink slug={opening.publicSlug} /></div>}
          <div className="flex flex-wrap gap-2">
            {opening.status !== 'published' && <Button disabled={statusBusy} onClick={() => changeStatus('published')}>{t('builder.publish')}</Button>}
            {opening.status === 'published' && <Button variant="secondary" disabled={statusBusy} onClick={() => changeStatus('closed')}>{t('builder.close')}</Button>}
            {opening.status === 'closed' && <Button variant="secondary" disabled={statusBusy} onClick={() => changeStatus('published')}>{t('builder.reopen')}</Button>}
          </div>
        </section>
      )}

      <section className="hc-ce-section surface-depth">
        <header className="hc-ce-section-head">
          <div className="hc-ce-section-title"><h3>{t('builder.questions')}</h3><span className="hc-ce-section-aside">{t('builder.questionsHint')}</span></div>
        </header>
        <ol className="hc-hr-builder-list">
          {draft.formSchema.map((field, index) => {
            const parts = labelParts(field.label);
            const usedSlots = draft.formSchema.filter((other, i) => i !== index && other.type === 'file').map(other => other.key);
            const freeSlots = FILE_SLOTS.filter(slot => !usedSlots.includes(slot));
            const changeType = (type: QuestionType) => {
              if (type === field.type) return;
              if (type === 'file') { if (freeSlots.length) setField(index, { type, key: freeSlots[0], options: [] }); return; }
              setField(index, { type, key: field.type === 'file' ? nextKey(draft.formSchema, 'q') : field.key });
            };
            return (
              <li key={`${field.key}-${index}`}>
                <div className="hc-hr-builder-row">
                  <label className="hc-ce-field sm:w-52">
                    <span className="hc-field-label">{t('builder.type')} <small className="hc-num text-black/35">{field.key}</small></span>
                    <select className="hc-input" value={field.type} onChange={e => changeType(e.target.value as QuestionType)}>
                      {QUESTION_TYPES.map(type => <option key={type} value={type} disabled={type === 'file' && field.type !== 'file' && freeSlots.length === 0}>{t(`questionType.${type}`)}</option>)}
                    </select>
                  </label>
                  {field.type === 'file' && (
                    <label className="hc-ce-field sm:w-52">
                      <span className="hc-field-label">{t('builder.fileSlot')}</span>
                      <select className={`hc-input ${showErrors && !isFileSlot(field.key) ? 'is-invalid' : ''}`} value={isFileSlot(field.key) ? field.key : ''} onChange={e => setField(index, { key: e.target.value })}>
                        {!isFileSlot(field.key) && <option value="">—</option>}
                        {FILE_SLOTS.map(slot => <option key={slot} value={slot} disabled={usedSlots.includes(slot)}>{t(`applicant.slot.${slot}`)}</option>)}
                      </select>
                    </label>
                  )}
                  <span className="flex-1" />
                  <RowTools index={index} count={draft.formSchema.length} onMove={to => set('formSchema', move(draft.formSchema, index, to))} onRemove={() => set('formSchema', draft.formSchema.filter((_, i) => i !== index))} />
                </div>
                <div className="hc-hr-labels mt-2">
                  {FORM_LANGS.map(lang => (
                    <label key={lang} className="hc-ce-field">
                      <span className="hc-field-label">{t('builder.questionLabel')} · {t(`builder.lang.${lang}`)}</span>
                      <input dir={lang === 'ar' ? 'rtl' : 'ltr'} lang={lang} className={`hc-input ${showErrors && !pickLabel(field.label, 'en').trim() ? 'is-invalid' : ''}`} value={parts[lang]}
                        onChange={e => setField(index, { label: { ...parts, [lang]: e.target.value } })} />
                    </label>
                  ))}
                </div>
                {CHOICE_TYPES.includes(field.type) && (
                  <label className="hc-ce-field mt-2">
                    <span className="hc-field-label">{t('builder.options')} <small className="text-black/40">{t('builder.optionsHint')}</small></span>
                    <textarea dir="auto" rows={3} className={`hc-input ${showErrors && field.options.filter(o => optionValue(o).trim()).length < 2 ? 'is-invalid' : ''}`}
                      value={field.options.map(optionValue).join('\n')}
                      // An option already labelled per language keeps its labels while its value is unchanged.
                      onChange={e => setField(index, { options: e.target.value.split('\n').map(line => field.options.find(o => typeof o !== 'string' && optionValue(o) === line) ?? line) })} />
                  </label>
                )}
                <label className="hc-hr-check mt-2">
                  <input type="checkbox" checked={field.required} onChange={e => setField(index, { required: e.target.checked })} />
                  {t('builder.required')}
                </label>
              </li>
            );
          })}
        </ol>
        <Button variant="secondary" className="hc-mg-small mt-3" onClick={() => set('formSchema', [...draft.formSchema, { key: nextKey(draft.formSchema, 'q'), type: 'short_text', label: { ar: '', en: '', tr: '' }, required: false, options: [] }])}>+ {t('builder.addQuestion')}</Button>
      </section>

      <KnockoutEditor draft={draft} showErrors={showErrors} onChange={rules => set('knockoutRules', rules)} />

      <section className="hc-ce-section surface-depth">
        <header className="hc-ce-section-head">
          <div className="hc-ce-section-title"><h3>{t('builder.criteria')}</h3><span className="hc-ce-section-aside">{t('builder.criteriaHint')}</span></div>
          {draft.interviewCriteria.some(c => c.weight !== null) && (
            <span className={`hc-num ms-auto text-[12.5px] font-semibold ${Math.round(weightTotal) === 100 ? 'text-[#047857]' : 'text-[#B45309]'}`}>{t('builder.weightTotal', { total: Math.round(weightTotal) })}</span>
          )}
        </header>
        <ol className="hc-hr-builder-list">
          {draft.interviewCriteria.map((criterion, index) => (
            <li key={criterion.key}>
              <div className="hc-hr-builder-row">
                <label className="hc-ce-field min-w-0 flex-1">
                  <span className="hc-field-label">{t('builder.criterion')}</span>
                  <input dir="auto" className={`hc-input ${showErrors && !criterion.label.trim() ? 'is-invalid' : ''}`} value={criterion.label} onChange={e => setCriterion(index, { label: e.target.value })} />
                </label>
                <label className="hc-ce-field w-28">
                  <span className="hc-field-label">{t('builder.weight')}</span>
                  <input dir="ltr" inputMode="numeric" className="hc-input" value={criterion.weight ?? ''} placeholder="—"
                    onChange={e => setCriterion(index, { weight: e.target.value.trim() === '' || Number.isNaN(Number(e.target.value)) ? null : Math.max(0, Number(e.target.value)) })} />
                </label>
                <RowTools index={index} count={draft.interviewCriteria.length} onMove={to => set('interviewCriteria', move(draft.interviewCriteria, index, to))} onRemove={() => set('interviewCriteria', draft.interviewCriteria.filter((_, i) => i !== index))} />
              </div>
            </li>
          ))}
        </ol>
        <Button variant="secondary" className="hc-mg-small mt-3" onClick={() => set('interviewCriteria', [...draft.interviewCriteria, { key: nextKey(draft.interviewCriteria, 'c'), label: '', weight: null }])}>+ {t('builder.addCriterion')}</Button>
      </section>

      <section className="hc-ce-section surface-depth">
        <header className="hc-ce-section-head">
          <div className="hc-ce-section-title"><h3>{t('builder.prompts')}</h3><span className="hc-ce-section-aside">{t('builder.promptsHint')}</span></div>
        </header>
        <ol className="hc-hr-builder-list">
          {draft.interviewQuestions.map((question, index) => (
            // eslint-disable-next-line react/no-array-index-key
            <li key={index}>
              <div className="hc-hr-builder-row">
                <input dir="auto" aria-label={`${t('builder.prompts')} ${index + 1}`} className="hc-input min-w-0 flex-1" value={question} onChange={e => set('interviewQuestions', draft.interviewQuestions.map((q, i) => (i === index ? e.target.value : q)))} />
                <RowTools index={index} count={draft.interviewQuestions.length} onMove={to => set('interviewQuestions', move(draft.interviewQuestions, index, to))} onRemove={() => set('interviewQuestions', draft.interviewQuestions.filter((_, i) => i !== index))} />
              </div>
            </li>
          ))}
        </ol>
        <Button variant="secondary" className="hc-mg-small mt-3" onClick={() => set('interviewQuestions', [...draft.interviewQuestions, ''])}>+ {t('builder.addPrompt')}</Button>
      </section>

      <div className="hc-hr-savebar surface-float">
        {error ? <p role="alert" className="text-[13px] text-[#b42318]">{error}</p> : <span />}
        <Button onClick={save} disabled={saving} aria-busy={saving}>{saving ? t('builder.saving') : id ? t('builder.save') : t('builder.create')}</Button>
      </div>

      {toast && ReactDOM.createPortal(
        <div role="status" className={`hc-toast-in fixed inset-x-3 bottom-24 z-[9400] mx-auto max-w-sm rounded-2xl px-4 py-3 text-center text-sm font-semibold text-white shadow-lg ${toast.bad ? 'bg-[#b42318]' : 'bg-[#0f1117]'}`}>{toast.text}</div>,
        document.body,
      )}
    </div>
  );
};

export default OpeningBuilderPage;
