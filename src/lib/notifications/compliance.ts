import type { MyNotification } from '../types/tasks';

/**
 * The daily insurance and inspection reminders. They all share one key per kind, so the
 * wording comes from `days_left`. A day this build has no wording for finds no translation
 * and falls back to the sentence stored with the row.
 */

export interface ExpiryNotice {
  field: 'insurance' | 'inspection';
  daysLeft: number;
  /** A day to go or less, which is when the triangle turns red. */
  urgent: boolean;
}

type NotificationEvent = Pick<MyNotification, 'event_key' | 'vars'>;

export function expiryNotice(n: NotificationEvent): ExpiryNotice | null {
  const field = n.event_key?.match(/^compliance\.(insurance|inspection)\.expiring$/)?.[1];
  const daysLeft = n.vars?.days_left;
  if (!field || daysLeft == null || !Number.isFinite(Number(daysLeft))) return null;
  return { field: field as ExpiryNotice['field'], daysLeft: Number(daysLeft), urgent: Number(daysLeft) <= 1 };
}

export const expiryTitleKey = (notice: ExpiryNotice): string => `compliance.${notice.field}.d${notice.daysLeft}`;

export const expiryBodyKey = (n: NotificationEvent): string => (n.vars?.model ? 'compliance.body' : 'compliance.bodyNoModel');

/** The stored date, in the reader's words. Some model names are stored with a double space. */
export function expiryVars(vars: Record<string, unknown> | null, locale: string): Record<string, unknown> | null {
  if (!vars) return vars;
  const expiry = typeof vars.expiry === 'string' ? new Date(`${vars.expiry}T12:00:00Z`) : null;
  return {
    ...vars,
    model: typeof vars.model === 'string' ? vars.model.replace(/\s+/g, ' ').trim() : vars.model,
    expiry: expiry && !Number.isNaN(expiry.getTime())
      ? expiry.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
      : vars.expiry,
  };
}
