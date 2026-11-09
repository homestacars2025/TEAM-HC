/**
 * Recruitment vocabulary and the pure helpers both HR screens share.
 *
 * The enums mirror Postgres exactly (`recruitment_stage`, `interview_confirmation`,
 * `interview_recommendation`, `recruitment_priority`, `recruitment_source`). Labels
 * live in the `hr` translations; data an applicant or an opening wrote (questions,
 * answers, names) is shown as written, with `dir="auto"`, never translated.
 *
 * The jsonb columns on `recruitment_openings` (`form_schema`, `interview_criteria`,
 * `interview_questions`) are a contract with the public application form, so every
 * reader treats them as untrusted: a malformed entry is dropped, not rendered.
 */

export const RECRUITMENT_STAGES = ['new', 'viewed', 'interview_invited', 'interviewed', 'rejected', 'on_hold', 'hired', 'no_show'] as const;
export type RecruitmentStage = typeof RECRUITMENT_STAGES[number];

/** Out of the running: dimmed on the board. */
export const CLOSED_STAGES: readonly RecruitmentStage[] = ['rejected', 'no_show', 'hired'];

/** One colour per stage: the chip tint, its text, and the board column's rail. */
export const STAGE_TONES: Record<RecruitmentStage, { bg: string; ink: string; rail: string }> = {
  new: { bg: '#F1F5F9', ink: '#334155', rail: '#94A3B8' },
  viewed: { bg: '#F0F9FF', ink: '#0369A1', rail: '#38BDF8' },
  interview_invited: { bg: '#F5F3FF', ink: '#6D28D9', rail: '#A78BFA' },
  interviewed: { bg: '#EEF2FF', ink: '#4338CA', rail: '#818CF8' },
  rejected: { bg: '#FFF1F2', ink: '#BE123C', rail: '#F87171' },
  on_hold: { bg: '#FFFBEB', ink: '#B45309', rail: '#FBBF24' },
  hired: { bg: '#ECFDF5', ink: '#047857', rail: '#34D399' },
  no_show: { bg: '#F5F5F4', ink: '#57534E', rail: '#A8A29E' },
};

export const INTERVIEW_CONFIRMATIONS = ['pending', 'coming', 'not_coming', 'no_response'] as const;
export type InterviewConfirmation = typeof INTERVIEW_CONFIRMATIONS[number];

/** What a scheduler can set; `pending` is only ever the starting state. */
export const SETTABLE_CONFIRMATIONS = ['coming', 'not_coming', 'no_response'] as const satisfies readonly InterviewConfirmation[];

export const CONFIRMATION_TONES: Record<InterviewConfirmation, { bg: string; ink: string; dot: string }> = {
  pending: { bg: '#FFFBEB', ink: '#B45309', dot: '#F59E0B' },
  coming: { bg: '#ECFDF5', ink: '#047857', dot: '#10B981' },
  not_coming: { bg: '#FFF1F2', ink: '#BE123C', dot: '#F43F5E' },
  no_response: { bg: '#F1F5F9', ink: '#475569', dot: '#94A3B8' },
};

export const readConfirmation = (value: unknown): InterviewConfirmation =>
  (INTERVIEW_CONFIRMATIONS as readonly string[]).includes(String(value)) ? value as InterviewConfirmation : 'pending';

export const readStage = (value: unknown): RecruitmentStage =>
  (RECRUITMENT_STAGES as readonly string[]).includes(String(value)) ? value as RecruitmentStage : 'new';

export const RECOMMENDATIONS = ['hire', 'reject', 'hold'] as const;
export type Recommendation = typeof RECOMMENDATIONS[number];

/** What a recommendation suggests for the stage. Only a suggestion: the drawer asks first. */
export const RECOMMENDATION_STAGE: Record<Recommendation, RecruitmentStage> = { hire: 'hired', reject: 'rejected', hold: 'on_hold' };

export const PRIORITIES = ['low', 'medium', 'high', 'hot'] as const;
export type Priority = typeof PRIORITIES[number];
export const PRIORITY_TONES: Record<Priority, { bg: string; ink: string }> = {
  low: { bg: '#F1F5F9', ink: '#475569' },
  medium: { bg: '#EFF6FF', ink: '#2563EB' },
  high: { bg: '#FFFBEB', ink: '#B45309' },
  hot: { bg: '#FFF1F2', ink: '#E11D48' },
};

export const SOURCES = ['website', 'referral', 'linkedin', 'instagram', 'walk_in', 'agency', 'whatsapp', 'other'] as const;

