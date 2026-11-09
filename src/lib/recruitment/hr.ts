/**
 * Full HR (page `hr`). Row-level security allows every read and write here only to
 * `is_hr()`: an admin, or someone given the HR page. The rules follow Admin's
 * recruitment module (HP-ADMIN), moved from server actions to the browser since
 * RLS is what guards them.
 *
 * Activities go to `recruitment_activities`. What happened is kept as data in
 * `meta` (`{ kind: 'stage', from, to }`) rather than as English text, so the
 * timeline can be read in either language.
 */

import { supabase } from '../supabase';
import {
  RECRUITMENT_STAGES,
  RECOMMENDATION_STAGE,
  isFileSlot,
  labelParts,
  optionValue,
  parseAnswers,
  parseKnockoutRules,
  pickLabel,
  ruleProblem,
  parseAttachments,
  parseCriteria,
  parseFormSchema,
  parseQuestions,
  readConfirmation,
  readOpeningStatus,
  readStage,
  type AnswerMap,
  type Attachment,
  type FormField,
  type InterviewConfirmation,
  type InterviewCriterion,
  type KnockoutRule,
  type OpeningStatus,
  type Priority,
  type Recommendation,
  type RecruitmentStage,
} from './model';

// ─── Rows ─────────────────────────────────────────────────────────────────────

export interface Opening {
  id: string;
  title: string;
  department: string | null;
  description: string | null;
  status: OpeningStatus;
  publicSlug: string | null;
  formSchema: FormField[];
  interviewCriteria: InterviewCriterion[];
  interviewQuestions: string[];
  /** Checked by the application endpoint; a hit marks the applicant auto-rejected. */
  knockoutRules: KnockoutRule[];
  positionsCount: number | null;
  publishedAt: string | null;
  closedAt: string | null;
  createdAt: string;
  applicantCount: number;
  shortlistedCount: number;
}

export interface Applicant {
  id: string;
  openingId: string;
  fullName: string;
  age: number | null;
  phone: string | null;
  email: string | null;
  nationality: string | null;
  residenceCity: string | null;
  residenceDistrict: string | null;
  cvPath: string | null;
  attachments: Attachment[];
  answers: AnswerMap;
  stage: RecruitmentStage;
  source: string | null;
  priority: Priority;
  rating: number | null;
  notes: string | null;
  lostReason: string | null;
  knockoutFailed: boolean;
  knockoutReasons: string[];
  /** The earlier applicant to this opening with the same phone, when there is one. */
  duplicateOf: string | null;
  /** The language they applied in: ar, en or tr. */
  language: string | null;
  shortlisted: boolean;
  confirmation: InterviewConfirmation;
  createdAt: string;
}

export interface InterviewScore {
  criterion: string;
  score: number | null;
  note: string | null;
}

export interface Interview {
  id: string;
  applicantId: string;
  heldAt: string | null;
  interviewerProfileId: string | null;
  recommendation: Recommendation | null;
  overallNotes: string | null;
  createdAt: string;
  scores: InterviewScore[];
}

export interface Activity {
  id: number;
  type: string;
  body: string | null;
  meta: Record<string, unknown>;
  auto: boolean;
  performedBy: string | null;
  createdAt: string;
}

export interface InterviewSettings {
  id: string;
  slotMinutes: number;
  location: string | null;
  notes: string | null;
}

export interface HrSlot {
  id: string;
  startsAt: string;
  endsAt: string;
  status: string;
  applicantId: string | null;
}

const OPENING_COLUMNS = 'id, title, department, description, status, public_slug, form_schema, interview_criteria, interview_questions, knockout_rules, positions_count, published_at, closed_at, created_at';
const APPLICANT_COLUMNS = 'id, opening_id, full_name, age, phone, email, nationality, residence_city, residence_district, cv_url, attachments, answers, stage, source, priority, rating, notes, lost_reason, knockout_failed, knockout_reasons, duplicate_of, language, shortlisted_for_interview, interview_confirmation, created_at';

const str = (value: unknown): string | null => (typeof value === 'string' && value.trim() ? value : null);
const num = (value: unknown): number | null => (value === null || value === undefined || Number.isNaN(Number(value)) ? null : Number(value));
const fail = (error: { message: string } | null) => { if (error) throw new Error(error.message); };

