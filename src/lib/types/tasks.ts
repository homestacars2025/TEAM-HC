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
  /** Translation key for the title, e.g. `reminder.missing_insurance.title`. */
  i18n_key: string | null;
  body_i18n_key: string | null;
  /** Interpolation values for both keys — `{ plate, date, count, … }`. */
  vars: Record<string, unknown> | null;
  /** Pre-rendered server wording. Fallback only: never displayed directly. */
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

export type TaskStatus = 'open' | 'claimed' | 'done' | 'missed' | 'cancelled';
export type TaskPriority = 'low' | 'normal' | 'high' | 'urgent';
export type TaskKind = 'one_off' | 'recurring';

/** What `my_tasks` accepts. `active` is everything still to be done. */
export type TaskFilter = 'active' | 'done' | 'missed' | 'all';

export interface MyTask {
  id: string;
  title: string;
  description: string | null;
  kind: TaskKind;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  is_overdue: boolean;
  requires_proof: boolean;
  proof_url: string | null;
  completion_notes: string | null;
  completed_at: string | null;
  created_at: string;
  template_id: string | null;
  created_by_name: string | null;
}

// ─── Action results ───────────────────────────────────────────────────────────

/**
 * Known refusal reasons, as codes rather than sentences — the wording is a
 * translation key resolved in the component, not something the data layer picks.
 */
export type TaskErrorCode = 'not_open' | 'proof_required' | 'forbidden';

/** Mirrors the Media section's convention: actions resolve, they never throw. */
export type TaskActionResult = {
  ok: boolean;
  /** Set for a recognised refusal; absent when `error` carries a raw message. */
  code?: TaskErrorCode;
  /** The server's own message, for anything not recognised above. */
  error?: string;
};