export const OPENING_STATUSES = ['draft', 'published', 'closed'] as const;
export type OpeningStatus = typeof OPENING_STATUSES[number];
export const readOpeningStatus = (value: unknown): OpeningStatus =>
  (OPENING_STATUSES as readonly string[]).includes(String(value)) ? value as OpeningStatus : 'draft';

/** Slot status is plain text in the database; these are the values the RPCs write. */
export const SLOT_STATUSES = ['open', 'booked', 'blocked'] as const;
export type SlotStatus = typeof SLOT_STATUSES[number];

/** The only places interviews are held, stored verbatim in `recruitment_interview_settings.location`. */
export const INTERVIEW_LOCATIONS = ['Şişli', 'Kayaşehir', 'Online'] as const;
export const SLOT_MINUTE_CHOICES = [10, 15, 20, 30, 45, 60] as const;
export const DEFAULT_SLOT_MINUTES = 20;

// ─── Opening jsonb ────────────────────────────────────────────────────────────

export const QUESTION_TYPES = ['short_text', 'long_text', 'number', 'date', 'phone', 'yes_no', 'single_choice', 'multiple_choice', 'file'] as const;
export type QuestionType = typeof QUESTION_TYPES[number];
export const CHOICE_TYPES: readonly QuestionType[] = ['single_choice', 'multiple_choice'];

/** The public form's languages; a label is one string or one per language. */
export const FORM_LANGS = ['ar', 'en', 'tr'] as const;
export type FormLang = typeof FORM_LANGS[number];
export type Localized = string | Partial<Record<FormLang, string>>;

/** A choice: its stored value, with labels per language when it has them. */
export type FieldOption = string | { value: string; label?: Localized };

/** The only keys a file question may have: the slots the application endpoint stores. */
export const FILE_SLOTS = ['cv', 'license', 'id_document'] as const;
export type FileSlot = typeof FILE_SLOTS[number];
export const isFileSlot = (key: string): key is FileSlot => (FILE_SLOTS as readonly string[]).includes(key);

export interface FormField {
  /** Stable per opening: the key an answer is stored under. Never reused. For a file, one of FILE_SLOTS. */
  key: string;
  type: QuestionType;
  label: Localized;
  required: boolean;
  options: FieldOption[];
}

/** The reader's language, then English, then whichever is there. */
export function pickLabel(label: Localized | undefined, lang: string): string {
  if (!label) return '';
  if (typeof label === 'string') return label;
  return label[lang as FormLang] || label.en || Object.values(label).find(Boolean) || '';
}

/** Every language as its own string, for the builder. */
export const labelParts = (label: Localized): Record<FormLang, string> =>
  typeof label === 'string' ? { ar: '', en: label, tr: '' } : { ar: label.ar ?? '', en: label.en ?? '', tr: label.tr ?? '' };

export const optionValue = (option: FieldOption): string => (typeof option === 'string' ? option : String(option.value));
export const optionLabel = (option: FieldOption, lang: string): string =>
  typeof option === 'string' ? option : pickLabel(option.label, lang) || String(option.value);

export interface InterviewCriterion {
  key: string;
  label: string;
  /** This criterion's share of the score out of 100; null on older openings, which split evenly. */
  weight: number | null;
}

const isQuestionType = (value: unknown): value is QuestionType => (QUESTION_TYPES as readonly unknown[]).includes(value);

function readLabel(raw: unknown): Localized {
  if (typeof raw === 'string') return raw.trim();
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    const out: Partial<Record<FormLang, string>> = {};
    for (const lang of FORM_LANGS) {
      const value = (raw as Record<string, unknown>)[lang];
      if (typeof value === 'string' && value.trim()) out[lang] = value.trim();
    }
    return out;
  }
  return '';
}

function readOption(raw: unknown): FieldOption | null {
  if (typeof raw === 'string') return raw.trim() ? raw : null;
  if (raw && typeof raw === 'object' && 'value' in raw) {
    const value = String((raw as { value: unknown }).value ?? '').trim();
    if (!value) return null;
    const label = readLabel((raw as { label?: unknown }).label);
    return pickLabel(label, 'en') ? { value, label } : value;
  }
  return null;
}

export function parseFormSchema(raw: unknown): FormField[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const f = entry as Record<string, unknown>;
    const key = typeof f.key === 'string' && f.key.trim() ? f.key.trim() : null;
    if (!key) return [];
    const label = readLabel(f.label);
    return [{
      key,
      // An unknown type degrades to text: the answer still has to be readable.
      type: isQuestionType(f.type) ? f.type : 'short_text',
      label: pickLabel(label, 'en') ? label : `#${index + 1}`,
      required: f.required === true,
      options: Array.isArray(f.options) ? f.options.map(readOption).filter((o): o is FieldOption => o !== null) : [],
    }];
  });
}

