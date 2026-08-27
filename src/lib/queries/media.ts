import { supabase } from '../supabase';
import type { MediaFormat, MediaGoal, MediaIdea, MediaInfluencer, MediaPost } from '../types/media';

/**
 * Every read for the Media section. All writes live in `pages/media/_actions.ts`;
 * nothing else in the section touches Supabase.
 *
 * `media` is a separate exposed schema, so the default `supabase.from(...)`
 * (which targets `public`) would not find these tables. The legacy `social`
 * schema is untouched by anything in this file.
 */
const mediaDb = supabase.schema('media');

/**
 * Select strings are single literals, never concatenations — supabase-js infers
 * the row shape from the literal, and a built-up string degrades the type.
 */
const LOOKUP_SELECT = 'key, label, color, is_active, sort_order';

const IDEA_SELECT =
  'id, title, content, category, format_key, goal_key, posted, is_approved, note, converted_post_id, created_by, created_at, updated_at';

const POST_SELECT =
  'id, post_date, week_no, week_label, goal_key, format_key, objective, visual_script, caption, cta, media_link, posted, source_idea_id, created_by, created_at, updated_at';

const INFLUENCER_SELECT =
  'id, name, followers_count, url, email_contact, type, country, notes, messaging_status, final_decision, created_by, created_at, updated_at';

/**
 * Reads log and swallow rather than throw: a broken lookup degrades to "no goals
 * available", never to a blank page. Failures surface to the user on *write*.
 */
export async function getGoals(): Promise<MediaGoal[]> {
  const { data, error } = await mediaDb
    .from('goals')
    .select(LOOKUP_SELECT)
    .eq('is_active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('label', { ascending: true });
  if (error) { console.error('[media] getGoals:', error.message); return []; }
  return (data ?? []) as unknown as MediaGoal[];
}

export async function getFormats(): Promise<MediaFormat[]> {
  const { data, error } = await mediaDb
    .from('formats')
    .select(LOOKUP_SELECT)
    .eq('is_active', true)
    .order('sort_order', { ascending: true, nullsFirst: false })
    .order('label', { ascending: true });
  if (error) { console.error('[media] getFormats:', error.message); return []; }
  return (data ?? []) as unknown as MediaFormat[];
}

export async function getIdeas(): Promise<MediaIdea[]> {
  const { data, error } = await mediaDb
    .from('ideas')
    .select(IDEA_SELECT)
    .order('created_at', { ascending: false });
  if (error) { console.error('[media] getIdeas:', error.message); return []; }
  return (data ?? []) as unknown as MediaIdea[];
}

/**
 * The whole calendar in one call. A media plan is a few hundred rows, and holding
 * it client-side makes month navigation and the List/Calendar toggle instant. If
 * this ever grows past a few thousand rows, it is the first thing to revisit.
 */
export async function getPosts(): Promise<MediaPost[]> {
  const { data, error } = await mediaDb
    .from('posts')
    .select(POST_SELECT)
    .order('post_date', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) { console.error('[media] getPosts:', error.message); return []; }
  return (data ?? []) as unknown as MediaPost[];
}

export async function getInfluencers(): Promise<MediaInfluencer[]> {
  const { data, error } = await mediaDb
    .from('influencers')
    .select(INFLUENCER_SELECT)
    .order('created_at', { ascending: false });
  if (error) { console.error('[media] getInfluencers:', error.message); return []; }
  return (data ?? []) as unknown as MediaInfluencer[];
}

export { mediaDb };