export function readOpening(row: Record<string, unknown>, counts?: { all: number; shortlisted: number }): Opening {
  return {
    id: String(row.id),
    title: String(row.title ?? ''),
    department: str(row.department),
    description: str(row.description),
    status: readOpeningStatus(row.status),
    publicSlug: str(row.public_slug),
    formSchema: parseFormSchema(row.form_schema),
    interviewCriteria: parseCriteria(row.interview_criteria),
    interviewQuestions: parseQuestions(row.interview_questions),
    knockoutRules: parseKnockoutRules(row.knockout_rules),
    positionsCount: num(row.positions_count),
    publishedAt: str(row.published_at),
    closedAt: str(row.closed_at),
    createdAt: String(row.created_at ?? ''),
    applicantCount: counts?.all ?? 0,
    shortlistedCount: counts?.shortlisted ?? 0,
  };
}

export function readApplicant(row: Record<string, unknown>): Applicant {
  const priority = String(row.priority ?? 'medium');
  return {
    id: String(row.id),
    openingId: String(row.opening_id ?? ''),
    fullName: String(row.full_name ?? ''),
    age: num(row.age),
    phone: str(row.phone),
    email: str(row.email),
    nationality: str(row.nationality),
    residenceCity: str(row.residence_city),
    residenceDistrict: str(row.residence_district),
    cvPath: str(row.cv_url),
    attachments: parseAttachments(row.attachments),
    answers: parseAnswers(row.answers),
    stage: readStage(row.stage),
    source: str(row.source),
    priority: (['low', 'medium', 'high', 'hot'].includes(priority) ? priority : 'medium') as Priority,
    rating: num(row.rating),
    notes: str(row.notes),
    lostReason: str(row.lost_reason),
    knockoutFailed: row.knockout_failed === true,
    knockoutReasons: Array.isArray(row.knockout_reasons) ? (row.knockout_reasons as unknown[]).map(String) : [],
    duplicateOf: str(row.duplicate_of),
    language: str(row.language),
    shortlisted: row.shortlisted_for_interview === true,
    confirmation: readConfirmation(row.interview_confirmation),
    createdAt: String(row.created_at ?? ''),
  };
}

// ─── Openings ─────────────────────────────────────────────────────────────────

/** Every opening with its applicant counts, from one read of applicant ids rather than a count per opening. */
export async function listOpenings(): Promise<Opening[]> {
  const [openings, applicants] = await Promise.all([
    supabase.from('recruitment_openings').select(OPENING_COLUMNS).order('created_at', { ascending: false }),
    supabase.from('recruitment_applicants').select('opening_id, shortlisted_for_interview'),
  ]);
  fail(openings.error);
  fail(applicants.error);
  const counts = new Map<string, { all: number; shortlisted: number }>();
  for (const row of (applicants.data ?? []) as Array<{ opening_id: string | null; shortlisted_for_interview: boolean }>) {
    if (!row.opening_id) continue;
    const entry = counts.get(row.opening_id) ?? { all: 0, shortlisted: 0 };
    entry.all += 1;
    if (row.shortlisted_for_interview) entry.shortlisted += 1;
    counts.set(row.opening_id, entry);
  }
  return ((openings.data ?? []) as Array<Record<string, unknown>>).map(row => readOpening(row, counts.get(String(row.id))));
}

export async function getOpening(id: string): Promise<Opening | null> {
  const { data, error } = await supabase.from('recruitment_openings').select(OPENING_COLUMNS).eq('id', id).maybeSingle();
  fail(error);
  return data ? readOpening(data as Record<string, unknown>) : null;
}

export interface OpeningDraft {
  title: string;
  department: string;
  description: string;
  positionsCount: string;
  formSchema: FormField[];
  interviewCriteria: InterviewCriterion[];
  interviewQuestions: string[];
  knockoutRules: KnockoutRule[];
}

export const toOpeningDraft = (opening: Opening | null): OpeningDraft => ({
  title: opening?.title ?? '',
  department: opening?.department ?? '',
  description: opening?.description ?? '',
  positionsCount: opening?.positionsCount != null ? String(opening.positionsCount) : '',
  formSchema: opening?.formSchema ?? [],
  interviewCriteria: opening?.interviewCriteria ?? [],
  interviewQuestions: opening?.interviewQuestions ?? [],
  knockoutRules: opening?.knockoutRules ?? [],
});

