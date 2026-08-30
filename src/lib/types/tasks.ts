/**
 * Types for the notifications_v2 / tasks feature.
 *
 * Entirely separate from the legacy `public.notifications` table behind the
 * older bell (which is kabis-specific and keyed by a bigint). Nothing here
 * touches it — the two are meant to be unified later, not now. The clearest
 * tell that a value belongs to this system is that every id is a uuid.
 */

// ─── Notifications ────────────────────────────────────────────────────────────

export const NOTIFICATION_CATEGORIES = ['event', 'reminder', 'task', 'manual'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export interface MyNotification {
  id: string;
  category: NotificationCategory;
  event_key: string | null;
  title: string;
  body: string | null;
  /** An app path such as `/cars/24`, or null. Not guaranteed to exist in TEAM. */
  link: string | null;
  entity_type: string | null;
  entity_id: string | null;
  is_read: boolean;
  created_at: string;
}

// ─── Tasks ────────────────────────────────────────────────────────────────────

export type TaskStatus = 'open' | 'claimed' | 'done' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';

/** The tab filter `my_tasks` accepts — `active` is open + claimed. */
export type TaskFilter = 'active' | 'done' | 'all';

export interface MyTask {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  claimed_by: string | null;
  claimed_by_name: string | null;
  entity_type: string | null;
  entity_id: string | null;
  due_at: string | null;
  created_at: string;
}

// ─── Action results ───────────────────────────────────────────────────────────

/** Mirrors the Media section's convention: actions resolve, they never throw. */
export type TaskActionResult = { ok: boolean; error?: string; raced?: boolean };
