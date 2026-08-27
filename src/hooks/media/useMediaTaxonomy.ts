import { useCallback, useEffect, useMemo, useState } from 'react';
import { mediaDb } from '../../lib/media/client';
import type { MediaTaxonomyItem, TaxonomyMap } from '../../types/media';

/**
 * Goals and formats are data, not constants — they are edited by admins in
 * `media.goals` / `media.formats`, so both lists (and their badge colours) are
 * always read from the database.
 */
export interface MediaTaxonomy {
  goals: MediaTaxonomyItem[];
  formats: MediaTaxonomyItem[];
  goalMap: TaxonomyMap;
  formatMap: TaxonomyMap;
  loading: boolean;
  error: string | null;
  reload: () => void;
}

const byOrder = (a: MediaTaxonomyItem, b: MediaTaxonomyItem) =>
  a.sort_order - b.sort_order || a.label.localeCompare(b.label);

export function useMediaTaxonomy(): MediaTaxonomy {
  const [goals, setGoals] = useState<MediaTaxonomyItem[]>([]);
  const [formats, setFormats] = useState<MediaTaxonomyItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce(n => n + 1), []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);

    // Two tiny independent lookups — no reason to serialise them.
    (async () => {
      const [goalsRes, formatsRes] = await Promise.all([
        mediaDb.from('goals').select('key, label, color, is_active, sort_order').eq('is_active', true),
        mediaDb.from('formats').select('key, label, color, is_active, sort_order').eq('is_active', true),
      ]);
      if (!active) return;

      const failure = goalsRes.error ?? formatsRes.error;
      if (failure) {
        setError(failure.message);
        setLoading(false);
        return;
      }
      setGoals(((goalsRes.data ?? []) as MediaTaxonomyItem[]).slice().sort(byOrder));
      setFormats(((formatsRes.data ?? []) as MediaTaxonomyItem[]).slice().sort(byOrder));
      setLoading(false);
    })();

    return () => { active = false; };
  }, [nonce]);

  const goalMap = useMemo(() => new Map(goals.map(g => [g.key, g])), [goals]);
  const formatMap = useMemo(() => new Map(formats.map(f => [f.key, f])), [formats]);

  return { goals, formats, goalMap, formatMap, loading, error, reload };
}