export function parseCriteria(raw: unknown): InterviewCriterion[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry, index) => {
    if (!entry || typeof entry !== 'object') return [];
    const c = entry as Record<string, unknown>;
    const key = typeof c.key === 'string' && c.key.trim() ? c.key.trim() : null;
    if (!key) return [];
    const label = typeof c.label === 'string' ? c.label.trim() : '';
    const weight = typeof c.weight === 'number' && Number.isFinite(c.weight) && c.weight >= 0 ? c.weight : null;
    return [{ key, label: label || `#${index + 1}`, weight }];
  });
}

/** The interviewer's prompt sheet: read aloud, never scored. */
export function parseQuestions(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(entry => (typeof entry === 'string' && entry.trim() ? [entry.trim()] : []));
}

/** The next free `q1`, `q2`… key. Never reuses a number, so an old answer can't attach to a new question. */
export function nextKey(existing: readonly { key: string }[], prefix: 'q' | 'c'): string {
  let max = 0;
  for (const item of existing) {
    const match = item.key.match(new RegExp(`^${prefix}(\\d+)$`));
    if (match) max = Math.max(max, Number(match[1]));
  }
  return `${prefix}${max + 1}`;
}

/**
 * An interview's score out of 100: each criterion adds `score / 5 × weight`. With no
 * weights, 100 splits evenly. `scoredWeight` says how much of it was actually scored,
 * so a half-finished scorecard is never read as a low one.
 */
export function weightedScore(criteria: readonly InterviewCriterion[], scores: readonly { criterion: string; score: number | null }[]) {
  if (criteria.length === 0) return null;
  const declared = criteria.reduce((sum, c) => sum + (c.weight ?? 0), 0);
  const weightOf = (c: InterviewCriterion) => (declared <= 0 ? 100 / criteria.length : c.weight ?? 0);
  let total = 0;
  let scoredWeight = 0;
  let scoredCount = 0;
  for (const c of criteria) {
    const hit = scores.find(s => s.criterion === c.key);
    if (!hit || typeof hit.score !== 'number') continue;
    total += (hit.score / 5) * weightOf(c);
    scoredWeight += weightOf(c);
    scoredCount += 1;
  }
  if (scoredCount === 0) return null;
  return {
    total: Math.round(total),
    scoredWeight: Math.round(scoredWeight),
    totalWeight: Math.round(criteria.reduce((sum, c) => sum + weightOf(c), 0)),
    scoredCount,
    criteriaCount: criteria.length,
  };
}

// ─── Answers and files ────────────────────────────────────────────────────────

export type AnswerMap = Record<string, unknown>;

export const parseAnswers = (raw: unknown): AnswerMap => (raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as AnswerMap : {});

/** One answer as lines of text; booleans come back as `true`/`false` for the caller to word. */
export function answerToStrings(value: unknown): string[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value.map(v => String(v)).filter(v => v.trim().length > 0);
  const s = String(value).trim();
  return s ? [s] : [];
}

export interface Attachment {
  path: string;
  /** A file slot (`cv`, `license`, `id_document`), or a name for an older list entry. */
  slot: FileSlot | null;
  name: string;
}

/**
 * `attachments` jsonb. The application endpoint writes `{ cv, license, id_document }`
 * of storage paths; older rows hold an array of paths or `{ path, name }`.
 */
export function parseAttachments(raw: unknown): Attachment[] {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    return Object.entries(raw as Record<string, unknown>).flatMap(([key, value]) => {
      const path = typeof value === 'string' ? value.trim() : '';
      if (!path) return [];
      return [{ path, slot: isFileSlot(key) ? key : null, name: key }];
    });
  }
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(entry => {
    if (typeof entry === 'string' && entry.trim()) return [{ path: entry.trim(), slot: null, name: entry.trim().split('/').pop() ?? entry }];
    if (entry && typeof entry === 'object') {
      const e = entry as Record<string, unknown>;
      const path = typeof e.path === 'string' ? e.path.trim() : typeof e.url === 'string' ? e.url.trim() : '';
      if (!path) return [];
      const name = typeof e.name === 'string' && e.name.trim() ? e.name.trim() : path.split('/').pop() ?? path;
      return [{ path, slot: null, name }];
    }
    return [];
  });
}

