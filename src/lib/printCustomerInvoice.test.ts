import { printCustomerInvoice, type InvoiceEntry } from './printCustomerInvoice';

const mockPrinted: string[] = [];
jest.mock('./printDocument', () => ({ printHtml: async (html: string) => { mockPrinted.push(html); } }));
jest.mock('./supabase', () => {
  const query = (data: unknown) => {
    const chain: Record<string, unknown> = {};
    ['select', 'eq'].forEach(name => { chain[name] = () => chain; });
    chain.maybeSingle = async () => ({ data, error: null });
    return chain;
  };
  return {
    supabase: {
      from: (table: string) => query(table === 'customers'
        ? { first_name: 'Ada', last_name: 'Test', nationality: null, id_number: null, phone: null }
        : { plate_number: '41AGZ890', model_group: { name: 'Renault Clio' } }),
    },
  };
});

const entry = (o: Partial<InvoiceEntry>): InvoiceEntry => ({ created_at: '2026-11-09T16:32:07Z', type: 'hgs', description: null, direction: 'OUT', amount: 0, car_id: 26, ...o });

test('one HGS row per batch, the hand-typed line apart, and the totals unchanged', async () => {
  mockPrinted.length = 0;
  await printCustomerInvoice('c1', [
    entry({ description: '05-10-2026 KARGO → KARGO', amount: 35, event_no: 3 }),
    entry({ description: '02-10-2026 KARGO → KARGO', amount: 65, event_no: 3 }),
    entry({ created_at: '2026-10-07T00:00:00Z', description: 'HGS to 31/09/2026', amount: 272, event_no: null }),
    entry({ created_at: '2026-09-22T09:00:00Z', type: 'rental', description: 'Rent', amount: 9000, event_no: 1 }),
  ], { onError: jest.fn() });
  const html = mockPrinted[0];
  const sums = html.match(/<tr class="hgs-sum">[\s\S]*?<\/tr>/g) ?? [];
  expect(sums).toHaveLength(2);
  expect(sums[0]).toContain('from 02/10 to 05/10 · 2 passes');
  expect(sums[0]).toContain('₺100,00');
  expect(sums[1]).toContain('1 entry');
  expect(sums[1]).toContain('₺272,00');
  expect(html.match(/class="hgs-detail"/g)).toHaveLength(3);
  expect(html).toContain('₺9.372,00');
});