export type OpeningProblem = 'title' | 'positions' | 'question' | 'options' | 'fileKey' | 'criterion' | 'weights' | 'rule';

/** A key under `hr:builder.errors`, or null when the draft can be saved. */
export function openingProblem(draft: OpeningDraft): OpeningProblem | null {
  if (!draft.title.trim()) return 'title';
  if (draft.positionsCount.trim() && !/^\d+$/.test(draft.positionsCount.trim())) return 'positions';
  if (draft.formSchema.some(field => !pickLabel(field.label, 'en').trim())) return 'question';
  if (draft.formSchema.some(field => (field.type === 'single_choice' || field.type === 'multiple_choice') && field.options.filter(o => optionValue(o).trim()).length < 2)) return 'options';
  const files = draft.formSchema.filter(field => field.type === 'file');
  if (files.some(field => !isFileSlot(field.key)) || new Set(files.map(field => field.key)).size !== files.length) return 'fileKey';
  if (draft.interviewCriteria.some(c => !c.label.trim())) return 'criterion';
  const weights = draft.interviewCriteria.map(c => c.weight).filter((w): w is number => w !== null);
  if (weights.length > 0 && (weights.length !== draft.interviewCriteria.length || Math.round(weights.reduce((a, b) => a + b, 0)) !== 100)) return 'weights';
  if (draft.knockoutRules.some(rule => ruleProblem(rule) !== null)) return 'rule';
  return null;
}

/** A label as stored: one string stays one string; per language, only the languages filled in. */
function cleanLabel(label: FormField['label']): FormField['label'] {
  if (typeof label === 'string') return label.trim();
  const parts = labelParts(label);
  return Object.fromEntries(Object.entries(parts).filter(([, text]) => text.trim()).map(([lang, text]) => [lang, text.trim()]));
}

function openingPayload(draft: OpeningDraft) {
  return {
    title: draft.title.trim(),
    department: draft.department.trim() || null,
    description: draft.description.trim() || null,
    positions_count: draft.positionsCount.trim() ? Number(draft.positionsCount.trim()) : null,
    form_schema: draft.formSchema.map(field => ({
      key: field.key,
      type: field.type,
      label: cleanLabel(field.label),
      required: field.required,
      ...(field.type === 'single_choice' || field.type === 'multiple_choice'
        ? { options: field.options.filter(o => optionValue(o).trim()).map(o => (typeof o === 'string' ? o.trim() : o)) }
        : {}),
    })),
    interview_criteria: draft.interviewCriteria.map(c => ({ key: c.key, label: c.label.trim(), weight: c.weight })),
    interview_questions: draft.interviewQuestions.map(q => q.trim()).filter(Boolean),
    knockout_rules: draft.knockoutRules.map(rule => ({ field: rule.field, op: rule.op, value: rule.op === 'empty' ? null : rule.value, reason: rule.reason.trim() })),
  };
}

export async function saveOpening(id: string | null, draft: OpeningDraft, profileId: string | null): Promise<string> {
  const payload = openingPayload(draft);
  const result = id
    ? await supabase.from('recruitment_openings').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', id).select('id').single()
    : await supabase.from('recruitment_openings').insert({ ...payload, status: 'draft', created_by_profile_id: profileId }).select('id').single();
  fail(result.error);
  return String((result.data as { id: string }).id);
}

