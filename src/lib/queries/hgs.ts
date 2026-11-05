import { supabase } from '../supabase';
import { ALL_MONTHS } from '../pendingInvoices';
import { monthRange, type HgsCar, type HgsTransit } from '../hgs';
import type { PortalRow } from '../hgsPortal';

/**
 * HGS reads, from `hgs_portal_transits`: the official portal files finance uploads per
 * car. `hgs_transactions` (the old Kuveyt feed) is no longer read here. A car's barcode
 * can be filled in from the banner. `cars` also holds investor details, which are never
 * selected here.
 */

const PAGE = 1000;

type CarRow = { id: number; plate_number: string; hgs_barcode: string | null; model_group: { name: string } | { name: string }[] | null };

export async function getHgsCars(): Promise<HgsCar[]> {
  const { data, error } = await supabase
    .from('cars')
    .select('id, plate_number, hgs_barcode, model_group:model_group_id(name)')
    .eq('is_active', true);
  if (error) throw error;
  return ((data ?? []) as unknown as CarRow[]).map(row => {
    const group = Array.isArray(row.model_group) ? row.model_group[0] : row.model_group;
    return { id: row.id, plate: row.plate_number, barcode: row.hgs_barcode, model: group?.name?.replace(/\s+/g, ' ').trim() ?? null };
  });
}

const TRANSITS = 'hgs_portal_transits';
const TRANSIT_COLUMNS = 'id, car_id, plate_number, transit_datetime, amount, road_type';
const toTransit = (row: HgsTransit): HgsTransit => ({ ...row, amount: Number(row.amount) });

/**
 * Every transit, a thousand at a time (the API's limit). The first page brings the
 * count, the rest go out together: two round trips however long the table gets.
 */
export async function getHgsTransits(): Promise<HgsTransit[]> {
  const page = (from: number) => supabase.from(TRANSITS).select(TRANSIT_COLUMNS).order('id').range(from, from + PAGE - 1);
  const first = await supabase.from(TRANSITS).select(TRANSIT_COLUMNS, { count: 'exact' }).order('id').range(0, PAGE - 1);
  if (first.error) throw first.error;
  const total = first.count ?? 0;
  const rest = await Promise.all(Array.from({ length: Math.max(Math.ceil(total / PAGE) - 1, 0) }, (_, i) => page((i + 1) * PAGE)));
  const failed = rest.find(result => result.error);
  if (failed?.error) throw failed.error;
  return [first, ...rest].flatMap(result => ((result.data ?? []) as HgsTransit[]).map(toTransit));
}

/** When a portal file last added a row. */
export async function getHgsLastSync(): Promise<string | null> {
  const { data, error } = await supabase.from(TRANSITS).select('created_at').order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  return (data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
}

export interface HgsCarTransit {
  id: number;
  road_type: string | null;
  transit_datetime: string;
  entry_location: string | null;
  exit_location: string | null;
  otoyol: string | null;
  amount: number;
  description: string | null;
}

/** One car's transits for the period, newest first. A car that left the fleet is found by its plate. */
export async function getHgsCarTransits(carId: number | null, plate: string, month: string): Promise<HgsCarTransit[]> {
  let query = supabase
    .from(TRANSITS)
    .select('id, road_type, transit_datetime, entry_location, exit_location, otoyol, amount, description');
  query = carId !== null ? query.eq('car_id', carId) : query.is('car_id', null).eq('plate_number', plate);
  if (month !== ALL_MONTHS) {
    const { from, to } = monthRange(month);
    query = query.gte('transit_datetime', from).lt('transit_datetime', to);
  }
  const { data, error } = await query.order('transit_datetime', { ascending: false }).order('id', { ascending: false }).limit(PAGE);
  if (error) throw error;
  return ((data ?? []) as HgsCarTransit[]).map(row => ({ ...row, amount: Number(row.amount) }));
}

/** `taken` when another car already carries this barcode. */
export async function saveHgsBarcode(carId: number, barcode: string): Promise<'saved' | 'taken'> {
  const { data: clash, error: lookup } = await supabase.from('cars').select('id').eq('hgs_barcode', barcode).neq('id', carId).limit(1);
  if (lookup) throw lookup;
  if (clash && clash.length > 0) return 'taken';
  const { data, error } = await supabase.from('cars').update({ hgs_barcode: barcode }).eq('id', carId).select('id');
  if (error) throw error;
  // Nothing changed means the write was quietly refused.
  if (!data || data.length === 0) throw new Error('Not saved');
  return 'saved';
}

// ─── The official portal file ─────────────────────────────────────────────────

export interface PortalImportResult {
  plate: string;
  car_id: number | null;
  car_matched: boolean;
  inserted: number;
  skipped_duplicates: number;
  total_amount: number;
}

/**
 * Sends one car's rows to `import_hgs_portal_file`, which writes `hgs_portal_transits`
 * only and skips any row whose `uniq_key` is already there, so the same file can be sent
 * twice. The Kuveyt sync and `hgs_transactions` are never touched.
 */
export async function importHgsPortalFile(plate: string, rows: PortalRow[], fileName: string): Promise<PortalImportResult> {
  const { data: { session } } = await supabase.auth.getSession();
  const { data, error } = await supabase.rpc('import_hgs_portal_file', {
    p_plate: plate,
    p_rows: rows,
    p_source_file: fileName,
    p_uploaded_by: session?.user?.id ?? null,
  });
  if (error) throw error;
  const result = data as PortalImportResult;
  return { ...result, inserted: Number(result.inserted) || 0, skipped_duplicates: Number(result.skipped_duplicates) || 0, total_amount: Number(result.total_amount) || 0 };
}
