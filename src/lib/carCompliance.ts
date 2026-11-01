/**
 * Whether an active car can legally go out: it needs a valid insurance and a valid
 * periodic inspection. A date that has never been entered counts against it too, because
 * nobody can say that car is covered. The expiry day itself is still valid.
 */

export type ComplianceField = 'insurance' | 'inspection';
export type IssueKind = 'expired' | 'missing';

export interface ComplianceIssue {
  field: ComplianceField;
  kind: IssueKind;
  /** Days past the expiry. 0 for a missing date. */
  daysAgo: number;
}

export interface CarCompliance {
  id: number;
  plate: string;
  model: string;
  insuranceExpiry: string | null;
  inspectionExpiry: string | null;
  issues: ComplianceIssue[];
  /** The worse of the car's issues, or `null` for a car with none. */
  severity: IssueKind | null;
}

export interface ComplianceSummary {
  /** Cars with anything expired, longest overdue first. */
  expired: CarCompliance[];
  /** Cars with nothing expired but a date missing, by plate. */
  missing: CarCompliance[];
  count: number;
  severity: IssueKind | null;
}

const dayNumber = (iso: string): number => {
  const [year, month, day] = iso.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86400000;
};

function issueFor(field: ComplianceField, expiry: string | null, today: string): ComplianceIssue | null {
  if (!expiry) return { field, kind: 'missing', daysAgo: 0 };
  const daysAgo = dayNumber(today) - dayNumber(expiry);
  return daysAgo > 0 ? { field, kind: 'expired', daysAgo } : null;
}

interface CarDates {
  id: number;
  plate: string;
  model: string;
  insuranceExpiry: string | null;
  inspectionExpiry: string | null;
}

export function checkCar(car: CarDates, today: string): CarCompliance {
  const issues = [issueFor('insurance', car.insuranceExpiry, today), issueFor('inspection', car.inspectionExpiry, today)]
    .filter((issue): issue is ComplianceIssue => issue !== null);
  const severity = issues.some(issue => issue.kind === 'expired') ? 'expired' : issues.length > 0 ? 'missing' : null;
  return { ...car, issues, severity };
}

const overdue = (car: CarCompliance): number => Math.max(...car.issues.map(issue => issue.daysAgo));

export function summarise(cars: readonly CarCompliance[]): ComplianceSummary {
  const expired = cars.filter(car => car.severity === 'expired').sort((a, b) => overdue(b) - overdue(a));
  const missing = cars.filter(car => car.severity === 'missing').sort((a, b) => a.plate.localeCompare(b.plate));
  return {
    expired,
    missing,
    count: expired.length + missing.length,
    severity: expired.length > 0 ? 'expired' : missing.length > 0 ? 'missing' : null,
  };
}
