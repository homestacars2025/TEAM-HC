/**
 * The official HGS portal export (hgsmusteri.ptt.gov.tr), one .xlsx per car, turned into
 * rows for `import_hgs_portal_file`. It fills `hgs_portal_transits`, which has nothing to
 * do with the Kuveyt sync or `hgs_transactions`.
 *
 * Two sheets, each with its header on row 3 and data from row 4:
 * - "Karayolları Geçişleri" (public roads), dates as `25.09.2026 12:45:56.000`
 * - "Özel Otoyol Geçişleri" (private motorways), dates as `10/15/2026 12:20:59 PM`
 * The two date formats are never mixed: each sheet has its own parser.
 */

export const PUBLIC_SHEET = 'Karayolları Geçişleri';
export const PRIVATE_SHEET = 'Özel Otoyol Geçişleri';
/** Rows 1–3 are the title and the header. */
const FIRST_DATA_ROW = 3;

export type RoadType = 'public' | 'private';

export interface PortalRow {
  road_type: RoadType;
  transit_datetime: string | null;
  entry_datetime: string | null;
  exit_datetime: string | null;
  entry_location: string | null;
  exit_location: string | null;
  otoyol: string | null;
  amount: number;
  description: string | null;
  uniq_key: string;
}

type Cell = string | number | boolean | null | undefined;

const text = (cell: Cell): string | null => {
  if (cell === null || cell === undefined) return null;
  const value = String(cell).trim();
  return value === '' ? null : value;
};

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (y: number, mo: number, d: number, h: number, mi: number, s: number) =>
  `${y}-${pad(mo)}-${pad(d)} ${pad(h)}:${pad(mi)}:${pad(s)}+03`;

const valid = (y: number, mo: number, d: number, h: number, mi: number, s: number) =>
  y > 1999 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31 && h >= 0 && h <= 23 && mi >= 0 && mi <= 59 && s >= 0 && s <= 59;

/** `25.09.2026 12:45:56.000` → `2026-09-25 12:45:56+03`. Fractions of a second are dropped. */
export function parsePublicDate(cell: Cell): string | null {
  const value = text(cell);
  if (!value) return null;
  const m = value.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?(?:[.,]\d+)?$/);
  if (!m) return null;
  const [d, mo, y, h, mi, s] = [m[1], m[2], m[3], m[4], m[5], m[6] ?? '0'].map(Number);
  return valid(y, mo, d, h, mi, s) ? stamp(y, mo, d, h, mi, s) : null;
}

/** `10/15/2026 12:20:59 PM` (month first) → `2026-10-15 12:20:59+03`. */
export function parsePrivateDate(cell: Cell): string | null {
  const value = text(cell);
  if (!value) return null;
  const m = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AaPp][Mm])?$/);
  if (!m) return null;
  let h = Number(m[4]);
  const half = m[7]?.toUpperCase();
  if (half === 'PM' && h < 12) h += 12;
  if (half === 'AM' && h === 12) h = 0;
  const [mo, d, y, mi, s] = [m[1], m[2], m[3], m[5], m[6] ?? '0'].map(Number);
  return valid(y, mo, d, h, mi, s) ? stamp(y, mo, d, h, mi, s) : null;
}

/** "49.00", "16,5" or 49 → 49 / 16.5. Anything else is no amount. */
export function parseAmount(cell: Cell): number | null {
  const value = text(cell);
  if (!value) return null;
  const amount = parseFloat(value.replace(',', '.'));
  return Number.isFinite(amount) ? amount : null;
}

/**
 * The amount as the key has always written it: a whole number keeps one decimal
 * ("49.0"), anything else as it is ("16.5"). The rows already in the table were keyed
 * this way, so a file uploaded twice is still caught as a duplicate.
 */
export const keyAmount = (amount: number) => (Number.isInteger(amount) ? amount.toFixed(1) : String(amount));

export const uniqKey = (plate: string, row: Pick<PortalRow, 'transit_datetime' | 'amount' | 'exit_location' | 'entry_location'>) =>
  `${plate}|${row.transit_datetime}|${keyAmount(row.amount)}|${row.exit_location || row.entry_location || ''}`;

