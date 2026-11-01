import type { MyNotification } from '../types/tasks';

/**
 * The reminder about every unpaid fine, sent every other day. `vars` carries the figures,
 * so the wording is built here. A row with figures missing falls back to its stored sentence.
 */

const EVENT_KEY = 'fines.unpaid.reminder';

type NotificationEvent = Pick<MyNotification, 'event_key' | 'vars'>;
type Translate = (key: string, options: Record<string, unknown>) => string;

export const isUnpaidFinesReminder = (n: NotificationEvent): boolean => n.event_key === EVENT_KEY;

/** Isolated so the symbol stays beside its number inside an Arabic sentence. */
const liraAmount = (total: number): string => `⁦₺${total.toLocaleString('tr-TR', { maximumFractionDigits: 0 })}⁩`;

export function unpaidFinesWords(n: NotificationEvent, t: Translate, locale: string): { title: string; body: string } | null {
  const count = Number(n.vars?.count);
  const total = Number(n.vars?.total);
  if (!isUnpaidFinesReminder(n) || n.vars?.count == null || n.vars?.total == null || !Number.isFinite(count) || !Number.isFinite(total)) return null;

  const line = t('fines.unpaid.title', { count, total: liraAmount(total) });
  const unassigned = Number(n.vars?.unassigned) || 0;
  const oldest = typeof n.vars?.oldest === 'string' ? new Date(`${n.vars.oldest}T12:00:00Z`) : null;
  const day = oldest && !Number.isNaN(oldest.getTime())
    ? oldest.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' })
    : null;

  return {
    title: unassigned > 0 ? `${line} · ${t('fines.unpaid.unassigned', { unassigned })}` : line,
    body: day ? t('fines.unpaid.oldest', { day }) : '',
  };
}
