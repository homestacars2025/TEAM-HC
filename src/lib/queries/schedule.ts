import { supabase } from '../supabase';
import { istanbulDate } from '../istanbulTime';
import type { MyTask } from '../types/tasks';

export type ScheduleKind = 'delivery' | 'pickup';

export interface ScheduleItem {
  key: string;
  kind: ScheduleKind;
  plate: string | null;
  customer: string | null;
  /**
   * Bookings carry dates only, so the one real time is when the operation was
   * logged. `null` until then, rather than an invented hour.
   */
  time: string | null;
}

/** An embedded row arrives as an object or a one-item array depending on the relation. */
const one = <T,>(value: T | T[] | null): T | null => (Array.isArray(value) ? value[0] ?? null : value);

interface BookingRow {
  id: number;
  start_date: string;
  end_date: string;
  cars: { plate_number: string | null } | { plate_number: string | null }[] | null;
  customers: { first_name: string | null; last_name: string | null } | { first_name: string | null; last_name: string | null }[] | null;
}

interface OperationRow {
  booking_id: number | null;
  type: string;
  operation_time: string | null;
}

/** Times first in clock order, then whatever has not been logged yet. */
function byTimeThenKind(a: ScheduleItem, b: ScheduleItem): number {
  if (a.time && b.time) return a.time.localeCompare(b.time);
  if (a.time) return -1;
  if (b.time) return 1;
  return a.kind.localeCompare(b.kind);
}

export function buildSchedule(bookings: BookingRow[], operations: OperationRow[], today: string): ScheduleItem[] {
  const loggedAt = new Map<string, string>();
  for (const op of operations) {
    if (op.booking_id != null && op.operation_time) {
      loggedAt.set(`${op.booking_id}:${op.type.toLowerCase()}`, op.operation_time.slice(0, 5));
    }
  }

  const items: ScheduleItem[] = [];
  for (const booking of bookings) {
    const plate = one(booking.cars)?.plate_number ?? null;
    const person = one(booking.customers);
    const customer = person ? `${person.first_name ?? ''} ${person.last_name ?? ''}`.trim() || null : null;
    const add = (kind: ScheduleKind) => items.push({
      key: `${booking.id}:${kind}`,
      kind,
      plate,
      customer,
      time: loggedAt.get(`${booking.id}:${kind}`) ?? null,
    });
    // A same-day rental is both a delivery and a pickup.
    if (booking.start_date === today) add('delivery');
    if (booking.end_date === today) add('pickup');
  }
  return items.sort(byTimeThenKind);
}

export async function getTodaySchedule(today: string): Promise<ScheduleItem[]> {
  const [bookings, operations] = await Promise.all([
    supabase
      .from('bookings')
      .select('id, start_date, end_date, cars(plate_number), customers(first_name, last_name)')
      .or(`start_date.eq.${today},end_date.eq.${today}`)
      .neq('status', 'cancelled'),
    supabase
      .from('operations')
      .select('booking_id, type, operation_time')
      .eq('operation_date', today)
      .in('type', ['DELIVERY', 'PICKUP']),
  ]);
  if (bookings.error) throw bookings.error;
  if (operations.error) throw operations.error;
  return buildSchedule(
    (bookings.data ?? []) as unknown as BookingRow[],
    (operations.data ?? []) as OperationRow[],
    today,
  );
}

export interface TaskCounts {
  today: number;
  overdue: number;
}

/**
 * A task with no due date has no later day to wait for, so it counts as today's.
 * Only one dated after today is left out.
 */
export function countTasks(tasks: MyTask[], now: Date = new Date()): TaskCounts {
  const today = istanbulDate(now);
  const counts: TaskCounts = { today: 0, overdue: 0 };
  for (const task of tasks) {
    if (!task.due_at) { counts.today += 1; continue; }
    const due = new Date(task.due_at);
    if (Number.isNaN(due.getTime())) { counts.today += 1; continue; }
    if (istanbulDate(due) <= today) counts.today += 1;
    if (due < now) counts.overdue += 1;
  }
  return counts;
}
