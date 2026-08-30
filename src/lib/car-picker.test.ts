import { sortCarsByModel } from './car-picker';

/** Mirrors how the pickers render a row, separator and all. */
const show = (cars: { plate_number: string; model?: string | null }[]) =>
  sortCarsByModel(cars).map(c => (c.model ? `${c.plate_number} — ${c.model}` : c.plate_number));

test('groups by model alphabetically, plates ascending inside each', () => {
  // Deliberately interleaved, the way a plate-ordered query returns them.
  const cars = [
    { plate_number: '06FHP107', model: 'Hyundai i20' },
    { plate_number: '34ABC100', model: 'Chery Tiggo' },
    { plate_number: '01AAA001', model: 'Renault Clio' },
    { plate_number: '06FHP046', model: 'Hyundai i20' },
    { plate_number: '34DEF200', model: 'Dacia Duster' },
    { plate_number: '02BBB002', model: 'Chery Tiggo' },
  ];
  expect(show(cars)).toEqual([
    '02BBB002 — Chery Tiggo',
    '34ABC100 — Chery Tiggo',
    '34DEF200 — Dacia Duster',
    '06FHP046 — Hyundai i20',
    '06FHP107 — Hyundai i20',
    '01AAA001 — Renault Clio',
  ]);
});

test('plates sort numerically, not as raw strings', () => {
  const cars = [
    { plate_number: '34ABC10', model: 'Fiat Egea' },
    { plate_number: '34ABC9', model: 'Fiat Egea' },
    { plate_number: '34ABC100', model: 'Fiat Egea' },
  ];
  // A plain string sort would put 34ABC10 and 34ABC100 ahead of 34ABC9.
  expect(show(cars)).toEqual([
    '34ABC9 — Fiat Egea',
    '34ABC10 — Fiat Egea',
    '34ABC100 — Fiat Egea',
  ]);
});

test('a car with no model sinks to the bottom, not to the top', () => {
  const cars = [
    { plate_number: '34ZZZ999', model: null },
    { plate_number: '34AAA111', model: 'Hyundai i20' },
    { plate_number: '34BBB222', model: '' },
  ];
  expect(show(cars)).toEqual([
    '34AAA111 — Hyundai i20',
    '34BBB222',
    '34ZZZ999',
  ]);
});

test('reads model_name too, so Fines and Accounting sort the same', () => {
  const cars = [
    { plate_number: '34BBB222', model_name: 'Renault Clio' },
    { plate_number: '34AAA111', model_name: 'Dacia Duster' },
  ];
  expect(sortCarsByModel(cars).map(c => c.model_name)).toEqual(['Dacia Duster', 'Renault Clio']);
});

test('does not mutate the array it was given', () => {
  const cars = [
    { plate_number: '34BBB222', model: 'Renault Clio' },
    { plate_number: '34AAA111', model: 'Dacia Duster' },
  ];
  const before = [...cars];
  sortCarsByModel(cars);
  expect(cars).toEqual(before);
});
