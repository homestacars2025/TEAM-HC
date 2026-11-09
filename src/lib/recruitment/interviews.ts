/**
 * The interviews-only screen. A scheduler without the HR page reaches recruitment
 * data through three doors only, all gated in the database by
 * `can_schedule_interviews()`:
 *
 * - the view `recruitment_shortlist_for_team`: name, age, nationality, district,
 *   confirmation and the booked slot. No phone, CV, answers, scores or stage;
 * - `recruitment_interview_slots`, read only;
 * - the RPCs `recruitment_book_slot` and `recruitment_set_confirmation`.
 *
 * Nothing here reads `recruitment_applicants`; a test holds that line.
 */

import { supabase } from '../supabase';
import { istanbulDay, readConfirmation, type InterviewConfirmation } from './model';

export interface ShortlistRow {
  id: string;
  openingId: string;
  openingTitle: string;
  fullName: string;
  age: number | null;
  nationality: string | null;
  district: string | null;
  confirmation: InterviewConfirmation;
  createdAt: string;
  slotId: string | null;
  slotStartsAt: string | null;
  slotEndsAt: string | null;
  location: string | null;
}

export interface InterviewSlot {
  id: string;
  openingId: string;
  startsAt: string;
  endsAt: string;
  status: string;
  /** Whose slot it is, when booked. Only an id: the view says who. */
  applicantId: string | null;
}

const SHORTLIST_COLUMNS = 'id, opening_id, opening_title, full_name, age, nationality, district, interview_confirmation, created_at, slot_id, slot_starts_at, slot_ends_at, location';

export async function getShortlist(): Promise<ShortlistRow[]> {
  const { data, error } = await supabase.from('recruitment_shortlist_for_team').select(SHORTLIST_COLUMNS).order('full_name');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    openingId: String(row.opening_id),
    openingTitle: String(row.opening_title ?? ''),
    fullName: String(row.full_name ?? ''),
    age: row.age == null ? null : Number(row.age),
    nationality: (row.nationality as string | null) || null,
    district: (row.district as string | null) || null,
    confirmation: readConfirmation(row.interview_confirmation),
    createdAt: String(row.created_at ?? ''),
    slotId: (row.slot_id as string | null) ?? null,
    slotStartsAt: (row.slot_starts_at as string | null) ?? null,
    slotEndsAt: (row.slot_ends_at as string | null) ?? null,
    location: (row.location as string | null) || null,
  }));
}

/** An opening's slots from today on, earliest first. */
export async function getOpeningSlots(openingId: string, fromIso: string): Promise<InterviewSlot[]> {
  const { data, error } = await supabase
    .from('recruitment_interview_slots')
    .select('id, opening_id, starts_at, ends_at, status, applicant_id')
    .eq('opening_id', openingId)
    .gte('starts_at', fromIso)
    .order('starts_at');
  if (error) throw new Error(error.message);
  return ((data ?? []) as Array<Record<string, unknown>>).map(row => ({
    id: String(row.id),
    openingId: String(row.opening_id),
    startsAt: String(row.starts_at),
    endsAt: String(row.ends_at),
    status: String(row.status ?? 'open'),
    applicantId: (row.applicant_id as string | null) ?? null,
  }));
}

export async function bookSlot(applicantId: string, slotId: string): Promise<void> {
  const { error } = await supabase.rpc('recruitment_book_slot', { p_applicant: applicantId, p_slot: slotId });
  if (error) throw new Error(error.message);
}

export async function setConfirmation(applicantId: string, status: InterviewConfirmation): Promise<void> {
  const { error } = await supabase.rpc('recruitment_set_confirmation', { p_applicant: applicantId, p_status: status });
  if (error) throw new Error(error.message);
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export const INTERVIEW_FILTERS = ['booked', 'coming', 'not_coming'] as const;
export type InterviewFilter = typeof INTERVIEW_FILTERS[number];

export function matchesInterviewFilter(row: ShortlistRow, filter: InterviewFilter | 'all'): boolean {
  if (filter === 'booked') return row.slotId !== null;
  if (filter === 'coming') return row.confirmation === 'coming';
  if (filter === 'not_coming') return row.confirmation === 'not_coming';
  return true;
}

export function interviewCounts(rows: readonly ShortlistRow[]): Record<InterviewFilter | 'all', number> {
  return {
    all: rows.length,
    booked: rows.filter(row => row.slotId !== null).length,
    coming: rows.filter(row => row.confirmation === 'coming').length,
    not_coming: rows.filter(row => row.confirmation === 'not_coming').length,
  };
}

/** The opening's slot days, in Istanbul, earliest first. */
export const slotDays = (slots: readonly InterviewSlot[]): string[] => Array.from(new Set(slots.map(slot => istanbulDay(slot.startsAt)))).sort();

/** Slots someone can still be booked into: open and not yet started. */
export const openSlots = (slots: readonly InterviewSlot[], now: number = Date.now()): InterviewSlot[] =>
  slots.filter(slot => slot.status === 'open' && Date.parse(slot.startsAt) > now);

/** Booked first by time, then the rest by name. */
export function sortShortlist(rows: readonly ShortlistRow[]): ShortlistRow[] {
  return [...rows].sort((a, b) => {
    if (a.slotStartsAt && b.slotStartsAt) return a.slotStartsAt.localeCompare(b.slotStartsAt);
    if (a.slotStartsAt) return -1;
    if (b.slotStartsAt) return 1;
    return a.fullName.localeCompare(b.fullName);
  });
}

/** Name, nationality or district, every word. */
export function matchesShortlistSearch(row: ShortlistRow, query: string): boolean {
  const words = query.trim().toLocaleLowerCase('tr-TR').split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const haystack = [row.fullName, row.nationality, row.district].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');
  return words.every(word => haystack.includes(word));
}