/** Lowercase latin letters, digits and dashes; Turkish letters folded. */
export function slugify(text: string): string {
  return text.toLocaleLowerCase('tr-TR')
    .replace(/ı/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u').replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

export async function setOpeningStatus(id: string, status: OpeningStatus, slug: string | null): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = { status, updated_at: now };
  if (status === 'published') { patch.published_at = now; patch.closed_at = null; if (slug) patch.public_slug = slug; }
  if (status === 'closed') patch.closed_at = now;
  const { error } = await supabase.from('recruitment_openings').update(patch).eq('id', id);
  if (error?.code === '23505') throw new Error('slug-taken');
  fail(error);
}

// ─── Applicants ───────────────────────────────────────────────────────────────

export async function listApplicants(openingId: string): Promise<Applicant[]> {
  const { data, error } = await supabase.from('recruitment_applicants').select(APPLICANT_COLUMNS).eq('opening_id', openingId).order('created_at', { ascending: false });
  fail(error);
  return ((data ?? []) as Array<Record<string, unknown>>).map(readApplicant);
}

async function logActivity(applicantId: string, type: string, profileId: string | null, body: string | null, meta: Record<string, unknown> = {}, auto = false): Promise<void> {
  // The change itself has landed; a lost timeline line is not worth failing it for.
  await supabase.from('recruitment_activities').insert({ applicant_id: applicantId, activity_type: type, body, meta, auto, performed_by_profile_id: profileId });
}

const STAGE_ORDER = new Map<string, number>(RECRUITMENT_STAGES.map((stage, index) => [stage, index]));

/**
 * Moves an applicant to `target`. `progress` only ever moves forward (an automatic
 * step never undoes a decision); `decision` moves either way. The update is matched
 * on the stage it read, so two people moving the same card can't cross.
 */
export async function moveStage(applicantId: string, target: RecruitmentStage, profileId: string | null, mode: 'manual' | 'progress' | 'decision' = 'manual'): Promise<RecruitmentStage> {
  const { data: before, error: readError } = await supabase.from('recruitment_applicants').select('stage').eq('id', applicantId).maybeSingle();
  fail(readError);
  if (!before) throw new Error('missing');
  const current = readStage((before as { stage: string }).stage);
  if (current === target) return current;
  if (mode === 'progress' && (STAGE_ORDER.get(target) ?? -1) <= (STAGE_ORDER.get(current) ?? -1)) return current;
  const { error } = await supabase.from('recruitment_applicants')
    .update({ stage: target, reviewed_by_profile_id: profileId, updated_at: new Date().toISOString() })
    .eq('id', applicantId).eq('stage', current);
  fail(error);
  await logActivity(applicantId, 'stage_change', profileId, null, { kind: 'stage', from: current, to: target }, mode !== 'manual');
  return target;
}

export interface ApplicantPatch {
  priority?: Priority;
  rating?: number | null;
  notes?: string | null;
  lostReason?: string | null;
}

/** Only what was sent: an omitted field is never nulled. */
export async function updateApplicant(applicantId: string, patch: ApplicantPatch): Promise<void> {
  const row: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if ('priority' in patch) row.priority = patch.priority;
  if ('rating' in patch) row.rating = patch.rating ?? null;
  if ('notes' in patch) row.notes = patch.notes?.trim() || null;
  if ('lostReason' in patch) row.lost_reason = patch.lostReason?.trim() || null;
  const { error } = await supabase.from('recruitment_applicants').update(row).eq('id', applicantId);
  fail(error);
}

/** On the list, the stage moves up to "interview invited". A booked slot is left alone when taken off. */
export async function setShortlisted(applicantId: string, shortlisted: boolean, profileId: string | null): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabase.from('recruitment_applicants').update({
    shortlisted_for_interview: shortlisted,
    shortlisted_at: shortlisted ? now : null,
    shortlisted_by_profile_id: shortlisted ? profileId : null,
    updated_at: now,
  }).eq('id', applicantId);
  fail(error);
  await logActivity(applicantId, 'note', profileId, null, { kind: shortlisted ? 'shortlisted' : 'unshortlisted' });
  if (shortlisted) await moveStage(applicantId, 'interview_invited', profileId, 'progress');
}

/** No-show: the stage, "not coming", and their slot back on the board. */
export async function markNoShow(applicantId: string, profileId: string | null): Promise<void> {
  await moveStage(applicantId, 'no_show', profileId, 'decision');
  const { error } = await supabase.from('recruitment_applicants').update({ interview_confirmation: 'not_coming', updated_at: new Date().toISOString() }).eq('id', applicantId);
  fail(error);
  const released = await supabase.from('recruitment_interview_slots').update({ applicant_id: null, status: 'open' }).eq('applicant_id', applicantId).eq('status', 'booked');
  fail(released.error);
}

// ─── Activities ───────────────────────────────────────────────────────────────

