import { supabase } from './supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerData {
  first_name:             string;
  last_name:              string;
  id_number:              string | null;
  id_type:                string | null;
  driving_license_number: string | null;
  license_issue_date:     string | null;
  nationality:            string | null;
  phone:                  string | null;
  email:                  string | null;
  birth_date:             string | null;
  address:                string | null;
  notes:                  string | null;
}

export interface ContractBooking {
  id:                  number;
  booking_number:      string;
  plate_number:        string;
  car_model:           string;
  customer_id:         number;
  customer_name:       string;
  start_date:          string;
  end_date:            string;
  pickup_location:     string | null;
  dropoff_location:    string | null;
  km_at_delivery:      number | null;
  fuel_at_delivery:    string | null;
  insurance_type:      string | null;
  additional_services: string | null;
  notes:               string | null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(s: string | null | undefined): string {
  return s?.trim() ? s.trim() : '—';
}

function fmtKm(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US') + ' km';
}

function fmtFuel(s: string | null | undefined): string {
  if (!s?.trim()) return '—';
  return s.trim();
}

function fmtDate(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s + 'T00:00:00');
  return d.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function infoRow(trLabel: string, enLabel: string, arLabel: string, value: string): string {
  return `
    <tr>
      <td class="info-label">
        <span class="lbl-tr">${trLabel}</span>
        <span class="lbl-en">${enLabel}</span>
        <span class="lbl-ar">${arLabel}</span>
      </td>
      <td class="info-val">${value}</td>
    </tr>`;
}

function infoRowPair(
  trL: string, enL: string, arL: string, valL: string,
  trR: string, enR: string, arR: string, valR: string
): string {
  return `
    <tr>
      <td colspan="2" class="info-pair-cell">
        <div class="pair-inner">
          <div class="pair-half">
            <div class="pair-lbl">
              <span class="lbl-tr">${trL}</span>
              <span class="lbl-en">${enL}</span>
              <span class="lbl-ar">${arL}</span>
            </div>
            <div class="pair-val">${valL}</div>
          </div>
          <div class="pair-half pair-half-r">
            <div class="pair-lbl">
              <span class="lbl-tr">${trR}</span>
              <span class="lbl-en">${enR}</span>
              <span class="lbl-ar">${arR}</span>
            </div>
            <div class="pair-val">${valR}</div>
          </div>
        </div>
      </td>
    </tr>`;
}

// ─── 15-clause terms ──────────────────────────────────────────────────────────

interface Clause { num: number; titleAR: string; titleTR: string; titleEN: string; ar: string; tr: string; en: string; }

const CLAUSES: Clause[] = [
  {
    num: 1,
    titleAR: 'تسليم واستلام السيارة', titleTR: 'TESLİM VE İADE', titleEN: 'VEHICLE DELIVERY & RETURN',
    ar: 'يتم تسليم السيارة للمستأجر بحالة نظيفة وجاهزة وخالية من أي نقص. ويتعهد المستأجر بإرجاعها بنفس الحالة في الوقت والمكان المتفق عليهما.',
    tr: 'Araç, kiracıya temiz, hazır ve eksiksiz halde teslim edilir. Kiracı, aracı aynı durumda ve anlaşılan yer ve zamanda iade etmeyi taahhüt eder.',
    en: 'The vehicle is delivered to the renter in clean, ready and complete condition. The renter undertakes to return it in the same condition at the agreed time and location.',
  },
  {
    num: 2,
    titleAR: 'مسؤولية السائق', titleTR: 'SÜRÜCÜ SORUMLULUĞU', titleEN: 'DRIVER RESPONSIBILITY',
    ar: 'تقع المسؤولية الكاملة عن السيارة على المستأجر طوال مدة الإيجار، ولا يجوز قيادة السيارة إلا من قبل الأشخاص المذكورين في العقد.',
    tr: 'Kiralama süresi boyunca araçla ilgili tüm sorumluluk kiracıya aittir. Araç, yalnızca sözleşmede belirtilen kişiler tarafından kullanılabilir.',
    en: 'Full responsibility for the vehicle lies with the renter throughout the rental period. The vehicle may only be driven by persons listed in the contract.',
  },
  {
    num: 3,
    titleAR: 'المخالفات والغرامات', titleTR: 'TRAFİK CEZALARI', titleEN: 'TRAFFIC FINES',
    ar: 'جميع المخالفات المرورية، رسوم الوقوف، أو أي عقوبات خلال فترة الإيجار تقع على المستأجر.',
    tr: 'Kiralama süresi boyunca oluşan tüm trafik cezaları, otopark ücretleri ve cezalar kiracıya aittir.',
    en: 'All traffic fines, parking fees, or any penalties incurred during the rental period are the renter\'s responsibility.',
  },
  {
    num: 4,
    titleAR: 'التأمين', titleTR: 'SİGORTA', titleEN: 'INSURANCE',
    ar: 'السيارة مشمولة بالتأمين الإجباري فقط، والذي يغطي أضرار الطرف الثالث بحد أقصى 400,000 ليرة تركية. أي أضرار تلحق بالسيارة نفسها أو تتجاوز هذا المبلغ يتحملها المستأجر بالكامل.',
    tr: 'Araç yalnızca zorunlu trafik sigortası kapsamındadır ve üçüncü şahıs hasarlarını en fazla 400.000 TL\'ye kadar karşılar. Aracın kendisine gelen veya bu tutarı aşan tüm hasarlar tamamen kiracıya aittir.',
    en: 'The vehicle is covered only by mandatory traffic insurance, which covers third-party damages up to 400,000 TRY. Any damage to the vehicle itself or amounts exceeding this limit are fully borne by the renter.',
  },
  {
    num: 5,
    titleAR: 'الأضرار والمسؤولية', titleTR: 'HASAR VE SORUMLULUK', titleEN: 'DAMAGE & LIABILITY',
    ar: 'أي ضرر غير مشمول بالتأمين يتحمله المستأجر بالكامل، كما يتحمل أيضاً قيمة نقصان سعر السيارة (الخفاض القيمة).',
    tr: 'Sigorta kapsamı dışındaki her türlü hasar tamamen kiracıya aittir. Kiracı ayrıca aracın değer kaybını da karşılamakla yükümlüdür.',
    en: 'Any damage not covered by insurance is fully borne by the renter. The renter is also liable for the vehicle\'s diminished value (depreciation loss).',
  },
  {
    num: 6,
    titleAR: 'في حالة الحادث', titleTR: 'KAZA DURUMU', titleEN: 'IN CASE OF ACCIDENT',
    ar: 'يجب على المستأجر في حال وقوع حادث: إبلاغ الشركة فوراً، استخراج تقرير من الشرطة أو الدرك، وإجراء فحص الكحول. في حال عدم الالتزام، يتحمل المستأجر كامل المسؤولية.',
    tr: 'Kaza halinde kiracı: Şirketi derhal bilgilendirmeli, polis veya jandarmadan tutanak almalı ve alkol testi yaptırmalıdır. Bu yükümlülüklere uyulmaması halinde tüm sorumluluk kiracıya aittir.',
    en: 'In case of an accident, the renter must: immediately notify the company, obtain a police or gendarmerie report, and undergo an alcohol test. Failure to comply transfers full liability to the renter.',
  },
  {
    num: 7,
    titleAR: 'حد الكيلومترات', titleTR: 'KİLOMETRE LİMİTİ', titleEN: 'KILOMETRE LIMIT',
    ar: 'الحد اليومي 150 كم والحد الشهري 3500 كم. في حال التجاوز يتم احتساب رسوم إضافية لكل كيلومتر زائد.',
    tr: 'Günlük limit 150 km, aylık limit 3.500 km\'dir. Aşılan her kilometre için ek ücret tahsil edilir.',
    en: 'Daily limit is 150 km and monthly limit is 3,500 km. An additional fee is charged for every kilometre exceeded.',
  },
  {
    num: 8,
    titleAR: 'الاستخدامات الممنوعة', titleTR: 'YASAKLI KULLANIMLAR', titleEN: 'PROHIBITED USES',
    ar: 'يُمنع استخدام السيارة في الحالات التالية: الخروج بها خارج تركيا، استخدامها في السباقات أو الطرق الوعرة، استخدامها في أي نشاط مخالف للقانون.',
    tr: 'Aracın aşağıdaki durumlarda kullanılması yasaktır: Türkiye dışına çıkarılması, yarışlarda veya arazi yollarında kullanılması, herhangi bir yasa dışı faaliyette kullanılması.',
    en: 'The vehicle is prohibited from: being taken outside Turkey, being used in races or off-road, or being used in any unlawful activity.',
  },
  {
    num: 9,
    titleAR: 'منع التأجير للغير', titleTR: 'DEVİR YASAĞI', titleEN: 'NO SUBLETTING',
    ar: 'لا يحق للمستأجر تأجير السيارة أو تسليمها لأي شخص آخر.',
    tr: 'Kiracı, aracı başka bir kişiye kiralayamaz veya devredemez.',
    en: 'The renter may not sublet, transfer, or hand over the vehicle to any other person.',
  },
  {
    num: 10,
    titleAR: 'الوقود', titleTR: 'YAKIT', titleEN: 'FUEL',
    ar: 'يجب إعادة السيارة بنفس مستوى الوقود الذي استلمها به، في حال النقص يتم احتساب الفرق على المستأجر.',
    tr: 'Araç, teslim alındığı yakıt seviyesinde iade edilmelidir. Eksik olması halinde fark kiracıdan tahsil edilir.',
    en: 'The vehicle must be returned with the same fuel level as received. Any shortfall will be charged to the renter.',
  },
  {
    num: 11,
    titleAR: 'التأخير في التسليم', titleTR: 'TESLİM GECİKMESİ', titleEN: 'LATE RETURN',
    ar: 'في حال تأخر المستأجر، يتم احتساب يوم إضافي مع غرامة. التأخير أكثر من ساعتين يُحسب يوماً كاملاً.',
    tr: 'Kiracının geç teslim etmesi halinde ek bir gün ve ceza tahakkuk ettirilir. 2 saatten fazla gecikme tam gün olarak sayılır.',
    en: 'If the renter is late, an additional day plus penalty applies. Delay over 2 hours counts as a full additional day.',
  },
  {
    num: 12,
    titleAR: 'التأمين (الوديعة)', titleTR: 'DEPOZİTO', titleEN: 'SECURITY DEPOSIT',
    ar: 'يتم استخدام مبلغ التأمين لتغطية أي أضرار أو مخالفات أو مبالغ غير مدفوعة، ويتم إعادة المتبقي إن وُجد.',
    tr: 'Depozito; her türlü hasar, ceza veya ödenmemiş tutarın karşılanması için kullanılır. Kalan tutar varsa iade edilir.',
    en: 'The security deposit is used to cover any damages, fines, or unpaid amounts. Any remaining balance is refunded.',
  },
  {
    num: 13,
    titleAR: 'تتبع السيارة والكاميرات', titleTR: 'ARAÇ TAKİBİ VE KAMERA', titleEN: 'VEHICLE TRACKING & CAMERAS',
    ar: 'قد تكون السيارة مزودة بجهاز تتبع GPS وكاميرا تسجيل للحوادث، ويوافق المستأجر على استخدامهما.',
    tr: 'Araç, GPS takip cihazı ve kaza kayıt kamerasıyla donatılmış olabilir. Kiracı bunların kullanımını kabul eder.',
    en: 'The vehicle may be equipped with GPS tracking and an accident recording camera. The renter consents to their use.',
  },
  {
    num: 14,
    titleAR: 'مخالفة العقد', titleTR: 'SÖZLEŞME İHLALİ', titleEN: 'BREACH OF CONTRACT',
    ar: 'في حال خالف المستأجر شروط العقد، يحق للشركة سحب السيارة فوراً.',
    tr: 'Kiracının sözleşme şartlarını ihlal etmesi halinde şirket, aracı derhal geri alma hakkına sahiptir.',
    en: 'If the renter breaches the contract terms, the company has the right to immediately repossess the vehicle.',
  },
  {
    num: 15,
    titleAR: 'الدفعات والمستحقات', titleTR: 'ÖDEMELER', titleEN: 'PAYMENTS',
    ar: 'يلتزم المستأجر بدفع جميع المبالغ المستحقة، في حال عدم الدفع يتم اتخاذ إجراءات قانونية.',
    tr: 'Kiracı, tüm ödenmesi gereken tutarları ödemekle yükümlüdür. Ödenmemesi halinde yasal işlem başlatılır.',
    en: 'The renter is obligated to pay all due amounts. In case of non-payment, legal action will be taken.',
  },
];

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHTML(booking: ContractBooking, cust: CustomerData): string {
  const today = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fullName = `${cust.first_name} ${cust.last_name}`.trim();

  const termsColAR = CLAUSES.map(c =>
    `<div class="clause">
      <div class="clause-title">${c.num}. ${c.titleAR}</div>
      <div class="clause-body">${c.ar}</div>
    </div>`
  ).join('');

  const termsColTR = CLAUSES.map(c =>
    `<div class="clause">
      <div class="clause-title">${c.num}. ${c.titleTR}</div>
      <div class="clause-body">${c.tr}</div>
    </div>`
  ).join('');

  const termsColEN = CLAUSES.map(c =>
    `<div class="clause">
      <div class="clause-title">${c.num}. ${c.titleEN}</div>
      <div class="clause-body">${c.en}</div>
    </div>`
  ).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Contract – ${booking.booking_number}</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link href="https://fonts.googleapis.com/css2?family=Cairo:wght@400;600;700&family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet"/>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
    font-size: 10.5px;
    color: #111;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }

  /* ── Page ─────────────────────────────────────────── */
  .page {
    width: 210mm;
    min-height: 297mm;
    padding: 15mm 15mm 12mm;
    position: relative;
    background: #fff;
  }
  .page-break { page-break-after: always; break-after: page; }

  /* ── Preview bar ────────────────────────────────────── */
  .preview-bar {
    background: #1a2942;
    color: #fff;
    padding: 10px 22px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-family: 'Inter', 'Segoe UI', Arial, sans-serif;
    font-size: 13px;
    font-weight: 500;
  }
  .preview-bar button {
    background: #4ba6ea;
    color: #fff;
    border: none;
    border-radius: 8px;
    padding: 9px 22px;
    font-size: 13px;
    font-weight: 700;
    cursor: pointer;
    font-family: inherit;
    letter-spacing: 0.3px;
  }
  .preview-bar button:hover { background: #2e8fd4; }

  /* ── Header ─────────────────────────────────────────── */
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 10px;
    border-bottom: 3px double #1a2942;
    margin-bottom: 10px;
  }
  .brand-block {}
  .brand-name {
    font-size: 20px;
    font-weight: 900;
    color: #1a2942;
    letter-spacing: 1.5px;
    line-height: 1;
  }
  .brand-sub {
    font-size: 8px;
    color: #4ba6ea;
    font-weight: 700;
    letter-spacing: 2.5px;
    text-transform: uppercase;
    margin-top: 3px;
  }
  .company-info {
    text-align: right;
    font-size: 8.5px;
    color: #374151;
    line-height: 1.75;
  }
  .company-info .co-name {
    font-size: 10px;
    font-weight: 700;
    color: #1a2942;
    letter-spacing: 0.3px;
  }

  /* ── Contract title block ───────────────────────────── */
  .contract-title-block {
    text-align: center;
    margin-bottom: 10px;
    padding: 8px 0 7px;
    border-bottom: 1.5px solid #e5e7eb;
  }
  .contract-title-tr {
    font-size: 13px;
    font-weight: 700;
    color: #1a2942;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .contract-title-divider {
    color: #9ca3af;
    margin: 0 8px;
    font-size: 12px;
  }
  .contract-title-en {
    font-size: 11px;
    font-weight: 700;
    color: #374151;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .contract-title-ar {
    font-family: 'Cairo', sans-serif;
    font-size: 12px;
    font-weight: 700;
    color: #374151;
    direction: rtl;
    display: block;
    margin-top: 3px;
  }
  .contract-meta {
    text-align: center;
    font-size: 9.5px;
    color: #374151;
    margin-top: 5px;
  }
  .contract-meta strong { color: #1a2942; font-size: 11px; }

  /* ── Section bar ────────────────────────────────────── */
  .section-bar {
    background: #1a2942;
    color: #fff;
    padding: 5px 10px;
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 1px;
    text-transform: uppercase;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .section-bar .bar-ar {
    font-family: 'Cairo', sans-serif;
    font-size: 9px;
    font-weight: 400;
    letter-spacing: 0;
    margin-left: auto;
    direction: rtl;
    opacity: 0.85;
  }

  /* ── Info grid ──────────────────────────────────────── */
  .info-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    grid-template-rows: 1fr auto;
    gap: 10px 10px;
    margin-bottom: 10px;
    align-items: stretch;
  }
  .info-box {
    border: 1.5px solid #d1d5db;
    overflow: hidden;
    page-break-inside: avoid;
    break-inside: avoid;
    display: flex;
    flex-direction: column;
  }
  .info-table {
    width: 100%;
    border-collapse: collapse;
    flex: 1;
    height: 100%;
  }
  .info-label {
    width: 106px;
    padding: 3px 7px;
    border-right: 1px solid #e5e7eb;
    border-bottom: 1px solid #f0f0f0;
    vertical-align: top;
    background: #f8f9fb;
  }
  .info-label:last-of-type { border-bottom: none; }
  .lbl-tr {
    display: block;
    font-size: 7.5px;
    font-weight: 700;
    color: #1a2942;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .lbl-en {
    display: block;
    font-size: 7px;
    font-weight: 400;
    color: #9ca3af;
    margin-top: 1px;
    letter-spacing: 0.1px;
  }
  .lbl-ar {
    display: block;
    font-family: 'Cairo', sans-serif;
    font-size: 8px;
    color: #9ca3af;
    direction: rtl;
    text-align: left;
    margin-top: 1px;
    line-height: 1.2;
  }
  .info-val {
    padding: 3px 8px;
    font-size: 10px;
    color: #111;
    font-weight: 500;
    border-bottom: 1px solid #f0f0f0;
    vertical-align: middle;
  }
  tr:last-child .info-label,
  tr:last-child .info-val { border-bottom: none; }
  tr:last-child .info-pair-cell { border-bottom: none; }

  /* ── Paired info row ────────────────────────────────── */
  .info-pair-cell {
    padding: 0;
    border-bottom: 1px solid #f0f0f0;
  }
  .pair-inner {
    display: flex;
    width: 100%;
  }
  .pair-half {
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    min-width: 0;
  }
  .pair-half-r {
    border-left: 1px solid #e5e7eb;
  }
  .pair-lbl {
    padding: 3px 7px;
    background: #f8f9fb;
    display: flex;
    flex-direction: column;
    justify-content: center;
    flex-shrink: 0;
    width: 80px;
    border-right: 1px solid #e5e7eb;
  }
  .pair-val {
    padding: 3px 8px;
    font-size: 10px;
    font-weight: 500;
    color: #111;
    flex: 1;
    display: flex;
    align-items: center;
  }

  /* ── Vehicle box note ───────────────────────────────── */
  .vehicle-note {
    font-style: italic;
    font-size: 7.5px;
    color: #6b7280;
    text-align: center;
    margin-top: 5px;
    line-height: 1.8;
  }
  .vehicle-note .vn-en {
    display: block;
    font-style: italic;
    font-size: 7px;
    color: #9ca3af;
  }
  .vehicle-note .ar {
    font-family: 'Cairo', sans-serif;
    direction: rtl;
    display: block;
    font-style: normal;
    font-size: 8px;
    color: #9ca3af;
  }

  /* ── Double divider ─────────────────────────────────── */
  .double-rule {
    border: none;
    border-top: 3px double #1a2942;
    margin: 10px 0;
  }

  /* ── BONO ───────────────────────────────────────────── */
  .bono-wrapper {
    border: 2.5px solid #1a2942;
    page-break-inside: avoid;
    break-inside: avoid;
    margin-bottom: 10px;
  }
  .bono-header {
    background: #1a2942;
    color: #fff;
    text-align: center;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 16px;
  }
  .bono-title {
    font-size: 15px;
    font-weight: 900;
    letter-spacing: 5px;
    text-transform: uppercase;
  }
  .bono-subtitle {
    font-size: 8px;
    color: #94a3b8;
    letter-spacing: 1.5px;
    text-transform: uppercase;
  }
  .bono-body { padding: 8px 10px; }
  .bono-row-3 {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 8px;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e5e7eb;
  }
  .bono-row-2 {
    display: grid;
    grid-template-columns: 2fr 1fr;
    gap: 8px;
    margin-bottom: 8px;
    padding-bottom: 8px;
    border-bottom: 1px solid #e5e7eb;
  }
  .bono-field-label {
    font-size: 7.5px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 3px;
  }
  .bono-field-val {
    font-size: 10.5px;
    font-weight: 600;
    color: #111;
    border-bottom: 1.5px solid #9ca3af;
    min-height: 17px;
    padding-bottom: 2px;
    letter-spacing: 0.2px;
  }
  .bono-field-val.prefilled { color: #1a2942; }
  .bono-amount-box {
    border: 2px solid #1a2942;
    padding: 6px 8px;
  }
  .bono-amount-label {
    font-size: 8px;
    font-weight: 700;
    color: #1a2942;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .bono-amount-val {
    font-size: 20px;
    font-weight: 900;
    color: #111;
    min-height: 26px;
    border-bottom: 1.5px solid #9ca3af;
    letter-spacing: 1px;
  }
  .bono-words-label {
    font-size: 7.5px;
    color: #6b7280;
    margin-top: 4px;
  }
  .bono-words-line {
    border-bottom: 1px solid #9ca3af;
    min-height: 15px;
    margin-top: 2px;
  }
  .bono-promise {
    font-size: 8.5px;
    color: #374151;
    line-height: 1.65;
    margin-bottom: 8px;
    padding: 5px 8px;
    background: #f8f9fb;
    border: 1px solid #e5e7eb;
  }
  .bono-promise strong { color: #1a2942; }
  .bono-debtor-grid {
    display: grid;
    grid-template-columns: 2fr 1fr 2fr 1.2fr;
    gap: 8px;
  }
  .bono-debtor-label {
    font-size: 7.5px;
    font-weight: 700;
    color: #6b7280;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    margin-bottom: 3px;
  }
  .bono-debtor-val {
    font-size: 10px;
    font-weight: 500;
    color: #111;
    border-bottom: 1px solid #9ca3af;
    min-height: 17px;
  }
  .bono-sig-box {
    height: 42px;
    border: 1px solid #9ca3af;
    margin-top: 3px;
  }

  /* ── Signatures ─────────────────────────────────────── */
  .sig-section {
    page-break-inside: avoid;
    break-inside: avoid;
    margin-bottom: 10px;
  }
  .sig-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 12px;
  }
  .sig-box {
    border: 1.5px solid #d1d5db;
    padding: 5px 10px;
    text-align: center;
  }
  .sig-title {
    font-size: 8.5px;
    font-weight: 700;
    color: #1a2942;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 2px;
  }
  .sig-title-ar {
    font-family: 'Cairo', sans-serif;
    font-size: 9px;
    color: #6b7280;
    direction: rtl;
    display: block;
    margin-bottom: 3px;
  }
  .sig-area {
    height: 26px;
    border-bottom: 1.5px solid #9ca3af;
    margin-bottom: 4px;
  }
  .sig-name {
    font-size: 8.5px;
    color: #374151;
    font-weight: 600;
  }

  /* ── Page 2 header ──────────────────────────────────── */
  .terms-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 8px;
    border-bottom: 3px double #1a2942;
    margin-bottom: 10px;
  }
  .terms-header-ref {
    text-align: right;
    font-size: 8.5px;
    color: #374151;
    line-height: 1.75;
  }

  /* ── Terms title ────────────────────────────────────── */
  .terms-title {
    text-align: center;
    font-size: 11px;
    font-weight: 700;
    color: #1a2942;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 10px;
    padding-bottom: 7px;
    border-bottom: 1.5px solid #e5e7eb;
  }

  /* ── Terms columns ──────────────────────────────────── */
  .terms-cols {
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
    gap: 16px;
  }
  .terms-col-header {
    background: #1a2942;
    color: #fff;
    text-align: center;
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    padding: 4px 6px;
    margin-bottom: 8px;
  }
  .terms-col-header.ar-col {
    font-family: 'Cairo', sans-serif;
    font-size: 10px;
    letter-spacing: 0;
  }
  .clause {
    margin-bottom: 3px;
  }
  .clause-title {
    font-size: 8px;
    font-weight: 700;
    color: #1a2942;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    margin-bottom: 2px;
  }
  .clause-body {
    font-size: 7.5px;
    color: #374151;
    line-height: 1.6;
    text-align: justify;
  }
  .terms-col-ar {
    direction: rtl;
    text-align: right;
  }
  .terms-col-ar .clause-title {
    font-family: 'Cairo', sans-serif;
    font-size: 8.5px;
    letter-spacing: 0;
    text-transform: none;
  }
  .terms-col-ar .clause-body {
    font-family: 'Cairo', sans-serif;
    font-size: 8px;
    text-align: right;
  }

  /* ── Footer note ────────────────────────────────────── */
  .footer-note {
    margin-top: 8px;
    text-align: center;
    font-size: 7.5px;
    color: #9ca3af;
    border-top: 1.5px solid #e5e7eb;
    padding-top: 5px;
  }

  /* ── Print ──────────────────────────────────────────── */
  @media print {
    @page { size: A4; margin: 0; }
    body  { margin: 0; }
    .page { padding: 15mm 15mm 12mm; }
    .no-print { display: none !important; }
  }
</style>
</head>
<body>

<!-- Preview bar -->
<div class="preview-bar no-print">
  <span>Contract Preview – ${booking.booking_number}</span>
  <button onclick="window.print()">🖨 Print / Save PDF</button>
</div>

<!-- ──────────────────────────── PAGE 1 ──────────────────────────── -->
<div class="page page-break">

  <!-- Header -->
  <div class="doc-header">
    <div class="brand-block">
      <div class="brand-name">HOMESTA CARS</div>
      <div class="brand-sub">Premium Car Rental &middot; Istanbul</div>
    </div>
    <div class="company-info">
      KAYABAŞI MAH. GAZİ YAŞARGIL CAD.<br/>
      T2 BLOK NO: 2Y &nbsp;&middot;&nbsp; BAŞAKŞEHIR / İSTANBUL<br/>
      +90 507 539 16 99 &nbsp;&middot;&nbsp; +90 501 615 95 16<br/>
      info@homestacars.com
    </div>
  </div>

  <!-- Title -->
  <div class="contract-title-block">
    <span class="contract-title-tr">ARAÇ KİRALAMA SÖZLEŞMESİ</span>
    <span class="contract-title-divider">/</span>
    <span class="contract-title-en">CAR RENTAL CONTRACT</span>
    <span class="contract-title-divider">/</span>
    <span class="contract-title-ar">عقد إيجار سيارة</span>
    <div class="contract-meta">
      Sözleşme No / Contract No: <strong>${booking.booking_number}</strong>
      &nbsp;&nbsp;&middot;&nbsp;&nbsp;
      Tarih / Date: <strong>${today}</strong>
    </div>
  </div>

  <!-- Info grid -->
  <div class="info-grid">

    <!-- LEFT: Customer info -->
    <div class="info-box">
      <div class="section-bar">
        KİRACI BİLGİLERİ / RENTER INFO
        <span class="bar-ar">معلومات المستأجر</span>
      </div>
      <table class="info-table">
        ${infoRow('AD SOYAD', 'Full Name', 'الاسم الكامل', fmt(fullName))}
        ${infoRow('KİMLİK NO', 'ID Number', 'رقم الهوية', fmt(cust.id_number))}
        ${infoRow('EHLİYET NO', 'License Number', 'رقم الرخصة', fmt(cust.driving_license_number))}
        ${infoRow('EHLİYET TARİHİ', 'License Issue Date', 'تاريخ إصدار الرخصة', fmtDate(cust.license_issue_date))}
        ${infoRow('UYRUK', 'Nationality', 'الجنسية', fmt(cust.nationality))}
        ${infoRow('TELEFON', 'Phone', 'رقم الهاتف', fmt(cust.phone))}
        ${infoRow('E-POSTA', 'Email', 'البريد الإلكتروني', fmt(cust.email))}
        ${infoRow('DOĞUM TARİHİ', 'Date of Birth', 'تاريخ الميلاد', fmtDate(cust.birth_date))}
        ${infoRow('ADRES', 'Address', 'العنوان', fmt(cust.address))}
      </table>
    </div>

    <!-- RIGHT: Booking info -->
    <div class="info-box">
      <div class="section-bar">
        REZERVASYON BİLGİLERİ / BOOKING INFO
        <span class="bar-ar">معلومات الحجز</span>
      </div>
      <table class="info-table">
        ${infoRow('PLAKA', 'Plate', 'رقم اللوحة', fmt(booking.plate_number))}
        ${infoRow('MODEL', 'Model', 'موديل السيارة', fmt(booking.car_model))}
        ${infoRowPair(
          'TESLİM TARİHİ', 'Delivery Date', 'تاريخ الاستلام', fmtDate(booking.start_date),
          'İADE TARİHİ',   'Return Date',   'تاريخ التسليم',  fmtDate(booking.end_date)
        )}
        ${infoRowPair(
          'TESLİM YERİ', 'Pickup Location',   'مكان التسليم',  fmt(booking.pickup_location),
          'İADE YERİ',   'Drop-off Location', 'مكان الاستلام', fmt(booking.dropoff_location)
        )}
        ${infoRowPair(
          'TESLİMDEKİ KM',    'KM at Delivery',   'الكيلومتر عند التسليم', fmtKm(booking.km_at_delivery),
          'TESLİMDEKİ YAKIT', 'Fuel at Delivery', 'الوقود عند التسليم',    fmtFuel(booking.fuel_at_delivery)
        )}
        ${infoRow('NOT', 'Notes', 'ملاحظة', fmt(booking.notes))}
        ${infoRow('SİGORTA TÜRÜ', 'Insurance Type', 'نوع التأمين', fmt(booking.insurance_type))}
        ${infoRow('EK HİZMETLER', 'Additional Services', 'الخدمات الإضافية', fmt(booking.additional_services))}
      </table>
    </div>

    <!-- Vehicle note: grid row 2, col 2 -->
    <div class="vehicle-note" style="grid-column:2; grid-row:2;">
      Bu süre uzatılabilir
      <span class="vn-en">This period is extendable</span>
      <span class="ar">هذه المدة قابلة للتمديد</span>
    </div>

  </div><!-- /info-grid -->

  <hr class="double-rule"/>

  <!-- BONO -->
  <div class="bono-wrapper">
    <div class="bono-header">
      <div>
        <div class="bono-title">B O N O</div>
        <div class="bono-subtitle">Promissory Note &nbsp;&middot;&nbsp; Senet &nbsp;&middot;&nbsp; سند الدين</div>
      </div>
    </div>
    <div class="bono-body">

      <!-- Row 1: Vade / Tanzim / Seri -->
      <div class="bono-row-3">
        <div>
          <div class="bono-field-label">Vade Tarihi / Due Date</div>
          <div class="bono-field-val">&nbsp;</div>
        </div>
        <div>
          <div class="bono-field-label">Tanzim Tarihi / Issue Date</div>
          <div class="bono-field-val">&nbsp;</div>
        </div>
        <div>
          <div class="bono-field-label">Senet Seri / Sıra No</div>
          <div class="bono-field-val">&nbsp;</div>
        </div>
      </div>

      <!-- Row 2: Amount / Yazıyla / Ödeme Yeri -->
      <div class="bono-row-2">
        <div class="bono-amount-box">
          <div class="bono-amount-label">Türk Lirası (₺) / Amount in Turkish Lira</div>
          <div class="bono-amount-val">&nbsp;</div>
          <div class="bono-words-label">Yazıyla / In Words:</div>
          <div class="bono-words-line"></div>
        </div>
        <div>
          <div class="bono-field-label">Ödeme Yeri / Payment Location</div>
          <div class="bono-field-val">&nbsp;</div>
        </div>
      </div>

      <!-- Promise text -->
      <div class="bono-promise">
        Bu senedi düzenleyen <span style="border-bottom:1px solid #374151;display:inline-block;min-width:160px;">&nbsp;</span>,
        yukarıda belirtilen <strong>vade tarihinde</strong>,
        Homesta Cars&rsquo;a veya emrine,
        yukarıda yazılı miktarı kayıtsız ve şartsız ödeyeceğini kabul ve taahhüt eder.
        İşbu bono, <span style="border-bottom:1px solid #374151;display:inline-block;min-width:120px;">&nbsp;</span> numaralı araç kiralama sözleşmesine istinaden düzenlenmiştir.
      </div>

      <!-- Debtor grid: name | TC (blank) | address (blank) | signature -->
      <div class="bono-debtor-grid">
        <div>
          <div class="bono-debtor-label">Borçlu Adı Soyadı</div>
          <div class="bono-debtor-val">&nbsp;</div>
        </div>
        <div>
          <div class="bono-debtor-label">TC / Vergi No</div>
          <div class="bono-debtor-val">&nbsp;</div>
        </div>
        <div>
          <div class="bono-debtor-label">Adres</div>
          <div class="bono-debtor-val">&nbsp;</div>
        </div>
        <div>
          <div class="bono-debtor-label">İmza / Signature</div>
          <div class="bono-sig-box"></div>
        </div>
      </div>

    </div>
  </div><!-- /bono -->

</div>
<!-- ──────────────────────────── END PAGE 1 ──────────────────────────── -->


<!-- ──────────────────────────── PAGE 2 ──────────────────────────── -->
<div class="page">

  <!-- Mini header -->
  <div class="terms-header">
    <div class="brand-block">
      <div class="brand-name" style="font-size:15px">HOMESTA CARS</div>
      <div class="brand-sub">Premium Car Rental &middot; Istanbul</div>
    </div>
    <div class="terms-header-ref">
      <strong>Sözleşme No:</strong> ${booking.booking_number}<br/>
      <strong>Kiraci:</strong> ${fmt(fullName)}<br/>
      <strong>Tarih:</strong> ${today}
    </div>
  </div>

  <!-- Terms title -->
  <div class="terms-title">
    الشروط والأحكام
    &nbsp;/&nbsp;
    ŞARTLAR VE KOŞULLAR
    &nbsp;/&nbsp;
    TERMS &amp; CONDITIONS
  </div>

  <!-- Three-column terms -->
  <div class="terms-cols">

    <!-- Arabic column -->
    <div>
      <div class="terms-col-header ar-col">العربية</div>
      <div class="terms-col-ar">${termsColAR}</div>
    </div>

    <!-- Turkish column -->
    <div>
      <div class="terms-col-header">TÜRKÇE</div>
      <div>${termsColTR}</div>
    </div>

    <!-- English column -->
    <div>
      <div class="terms-col-header">ENGLISH</div>
      <div>${termsColEN}</div>
    </div>

  </div>

  <hr class="double-rule"/>

  <!-- Signatures -->
  <div class="sig-section">
    <div class="sig-grid">
      <div class="sig-box">
        <div class="sig-title">KİRACI İMZASI / RENTER SIGNATURE</div>
        <div class="sig-title-ar">توقيع المستأجر</div>
        <div class="sig-area"></div>
        <div class="sig-name">${fmt(fullName)}</div>
      </div>
      <div class="sig-box">
        <div class="sig-title">ŞİRKET YETKİLİSİ / AUTHORIZED REPRESENTATIVE</div>
        <div class="sig-title-ar">ممثل الشركة</div>
        <div class="sig-area"></div>
        <div class="sig-name">HOMESTA CARS</div>
      </div>
    </div>
  </div>

  <div class="footer-note">
    HOMESTA CARS &nbsp;&middot;&nbsp; Başakşehir, İstanbul
    &nbsp;&middot;&nbsp;
    Bu sözleşme elektronik ortamda oluşturulmuştur / This contract was generated electronically.
    &nbsp;&middot;&nbsp;
    Booking: ${booking.booking_number} &nbsp;&middot;&nbsp; ${today}
  </div>

</div>
<!-- ──────────────────────────── END PAGE 2 ──────────────────────────── -->

</body>
</html>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function printBookingContract(booking: ContractBooking): Promise<void> {
  const { data, error } = await supabase
    .from('customers')
    .select('first_name, last_name, id_number, id_type, driving_license_number, license_issue_date, nationality, phone, email, birth_date, address, notes')
    .eq('id', booking.customer_id)
    .maybeSingle();

  if (error) {
    // Non-fatal: proceed with partial data
  }

  const nameParts = booking.customer_name.split(' ');
  const cust: CustomerData = data ?? {
    first_name:             nameParts[0] ?? '',
    last_name:              nameParts.slice(1).join(' ') ?? '',
    id_number:              null,
    id_type:                null,
    driving_license_number: null,
    license_issue_date:     null,
    nationality:            null,
    phone:                  null,
    email:                  null,
    birth_date:             null,
    address:                null,
    notes:                  null,
  };

  const html = buildHTML(booking, cust);

  const win = window.open('', '_blank', 'width=960,height=1150');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site and try again.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
