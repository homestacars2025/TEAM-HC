import { getCurrentProfile } from '../../lib/auth/get-current-profile';
import { mediaDb } from '../../lib/queries/media';
import { normalizeReferenceUrl } from '../../lib/media/reference-url';
import type {
  ActionResult, ConvertResult, EditablePostField,
  IdeaInput, InfluencerInput, PostInput, SaveResult,
} from '../../lib/types/media';

/**
 * Every write for the Media section. Reads live in `lib/queries/media.ts`.
 *
 * Each action re-checks the caller and returns a plain object — never throws — so
 * a rejected write becomes a toast rather than an error boundary.
 */

// ─── Shared helpers ───────────────────────────────────────────────────────────

type Subscriber = () => void;
const subscribers = new Set<Subscriber>();

/**
 * The SPA stand-in for `revalidatePath`: mounted Media pages re-run their fetch.
 * Returns an unsubscribe function for effect cleanup.
 */
export function onMediaRevalidate(fn: Subscriber): () => void {
  subscribers.add(fn);
  return () => { subscribers.delete(fn); };
}

function revalidateMedia(): void {
  subscribers.forEach((fn) => fn());
}

/** Today in Istanbul (UTC+3, year-round) as yyyy-MM-dd — the operating timezone. */
function istanbulToday(): string {
  const now = new Date();
  const istanbul = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  return istanbul.toISOString().slice(0, 10);
}

/** `""` and `"   "` both become null, so "unset" has one representation. */
function trimmed(value: string | null | undefined): string | null {
  const v = value?.trim();
  return v ? v : null;
}

function friendlyError(error: { code?: string; message: string }): string {
  const code = error.code ?? '';
  const msg = error.message.toLowerCase();

  if (code === 'PGRST106' || msg.includes('invalid schema'))
    return "Media tables aren't reachable yet — ask an admin to expose the `media` schema in Supabase.";
  if (code === '42501' || msg.includes('row-level security'))
    return "You don't have permission to change this — Posted and Approved are set by an admin.";
  if (code === '23503')
    return 'That reference no longer exists. Refresh the page and try again.';
  if (code === '23505')
    return 'A record with those details already exists.';
  return error.message;
}

const NOT_AUTHENTICATED = { ok: false as const, error: 'Not authenticated' };

// ─── Ideas ────────────────────────────────────────────────────────────────────

/**
 * `posted` and `is_approved` are absent from `IdeaInput` and from this payload —
 * they are admin-only, so leaving them out means an ordinary edit never trips the
 * policy. `converted_post_id` is written only by `convertIdeaToPost`.
 */
export async function saveIdea(input: IdeaInput): Promise<SaveResult> {
  const profile = await getCurrentProfile();
  if (!profile) return NOT_AUTHENTICATED;

  const title = input.title.trim();
  if (!title) return { ok: false, error: 'Title is required' };

  const payload = {
    title,
    content: trimmed(input.content),
    category: trimmed(input.category),
    goal_key: trimmed(input.goal_key),
    format_key: trimmed(input.format_key),
    note: trimmed(input.note),
    reference_url: normalizeReferenceUrl(input.reference_url),
  };

  if (input.id) {
    const { error } = await mediaDb
      .from('ideas')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', input.id);
    if (error) return { ok: false, error: friendlyError(error) };
    revalidateMedia();
    return { ok: true, id: input.id };
  }

  const { data, error } = await mediaDb
    .from('ideas')
    .insert({ ...payload, created_by: profile.id })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: friendlyError(error ?? { message: 'Insert failed' }) };
  revalidateMedia();
  return { ok: true, id: (data as unknown as { id: string }).id };
}

/**
 * Seeds a post from an idea and links the two.
 *
 * Idempotent — a second call returns the existing post and creates nothing. The
 * date defaults to today so the post lands somewhere visible rather than sitting
 * in unscheduled limbo. If the back-link fails the post is *kept*: losing real
 * work to a bookkeeping error is worse than a stale "not converted" flag.
 */
export async function convertIdeaToPost(ideaId: string): Promise<ConvertResult> {
  const profile = await getCurrentProfile();
  if (!profile) return NOT_AUTHENTICATED;

  const { data: idea, error: readError } = await mediaDb
    .from('ideas')
    .select('id, title, content, goal_key, format_key, reference_url, converted_post_id')
    .eq('id', ideaId)
    .single();

  if (readError) return { ok: false, error: friendlyError(readError) };
  if (!idea) return { ok: false, error: 'Idea not found' };

  const source = idea as unknown as {
    id: string; title: string | null; content: string | null;
    goal_key: string | null; format_key: string | null;
    reference_url: string | null; converted_post_id: string | null;
  };

  if (source.converted_post_id) return { ok: true, postId: source.converted_post_id };

  const { data: post, error: insertError } = await mediaDb
    .from('posts')
    .insert({
      post_date: istanbulToday(),
      goal_key: source.goal_key,
      format_key: source.format_key,
      objective: source.title,   // title   → objective
      caption: source.content,   // content → caption
      reference_url: source.reference_url,
      source_idea_id: source.id,
      created_by: profile.id,
    })
    .select('id')
    .single();

  if (insertError || !post) {
    return { ok: false, error: friendlyError(insertError ?? { message: 'Insert failed' }) };
  }

  const postId = (post as unknown as { id: string }).id;

  const { error: linkError } = await mediaDb
    .from('ideas')
    .update({ converted_post_id: postId, updated_at: new Date().toISOString() })
    .eq('id', ideaId);

  revalidateMedia();

  if (linkError) {
    return { ok: true, postId, warning: "Post created, but the idea couldn't be marked as converted." };
  }
  return { ok: true, postId };
}

