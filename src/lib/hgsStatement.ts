import { addDay } from './bookingDates';
import { istanbulDate } from './istanbulTime';
import { transitDate, transitPlace, transitTime, type DayRange } from './hgs';

/**
 * The HGS toll statement: one car's portal transits over a range of days, as a PDF a
 * customer can be handed. Worked out here, apart from the drawing, so it can be tested;
 * Admin builds the same statement. Nothing about the car's owner or investor is on it.
 */

export const STATEMENT_LANGS = ['ar', 'tr', 'en', 'fr'] as const;
export type StatementLang = typeof STATEMENT_LANGS[number];

/** Each language by its own name, as the picker shows it whatever the interface language. */
export const STATEMENT_LANG_NAMES: Record<StatementLang, string> = { ar: 'العربية', tr: 'Türkçe', en: 'English', fr: 'Français' };

export const isStatementLang = (value: string | null | undefined): value is StatementLang =>
  STATEMENT_LANGS.includes((value ?? '').trim().toLowerCase().slice(0, 2) as StatementLang);

/** The customer's language when a booking is linked and it's one of the four; Arabic otherwise. */
export function defaultStatementLang(customerLanguage: string | null | undefined): StatementLang {
  const code = (customerLanguage ?? '').trim().toLowerCase().slice(0, 2);
  return isStatementLang(code) ? code as StatementLang : 'ar';
}

const platePart = (plate: string) => plate.replace(/\s/g, '').toUpperCase();

/** `HGS-261107-34HZY380`: the Istanbul issue date and the plate. */
export const statementNumber = (plate: string, issued: string = istanbulDate()): string =>
  `HGS-${issued.slice(2, 4)}${issued.slice(5, 7)}${issued.slice(8, 10)}-${platePart(plate)}`;

/** `HGS-34HZY380-2026-11-01_2026-11-06-ar.pdf` */
export const statementFileName = (plate: string, range: DayRange, lang: StatementLang): string =>
  `HGS-${platePart(plate)}-${range.from}_${range.to}-${lang}.pdf`;

/** `06.11.2026` */
export const statementDay = (iso: string): string => `${iso.slice(8, 10)}.${iso.slice(5, 7)}.${iso.slice(0, 4)}`;

