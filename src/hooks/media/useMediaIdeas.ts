import { useCallback, useEffect, useState } from 'react';
import {
  IDEA_WRITABLE_COLUMNS,
  currentUserId,
  mediaDb,
  mediaErrorMessage,
  pickWritable,
} from '../../lib/media/client';
import type { IdeaDraft, MediaIdea } from '../../types/media';

const IDEA_SELECT =
  'id, title, content, category, format_key, goal_key, posted, is_approved, note, ' +
  'converted_post_id, created_by, created_at, updated_at';

export interface UseMediaIdeas {
  ideas: MediaIdea[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createIdea: (draft: IdeaDraft) => Promise<{ ok: boolean; message: string }>;
  updateIdea: (id: string, patch: Partial<IdeaDraft>) => Promise<{ ok: boolean; message: string }>;
  /** Spawns a post from an idea and links the two. Resolves with the new post id. */
  convertToPost: (idea: MediaIdea) => Promise<{ ok: boolean; message: string; postId?: string }>;
}

export function useMediaIdeas(): UseMediaIdeas {
  const [ideas, setIdeas] = useState<MediaIdea[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await mediaDb
      .from('ideas')
      .select(IDEA_SELECT)
      .order('created_at', { ascending: false });

    setLoading(false);
    if (fetchError) { setError(fetchError.message); return; }
    setIdeas((data ?? []) as unknown as MediaIdea[]);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const createIdea = useCallback(async (draft: IdeaDraft) => {
    const payload = {
      ...pickWritable<IdeaDraft, keyof IdeaDraft>(draft, IDEA_WRITABLE_COLUMNS),
      created_by: await currentUserId(),
    };
    const { data, error: insertError } = await mediaDb
      .from('ideas')
      .insert(payload)
      .select(IDEA_SELECT)
      .single();

    if (insertError || !data) {
      return { ok: false, message: mediaErrorMessage(insertError, 'Could not save the idea') };
    }
    // Newest first, matching the query's ordering.
    setIdeas(prev => [data as unknown as MediaIdea, ...prev]);
    return { ok: true, message: 'Idea added' };
  }, []);

  /** Optimistic: the card updates immediately and reverts if the write is rejected. */
  const updateIdea = useCallback(async (id: string, patch: Partial<IdeaDraft>) => {
    const payload = pickWritable<IdeaDraft, keyof IdeaDraft>(patch, IDEA_WRITABLE_COLUMNS);
    if (Object.keys(payload).length === 0) return { ok: true, message: '' };

    let snapshot: MediaIdea | undefined;
    setIdeas(prev => prev.map(idea => {
      if (idea.id !== id) return idea;
      snapshot = idea;
      return { ...idea, ...payload } as MediaIdea;
    }));

    const { data, error: updateError } = await mediaDb
      .from('ideas')
      .update(payload)
      .eq('id', id)
      .select(IDEA_SELECT)
      .single();

    if (updateError || !data) {
      if (snapshot) {
        const restored = snapshot;
        setIdeas(prev => prev.map(idea => (idea.id === id ? restored : idea)));
      }
      return { ok: false, message: mediaErrorMessage(updateError, 'Could not save the changes') };
    }
    setIdeas(prev => prev.map(idea => (idea.id === id ? (data as unknown as MediaIdea) : idea)));
    return { ok: true, message: 'Idea updated' };
  }, []);

  /**
   * Two writes, deliberately not optimistic: the post has to exist before the idea
   * can point at it. If the link-back fails the post is kept — it is real content —
   * and the caller is told, so nothing is silently lost.
   */
  const convertToPost = useCallback(async (idea: MediaIdea) => {
    if (idea.converted_post_id) {
      return { ok: true, message: 'Already converted', postId: idea.converted_post_id };
    }

    const userId = await currentUserId();
    const { data: post, error: postError } = await mediaDb
      .from('posts')
      .insert({
        goal_key: idea.goal_key,
        format_key: idea.format_key,
        objective: idea.title,
        visual_script: idea.content,
        caption: idea.content,
        source_idea_id: idea.id,
        created_by: userId,
      })
      .select('id')
      .single();

    if (postError || !post) {
      return { ok: false, message: mediaErrorMessage(postError, 'Could not create the post') };
    }

    const postId = (post as unknown as { id: string }).id;
    const { error: linkError } = await mediaDb
      .from('ideas')
      .update({ converted_post_id: postId })
      .eq('id', idea.id);

    if (linkError) {
      return { ok: false, message: mediaErrorMessage(linkError, 'Post created, but the idea could not be linked'), postId };
    }

    setIdeas(prev => prev.map(row => (row.id === idea.id ? { ...row, converted_post_id: postId } : row)));
    return { ok: true, message: 'Converted to a post', postId };
  }, []);

  return { ideas, loading, error, reload, createIdea, updateIdea, convertToPost };
}
