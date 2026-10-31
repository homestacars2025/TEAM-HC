import { istanbulDate } from './istanbulTime';
import type { MyTask } from './types/tasks';

export type TaskGroup = 'overdue' | 'today' | 'tomorrow' | 'week' | 'later' | 'noDue';

export const TASK_GROUPS: TaskGroup[] = ['overdue', 'today', 'tomorrow', 'week', 'later', 'noDue'];

const DUE_SOON_MS = 2 * 60 * 60 * 1000;

/** Plain calendar arithmetic on `YYYY-MM-DD`, free of any time zone. */
export function addDays(day: string, by: number): string {
  const [year, month, date] = day.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, date + by)).toISOString().slice(0, 10);
}

/** The Monday and Sunday of the Istanbul week holding this moment. */
export function weekBounds(now: Date = new Date()): { start: string; end: string } {
  const today = istanbulDate(now);
  const weekday = new Date(`${today}T00:00:00Z`).getUTCDay();
  const start = addDays(today, -((weekday + 6) % 7));
  return { start, end: addDays(start, 6) };
}

/** Overdue wins, so a task due earlier today reads as overdue, not today. */
export function taskGroup(task: Pick<MyTask, 'due_at' | 'is_overdue'>, now: Date = new Date()): TaskGroup {
  if (!task.due_at) return 'noDue';
  const due = new Date(task.due_at);
  if (task.is_overdue || due < now) return 'overdue';

  const day = istanbulDate(due);
  const today = istanbulDate(now);
  if (day === today) return 'today';
  if (day === addDays(today, 1)) return 'tomorrow';
  return day <= weekBounds(now).end ? 'week' : 'later';
}

export function groupTasks(tasks: MyTask[], now: Date = new Date()): Record<TaskGroup, MyTask[]> {
  const groups: Record<TaskGroup, MyTask[]> = { overdue: [], today: [], tomorrow: [], week: [], later: [], noDue: [] };
  for (const task of tasks) groups[taskGroup(task, now)].push(task);
  return groups;
}

export type DueTone = 'overdue' | 'soon' | 'calm';

export function dueTone(dueAt: string, now: Date = new Date()): DueTone {
  const left = new Date(dueAt).getTime() - now.getTime();
  if (left < 0) return 'overdue';
  return left < DUE_SOON_MS ? 'soon' : 'calm';
}

export interface WeekProgress {
  done: number;
  total: number;
}

/**
 * Done this week, out of everything that belonged to this week: what was finished,
 * what is still due by Sunday (anything overdue included), and what was missed.
 * A task with no due date has no week, so it counts only once it is done.
 */
export function weekProgress(active: MyTask[], done: MyTask[], missed: MyTask[], now: Date = new Date()): WeekProgress {
  const { start, end } = weekBounds(now);
  const inWeek = (iso: string | null) => {
    if (!iso) return false;
    const day = istanbulDate(new Date(iso));
    return day >= start && day <= end;
  };

  const finished = done.filter(task => inWeek(task.completed_at)).length;
  const remaining = active.filter(task => inWeek(task.due_at) || taskGroup(task, now) === 'overdue').length;
  const lost = missed.filter(task => inWeek(task.due_at)).length;
  return { done: finished, total: finished + remaining + lost };
}
