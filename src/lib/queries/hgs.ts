import { supabase } from '../supabase';
import { ALL_MONTHS } from '../pendingInvoices';
import { monthRange, type HgsCar, type HgsTransit } from '../hgs';

/**
 * HGS reads. An n8n workflow writes `hgs_transactions`; this page only reads it,
 * except for a car's barcode, which finance can fill in from the banner. `cars` also
 * holds investor details, which are never selected here.
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

const TRANSIT_COLUMNS = 'id, car_id, plate_number, transit_datetime, amount, record_type';
const toTransit = (row: HgsTransit): HgsTransit => ({ ...row, amount: Number(row.amount) });

/**
 * Every transit, a thousand at a time (the API's limit). The first page brings the
 * count, the rest go out together: two round trips however long the table gets.
 */
export async function getHgsTransits(): Promise<HgsTransit[]> {
  const page = (from: number) => supabase.from('hgs_transactions').select(TRANSIT_COLUMNS).order('id').range(from, from + PAGE - 1);
  const first = await supabase.from('hgs_transactions').select(TRANSIT_COLUMNS, { count: 'exact' }).order('id').range(0, PAGE - 1);
  if (first.error) throw first.error;
  const total = first.count ?? 0;
  const rest = await Promise.all(Array.from({ length: Math.max(Math.ceil(total / PAGE) - 1, 0) }, (_, i) => page((i + 1) * PAGE)));
  const failed = rest.find(result => result.error);
  if (failed?.error) throw failed.error;
  return [first, ...rest].flatMap(result => ((result.data ?? []) as HgsTransit[]).map(toTransit));
}

/** When the workflow last wrote a row. */
export async function getHgsLastSync(): Promise<string | null> {
  const { data, error } = await supabase.from('hgs_transactions').select('created_at').order('created_at', { ascending: false }).limit(1);
  if (error) throw error;
  return (data?.[0] as { created_at?: string } | undefined)?.created_at ?? null;
}

export interface HgsCarTransit {
  id: number;
  transit_datetime: string;
  toll_location: string | null;
  entry_location: string | null;
  exit_location: string | null;
  amount: number;
  record_type: string | null;
  booking_id: number | null;
  booking: { booking_number: string } | null;
  customer: { first_name: string | null; last_name: string | null } | null;
}

/** One car's transits for the period, newest first. A car that left the fleet is found by its plate. */
export async function getHgsCarTransits(carId: number | null, plate: string, month: string): Promise<HgsCarTransit[]> {
  let query = supabase
    .from('hgs_transactions')
    .select('id, transit_datetime, toll_location, entry_location, exit_location, amount, record_type, booking_id, booking:booking_id(booking_number), customer:customer_id(first_name, last_name)');
  query = carId !== null ? query.eq('car_id', carId) : query.is('car_id', null).eq('plate_number', plate);
  if (month !== ALL_MONTHS) {
    const { from, to } = monthRange(month);
    query = query.gte('transit_datetime', from).lt('transit_datetime', to);
  }
  const { data, error } = await query.order('transit_datetime', { ascending: false }).order('id', { ascending: false }).limit(PAGE);
  if (error) throw error;
  const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);
  type Raw = Omit<HgsCarTransit, 'booking' | 'customer'> & { booking: HgsCarTransit['booking'] | HgsCarTransit['booking'][]; customer: HgsCarTransit['customer'] | HgsCarTransit['customer'][] };
  return ((data ?? []) as unknown as Raw[]).map(row => ({ ...row, amount: Number(row.amount), booking: one(row.booking), customer: one(row.customer) }));
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
