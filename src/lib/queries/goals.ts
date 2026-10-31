import { supabase } from '../supabase';

/**
 * Monthly goals, read through RPCs only. Both functions default to the signed-in
 * person when no profile is passed, so none is, and each one refuses anybody else's
 * data on the server.
 */

export type GoalStatus = 'green' | 'amber' | 'red' | 'progress' | 'none';

export interface GoalMetric {
  metric_key: string;
  label_en: string;
  label_ar: string;
  kind: 'count' | 'percent';
  description_en: string | null;
  description_ar: string | null;
  target: number;
  numerator: number | null;
  denominator: number | null;
  /** Null for a percentage with nothing to measure yet. */
  value: number | null;
  status: GoalStatus;
  sort_order: number;
}

export interface GoalGap {
  metric_key: string;
  ref_type: 'operation' | 'custody';
  ref_id: number;
  ref_date: string;
  plate: string | null;
  missing: string[];
}

export interface GoalHint {
  metricKey: string;
  /** How many records share the most common missing item. */
  count: number;
  item: string | null;
}

export async function getGoalProgress(month: string): Promise<GoalMetric[]> {
  const { data, error } = await supabase.rpc('staff_goal_progress', { p_month: month });
  if (error) throw error;
  return (data ?? []) as GoalMetric[];
}

export async function getGoalGaps(month: string): Promise<GoalGap[]> {
  const { data, error } = await supabase.rpc('staff_goal_gaps', { p_month: month });
  if (error) throw error;
  return (data ?? []) as GoalGap[];
}

/** How far round the ring goes: 0 to 1, and never past full. */
export function ringFraction(metric: Pick<GoalMetric, 'kind' | 'numerator' | 'value' | 'target'>): number {
  const reached = metric.kind === 'count' ? metric.numerator : metric.value;
  if (reached == null || !(metric.target > 0)) return 0;
  return Math.min(Math.max(reached / metric.target, 0), 1);
}

export function formatGoalValue(metric: Pick<GoalMetric, 'kind' | 'numerator' | 'value'>): string {
  if (metric.kind === 'count') return String(metric.numerator ?? 0);
  if (metric.value == null) return '—';
  return `${Number(metric.value.toFixed(1))}%`;
}

export const allGreen = (metrics: GoalMetric[]): boolean =>
  metrics.length > 0 && metrics.every(m => m.status === 'green');

/** One line per red metric, naming whatever is missing most often. */
export function redHints(metrics: GoalMetric[], gaps: GoalGap[]): GoalHint[] {
  return metrics.filter(m => m.status === 'red').map(metric => {
    const tally = new Map<string, number>();
    for (const gap of gaps) {
      if (gap.metric_key !== metric.metric_key) continue;
      for (const item of gap.missing) tally.set(item, (tally.get(item) ?? 0) + 1);
    }
    let item: string | null = null;
    let count = 0;
    tally.forEach((seen, key) => {
      if (seen > count) { item = key; count = seen; }
    });
    return { metricKey: metric.metric_key, count, item };
  });
}

// ─── Months ───────────────────────────────────────────────────────────────────

/** How far back the switcher goes, including this month. */
export const GOAL_MONTHS_BACK = 12;

export const firstOfMonth = (isoDate: string): string => `${isoDate.slice(0, 7)}-01`;

/** Plain arithmetic on the string, so no time zone can move it to another month. */
export function shiftMonth(month: string, by: number): string {
  const year = Number(month.slice(0, 4));
  const index = Number(month.slice(5, 7)) - 1 + by;
  const shifted = new Date(Date.UTC(year, index, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}-01`;
}
