import { supabase } from '../supabase';
import type { IdeaDraft, InfluencerDraft, PostDraft } from '../../types/media';

/**
 * Every Media query goes through this handle. `media` is a separate exposed schema,
 * so the default `supabase.from(...)` (which targets `public`) would not find these
 * tables. The legacy `social` schema is untouched by anything in this folder.
 */
export const mediaDb = supabase.schema('media');

/**
 * Columns this dashboard is allowed to write.
 *
 * `posted` (posts + ideas) and `is_approved` (ideas) are admin-only — a server-side
 * trigger raises if a staff member changes them — and `week_no` is generated from
 * `post_date`. Sending any of them would fail the whole statement, so every payload
 * is filtered through these lists rather than trusting the caller's object shape.
 */
export const IDEA_WRITABLE_COLUMNS = [
  'title', 'content', 'category', 'format_key', 'goal_key', 'note',
] as const satisfies readonly (keyof IdeaDraft)[];

export const POST_WRITABLE_COLUMNS = [
  'post_date', 'week_label', 'goal_key', 'format_key',
  'objective', 'visual_script', 'caption', 'cta', 'media_link', 'source_idea_id',
] as const satisfies readonly (keyof PostDraft)[];

export const INFLUENCER_WRITABLE_COLUMNS = [
  'name', 'followers_count', 'url', 'email_contact',
  'type', 'country', 'notes', 'messaging_status', 'final_decision',
] as const satisfies readonly (keyof InfluencerDraft)[];

/** Keeps only whitelisted keys that the caller actually supplied. */
export function pickWritable<T extends object, K extends keyof T>(
  source: Partial<T>,
  allowed: readonly K[],
): Partial<Pick<T, K>> {
  const out: Partial<Pick<T, K>> = {};
  for (const key of allowed) {
    if (Object.prototype.hasOwnProperty.call(source, key)) out[key] = source[key];
  }
  return out;
}

/** Empty strings from text inputs mean "no value", not an empty cell. */
export const nullIfBlank = (value: string | null | undefined): string | null => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
};

/** The signed-in user's id, stamped on inserts so `created_by` is never guessed. */
export async function currentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getUser();
  return data.user?.id ?? null;
}

/**
 * PostgREST errors carry a code plus a message; the trigger message is already
 * human-readable, so surface it as-is and fall back to something generic.
 */
export function mediaErrorMessage(error: { message?: string } | null, fallback: string): string {
  return error?.message?.trim() || fallback;
}
