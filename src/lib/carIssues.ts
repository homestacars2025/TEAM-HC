export type IssueType = 'accident' | 'damage' | 'mechanical' | 'sound' | 'maintenance' | 'other';
export type IssueStatus = 'open' | 'resolved';

export const ISSUE_TYPES: IssueType[] = ['accident', 'damage', 'mechanical', 'sound', 'maintenance', 'other'];

/** One row of car_issues_detailed. The view already hides soft-deleted rows. */
export interface IssueRow {
  id: number;
  car_id: number;
  plate_number: string;
  model_name: string | null;
  type: string;
  status: string;
  description: string | null;
  damage_photos: string[] | null;
  repair_photos: string[] | null;
  damage_photo_count: number | null;
  repair_photo_count: number | null;
  booking_id: number | null;
  booking_number: string | null;
  /** customers.id is a uuid: never cast. */
  customer_id: string | null;
  customer_name: string | null;
  discovered_at: string;
  discovered_by: string | null;
  discovered_by_name: string | null;
  resolved_at: string | null;
  days_to_resolve: number | null;
  created_at: string;
  updated_at: string;
}

export const asIssueType = (value: string): IssueType => (ISSUE_TYPES as string[]).includes(value) ? value as IssueType : 'other';
export const asIssueStatus = (value: string): IssueStatus => (value === 'resolved' ? 'resolved' : 'open');

/** jsonb arrives parsed, but tolerate null, a JSON string or non-string members. */
export function photoUrls(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string');
  if (typeof value === 'string') {
    try {
      return photoUrls(JSON.parse(value));
    } catch {
      return [];
    }
  }
  return [];
}

const dayNumber = (iso: string): number => {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
};

export const daysOpen = (discoveredAt: string, today: string): number => Math.max(0, dayNumber(today) - dayNumber(discoveredAt));

/** Amber after 3 days, red after 7. */
export const ageTone = (days: number): 'calm' | 'amber' | 'red' => (days > 7 ? 'red' : days > 3 ? 'amber' : 'calm');

export function issueStats(issues: readonly IssueRow[], today: string) {
  const month = today.slice(0, 7);
  const resolved = issues.filter(issue => asIssueStatus(issue.status) === 'resolved');
  const timed = resolved.map(issue => issue.days_to_resolve).filter((days): days is number => days !== null && days >= 0);
  return {
    total: issues.length,
    open: issues.length - resolved.length,
    resolvedThisMonth: resolved.filter(issue => (issue.resolved_at ?? '').startsWith(month)).length,
    resolved: resolved.length,
    accidents: issues.filter(issue => asIssueType(issue.type) === 'accident').length,
    averageDays: timed.length > 0 ? Math.round((timed.reduce((sum, days) => sum + days, 0) / timed.length) * 10) / 10 : null,
  };
}

/** The ones a tile can filter by. `all` is simply no filter. */
export const ISSUE_FILTERS = ['open', 'resolved', 'accidents'] as const;
export type IssueFilter = 'all' | typeof ISSUE_FILTERS[number];

/** `resolved` means resolved this month, which is what its tile counts. */
export function inIssueFilter(issue: IssueRow, filter: IssueFilter, today: string): boolean {
  switch (filter) {
    case 'open': return asIssueStatus(issue.status) === 'open';
    case 'resolved': return asIssueStatus(issue.status) === 'resolved' && (issue.resolved_at ?? '').startsWith(today.slice(0, 7));
    case 'accidents': return asIssueType(issue.type) === 'accident';
    default: return true;
  }
}

export function matchesIssue(issue: IssueRow, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [issue.plate_number, issue.model_name, issue.customer_name, issue.description]
    .some(text => (text ?? '').toLowerCase().includes(q));
}
