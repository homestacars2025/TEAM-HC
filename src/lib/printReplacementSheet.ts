import { supabase } from './supabase';
import { fmt, fmtKm, fmtFuel, fmtDate, infoRow, infoRowPair } from './printContract';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CustomerData {
  first_name:             string;
  last_name:              string;
  id_number:              string | null;
  driving_license_number: string | null;
  nationality:            string | null;
  phone:                  string | null;
}

export interface ReplacementSheet {
  sheet_number:            string;
  /** customers.id is a uuid — never cast this to a number. */
  customer_id:             string;
  customer_name:           string;
  original_booking_number: string | null;
  original_plate:          string | null;
  original_model:          string | null;
  replacement_plate:       string;
  replacement_model:       string | null;
  start_date:              string;
  end_date:                string;
  km_at_handover:          number | null;
  fuel_at_handover:        string | null;
  notes:                   string | null;
}

// ─── HTML escaping ────────────────────────────────────────────────────────────

/**
 * Every interpolated value is user-entered (plate, notes, customer name) and lands in a
 * document we write with document.write — escape it so a stray angle bracket or quote
 * cannot break out of the markup.
 */
function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Formats via the shared contract helper, then escapes the result. */
function safe(s: string | null | undefined): string {
  return esc(fmt(s));
}

// ─── 4-clause replacement terms ───────────────────────────────────────────────

interface Clause { num: number; titleAR: string; titleTR: string; titleEN: string; ar: string; tr: string; en: string; }

const CLAUSES: Clause[] = [
  {
    num: 1,
    titleAR: 'سريان العقد الأصلي', titleTR: 'ASIL SÖZLEŞMENİN GEÇERLİLİĞİ', titleEN: 'APPLICABILITY OF THE ORIGINAL CONTRACT',
    ar: 'تنطبق جميع شروط وأحكام عقد الإيجار الأصلي بالكامل على هذه السيارة البديلة دون استثناء، ويُعد هذا المحضر جزءاً لا يتجزأ من ذلك العقد.',
    tr: 'Asıl kira sözleşmesinin tüm hüküm ve şartları, istisnasız olarak işbu değişim aracı hakkında da aynen geçerlidir. İşbu tutanak, anılan sözleşmenin ayrılmaz bir parçasıdır.',
    en: 'All terms and conditions of the original rental contract apply in full and without exception to this replacement vehicle. This record forms an integral part of that contract.',
  },
  {
    num: 2,
    titleAR: 'إرجاع السيارة البديلة', titleTR: 'DEĞİŞİM ARACININ İADESİ', titleEN: 'RETURN OF THE REPLACEMENT VEHICLE',
    ar: 'يلتزم العميل بإرجاع السيارة البديلة فور إشعاره بجاهزية سيارته الأصلية أو عند انتهاء المدة المذكورة، أيهما أقرب.',
    tr: 'Kiracı, asıl aracının hazır olduğunun kendisine bildirilmesi üzerine derhal veya yukarıda belirtilen sürenin sonunda — hangisi önce gerçekleşirse — değişim aracını iade etmekle yükümlüdür.',
    en: 'The renter undertakes to return the replacement vehicle immediately upon being notified that their original vehicle is ready, or at the end of the stated period, whichever occurs first.',
  },
  {
    num: 3,
    titleAR: 'الوقود والكيلومترات والحالة', titleTR: 'YAKIT, KİLOMETRE VE ARACIN DURUMU', titleEN: 'FUEL, KILOMETRES & CONDITION',
    ar: 'تسري على السيارة البديلة نفس التزامات الوقود والكيلومترات والحالة المتفق عليها في العقد الأصلي، ويلتزم العميل بإرجاعها نظيفة ومغسولة وبنفس الحالة التي استلمها بها.',
    tr: 'Asıl sözleşmede kararlaştırılan yakıt, kilometre ve araç durumuna ilişkin yükümlülükler değişim aracı hakkında da aynen geçerlidir. Kiracı, aracı temiz ve yıkanmış olarak, teslim aldığı durumda iade etmeyi taahhüt eder.',
    en: 'The fuel, kilometre and condition obligations agreed in the original contract apply equally to the replacement vehicle. The renter undertakes to return it clean and washed, in the same condition in which it was received.',
  },
  {
    num: 4,
    titleAR: 'عدم التمديد والالتزامات المالية', titleTR: 'SÜRE UZATIMI VE EK YÜKÜMLÜLÜK', titleEN: 'NO EXTENSION OR ADDITIONAL OBLIGATION',
    ar: 'لا يترتب على استلام السيارة البديلة أي تمديد لمدة العقد الأصلي أو أي التزامات مالية إضافية ما لم يُتفق على غير ذلك كتابةً.',
    tr: 'Değişim aracının teslim alınması, asıl sözleşmenin süresini uzatmaz ve yazılı olarak aksi kararlaştırılmadıkça herhangi bir ek mali yükümlülük doğurmaz.',
    en: 'Receipt of the replacement vehicle neither extends the term of the original contract nor creates any additional financial obligation, unless otherwise agreed in writing.',
  },
];

