import { useCallback, useEffect, useState } from 'react';
import {
  INFLUENCER_WRITABLE_COLUMNS,
  currentUserId,
  mediaDb,
  mediaErrorMessage,
  pickWritable,
} from '../../lib/media/client';
import type { InfluencerDraft, MediaInfluencer } from '../../types/media';

const INFLUENCER_SELECT =
  'id, name, followers_count, url, email_contact, type, country, notes, ' +
  'messaging_status, final_decision, created_by, created_at, updated_at';

export interface UseMediaInfluencers {
  influencers: MediaInfluencer[];
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  createInfluencer: (draft: InfluencerDraft) => Promise<{ ok: boolean; message: string }>;
  updateInfluencer: (id: string, patch: Partial<InfluencerDraft>) => Promise<{ ok: boolean; message: string }>;
}

export function useMediaInfluencers(): UseMediaInfluencers {
  const [influencers, setInfluencers] = useState<MediaInfluencer[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: fetchError } = await mediaDb
      .from('influencers')
      .select(INFLUENCER_SELECT)
      .order('created_at', { ascending: false });

    setLoading(false);
    if (fetchError) { setError(fetchError.message); return; }
    setInfluencers((data ?? []) as unknown as MediaInfluencer[]);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const createInfluencer = useCallback(async (draft: InfluencerDraft) => {
    const payload = {
      ...pickWritable<InfluencerDraft, keyof InfluencerDraft>(draft, INFLUENCER_WRITABLE_COLUMNS),
      created_by: await currentUserId(),
    };
    const { data, error: insertError } = await mediaDb
      .from('influencers')
      .insert(payload)
      .select(INFLUENCER_SELECT)
      .single();

    if (insertError || !data) {
      return { ok: false, message: mediaErrorMessage(insertError, 'Could not save the contact') };
    }
    setInfluencers(prev => [data as unknown as MediaInfluencer, ...prev]);
    return { ok: true, message: 'Contact added' };
  }, []);

  /**
   * Optimistic — the status dropdowns are edited inline and must feel instant.
   * A rejected write puts the previous value back and the caller raises a toast.
   */
  const updateInfluencer = useCallback(async (id: string, patch: Partial<InfluencerDraft>) => {
    const payload = pickWritable<InfluencerDraft, keyof InfluencerDraft>(patch, INFLUENCER_WRITABLE_COLUMNS);
    if (Object.keys(payload).length === 0) return { ok: true, message: '' };

    let snapshot: MediaInfluencer | undefined;
    setInfluencers(prev => prev.map(row => {
      if (row.id !== id) return row;
      snapshot = row;
      return { ...row, ...payload } as MediaInfluencer;
    }));

    const { data, error: updateError } = await mediaDb
      .from('influencers')
      .update(payload)
      .eq('id', id)
      .select(INFLUENCER_SELECT)
      .single();

    if (updateError || !data) {
      if (snapshot) {
        const restored = snapshot;
        setInfluencers(prev => prev.map(row => (row.id === id ? restored : row)));
      }
      return { ok: false, message: mediaErrorMessage(updateError, 'Could not save the changes') };
    }
    setInfluencers(prev => prev.map(row => (row.id === id ? (data as unknown as MediaInfluencer) : row)));
    return { ok: true, message: 'Contact updated' };
  }, []);

  return { influencers, loading, error, reload, createInfluencer, updateInfluencer };
}