/** `₺1.234,50`, as on the page. */
export const statementAmount = (n: number): string =>
  `₺${Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export interface StatementBooking {
  id: number;
  bookingNumber: string | null;
  start: string;
  end: string;
  customer: string | null;
  language: string | null;
}

/** The days a booking shares with the range; `null` when they don't meet. */
export function bookingWindow(range: DayRange, booking: Pick<StatementBooking, 'start' | 'end'>): DayRange | null {
  const from = booking.start > range.from ? booking.start : range.from;
  const to = booking.end < range.to ? booking.end : range.to;
  return from <= to ? { from, to } : null;
}

export interface StatementSource {
  id: number;
  transit_datetime: string;
  entry_location: string | null;
  exit_location: string | null;
  otoyol: string | null;
  road_type: string | null;
  amount: number;
}

export interface StatementRow {
  id: number;
  date: string;
  time: string;
  route: string;
  road: string;
  type: 'public' | 'private' | null;
  amount: number;
}

/** The rows inside the window, oldest first; private roads left out when asked. */
export function statementRows(items: readonly StatementSource[], window: DayRange, includePrivate: boolean): StatementRow[] {
  return items
    .filter(item => {
      const day = transitDate(item.transit_datetime);
      return day >= window.from && day <= window.to && (includePrivate || item.road_type !== 'private');
    })
    .sort((a, b) => Date.parse(a.transit_datetime) - Date.parse(b.transit_datetime) || a.id - b.id)
    .map(item => {
      const road = item.otoyol?.trim();
      return {
        id: item.id,
        date: transitDate(item.transit_datetime),
        time: transitTime(item.transit_datetime),
        route: transitPlace(item),
        road: road && road !== '*' ? road : '—',
        type: item.road_type === 'private' || item.road_type === 'public' ? item.road_type : null,
        amount: Number(item.amount) || 0,
      };
    });
}

export interface StatementSummary {
  total: number;
  passes: number;
  /** Istanbul days with at least one pass. */
  days: number;
}

export function statementSummary(rows: readonly StatementRow[]): StatementSummary {
  return {
    total: Math.round(rows.reduce((sum, row) => sum + row.amount, 0) * 100) / 100,
    passes: rows.length,
    days: new Set(rows.map(row => row.date)).size,
  };
}

/** The first and last instant of the window, for the query. */
export const windowBounds = (window: DayRange) => ({ from: `${window.from}T00:00:00+03:00`, to: `${addDay(window.to, 1)}T00:00:00+03:00` });

export interface StatementText {
  title: string;
  number: string;
  issued: string;
  plate: string;
  vehicle: string;
  period: string;
  customer: string;
  booking: string;
  total: string;
  passes: string;
  days: string;
  date: string;
  time: string;
  route: string;
  road: string;
  type: string;
  amount: string;
  public: string;
  private: string;
  totalRow: string;
  /** `{x}` and `{y}`. */
  page: string;
  empty: string;
  privateExcluded: string;
  legalTitle: string;
  legal: string;
}

/** The same words as Admin's statement, line for line. */
export const STATEMENT_TEXT: Record<StatementLang, StatementText> = {
  ar: {
    title: 'كشف رسوم عبور HGS',
    number: 'رقم الكشف',
    issued: 'تاريخ الإصدار',
    plate: 'رقم اللوحة',
    vehicle: 'المركبة',
    period: 'الفترة',
    customer: 'العميل',
    booking: 'رقم الحجز',
    total: 'إجمالي المبلغ',
    passes: 'عدد مرات العبور',
    days: 'أيام العبور',
    date: 'التاريخ',
    time: 'الوقت',
    route: 'المعبر / المسار',
    road: 'الطريق / المشغّل',
    type: 'النوع',
    amount: 'المبلغ',
    public: 'طريق عام',
    private: 'طريق خاص',
    totalRow: 'الإجمالي',
    page: 'صفحة {x} من {y}',
    empty: 'لا توجد عمليات عبور في هذه الفترة.',
    privateExcluded: 'لا يشمل الطرق الخاصة',
    legalTitle: 'ملاحظة قانونية',
    legal: 'تم استخراج هذه البيانات من سجل نظام HGS الرسمي المرتبط بالمركبة، والمسجّل باسم مالك المركبة أو الجهة المتعاقدة مع شركة Homesta. يحق لـ Homesta تحصيل هذه الرسوم من المستأجر وفقاً لعقد الإيجار الموقّع.',
  },
  tr: {
    title: 'HGS Geçiş Ekstresi',
    number: 'Ekstre no.',
    issued: 'Düzenleme tarihi',
    plate: 'Plaka',
    vehicle: 'Araç',
    period: 'Dönem',
    customer: 'Müşteri',
    booking: 'Rezervasyon no.',
    total: 'Toplam tutar',
    passes: 'Geçiş sayısı',
    days: 'Geçiş yapılan gün',
    date: 'Tarih',
    time: 'Saat',
    route: 'Geçiş / güzergâh',
    road: 'Yol / işletmeci',
    type: 'Tür',
    amount: 'Tutar',
    public: 'Kamu yolu',
    private: 'Özel yol',
    totalRow: 'Toplam',
    page: 'Sayfa {x} / {y}',
    empty: 'Bu dönemde geçiş yok.',
    privateExcluded: 'Özel yollar hariç',
    legalTitle: 'Yasal not',
    legal: 'Bu veriler, araca bağlı ve araç sahibi veya Homesta ile sözleşmeli taraf adına kayıtlı resmi HGS sistem kayıtlarından alınmıştır. Homesta, imzalanan kira sözleşmesi uyarınca bu ücretleri kiracıdan tahsil etme hakkına sahiptir.',
  },
  en: {
    title: 'HGS Toll Statement',
    number: 'Statement no.',
    issued: 'Issue date',
    plate: 'Plate',
    vehicle: 'Vehicle',
    period: 'Period',
    customer: 'Customer',
    booking: 'Booking no.',
    total: 'Total amount',
    passes: 'Passes',
    days: 'Days with passes',
    date: 'Date',
    time: 'Time',
    route: 'Crossing / route',
    road: 'Road / operator',
    type: 'Type',
    amount: 'Amount',
    public: 'Public road',
    private: 'Private road',
    totalRow: 'Total',
    page: 'Page {x} of {y}',
    empty: 'No passes in this period.',
    privateExcluded: 'Private roads not included',
    legalTitle: 'Legal note',
    legal: 'This data is taken from the official HGS system records linked to the vehicle, registered to the vehicle owner or the party contracted with Homesta. Homesta is entitled to collect these charges from the renter under the signed rental agreement.',
  },
  fr: {
    title: 'Relevé des péages HGS',
    number: 'Relevé n°',
    issued: 'Date d\'émission',
    plate: 'Immatriculation',
    vehicle: 'Véhicule',
    period: 'Période',
    customer: 'Client',
    booking: 'Réservation n°',
    total: 'Montant total',
    passes: 'Passages',
    days: 'Jours avec passages',
    date: 'Date',
    time: 'Heure',
    route: 'Passage / trajet',
    road: 'Route / exploitant',
    type: 'Type',
    amount: 'Montant',
    public: 'Route publique',
    private: 'Route privée',
    totalRow: 'Total',
    page: 'Page {x} sur {y}',
    empty: 'Aucun passage sur cette période.',
    privateExcluded: 'Routes privées exclues',
    legalTitle: 'Mention légale',
    legal: 'Ces données proviennent des registres officiels du système HGS liés au véhicule, enregistrés au nom du propriétaire du véhicule ou de la partie sous contrat avec Homesta. Homesta est en droit de facturer ces frais au locataire conformément au contrat de location signé.',
  },
};

export interface StatementData {
  lang: StatementLang;
  plate: string;
  model: string | null;
  window: DayRange;
  customer: string | null;
  bookingNumber: string | null;
  includePrivate: boolean;
  issued: string;
  rows: StatementRow[];
}