export const NOTE_TYPES = ['note', 'call', 'whatsapp', 'email', 'meeting'] as const;
export type NoteType = typeof NOTE_TYPES[number];

export async function listActivities(applicantId: string): Promise<Activity[]> {
  const { data, error } = await supabase.from('recruitment_activities')
    .select('id, activity_type, body, meta, auto, performed_by_profile_id, created_at')
    .eq('applicant_id', applicantId).order('created_at', { ascending: false }).limit(100);
  fail(error);
  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    id: Number(row.id),
    type: String(row.activity_type ?? 'note'),
    body: str(row.body),
    meta: row.meta && typeof row.meta === 'object' && !Array.isArray(row.meta) ? row.meta as Record<string, unknown> : {},
    auto: row.auto === true,
    performedBy: str(row.performed_by_profile_id),
    createdAt: String(row.created_at ?? ''),
  }));
}

export async function addNote(applicantId: string, type: NoteType, body: string, profileId: string | null): Promise<void> {
  const { error } = await supabase.from('recruitment_activities').insert({ applicant_id: applicantId, activity_type: type, body: body.trim(), meta: {}, auto: false, performed_by_profile_id: profileId });
  fail(error);
}

// ─── Interviews and scorecards ────────────────────────────────────────────────

export async function listInterviews(applicantIds: readonly string[]): Promise<Interview[]> {
  if (applicantIds.length === 0) return [];
  const { data, error } = await supabase.from('recruitment_interviews')
    .select('id, applicant_id, held_at, interviewer_profile_id, recommendation, overall_notes, created_at')
    .in('applicant_id', applicantIds as string[]).order('created_at', { ascending: false });
  fail(error);
  const interviews = (data ?? []) as Array<Record<string, unknown>>;
  const ids = interviews.map(row => String(row.id));
  const scores = ids.length
    ? await supabase.from('recruitment_interview_scores').select('interview_id, criterion, score, note').in('interview_id', ids)
    : { data: [], error: null };
  fail(scores.error);
  const byInterview = new Map<string, InterviewScore[]>();
  for (const row of (scores.data ?? []) as Array<Record<string, unknown>>) {
    const list = byInterview.get(String(row.interview_id)) ?? [];
    list.push({ criterion: String(row.criterion), score: num(row.score), note: str(row.note) });
    byInterview.set(String(row.interview_id), list);
  }
  return interviews.map(row => ({
    id: String(row.id),
    applicantId: String(row.applicant_id),
    heldAt: str(row.held_at),
    interviewerProfileId: str(row.interviewer_profile_id),
    recommendation: (['hire', 'reject', 'hold'].includes(String(row.recommendation)) ? row.recommendation : null) as Recommendation | null,
    overallNotes: str(row.overall_notes),
    createdAt: String(row.created_at ?? ''),
    scores: byInterview.get(String(row.id)) ?? [],
  }));
}

/** Resumes the open interview (no recommendation yet) or starts one; either way the stage moves up to "interviewed". */
export async function startInterview(applicantId: string, profileId: string | null): Promise<string> {
  const { data: open, error } = await supabase.from('recruitment_interviews').select('id')
    .eq('applicant_id', applicantId).is('recommendation', null).order('created_at', { ascending: false }).limit(1).maybeSingle();
  fail(error);
  let id = open ? String((open as { id: string }).id) : null;
  if (!id) {
    const created = await supabase.from('recruitment_interviews')
      .insert({ applicant_id: applicantId, interviewer_profile_id: profileId, held_at: new Date().toISOString(), created_by_profile_id: profileId })
      .select('id').single();
    fail(created.error);
    id = String((created.data as { id: string }).id);
    await logActivity(applicantId, 'interview', profileId, null, { kind: 'interview_started' });
  }
  await moveStage(applicantId, 'interviewed', profileId, 'progress');
  return id;
}

/** One criterion, saved as it is scored; the (interview, criterion) key makes repeat saves update in place. */
export async function saveScore(interviewId: string, criterion: string, score: number | null, note: string | null): Promise<void> {
  if (score !== null && (!Number.isInteger(score) || score < 1 || score > 5)) throw new Error('score');
  const { error } = await supabase.from('recruitment_interview_scores')
    .upsert({ interview_id: interviewId, criterion, score, note: note?.trim() || null }, { onConflict: 'interview_id,criterion' });
  fail(error);
}