/** The CV, licence and ID first, then anything else, each path once; `cv_url` is the CV of older rows. */
export function applicantFiles(attachments: readonly Attachment[], cvPath: string | null): Attachment[] {
  const seen = new Set<string>();
  const out: Attachment[] = [];
  const add = (file: Attachment) => { if (!seen.has(file.path)) { seen.add(file.path); out.push(file); } };
  const bySlot = (slot: FileSlot) => attachments.find(file => file.slot === slot);
  const cv = bySlot('cv') ?? (cvPath ? { path: cvPath, slot: 'cv' as const, name: 'cv' } : undefined);
  if (cv) add(cv);
  (['license', 'id_document'] as const).forEach(slot => { const file = bySlot(slot); if (file) add(file); });
  attachments.forEach(add);
  return out;
}

// ─── Knock-out rules ──────────────────────────────────────────────────────────

/** Checked by the application endpoint against the answers and the fixed fields. */
export const KNOCKOUT_OPS = ['lt', 'lte', 'gt', 'gte', 'eq', 'neq', 'in', 'not_in', 'empty'] as const;
export type KnockoutOp = typeof KNOCKOUT_OPS[number];
export const NUMERIC_OPS: readonly KnockoutOp[] = ['lt', 'lte', 'gt', 'gte'];
export const LIST_OPS: readonly KnockoutOp[] = ['in', 'not_in'];

/** The fixed form fields a rule can test, besides the opening's own questions. */
export const FIXED_FIELDS = ['age', 'nationality', 'residence_city', 'residence_district'] as const;

export type KnockoutValue = string | number | boolean | string[] | null;

export interface KnockoutRule {
  field: string;
  op: KnockoutOp;
  value: KnockoutValue;
  reason: string;
}

export function parseKnockoutRules(raw: unknown): KnockoutRule[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap(entry => {
    if (!entry || typeof entry !== 'object') return [];
    const r = entry as Record<string, unknown>;
    if (typeof r.field !== 'string' || !r.field.trim() || !(KNOCKOUT_OPS as readonly unknown[]).includes(r.op)) return [];
    const v = r.value;
    const value: KnockoutValue = Array.isArray(v) ? v.map(String) : typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' ? v : null;
    return [{ field: r.field.trim(), op: r.op as KnockoutOp, value, reason: typeof r.reason === 'string' ? r.reason : '' }];
  });
}

/** What a rule's value box holds while it is edited: text, or `true`/`false` for a yes/no question. */
export function ruleValueText(rule: Pick<KnockoutRule, 'value'>): string {
  if (Array.isArray(rule.value)) return rule.value.join(', ');
  if (rule.value === null) return '';
  return String(rule.value);
}

/**
 * The value as the endpoint compares it: numbers for lt…gte, a list for in/not_in,
 * a boolean for a yes/no question, nothing for empty, text otherwise.
 */
export function ruleValueFrom(text: string, op: KnockoutOp, fieldType: QuestionType | 'number' | 'text'): KnockoutValue {
  if (op === 'empty') return null;
  if (LIST_OPS.includes(op)) return text.split(',').map(part => part.trim()).filter(Boolean);
  if (NUMERIC_OPS.includes(op)) return text.trim() === '' ? null : Number(text.replace(',', '.'));
  if (fieldType === 'yes_no') return text === 'true' ? true : text === 'false' ? false : null;
  if (fieldType === 'number') return text.trim() === '' ? null : Number(text.replace(',', '.'));
  return text.trim() || null;
}

/** A key under `hr:builder.knockout.errors`, or null. */
export function ruleProblem(rule: KnockoutRule): 'field' | 'value' | 'number' | null {
  if (!rule.field) return 'field';
  if (rule.op === 'empty') return null;
  if (rule.value === null || (Array.isArray(rule.value) && rule.value.length === 0)) return 'value';
  if (NUMERIC_OPS.includes(rule.op) && (typeof rule.value !== 'number' || !Number.isFinite(rule.value))) return 'number';
  return null;
}

// ─── Time (interviews are held in Istanbul) ───────────────────────────────────

const ZONE = 'Europe/Istanbul';

/** `YYYY-MM-DD` of an instant, in Istanbul. */
export const istanbulDay = (iso: string): string => new Date(iso).toLocaleDateString('en-CA', { timeZone: ZONE });

export const formatTime = (iso: string, locale: string): string =>
  new Date(iso).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: ZONE });

export const formatDayLabel = (day: string, locale: string, options: Intl.DateTimeFormatOptions = { weekday: 'short', day: 'numeric', month: 'short' }): string =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString(locale, { ...options, timeZone: 'UTC' });

/** Istanbul is UTC+3 all year, so a local wall time there is that instant minus three hours. */
export function istanbulInstant(day: string, time: string): string {
  return new Date(`${day}T${time}:00+03:00`).toISOString();
}
