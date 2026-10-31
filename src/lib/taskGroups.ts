import { istanbulDate } from './istanbulTime';
import type { MyTask } from './types/tasks';

export type TaskGroup = 'overdue' | 'today' | 'upcoming' | 'noDue';

export const TASK_GROUPS: TaskGroup[] = ['overdue', 'today', 'upcoming', 'noDue'];

/** "Today" is the Istanbul day. Overdue wins, so a task due earlier today is overdue. */
export function taskGroup(task: Pick<MyTask, 'due_at' | 'is_overdue'>, now: Date = new Date()): TaskGroup {
  if (!task.due_at) return 'noDue';
  if (task.is_overdue || new Date(task.due_at) < now) return 'overdue';
  return istanbulDate(new Date(task.due_at)) === istanbulDate(now) ? 'today' : 'upcoming';
}

export function groupTasks(tasks: MyTask[], now: Date = new Date()): Record<TaskGroup, MyTask[]> {
  const groups: Record<TaskGroup, MyTask[]> = { overdue: [], today: [], upcoming: [], noDue: [] };
  for (const task of tasks) groups[taskGroup(task, now)].push(task);
  return groups;
}
