import { supabase } from '../supabase';
import type {
  MyNotification, MyTask, TaskActionResult, TaskFilter,
} from '../types/tasks';

/**
 * Every call for the notifications_v2 / tasks feature.
 *
 * Reads and writes live together here, unlike the Media section: RLS forbids
 * writing to `tasks` and `notifications_v2` directly, so there is no table
 * access to separate — the whole surface is a handful of security-definer RPCs,
 * and each one already scopes itself to the caller's role.
 *
 * Counts and notifications log and return a neutral value rather than throwing: a
 * failed count must degrade to "no badge", never to a blank dashboard. Writes return
 * a result object so a refusal becomes a toast.
 */

// ─── Counts (the bell badge and the sidebar badge) ────────────────────────────

async function count(fn: 'my_unread_notifications_count' | 'my_open_tasks_count'): Promise<number> {
  const { data, error } = await supabase.rpc(fn);
  if (error) {
    console.error(`[tasks] ${fn}:`, error.message);
    return 0;
  }
  return typeof data === 'number' ? data : 0;
}

/** The bell badge. The same recipients as `my_notifications`: to them, their role or a section they work in. */
export const getUnreadCount = () => count('my_unread_notifications_count');
export const getOpenTasksCount = () => count('my_open_tasks_count');

// ─── Notifications ────────────────────────────────────────────────────────────

export async function getMyNotifications(limit = 10, offset = 0): Promise<MyNotification[]> {
  const { data, error } = await supabase.rpc('my_notifications', {
    p_limit: limit,
    p_offset: offset,
    p_only_unread: false,
  });
  if (error) {
    console.error('[tasks] my_notifications:', error.message);
    return [];
  }
  return (data ?? []) as MyNotification[];
}

export async function markNotificationRead(id: string): Promise<TaskActionResult> {
  const { error } = await supabase.rpc('mark_notification_read', { p_notification_id: id });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<TaskActionResult> {
  const { error } = await supabase.rpc('mark_all_notifications_read');
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export const TASK_PAGE_SIZE = 100;

const MAX_PROOF_BYTES = 10 * 1024 * 1024;

/** Overdue first, then soonest due. The caller decides what a failure looks like. */
export async function getMyTasks(status: TaskFilter, limit = TASK_PAGE_SIZE, offset = 0): Promise<MyTask[]> {
  const { data, error } = await supabase.rpc('my_tasks', {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) throw error;
  return (data ?? []) as MyTask[];
}

/**
 * `complete_task` raises on a refusal. Losing a race is the one worth naming: the
 * task was marked missed or cancelled in the minutes since the list was fetched.
 *
 * Codes, not sentences: the wording is a translation key the component resolves.
 */
export function classifyCompletion(message: string): TaskActionResult {
  if (/not open/i.test(message)) return { ok: false, code: 'not_open' };
  if (/proof photo required/i.test(message)) return { ok: false, code: 'proof_required' };
  if (/not found|row-level security|permission denied/i.test(message)) return { ok: false, code: 'forbidden' };
  return { ok: false, error: message };
}

export async function completeTask(id: string, notes?: string | null, proofUrl?: string | null): Promise<TaskActionResult> {
  const trimmed = notes?.trim();
  const { error } = await supabase.rpc('complete_task', {
    p_task_id: id,
    p_notes: trimmed ? trimmed : null,
    p_proof_url: proofUrl ?? null,
  });
  if (error) return classifyCompletion(error.message);
  return { ok: true };
}

/**
 * For the moment the page is going away. The browser cancels an ordinary request at
 * that point, and supabase-js has no way to ask for `keepalive`, so this one is sent
 * by hand. Nothing is left to read the answer, so there is no result.
 */
export function completeTaskOnExit(id: string, notes: string | null, proofUrl: string | null, accessToken: string): void {
  fetch(`${process.env.REACT_APP_SUPABASE_URL}/rest/v1/rpc/complete_task`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'Content-Type': 'application/json',
      apikey: process.env.REACT_APP_SUPABASE_ANON_KEY as string,
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ p_task_id: id, p_notes: notes, p_proof_url: proofUrl }),
  }).catch(() => {});
}

export const proofTooLarge = (file: File): boolean => file.size > MAX_PROOF_BYTES;

/** `{user_id}/{task_id}/{time}.{ext}`. A new name each time, so nothing is overwritten. */
export function proofPath(userId: string, taskId: string, file: Pick<File, 'name' | 'type'>, now = Date.now()): string {
  const fromType = file.type.split('/')[1]?.replace('jpeg', 'jpg');
  const fromName = file.name.includes('.') ? file.name.split('.').pop()?.toLowerCase() : undefined;
  return `${userId}/${taskId}/${now}.${fromType || fromName || 'jpg'}`;
}

export async function uploadTaskProof(userId: string, taskId: string, file: File): Promise<string> {
  const path = proofPath(userId, taskId, file);
  const { error } = await supabase.storage.from('task-proofs').upload(path, file, { contentType: file.type || undefined });
  if (error) throw error;
  return supabase.storage.from('task-proofs').getPublicUrl(path).data.publicUrl;
}
