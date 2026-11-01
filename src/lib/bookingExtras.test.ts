import fs from 'fs';
import path from 'path';
import { formatExtras, NO_EXTRAS, parseExtras } from './bookingExtras';

const roundTrip = (stored: string) => formatExtras(parseExtras(stored), stored);

describe('reading additional_services', () => {
  test('nothing stored', () => {
    expect(parseExtras(null)).toEqual(NO_EXTRAS);
    expect(parseExtras('')).toEqual(NO_EXTRAS);
  });

  test('the names the forms have always written', () => {
    expect(parseExtras('Çocuk Koltuğu,Ek Kilometre')).toEqual({ ...NO_EXTRAS, childSeats: 1, extraKm: true });
  });

  test('quantities', () => {
    expect(parseExtras('Çocuk Koltuğu x2,Yedek Sürücü x3')).toEqual({ ...NO_EXTRAS, childSeats: 2, drivers: 3 });
  });

  test('anything else is the customer\'s own words, all of it', () => {
    expect(parseExtras('AIRPORT DELIVERY')).toEqual({ ...NO_EXTRAS, other: true, otherText: 'AIRPORT DELIVERY' });
    expect(parseExtras('Çocuk Koltuğu,GPS,Roof rack').otherText).toBe('GPS, Roof rack');
  });

  test('the JSON format, as on booking HOM-09-26-033', () => {
    expect(parseExtras('{"child_seat":1, "additional_drivers":2, "extra_km":true}'))
      .toEqual({ ...NO_EXTRAS, childSeats: 1, drivers: 2, extraKm: true });
  });

  test('text that only looks like JSON is treated as text', () => {
    expect(parseExtras('{broken').otherText).toBe('{broken');
  });
});

describe('writing additional_services', () => {
  test('one of something is its plain name, so existing readers see no change', () => {
    expect(formatExtras({ ...NO_EXTRAS, childSeats: 1, drivers: 1, extraKm: true })).toBe('Çocuk Koltuğu,Yedek Sürücü,Ek Kilometre');
  });

  test('zero means not chosen', () => {
    expect(formatExtras(NO_EXTRAS)).toBeNull();
  });

  test('more than one carries the count', () => {
    expect(formatExtras({ ...NO_EXTRAS, childSeats: 2 })).toBe('Çocuk Koltuğu x2');
  });

  test('Other with nothing typed adds nothing', () => {
    expect(formatExtras({ ...NO_EXTRAS, other: true, otherText: '  ' })).toBeNull();
  });

  test.each([
    'Çocuk Koltuğu',
    'Ek Kilometre,Çocuk Koltuğu',
    'AIRPORT DELIVERY',
    'Çocuk Koltuğu,GPS,Roof rack',
    '{"child_seat":1, "additional_drivers":2, "extra_km":true}',
  ])('unchanged, %s goes back exactly as stored', stored => {
    expect(roundTrip(stored)).toBe(stored);
  });

  test('a changed JSON booking stays JSON and keeps what it doesn\'t know', () => {
    const stored = '{"child_seat":1,"additional_drivers":2,"extra_km":true,"source":"app"}';
    expect(JSON.parse(formatExtras({ ...parseExtras(stored), childSeats: 3 }, stored) as string))
      .toEqual({ child_seat: 3, additional_drivers: 2, extra_km: true, source: 'app' });
  });

  test('a removed extra leaves no trace', () => {
    expect(formatExtras({ ...parseExtras('Çocuk Koltuğu,Ek Kilometre'), childSeats: 0 }, 'Çocuk Koltuğu,Ek Kilometre')).toBe('Ek Kilometre');
  });
});

describe('booking illustrations', () => {
  const dir = path.join(process.cwd(), 'public/illustrations/booking');
  const names = ['shield-none', 'shield-partial', 'shield-medium', 'shield-full', 'child-seat', 'extra-driver', 'extra-km'];

  test.each(names)('%s has both sizes, with real transparency', name => {
    for (const file of [`${name}.webp`, `${name}@2x.webp`]) {
      const bytes = fs.readFileSync(path.join(dir, file));
      expect(bytes.toString('latin1', 0, 4)).toBe('RIFF');
      expect(bytes.toString('latin1', 12, 16)).toBe('VP8X');
      expect(bytes[20] & 0x10).toBeTruthy();
    }
  });
});