// ─── Posts ────────────────────────────────────────────────────────────────────

/**
 * The whitelist backing `PostInput`. `posted` is admin-only and `week_no` is a
 * generated column, so neither can be reached from this dashboard.
 */
const EDITABLE_POST_FIELDS: readonly EditablePostField[] = [
  'post_date', 'week_label', 'goal_key', 'format_key',
  'objective', 'visual_script', 'caption', 'cta', 'media_link', 'reference_url',
];

export async function savePost(input: PostInput): Promise<SaveResult> {
  const profile = await getCurrentProfile();
  if (!profile) return NOT_AUTHENTICATED;

  const payload = {
    post_date: trimmed(input.post_date),
    week_label: trimmed(input.week_label),
    goal_key: trimmed(input.goal_key),
    format_key: trimmed(input.format_key),
    objective: trimmed(input.objective),
    visual_script: trimmed(input.visual_script),
    caption: trimmed(input.caption),
    cta: trimmed(input.cta),
    media_link: trimmed(input.media_link),
    reference_url: normalizeReferenceUrl(input.reference_url),
  };

  if (input.id) {
    const { error } = await mediaDb
      .from('posts')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', input.id);
    if (error) return { ok: false, error: friendlyError(error) };
    revalidateMedia();
    return { ok: true, id: input.id };
  }

  const { data, error } = await mediaDb
    .from('posts')
    .insert({ ...payload, created_by: profile.id })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: friendlyError(error ?? { message: 'Insert failed' }) };
  revalidateMedia();
  return { ok: true, id: (data as unknown as { id: string }).id };
}

/**
 * One field of one post, for the List view's inline editors and for a dragged
 * chip. No revalidation: the caller already applied the value optimistically and
 * rolls back on `ok: false`, so refetching here would only risk a visible flash.
 */
export async function updatePostField(
  postId: string,
  field: EditablePostField,
  value: string | null,
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return NOT_AUTHENTICATED;

  if (!EDITABLE_POST_FIELDS.includes(field)) {
    return { ok: false, error: 'That field is managed by an admin.' };
  }

  const next = field === 'reference_url' ? normalizeReferenceUrl(value) : trimmed(value);

  const { error } = await mediaDb
    .from('posts')
    .update({ [field]: next, updated_at: new Date().toISOString() })
    .eq('id', postId);

  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}

// ─── Influencers ──────────────────────────────────────────────────────────────

export async function saveInfluencer(input: InfluencerInput): Promise<SaveResult> {
  const profile = await getCurrentProfile();
  if (!profile) return NOT_AUTHENTICATED;

  const name = input.name.trim();
  if (!name) return { ok: false, error: 'Name is required' };

  const payload = {
    name,
    followers_count: trimmed(input.followers_count),
    url: trimmed(input.url),
    email_contact: trimmed(input.email_contact),
    type: trimmed(input.type),
    country: trimmed(input.country),
    notes: trimmed(input.notes),
    messaging_status: trimmed(input.messaging_status),
    final_decision: trimmed(input.final_decision),
  };

  if (input.id) {
    const { error } = await mediaDb
      .from('influencers')
      .update({ ...payload, updated_at: new Date().toISOString() })
      .eq('id', input.id);
    if (error) return { ok: false, error: friendlyError(error) };
    revalidateMedia();
    return { ok: true, id: input.id };
  }

  const { data, error } = await mediaDb
    .from('influencers')
    .insert({ ...payload, created_by: profile.id })
    .select('id')
    .single();
  if (error || !data) return { ok: false, error: friendlyError(error ?? { message: 'Insert failed' }) };
  revalidateMedia();
  return { ok: true, id: (data as unknown as { id: string }).id };
}

/** Narrowed at runtime as well as in the type — the pills may touch nothing else. */
export async function updateInfluencerStatus(
  id: string,
  field: 'messaging_status' | 'final_decision',
  value: string | null,
): Promise<ActionResult> {
  const profile = await getCurrentProfile();
  if (!profile) return NOT_AUTHENTICATED;

  if (field !== 'messaging_status' && field !== 'final_decision') {
    return { ok: false, error: "That field can't be edited here." };
  }

  const { error } = await mediaDb
    .from('influencers')
    .update({ [field]: trimmed(value), updated_at: new Date().toISOString() })
    .eq('id', id);

  if (error) return { ok: false, error: friendlyError(error) };
  return { ok: true };
}