export interface ParsedFile {
  rows: PortalRow[];
  /** Rows with no amount, left out as the format says. */
  skipped: number;
  /** Rows with an amount whose date couldn't be read. Sent anyway, but worth a look. */
  undated: number;
  /** Which of the two sheets the file had. */
  sheets: RoadType[];
}

type Sheets = Record<string, Cell[][]>;

/** Finds a sheet by its name, ignoring case and stray spaces. */
const sheetNamed = (sheets: Sheets, name: string) => {
  const wanted = name.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim();
  const found = Object.keys(sheets).find(key => key.toLocaleLowerCase('tr-TR').replace(/\s+/g, ' ').trim() === wanted);
  return found ? sheets[found] : null;
};

export function portalRows(sheets: Sheets, plate: string): ParsedFile {
  const rows: PortalRow[] = [];
  let skipped = 0;
  let undated = 0;
  const found: RoadType[] = [];

  const add = (row: Omit<PortalRow, 'uniq_key'>) => {
    if (!row.transit_datetime) undated += 1;
    rows.push({ ...row, uniq_key: uniqKey(plate, row) });
  };

  // [Giriş Zamanı, Çıkış Zamanı, Açıklama, Giriş İstasyonu, Çıkış İstasyonu, Otoyol, Ücret, OdenecekTutar, NormalGecisUcreti]
  const roads = sheetNamed(sheets, PUBLIC_SHEET);
  if (roads) {
    found.push('public');
    for (const cells of roads.slice(FIRST_DATA_ROW)) {
      if (!cells || cells.every(cell => text(cell) === null)) continue;
      const amount = parseAmount(cells[6]);
      if (amount === null) { skipped += 1; continue; }
      const entry = parsePublicDate(cells[0]);
      const exit = parsePublicDate(cells[1]);
      add({
        road_type: 'public', transit_datetime: exit ?? entry, entry_datetime: entry, exit_datetime: exit,
        entry_location: text(cells[3]), exit_location: text(cells[4]), otoyol: text(cells[5]), amount, description: text(cells[2]),
      });
    }
  }

  // [Tahsilat Tarihi, Ücret, Otoyol, Açıklama, Giriş İstasyonu, Giriş Tarihi, Çıkış İstasyonu, Çıkış Tarihi]
  // Tahsilat Tarihi is when it was charged, not when the car passed, so it is not used.
  const motorways = sheetNamed(sheets, PRIVATE_SHEET);
  if (motorways) {
    found.push('private');
    for (const cells of motorways.slice(FIRST_DATA_ROW)) {
      if (!cells || cells.every(cell => text(cell) === null)) continue;
      const amount = parseAmount(cells[1]);
      if (amount === null) { skipped += 1; continue; }
      const entry = parsePrivateDate(cells[5]);
      const exit = parsePrivateDate(cells[7]);
      add({
        road_type: 'private', transit_datetime: exit ?? entry, entry_datetime: entry, exit_datetime: exit,
        entry_location: text(cells[4]), exit_location: text(cells[6]), otoyol: text(cells[2]), amount, description: text(cells[3]),
      });
    }
  }

  return { rows, skipped, undated, sheets: found };
}

/** Reads the workbook in the browser. SheetJS loads only when a file is picked. */
export async function readPortalFile(file: File, plate: string): Promise<ParsedFile> {
  const XLSX = await import('xlsx');
  const book = XLSX.read(await file.arrayBuffer(), { type: 'array', cellDates: false, cellText: true });
  const sheets: Sheets = {};
  for (const name of book.SheetNames) {
    // Formatted text, so a date stored as a number reads as the portal shows it.
    sheets[name] = XLSX.utils.sheet_to_json<Cell[]>(book.Sheets[name], { header: 1, raw: false, defval: null, blankrows: true });
  }
  return portalRows(sheets, plate);
}

export const isPortalFile = (file: File) => /\.xlsx$/i.test(file.name);
