import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { busyCars, carConflicts, getBlocks, isSoftBlock, ownReplacementBlockIds, type BlockExclusions, type BlockType, type CalendarBlock } from '../../lib/queries/availability';

const BUSY_KEY: Record<BlockType, string> = {
  booked_confirmed: 'carBusy.booked',
  booked_pending: 'carBusy.booked',
  maintenance: 'carBusy.maintenance',
  replacement: 'carBusy.replacement',
  selling: 'carBusy.selling',
};

export const busyLabelKey = (type: BlockType) => BUSY_KEY[type];

interface AvailabilityOptions extends Omit<BlockExclusions, 'blockIds'> {
  /** Whose booking this is, so their own replacement cars don't count against it. */
  customerId?: string | null;
  /**
   * A booking may go over maintenance or a replacement once someone has been warned.
   * Those cars then stay choosable, marked in `cautions` instead of `busy`.
   */
  softAllowed?: boolean;
}

/** Each busy car with the reason it can't be chosen, or `undefined` until the dates are known. */
export function useCarAvailability(start: string, end: string, options: AvailabilityOptions = {}) {
  const { t } = useTranslation('bookings');
  const [blocks, setBlocks] = useState<CalendarBlock[] | null>(null);
  const [ownBlocks, setOwnBlocks] = useState<number[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { bookingId, blockId, customerId, softAllowed = false } = options;

  useEffect(() => {
    setBlocks(null);
    setFailed(false);
    if (!start || !end) return;
    let active = true;
    getBlocks(start, end)
      .then(found => { if (active) setBlocks(found); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [start, end]);

  useEffect(() => {
    setOwnBlocks(null);
    if (!customerId && bookingId == null) { setOwnBlocks([]); return; }
    let active = true;
    ownReplacementBlockIds(customerId ?? null, bookingId)
      .then(ids => { if (active) setOwnBlocks(ids); })
      // Unknown means none: at worst their own replacement shows as a warning.
      .catch(() => { if (active) setOwnBlocks([]); });
    return () => { active = false; };
  }, [customerId, bookingId]);

  const exclude = useMemo<BlockExclusions>(() => ({ bookingId, blockId, blockIds: ownBlocks ?? [] }), [bookingId, blockId, ownBlocks]);
  const ready = blocks !== null && ownBlocks !== null;

  const { busy, cautions } = useMemo(() => {
    if (!ready) return { busy: undefined, cautions: undefined };
    const hard = new Map<number, string>();
    const soft = new Map<number, string>();
    const hardBlocks = softAllowed ? blocks!.filter(block => !isSoftBlock(block.block_type)) : blocks!;
    busyCars(hardBlocks, exclude).forEach((type, carId) => hard.set(carId, t(BUSY_KEY[type])));
    if (softAllowed) {
      busyCars(blocks!.filter(block => isSoftBlock(block.block_type)), exclude).forEach((type, carId) => { if (!hard.has(carId)) soft.set(carId, t(BUSY_KEY[type])); });
    }
    return { busy: hard, cautions: soft };
  }, [ready, blocks, exclude, softAllowed, t]);

  /** The blocks in the way of one car, with this booking's and customer's own left out. */
  const conflictsFor = useCallback((carId: number) => (ready ? carConflicts(blocks!, carId, exclude) : []), [ready, blocks, exclude]);

  return { busy, cautions, failed, conflictsFor };
}