// ─── HTML builder ─────────────────────────────────────────────────────────────

function buildHTML(sheet: ReplacementSheet, cust: CustomerData): string {
  const today    = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const fullName = `${cust.first_name} ${cust.last_name}`.trim();
  const sheetNo  = esc(sheet.sheet_number);

  // Clause 1 is the legally load-bearing one — it carries the original contract onto this
  // vehicle — so it renders in a highlighted box ahead of the remaining three.
  const lead = CLAUSES[0];
  const rest = CLAUSES.slice(1);

  const restCol = (pick: (c: Clause) => { title: string; body: string }) =>
    rest.map(c => {
      const { title, body } = pick(c);
      return `<div class="clause">
        <div class="clause-title">${c.num}. ${esc(title)}</div>
        <div class="clause-body">${esc(body)}</div>
      </div>`;
    }).join('');

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Replacement – ${sheetNo}</title>
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

  /* ── Title block ────────────────────────────────────── */
  .doc-title-block {
    text-align: center;
    margin-bottom: 10px;
    padding: 8px 0 7px;
    border-bottom: 1.5px solid #e5e7eb;
  }
  .doc-title-tr {
    font-size: 13px;
    font-weight: 700;
    color: #1a2942;
    letter-spacing: 2px;
    text-transform: uppercase;
  }
  .doc-title-divider {
    color: #9ca3af;
    margin: 0 8px;
    font-size: 12px;
  }
  .doc-title-en {
    font-size: 11px;
    font-weight: 700;
    color: #374151;
    letter-spacing: 1px;
    text-transform: uppercase;
  }
  .doc-title-ar {
    font-family: 'Cairo', sans-serif;
    font-size: 13px;
    font-weight: 700;
    color: #1a2942;
    direction: rtl;
  }
  .doc-meta {
    margin-top: 5px;
    font-size: 8.5px;
    color: #6b7280;
    letter-spacing: 0.2px;
  }

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
    gap: 10px;
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
  .pair-inner { display: flex; width: 100%; }
  .pair-half {
    flex: 1;
    display: flex;
    flex-direction: row;
    align-items: stretch;
    min-width: 0;
  }
  .pair-half-r { border-left: 1px solid #e5e7eb; }
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

  /* ── Swap banner ────────────────────────────────────── */
  .swap-banner {
    border: 1.5px solid #d1d5db;
    border-left: 4px solid #4ba6ea;
    background: #f8f9fb;
    padding: 7px 12px;
    margin-bottom: 10px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .swap-line {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 12px;
    font-size: 12px;
    font-weight: 700;
    color: #1a2942;
    letter-spacing: 0.4px;
  }
  .swap-arrow { color: #4ba6ea; font-size: 15px; font-weight: 900; }
  .swap-caption {
    text-align: center;
    font-size: 7.5px;
    color: #6b7280;
    margin-top: 3px;
    letter-spacing: 0.3px;
    text-transform: uppercase;
  }

  /* ── Acknowledgement ────────────────────────────────── */
  .ack-box {
    border: 1.5px solid #d1d5db;
    padding: 8px 12px;
    margin-bottom: 10px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
  .ack-line {
    font-size: 8.5px;
    color: #374151;
    line-height: 1.65;
    text-align: justify;
    margin-bottom: 4px;
  }
  .ack-line:last-child { margin-bottom: 0; }
  .ack-ar {
    font-family: 'Cairo', sans-serif;
    font-size: 9px;
    direction: rtl;
    text-align: right;
  }

  /* ── Terms ──────────────────────────────────────────── */
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
  .lead-clause {
    border: 1.5px solid #4ba6ea;
    background: rgba(75,166,234,0.07);
    padding: 8px 10px;
    margin-bottom: 10px;
    page-break-inside: avoid;
    break-inside: avoid;
  }
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
  .clause { margin-bottom: 6px; }
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
  .terms-col-ar { direction: rtl; text-align: right; }
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

  /* ── Signatures ─────────────────────────────────────── */
  .sig-section {
    page-break-inside: avoid;
    break-inside: avoid;
    margin-top: 12px;
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
    height: 30px;
    border-bottom: 1.5px solid #9ca3af;
    margin-bottom: 4px;
  }
  .sig-name {
    font-size: 8.5px;
    color: #374151;
    font-weight: 600;
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
  <span>Replacement Sheet Preview – ${sheetNo}</span>
  <button onclick="window.print()">🖨 Print / Save PDF</button>
</div>

<div class="page">

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
  <div class="doc-title-block">
    <span class="doc-title-tr">ARAÇ DEĞİŞİM TUTANAĞI</span>
    <span class="doc-title-divider">/</span>
    <span class="doc-title-en">REPLACEMENT VEHICLE HANDOVER</span>
    <span class="doc-title-divider">/</span>
    <span class="doc-title-ar">محضر استبدال سيارة</span>
    <div class="doc-meta">
      Tutanak No / Sheet No: <strong>${sheetNo}</strong>
      &nbsp;&nbsp;&middot;&nbsp;&nbsp;
      Tarih / Date: <strong>${esc(today)}</strong>
    </div>
  </div>

  <!-- Swap banner -->
  <div class="swap-banner">
    <div class="swap-line">
      <span>${safe(sheet.original_plate)}</span>
      <span class="swap-arrow">&#10230;</span>
      <span>${esc(fmt(sheet.replacement_plate))}</span>
    </div>
    <div class="swap-caption">Asıl Araç / Original &nbsp;&middot;&nbsp; Değişim Aracı / Replacement</div>
  </div>

  <!-- Info grid -->
  <div class="info-grid">

    <!-- LEFT: customer + original booking -->
    <div class="info-box">
      <div class="section-bar">
        KİRACI VE ASIL SÖZLEŞME / RENTER &amp; ORIGINAL
        <span class="bar-ar">المستأجر والعقد الأصلي</span>
      </div>
      <table class="info-table">
        ${infoRow('AD SOYAD', 'Full Name', 'الاسم الكامل', esc(fmt(fullName)))}
        ${infoRow('KİMLİK NO', 'ID Number', 'رقم الهوية', safe(cust.id_number))}
        ${infoRow('EHLİYET NO', 'License Number', 'رقم الرخصة', safe(cust.driving_license_number))}
        ${infoRow('UYRUK', 'Nationality', 'الجنسية', safe(cust.nationality))}
        ${infoRow('TELEFON', 'Phone', 'رقم الهاتف', safe(cust.phone))}
        ${infoRow('SÖZLEŞME NO', 'Contract No', 'رقم العقد الأصلي', safe(sheet.original_booking_number))}
        ${infoRow('ASIL PLAKA', 'Original Plate', 'لوحة السيارة الأصلية', safe(sheet.original_plate))}
        ${infoRow('ASIL MODEL', 'Original Model', 'موديل السيارة الأصلية', safe(sheet.original_model))}
      </table>
    </div>

    <!-- RIGHT: replacement vehicle -->
    <div class="info-box">
      <div class="section-bar">
        DEĞİŞİM ARACI / REPLACEMENT VEHICLE
        <span class="bar-ar">السيارة البديلة</span>
      </div>
      <table class="info-table">
        ${infoRow('PLAKA', 'Plate', 'رقم اللوحة', esc(fmt(sheet.replacement_plate)))}
        ${infoRow('MODEL', 'Model', 'موديل السيارة', safe(sheet.replacement_model))}
        ${infoRowPair(
          'TESLİM TARİHİ', 'Handover Date', 'تاريخ التسليم', esc(fmtDate(sheet.start_date)),
          'İADE TARİHİ',   'Return Date',   'تاريخ الإرجاع', esc(fmtDate(sheet.end_date))
        )}
        ${infoRowPair(
          'TESLİMDEKİ KM',    'KM at Handover',   'الكيلومتر عند التسليم', esc(fmtKm(sheet.km_at_handover)),
          'TESLİMDEKİ YAKIT', 'Fuel at Handover', 'الوقود عند التسليم',    esc(fmtFuel(sheet.fuel_at_handover))
        )}
        ${infoRow('NOT', 'Notes', 'ملاحظة', safe(sheet.notes))}
      </table>
    </div>

  </div><!-- /info-grid -->

  <!-- Acknowledgement -->
  <div class="ack-box">
    <div class="ack-line">
      İşbu tutanak ile kiracı, yukarıda bilgileri yer alan aracı, asıl kira sözleşmesi kapsamındaki aracının
      yerine <strong>geçici olarak</strong> teslim aldığını kabul ve beyan eder. Asıl sözleşme yürürlükte kalmaya devam eder.
    </div>
    <div class="ack-line">
      By this record the renter acknowledges having received the vehicle described above as a
      <strong>temporary substitute</strong> for the vehicle under the original rental contract. The original contract remains in force.
    </div>
    <div class="ack-line ack-ar">
      يُقر المستأجر بموجب هذا المحضر باستلامه السيارة الموضحة أعلاه <strong>بصفة مؤقتة</strong> بدلاً من سيارته المشمولة بعقد الإيجار الأصلي،
      ويبقى العقد الأصلي ساري المفعول.
    </div>
  </div>

  <!-- Terms -->
  <div class="terms-title">
    ŞARTLAR / TERMS &amp; CONDITIONS / الشروط والأحكام
  </div>

  <!-- Clause 1 — highlighted -->
  <div class="lead-clause">
    <div class="terms-cols">
      <div>
        <div class="clause-title">${lead.num}. ${esc(lead.titleTR)}</div>
        <div class="clause-body">${esc(lead.tr)}</div>
      </div>
      <div>
        <div class="clause-title">${lead.num}. ${esc(lead.titleEN)}</div>
        <div class="clause-body">${esc(lead.en)}</div>
      </div>
      <div class="terms-col-ar">
        <div class="clause-title">${lead.num}. ${esc(lead.titleAR)}</div>
        <div class="clause-body">${esc(lead.ar)}</div>
      </div>
    </div>
  </div>

  <!-- Clauses 2-4 -->
  <div class="terms-cols">
    <div>
      <div class="terms-col-header">Türkçe</div>
      ${restCol(c => ({ title: c.titleTR, body: c.tr }))}
    </div>
    <div>
      <div class="terms-col-header">English</div>
      ${restCol(c => ({ title: c.titleEN, body: c.en }))}
    </div>
    <div class="terms-col-ar">
      <div class="terms-col-header ar-col">العربية</div>
      ${restCol(c => ({ title: c.titleAR, body: c.ar }))}
    </div>
  </div>

  <!-- Signatures -->
  <div class="sig-section">
    <div class="sig-grid">
      <div class="sig-box">
        <div class="sig-title">KİRACI İMZASI / RENTER SIGNATURE</div>
        <div class="sig-title-ar">توقيع المستأجر</div>
        <div class="sig-area"></div>
        <div class="sig-name">${esc(fmt(fullName))}</div>
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
    Bu tutanak asıl kira sözleşmesinin ekidir. / This record is an annex to the original rental contract. / هذا المحضر ملحق بعقد الإيجار الأصلي.
  </div>

</div>

</body>
</html>`;
}

// ─── Main export ──────────────────────────────────────────────────────────────

export async function printReplacementSheet(sheet: ReplacementSheet): Promise<void> {
  const { data } = await supabase
    .from('customers')
    .select('first_name, last_name, id_number, driving_license_number, nationality, phone')
    .eq('id', sheet.customer_id)
    .maybeSingle();

  // Non-fatal: fall back to the name we were handed so the sheet still prints.
  const nameParts = sheet.customer_name.split(' ');
  const cust: CustomerData = (data as CustomerData | null) ?? {
    first_name:             nameParts[0] ?? '',
    last_name:              nameParts.slice(1).join(' '),
    id_number:              null,
    driving_license_number: null,
    nationality:            null,
    phone:                  null,
  };

  const html = buildHTML(sheet, cust);

  const win = window.open('', '_blank', 'width=960,height=1150');
  if (!win) {
    alert('Pop-up blocked. Please allow pop-ups for this site and try again.');
    return;
  }
  win.document.open();
  win.document.write(html);
  win.document.close();
}
