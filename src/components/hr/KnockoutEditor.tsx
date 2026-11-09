import React from 'react';
import { useTranslation } from 'react-i18next';
import Button from '../Button';
import type { OpeningDraft } from '../../lib/recruitment/hr';
import {
  FIXED_FIELDS,
  KNOCKOUT_OPS,
  LIST_OPS,
  NUMERIC_OPS,
  pickLabel,
  ruleProblem,
  ruleValueFrom,
  ruleValueText,
  type KnockoutOp,
  type KnockoutRule,
  type QuestionType,
} from '../../lib/recruitment/model';

const Trash: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

type FieldKind = QuestionType | 'number' | 'text';

/**
 * Knock-out rules: the application endpoint tests each against the answers and the
 * fixed fields, and an applicant who hits one comes in auto-rejected with its reason.
 * Applicants never see the reason.
 */
export const KnockoutEditor: React.FC<{ draft: OpeningDraft; showErrors: boolean; onChange: (rules: KnockoutRule[]) => void }> = ({ draft, showErrors, onChange }) => {
  const { t, i18n } = useTranslation('hr');
  const lang = i18n.resolvedLanguage ?? 'en';
  const questions = draft.formSchema.filter(field => field.type !== 'file');
  const kindOf = (key: string): FieldKind => (key === 'age' ? 'number' : (FIXED_FIELDS as readonly string[]).includes(key) ? 'text' : questions.find(q => q.key === key)?.type ?? 'text');
  const opsFor = (kind: FieldKind): readonly KnockoutOp[] => (kind === 'yes_no' ? ['eq', 'neq', 'empty'] : KNOCKOUT_OPS);
  const rules = draft.knockoutRules;
  const update = (index: number, patch: Partial<KnockoutRule>) => onChange(rules.map((rule, i) => (i === index ? { ...rule, ...patch } : rule)));

  return (
    <section className="hc-ce-section surface-depth">
      <header className="hc-ce-section-head">
        <div className="hc-ce-section-title"><h3>{t('builder.knockout.title')}</h3><span className="hc-ce-section-aside">{t('builder.knockout.hint')}</span></div>
      </header>
      {rules.length === 0 && <p className="text-[13px] text-black/50">{t('builder.knockout.none')}</p>}
      <ol className="hc-hr-builder-list">
        {rules.map((rule, index) => {
          const kind = kindOf(rule.field);
          const problem = showErrors ? ruleProblem(rule) : null;
          const known = rule.field === '' || (FIXED_FIELDS as readonly string[]).includes(rule.field) || questions.some(q => q.key === rule.field);
          return (
            // eslint-disable-next-line react/no-array-index-key
            <li key={index}>
              <div className="hc-hr-rule">
                <label className="hc-ce-field">
                  <span className="hc-field-label">{t('builder.knockout.field')}</span>
                  <select className={`hc-input ${problem === 'field' ? 'is-invalid' : ''}`} value={rule.field}
                    onChange={e => { const next = kindOf(e.target.value); const op = opsFor(next).includes(rule.op) ? rule.op : 'eq'; update(index, { field: e.target.value, op, value: next === 'yes_no' && op !== 'empty' ? false : rule.value }); }}>
                    <option value="">—</option>
                    <optgroup label={t('builder.knockout.fixed')}>
                      {FIXED_FIELDS.map(key => <option key={key} value={key}>{t(`builder.knockout.fields.${key}`)}</option>)}
                    </optgroup>
                    {questions.length > 0 && (
                      <optgroup label={t('builder.questions')}>
                        {questions.map(q => <option key={q.key} value={q.key}>{pickLabel(q.label, lang) || q.key}</option>)}
                      </optgroup>
                    )}
                    {!known && <option value={rule.field}>{rule.field}</option>}
                  </select>
                </label>
                <label className="hc-ce-field">
                  <span className="hc-field-label">{t('builder.knockout.op')}</span>
                  <select className="hc-input" value={rule.op}
                    onChange={e => { const op = e.target.value as KnockoutOp; update(index, { op, value: ruleValueFrom(ruleValueText(rule), op, kind) }); }}>
                    {opsFor(kind).map(op => <option key={op} value={op}>{t(`builder.knockout.ops.${op}`)}</option>)}
                  </select>
                </label>
                {rule.op !== 'empty' && (
                  <label className="hc-ce-field">
                    <span className="hc-field-label">{LIST_OPS.includes(rule.op) ? t('builder.knockout.values') : t('builder.knockout.value')}</span>
                    {kind === 'yes_no' ? (
                      <select className="hc-input" value={rule.value === true ? 'true' : 'false'} onChange={e => update(index, { value: e.target.value === 'true' })}>
                        <option value="true">{t('applicant.yes')}</option>
                        <option value="false">{t('applicant.no')}</option>
                      </select>
                    ) : (
                      <input dir="auto" className={`hc-input ${problem === 'value' || problem === 'number' ? 'is-invalid' : ''}`}
                        inputMode={NUMERIC_OPS.includes(rule.op) || kind === 'number' ? 'decimal' : undefined}
                        placeholder={LIST_OPS.includes(rule.op) ? t('builder.knockout.listHint') : ''}
                        value={ruleValueText(rule)} onChange={e => update(index, { value: ruleValueFrom(e.target.value, rule.op, kind) })} />
                    )}
                  </label>
                )}
                <label className="hc-ce-field hc-hr-rule-reason">
                  <span className="hc-field-label">{t('builder.knockout.reason')}</span>
                  <input dir="auto" className="hc-input" placeholder={t('builder.knockout.reasonHint')} value={rule.reason} onChange={e => update(index, { reason: e.target.value })} />
                </label>
                <div className="hc-hr-rowtools self-end">
                  <button type="button" aria-label={t('builder.remove')} className="is-danger" onClick={() => onChange(rules.filter((_, i) => i !== index))}><Trash /></button>
                </div>
              </div>
              {problem && <p className="hc-field-error" role="alert">{t(`builder.knockout.errors.${problem}`)}</p>}
            </li>
          );
        })}
      </ol>
      <Button variant="secondary" className="hc-mg-small mt-3" onClick={() => onChange([...rules, { field: '', op: 'lt', value: null, reason: '' }])}>+ {t('builder.knockout.add')}</Button>
    </section>
  );
};

export default KnockoutEditor;
