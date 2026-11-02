import { supabase } from '../supabase';
import { compareEntries, type KabisEntry, type KabisRow } from '../kabis';

/** Who marked the entry, resolved through an explicitly named foreign key. */
const KABIS_SELECT = `
  id, created_at, operation_id, booking_id, car_id,
  customer_name, customer_id_number, booking_number, plate_number, km, operation_date,
  action_type, status, entered_by, entered_at, note,
  entered_by_profile:profiles!kabis_entries_entered_by_fkey(full_name, avatar_url, gender, avatar_bg)
`;

const PAGE_SIZE = 1000;

function resolveRow(row: KabisRow): KabisEntry {
  const profile = Array.isArray(row.entered_by_profile) ? row.entered_by_profile[0] : row.entered_by_profile;
  const { entered_by_profile, ...rest } = row;
  return { ...rest, entered_by_name: profile?.full_name ?? null, entered_by_avatar: profile ?? null };
}

/** Every entry. PostgREST stops at 1000 rows, so it is read a page at a time. */
export async function getKabisEntries(): Promise<KabisEntry[]> {
  const rows: KabisRow[] = [];
  for (let start = 0; ; start += PAGE_SIZE) {
    const { data, error } = await supabase.from('kabis_entries').select(KABIS_SELECT).order('id').range(start, start + PAGE_SIZE - 1);
    if (error) throw error;
    rows.push(...((data ?? []) as unknown as KabisRow[]));
    if ((data ?? []).length < PAGE_SIZE) break;
  }
  return rows.map(resolveRow).sort(compareEntries);
}

export interface KabisArrival {
  id: number;
  action_type: string;
  plate_number: string | null;
  customer_name: string | null;
}

export async function getLatestKabisId(): Promise<number> {
  const { data, error } = await supabase.from('kabis_entries').select('id').order('id', { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data as { id: number } | null)?.id ?? 0;
}

export async function getKabisArrivals(afterId: number): Promise<KabisArrival[]> {
  const { data, error } = await supabase
    .from('kabis_entries')
    .select('id, action_type, plate_number, customer_name')
    .eq('status', 'pending')
    .gt('id', afterId)
    .order('id')
    .limit(20);
  if (error) throw error;
  return (data ?? []) as KabisArrival[];
}
