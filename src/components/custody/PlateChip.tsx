import React from 'react';
import { formatPlate } from '../../lib/custodyExpense';

/** A small Turkish number plate: the blue strip, then the number as printed. */
const PlateChip: React.FC<{ plate: string }> = ({ plate }) => (
  <span className="hc-plate" dir="ltr">
    <span className="hc-plate-strip" aria-hidden="true">TR</span>
    <span className="hc-plate-number">{formatPlate(plate)}</span>
  </span>
);

export default PlateChip;
