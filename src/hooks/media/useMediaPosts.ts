import { useCallback, useEffect, useState } from 'react';
import {
  POST_WRITABLE_COLUMNS,
  currentUserId,
  mediaDb,
  mediaErrorMessage,
  pickWritable,
} from '../../lib/media/client';
import type { MediaPost, PostDraft } from '../../types/media';

const POST_SELECT =
  'id, post_date, week_no, week_label, goal_key, format_key, objective, visual_script, ' +
  'caption, cta, media_link, posted, source_idea_id, created_by, created_at, updated_at';

export interface UseMediaPosts {
  posts: MediaPost[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createPost: (draft: Partial<PostDraft>) => Promise<{ ok: boolean; message: string; post?: MediaPost }>;
  updatePost: (id: string, patch: Partial<PostDraft>) => Promise<{ ok: boolean; message: string }>;
}

/**
 * Every post is loaded once and filtered by month in the page. The table holds one
 * row per planned post — a few hundred at most — so paging by month would cost a
 * round-trip on every arrow click for no gain.
 */
export function useMediaPosts(): UseMediaPosts {
  const [posts, setPosts] = useState<MediaPost[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    // Undated posts sort last so the Unscheduled group stays at the bottom.
    const { data, error: fetchError } = await mediaDb
      .from('posts')
      .select(POST_SELECT)
      .order('post_date', { ascending: true, nullsFirst: false })
      .order('created_at', { ascending: true });

    setLoading(false);
    if (fetchError) { setError(fetchError.message); return; }
    setPosts((data ?? []) as unknown as MediaPost[]);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const createPost = useCallback(async (draft: Partial<PostDraft>) => {
    const payload = {
      ...pickWritable<PostDraft, keyof PostDraft>(draft, POST_WRITABLE_COLUMNS),
      created_by: await currentUserId(),
    };
    const { data, error: insertError } = await mediaDb
      .from('posts')
      .insert(payload)
      .select(POST_SELECT)
      .single();

    if (insertError || !data) {
      return { ok: false, message: mediaErrorMessage(insertError, 'Could not create the post') };
    }
    const post = data as unknown as MediaPost;
    setPosts(prev => sortPosts([...prev, post]));
    return { ok: true, message: 'Post created', post };
  }, []);

  /** Optimistic: inline edits land instantly and revert if the server refuses. */
  const updatePost = useCallback(async (id: string, patch: Partial<PostDraft>) => {
    const payload = pickWritable<PostDraft, keyof PostDraft>(patch, POST_WRITABLE_COLUMNS);
    if (Object.keys(payload).length === 0) return { ok: true, message: '' };

    let snapshot: MediaPost | undefined;
    setPosts(prev => sortPosts(prev.map(post => {
      if (post.id !== id) return post;
      snapshot = post;
      return { ...post, ...payload } as MediaPost;
    })));

    const { data, error: updateError } = await mediaDb
      .from('posts')
      .update(payload)
      .eq('id', id)
      .select(POST_SELECT)
      .single();

    if (updateError || !data) {
      if (snapshot) {
        const restored = snapshot;
        setPosts(prev => sortPosts(prev.map(post => (post.id === id ? restored : post))));
      }
      return { ok: false, message: mediaErrorMessage(updateError, 'Could not save the changes') };
    }
    // week_no is generated from post_date, so the server's row is the source of truth.
    setPosts(prev => sortPosts(prev.map(post => (post.id === id ? (data as unknown as MediaPost) : post))));
    return { ok: true, message: 'Post updated' };
  }, []);

  return { posts, loading, error, reload, createPost, updatePost };
}

/** Same ordering as the query, applied locally after an insert or a date change. */
function sortPosts(rows: MediaPost[]): MediaPost[] {
  return rows.slice().sort((a, b) => {
    if (a.post_date === b.post_date) return a.created_at.localeCompare(b.created_at);
    if (!a.post_date) return 1;
    if (!b.post_date) return -1;
    return a.post_date.localeCompare(b.post_date);
  });
}
