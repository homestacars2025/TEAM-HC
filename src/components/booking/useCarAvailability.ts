import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { busyCars, getBlocks, type BlockExclusions, type BlockType, type CalendarBlock } from '../../lib/queries/availability';

const BUSY_KEY: Record<BlockType, string> = {
  booked_confirmed: 'carBusy.booked',
  booked_pending: 'carBusy.booked',
  maintenance: 'carBusy.maintenance',
  replacement: 'carBusy.replacement',
  selling: 'carBusy.selling',
};

/** Each busy car with the reason it can't be chosen, or `undefined` until the dates are known. */
export function useCarAvailability(start: string, end: string, exclude: BlockExclusions = {}) {
  const { t } = useTranslation('bookings');
  const [blocks, setBlocks] = useState<CalendarBlock[] | null>(null);
  const [failed, setFailed] = useState(false);
  const { bookingId, blockId } = exclude;

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

  const busy = useMemo(() => {
    if (!blocks) return undefined;
    const labels = new Map<number, string>();
    busyCars(blocks, { bookingId, blockId }).forEach((type, carId) => labels.set(carId, t(BUSY_KEY[type])));
    return labels;
  }, [blocks, bookingId, blockId, t]);

  return { busy, failed };
}
