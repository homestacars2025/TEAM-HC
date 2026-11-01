/**
 * `bookings.additional_services` is one text column holding two formats. The forms write
 * comma-separated Turkish names, which contracts print as they are. A booking made
 * elsewhere can hold JSON, like `{"child_seat":1,"additional_drivers":2,"extra_km":true}`.
 */

export const CHILD_SEAT = 'Çocuk Koltuğu';
export const EXTRA_DRIVER = 'Yedek Sürücü';
export const EXTRA_KM = 'Ek Kilometre';

/** Enough for any car. Nothing in the data sets a limit. */
export const MAX_QUANTITY = 9;

export interface BookingExtras {
  childSeats: number;
  drivers: number;
  extraKm: boolean;
  other: boolean;
  otherText: string;
}

export const NO_EXTRAS: BookingExtras = { childSeats: 0, drivers: 0, extraKm: false, other: false, otherText: '' };

function readJson(stored: string | null | undefined): Record<string, unknown> | null {
  if (!stored?.trim().startsWith('{')) return null;
  try {
    const value: unknown = JSON.parse(stored);
    return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

const quantity = (value: unknown): number => Math.max(0, Math.floor(Number(value)) || 0);

export function parseExtras(stored: string | null | undefined): BookingExtras {
  const json = readJson(stored);
  if (json) {
    const otherText = typeof json.other === 'string' ? json.other : '';
    return {
      childSeats: quantity(json.child_seat),
      drivers: quantity(json.additional_drivers),
      extraKm: json.extra_km === true,
      other: otherText !== '',
      otherText,
    };
  }

  const extras = { ...NO_EXTRAS };
  const others: string[] = [];
  for (const part of (stored ?? '').split(',').map(text => text.trim()).filter(Boolean)) {
    const [, name, count] = part.match(/^(.*?)\s+x(\d+)$/) ?? [null, part, '1'];
    if (name === CHILD_SEAT) extras.childSeats += Number(count);
    else if (name === EXTRA_DRIVER) extras.drivers += Number(count);
    else if (part === EXTRA_KM) extras.extraKm = true;
    else others.push(part);
  }
  return { ...extras, other: others.length > 0, otherText: others.join(', ') };
}

const typedOther = (extras: BookingExtras): string => (extras.other ? extras.otherText.trim() : '');

const sameExtras = (a: BookingExtras, b: BookingExtras): boolean =>
  a.childSeats === b.childSeats && a.drivers === b.drivers && a.extraKm === b.extraKm && typedOther(a) === typedOther(b);

/**
 * What to save. Nothing changed means the stored text goes back exactly as it came, and a
 * JSON booking stays JSON. One of something is its plain name, as it always was, so only
 * a real quantity reads differently: `Çocuk Koltuğu x2`.
 */
export function formatExtras(extras: BookingExtras, stored?: string | null): string | null {
  if (stored && sameExtras(parseExtras(stored), extras)) return stored;

  const other = typedOther(extras);
  const json = readJson(stored);
  if (json) {
    const { other: _dropped, ...rest } = json;
    return JSON.stringify({
      ...rest,
      child_seat: extras.childSeats,
      additional_drivers: extras.drivers,
      extra_km: extras.extraKm,
      ...(other && { other }),
    });
  }

  const named = (name: string, count: number) => (count > 1 ? [`${name} x${count}`] : count === 1 ? [name] : []);
  const parts = [
    ...named(CHILD_SEAT, extras.childSeats),
    ...named(EXTRA_DRIVER, extras.drivers),
    ...(extras.extraKm ? [EXTRA_KM] : []),
    ...(other ? [other] : []),
  ];
  return parts.length > 0 ? parts.join(',') : null;
}

export const hasExtras = (extras: BookingExtras): boolean => !sameExtras(extras, NO_EXTRAS);
