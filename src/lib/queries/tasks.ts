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
 * Reads log and return a neutral value rather than throwing: a failed count must
 * degrade to "no badge", never to a blank dashboard. Writes return a result
 * object so a refusal becomes a toast.
 */

// ─── Counts (the bell badge and the sidebar badge) ────────────────────────────

async function count(fn: 'my_unread_count' | 'my_open_tasks_count'): Promise<number> {
  const { data, error } = await supabase.rpc(fn);
  if (error) {
    console.error(`[tasks] ${fn}:`, error.message);
    return 0;
  }
  return typeof data === 'number' ? data : 0;
}

export const getUnreadCount = () => count('my_unread_count');
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

/** Already sorted by priority then oldest-first inside the function. */
export async function getMyTasks(status: TaskFilter, limit = 50, offset = 0): Promise<MyTask[]> {
  const { data, error } = await supabase.rpc('my_tasks', {
    p_status: status,
    p_limit: limit,
    p_offset: offset,
  });
  if (error) {
    console.error('[tasks] my_tasks:', error.message);
    return [];
  }
  return (data ?? []) as MyTask[];
}

/**
 * Both write RPCs `raise exception` when their guarded UPDATE matches no row —
 * which is what a lost race looks like: someone claimed or completed it in the
 * seconds since the list was fetched. That is not a failure worth an alarming
 * message, so it is flagged as `raced` and the caller refreshes instead.
 */
function classify(message: string, verb: 'claim' | 'complete'): TaskActionResult {
  const raced = /not claimable|not completable/i.test(message);
  if (raced) {
    return {
      ok: false,
      raced: true,
      error: verb === 'claim'
        ? 'المهمة استُلمت للتو'
        : 'المهمة أُنجزت للتو',
    };
  }
  if (/row-level security|permission denied/i.test(message)) {
    return { ok: false, error: 'ما عندك صلاحية لهذه المهمة' };
  }
  return { ok: false, error: message };
}

export async function claimTask(id: string): Promise<TaskActionResult> {
  const { error } = await supabase.rpc('claim_task', { p_task_id: id });
  if (error) return classify(error.message, 'claim');
  return { ok: true };
}

export async function completeTask(id: string, notes?: string | null): Promise<TaskActionResult> {
  const trimmed = notes?.trim();
  const { error } = await supabase.rpc('complete_task', {
    p_task_id: id,
    p_notes: trimmed ? trimmed : null,
  });
  if (error) return classify(error.message, 'complete');
  return { ok: true };
}
