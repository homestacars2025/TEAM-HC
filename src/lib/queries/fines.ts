import type { Fine, FineStatus } from '../fines';
import { supabase } from '../supabase';
import { uploadWithProgress } from './storageUpload';

/**
 * `traffic_fines` has triggers on every write. Inserting a fine with a customer charges
 * their wallet and queues a WhatsApp message; moving it to paid credits the wallet and
 * queues another. Nothing undoes either, and a fine inserted as already paid never gets
 * the payment line. So a new fine is always unpaid, and only `markFinePaid` changes status.
 */

export interface FineCar {
  id: number;
  plate_number: string;
  model: string | null;
}

type Joined = { first_name: string; last_name: string };

export async function getFines(): Promise<Fine[]> {
  const { data, error } = await supabase
    .from('traffic_fines')
    .select(`
      id, status, plate_number, violation_number, customer_name,
      notification_date, amount, location, violation_date, violation_time,
      article, description, fine_image_url, fine_pdf_url, payment_receipt_url,
      created_at, car_id, customer_id, violation_code
    `)
    .order('created_at', { ascending: false });
  if (error) throw error;
  const fines = (data ?? []) as Fine[];

  // New fines store only customer_id, so the name comes from the customer.
  const ids = [...new Set(fines.map(fine => fine.customer_id).filter((id): id is string => !!id))];
  if (ids.length === 0) return fines;
  const { data: customers } = await supabase.from('customers').select('id, first_name, last_name').in('id', ids);
  const names = new Map(((customers ?? []) as Array<Joined & { id: string }>).map(c => [String(c.id), `${c.first_name} ${c.last_name}`.trim()]));
  return fines.map(fine => (fine.customer_id && names.has(fine.customer_id) ? { ...fine, customer_name: names.get(fine.customer_id)! } : fine));
}

export async function getFineCars(): Promise<FineCar[]> {
  const { data, error } = await supabase
    .from('cars')
    .select('id, plate_number, model_group:model_group_id(name)')
    .eq('is_active', true)
    .order('plate_number');
  if (error) throw error;
  return ((data ?? []) as unknown as Array<{ id: number; plate_number: string; model_group: { name: string } | { name: string }[] | null }>)
    .map(car => {
      const group = Array.isArray(car.model_group) ? car.model_group[0] : car.model_group;
      return { id: car.id, plate_number: car.plate_number, model: group?.name?.replace(/\s+/g, ' ').trim() || null };
    });
}

export const nextFineSequence = async (plate: string): Promise<number> => {
  const { count } = await supabase.from('traffic_fines').select('id', { count: 'exact', head: true }).eq('plate_number', plate);
  return (count ?? 0) + 1;
};

const extension = (file: File, fallback: string) =>
  (file.name.includes('.') ? file.name.split('.').pop() ?? fallback : fallback).toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || fallback;

/** `CZ-R`, `CZ-D` and `CZ-F` are the folders of fine images, PDFs and receipts. */
export function uploadFineFile(folder: 'CZ-R' | 'CZ-D' | 'CZ-F', name: string, file: File, onProgress?: (percent: number) => void): Promise<string> {
  return uploadWithProgress('cezalar', `${folder}/${folder}-${name}.${extension(file, 'jpg')}`, file, onProgress);
}

export interface FineChange {
  violation_number: string;
  violation_code: string | null;
  car_id: number | null;
  plate_number: string;
  customer_id: string | null;
  amount: number;
  violation_date: string | null;
  violation_time: string | null;
  notification_date: string | null;
  location: string | null;
  article: string | null;
  description: string | null;
  fine_image_url?: string | null;
  fine_pdf_url?: string | null;
  payment_receipt_url?: string | null;
}

export async function addFine(change: FineChange): Promise<void> {
  const status: FineStatus = 'unpaid';
  const { error } = await supabase.from('traffic_fines').insert({ ...change, status, payment_receipt_url: null });
  if (error) throw error;
}

export async function updateFine(id: string, change: FineChange): Promise<void> {
  const { error } = await supabase.from('traffic_fines').update(change).eq('id', id);
  if (error) throw error;
}

export async function linkFineCustomer(id: string, customerId: string): Promise<void> {
  const { error } = await supabase.from('traffic_fines').update({ customer_id: customerId }).eq('id', id);
  if (error) throw error;
}

/** The sequence comes from the receipts already stored for the plate, and never overwrites one. */
export async function markFinePaid(fine: Pick<Fine, 'id' | 'plate_number' | 'payment_receipt_url'>, receipt: File | null, onProgress?: (percent: number) => void): Promise<void> {
  let payment_receipt_url = fine.payment_receipt_url;
  if (receipt) {
    const { data: stored, error: listError } = await supabase.storage.from('cezalar').list('CZ-F', { limit: 1000, search: `CZ-F-${fine.plate_number}-` });
    if (listError) throw listError;
    payment_receipt_url = await uploadWithProgress(
      'cezalar',
      `CZ-F/CZ-F-${fine.plate_number}-${(stored?.length ?? 0) + 1}.${extension(receipt, 'pdf')}`,
      receipt,
      onProgress,
      false,
    );
  }
  const { error } = await supabase.from('traffic_fines').update({ status: 'paid', payment_receipt_url }).eq('id', fine.id);
  if (error) throw error;
}

export async function deleteFine(id: string): Promise<void> {
  const { error } = await supabase.from('traffic_fines').delete().eq('id', id);
  if (error) throw error;
}
