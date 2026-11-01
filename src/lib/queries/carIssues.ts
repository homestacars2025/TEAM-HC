import type { IssueRow, IssueStatus, IssueType } from '../carIssues';
import { supabase } from '../supabase';
import { uploadWithProgress } from './storageUpload';

const ISSUE_SELECT =
  'id, car_id, plate_number, model_name, type, status, description, ' +
  'damage_photos, repair_photos, damage_photo_count, repair_photo_count, ' +
  'booking_id, booking_number, customer_id, customer_name, ' +
  'discovered_at, discovered_by, discovered_by_name, resolved_at, days_to_resolve, ' +
  'created_at, updated_at';

export async function getIssues(): Promise<IssueRow[]> {
  const { data, error } = await supabase.from('car_issues_detailed').select(ISSUE_SELECT).order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as unknown as IssueRow[];
}

/**
 * Storage keys are ASCII and id-based, never filename-based: uploaded names may carry
 * Turkish or Arabic characters Storage rejects, and two files could share a name.
 * The order of `urls` is the order of `files`.
 */
export async function uploadIssuePhotos(files: File[], prefix: string, onProgress?: (percent: number) => void): Promise<{ urls: string[]; failed: number }> {
  const progress = files.map(() => 0);
  const results = await Promise.all(files.map(async (file, index) => {
    const raw = file.name.includes('.') ? file.name.split('.').pop() ?? '' : '';
    const extension = raw.toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
    const path = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${extension}`;
    try {
      return await uploadWithProgress('car-issues', path, file, percent => {
        progress[index] = percent;
        onProgress?.(Math.round(progress.reduce((sum, part) => sum + part, 0) / files.length));
      });
    } catch {
      return null;
    }
  }));
  return { urls: results.filter((url): url is string => url !== null), failed: results.filter(url => url === null).length };
}

export interface NewIssue {
  car_id: number;
  type: IssueType;
  description: string;
  damage_photos: string[];
  discovered_at: string;
  discovered_by: string | null;
  booking_id: number | null;
  customer_id: string | null;
}

/** `resolved_at` is left alone: the database owns it. */
export async function addIssue(issue: NewIssue): Promise<void> {
  const { error } = await supabase.from('car_issues').insert({ ...issue, status: 'open', repair_photos: [] });
  if (error) throw error;
}

export async function updateIssue(id: number, change: { type: IssueType; description: string }): Promise<void> {
  const { error } = await supabase.from('car_issues').update(change).eq('id', id);
  if (error) throw error;
}

export async function setIssueStatus(id: number, status: IssueStatus): Promise<void> {
  const { error } = await supabase.from('car_issues').update({ status }).eq('id', id);
  if (error) throw error;
}

/** With a date the database keeps it. Without one it stamps its own. */
export async function resolveIssue(id: number, resolvedAt: string, repairPhotos?: string[]): Promise<void> {
  const { error } = await supabase
    .from('car_issues')
    .update({ status: 'resolved', resolved_at: resolvedAt, ...(repairPhotos && { repair_photos: repairPhotos }) })
    .eq('id', id);
  if (error) throw error;
}

export async function setRepairPhotos(id: number, repairPhotos: string[]): Promise<void> {
  const { error } = await supabase.from('car_issues').update({ repair_photos: repairPhotos }).eq('id', id);
  if (error) throw error;
}

export async function deleteIssue(id: number): Promise<void> {
  const { error } = await supabase.from('car_issues').update({ deleted_at: new Date().toISOString() }).eq('id', id);
  if (error) throw error;
}
