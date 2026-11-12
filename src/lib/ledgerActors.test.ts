import { actorInitials, changedFields, clearLedgerActorCache, loadLedgerActors } from './ledgerActors';

const mockRpc = jest.fn();
jest.mock('./supabase', () => ({ supabase: { rpc: (...args: unknown[]) => mockRpc(...args) } }));

const card = (id: string, name: string) => ({ id, full_name: name, avatar_url: null, avatar_bg: 'mint', role: 'admin' });

beforeEach(() => {
  clearLedgerActorCache();
  mockRpc.mockReset();
});

describe('loadLedgerActors', () => {
  it('asks once for every unique id, then answers from the cache', async () => {
    mockRpc.mockResolvedValue({ data: [card('a', 'Lina Aydın'), card('b', 'Kerem')], error: null });
    const first = await loadLedgerActors(['b', 'a', null, 'a', undefined, 'b']);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledWith('ledger_actor_cards', { p_ids: ['a', 'b'] });
    expect(first.get('a')?.fullName).toBe('Lina Aydın');

    const again = await loadLedgerActors(['a', 'b']);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(again.size).toBe(2);
  });

  it('shares one request between lists loading at the same time, and asks only for new people', async () => {
    mockRpc.mockResolvedValueOnce({ data: [card('a', 'A')], error: null });
    await Promise.all([loadLedgerActors(['a']), loadLedgerActors(['a'])]);
    expect(mockRpc).toHaveBeenCalledTimes(1);

    mockRpc.mockResolvedValueOnce({ data: [card('c', 'C')], error: null });
    const both = await loadLedgerActors(['a', 'c']);
    expect(mockRpc).toHaveBeenLastCalledWith('ledger_actor_cards', { p_ids: ['c'] });
    expect(Array.from(both.keys())).toEqual(['a', 'c']);
  });

  it('remembers people it was not shown (not finance), and retries after an error', async () => {
    mockRpc.mockResolvedValueOnce({ data: [], error: null });
    expect((await loadLedgerActors(['x'])).size).toBe(0);
    await loadLedgerActors(['x']);
    expect(mockRpc).toHaveBeenCalledTimes(1);

    mockRpc.mockResolvedValueOnce({ data: null, error: { message: 'boom' } });
    await expect(loadLedgerActors(['y'])).rejects.toThrow('boom');
    mockRpc.mockResolvedValueOnce({ data: [card('y', 'Y')], error: null });
    expect((await loadLedgerActors(['y'])).get('y')?.fullName).toBe('Y');
  });

  it('makes no call when there is nobody to look up', async () => {
    expect((await loadLedgerActors([null, undefined])).size).toBe(0);
    expect(mockRpc).not.toHaveBeenCalled();
  });
});

describe('changedFields', () => {
  const before = { amount: 100, type: 'payment', direction: 'IN', description: 'Cash', car_id: 4, booking_id: 9, account_id: null, updated_at: 'x' };

  it('lists only what changed, in a fixed order', () => {
    const after = { ...before, amount: '120.00', description: 'Cash, second half', updated_at: 'y' };
    expect(changedFields(before, after)).toEqual([
      { field: 'amount', from: 100, to: '120.00' },
      { field: 'description', from: 'Cash', to: 'Cash, second half' },
    ]);
  });

  it('treats 100 and "100.00", and null and "", as the same', () => {
    expect(changedFields(before, { ...before, amount: '100.00', account_id: '' })).toEqual([]);
  });

  it('catches a moved line: car, booking and account', () => {
    const fields = changedFields(before, { ...before, car_id: 7, booking_id: 10, account_id: 3 }).map((change) => change.field);
    expect(fields).toEqual(['car_id', 'booking_id', 'account_id']);
  });

  it('has nothing to compare on a delete', () => {
    expect(changedFields(before, null)).toEqual([]);
  });
});

describe('actorInitials', () => {
  it('takes the first and last name', () => {
    expect(actorInitials('Ahmet Can Yılmaz')).toBe('AY');
    expect(actorInitials('lina')).toBe('LI');
    expect(actorInitials('  ')).toBe('?');
    expect(actorInitials('أحمد علي')).toBe('أع');
  });
});
