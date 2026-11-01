export type FineStatus = 'paid' | 'unpaid';

export interface Fine {
  id: string;
  status: FineStatus;
  plate_number: string;
  violation_number: string | null;
  customer_name: string | null;
  notification_date: string | null;
  amount: number | null;
  location: string | null;
  violation_date: string | null;
  violation_time: string | null;
  article: string | null;
  description: string | null;
  fine_image_url: string | null;
  fine_pdf_url: string | null;
  payment_receipt_url: string | null;
  created_at: string;
  car_id: number | null;
  customer_id: string | null;
  violation_code: string | null;
}

export type FineSegment = 'all' | 'unpaid' | 'paid' | 'month' | 'unassigned';

/** The ones a tile can filter by. `all` is simply no filter. */
export const FINE_FILTERS = ['unpaid', 'paid', 'month', 'unassigned'] as const;

/** The day a fine belongs to: when it happened, or failing that when it was notified. */
export const fineDay = (fine: Pick<Fine, 'violation_date' | 'notification_date'>): string =>
  fine.violation_date ?? fine.notification_date ?? '';

const sum = (fines: readonly Fine[]) => fines.reduce((total, fine) => total + (Number(fine.amount) || 0), 0);

export function inSegment(fine: Fine, segment: FineSegment, today: string): boolean {
  switch (segment) {
    case 'unpaid': return fine.status !== 'paid';
    case 'paid': return fine.status === 'paid';
    case 'unassigned': return !fine.customer_id;
    case 'month': return fineDay(fine).startsWith(today.slice(0, 7));
    default: return true;
  }
}

export function fineStats(fines: readonly Fine[], today: string) {
  const group = (segment: FineSegment) => {
    const found = fines.filter(fine => inSegment(fine, segment, today));
    return { count: found.length, total: sum(found) };
  };
  return {
    all: group('all'),
    unpaid: group('unpaid'),
    paid: group('paid'),
    month: group('month'),
    unassigned: group('unassigned'),
  };
}

export function matchesFine(fine: Fine, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [fine.plate_number, fine.customer_name, fine.violation_number, fine.location]
    .some(text => (text ?? '').toLowerCase().includes(q));
}

export interface FineDocument {
  url: string;
  label: 'image' | 'pdf' | 'receipt';
}

export function fineDocuments(fine: Pick<Fine, 'fine_image_url' | 'fine_pdf_url' | 'payment_receipt_url'>): FineDocument[] {
  const found: FineDocument[] = [];
  if (fine.fine_image_url) found.push({ url: fine.fine_image_url, label: 'image' });
  if (fine.fine_pdf_url) found.push({ url: fine.fine_pdf_url, label: 'pdf' });
  if (fine.payment_receipt_url) found.push({ url: fine.payment_receipt_url, label: 'receipt' });
  return found;
}