/** Closes an interview; a recommendation moves the stage with it, either way. */
export async function finishInterview(interviewId: string, applicantId: string, recommendation: Recommendation | null, notes: string, profileId: string | null): Promise<void> {
  const { error } = await supabase.from('recruitment_interviews')
    .update({ recommendation, overall_notes: notes.trim() || null, updated_at: new Date().toISOString() }).eq('id', interviewId);
  fail(error);
  if (recommendation) await moveStage(applicantId, RECOMMENDATION_STAGE[recommendation], profileId, 'decision');
}

// ─── Interview calendar ───────────────────────────────────────────────────────

export async function getInterviewSettings(openingId: string): Promise<InterviewSettings | null> {
  const { data, error } = await supabase.from('recruitment_interview_settings').select('id, slot_minutes, location, notes').eq('opening_id', openingId).maybeSingle();
  fail(error);
  if (!data) return null;
  const row = data as Record<string, unknown>;
  return { id: String(row.id), slotMinutes: Number(row.slot_minutes) || 20, location: str(row.location), notes: str(row.notes) };
}

export async function saveInterviewSettings(openingId: string, settings: { slotMinutes: number; location: string | null; notes: string | null }, profileId: string | null): Promise<void> {
  const existing = await getInterviewSettings(openingId);
  const payload = { slot_minutes: settings.slotMinutes, location: settings.location, notes: settings.notes?.trim() || null, updated_at: new Date().toISOString() };
  const { error } = existing
    ? await supabase.from('recruitment_interview_settings').update(payload).eq('id', existing.id)
    : await supabase.from('recruitment_interview_settings').insert({ ...payload, opening_id: openingId, created_by_profile_id: profileId });
  fail(error);
}

export async function listSlots(openingId: string): Promise<HrSlot[]> {
  const { data, error } = await supabase.from('recruitment_interview_slots').select('id, starts_at, ends_at, status, applicant_id').eq('opening_id', openingId).order('starts_at');
  fail(error);
  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id), startsAt: String(row.starts_at), endsAt: String(row.ends_at), status: String(row.status ?? 'open'), applicantId: str(row.applicant_id),
  }));
}

/** Slots for one day's window through `recruitment_generate_slots`; returns how many were new. */
export async function generateSlots(openingId: string, startIso: string, endIso: string, minutes: number): Promise<number> {
  const { data, error } = await supabase.rpc('recruitment_generate_slots', { p_opening_id: openingId, p_day_start: startIso, p_day_end: endIso, p_slot_minutes: minutes });
  fail(error);
  return Number(data) || 0;
}

/** Removes a day's open slots; booked ones stay. */
export async function clearOpenSlots(openingId: string, startIso: string, endIso: string): Promise<void> {
  const { error } = await supabase.from('recruitment_interview_slots').delete()
    .eq('opening_id', openingId).eq('status', 'open').gte('starts_at', startIso).lt('starts_at', endIso);
  fail(error);
}

export async function setSlotBlocked(slotId: string, blocked: boolean): Promise<void> {
  const { error } = await supabase.from('recruitment_interview_slots').update({ status: blocked ? 'blocked' : 'open', updated_at: new Date().toISOString() }).eq('id', slotId).neq('status', 'booked');
  fail(error);
}

// ─── Files ────────────────────────────────────────────────────────────────────

export const RECRUITMENT_BUCKET = 'recruitment_files';
/** Ten minutes: long enough to open, too short to pass around. */
const SIGNED_URL_SECONDS = 600;

/** A fresh link per click; the bucket is private, so nothing permanent is ever stored or shown. */
export async function signedFileUrl(path: string): Promise<string | null> {
  const clean = path.trim().replace(/^recruitment_files\//, '');
  if (!clean) return null;
  if (/^https?:\/\//.test(clean)) return clean;
  const { data, error } = await supabase.storage.from(RECRUITMENT_BUCKET).createSignedUrl(clean, SIGNED_URL_SECONDS);
  if (error) return null;
  return data?.signedUrl ?? null;
}
