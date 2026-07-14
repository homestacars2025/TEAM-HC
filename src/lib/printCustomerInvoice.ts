import { supabase } from './supabase';

/* ────────────────────────────────────────────────────────────────────────────
   printCustomerInvoice — replicates the ADMIN dashboard customer invoice
   pixel-for-pixel. The HTML template is intentionally kept verbatim; do not
   restyle it or the two dashboards will drift apart.

   SIGN CONVENTION (matches ADMIN, opposite of the Customers page balance):
     totalCharged = totalOut   (sum of OUT amounts)
     totalPaid    = totalIn     (sum of IN amounts)
     balance      = totalCharged - totalPaid
──────────────────────────────────────────────────────────────────────────── */

export interface InvoiceEntry {
  created_at: string | null;
  type: string | null;
  description: string | null;
  direction: string | null;
  amount: number;
  car_id: number | null;
}

// Simple TRY formatter — symbol prepended, no space, absolute value.
const fmt = (n: number) =>
  '₺' + Math.abs(n).toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export async function printCustomerInvoice(
  customerId: string,
  entries: InvoiceEntry[],
  handlers: { onError: (message: string) => void },
): Promise<void> {
  // ── Customer ──────────────────────────────────────────────────────────────
  const { data: custData, error: custErr } = await supabase
    .from('customers')
    .select('first_name, last_name, nationality, id_number, phone')
    .eq('id', customerId)
    .maybeSingle();

  if (custErr || !custData) {
    handlers.onError('Could not load customer for the invoice');
    return;
  }

  // ── Vehicle (from the customer's most recent entry) ─────────────────────────
  // entries arrive in created_at DESC order, so the first with a car wins.
  const carId = entries.find(e => e.car_id != null)?.car_id ?? null;
  let car: { plate_number: string | null; model_name: string | null } | null = null;
  if (carId != null) {
    const { data: carData } = await supabase
      .from('cars')
      .select('plate_number, model_group:model_group_id(name)')
      .eq('id', carId)
      .maybeSingle();
    if (carData) {
      // The embed can come back as an object or an array — guard both.
      const mg = (carData as { model_group: { name: string } | { name: string }[] | null }).model_group;
      const model_name = Array.isArray(mg) ? (mg[0]?.name ?? null) : (mg?.name ?? null);
      car = { plate_number: (carData as { plate_number: string | null }).plate_number ?? null, model_name };
    }
  }

  const cust = {
    first_name: custData.first_name ?? '',
    last_name: custData.last_name ?? '',
    nationality: custData.nationality ?? null,
    id_number: custData.id_number ?? null,
    phone: custData.phone ?? null,
    entries,
  };

  // ── Totals (note the relabelling / sign convention above) ───────────────────
  const totalIn = entries.reduce((s, e) => s + (e.direction?.toUpperCase() === 'IN' ? e.amount : 0), 0);
  const totalOut = entries.reduce((s, e) => s + (e.direction?.toUpperCase() === 'OUT' ? e.amount : 0), 0);
  const totalCharged = totalOut;
  const totalPaid = totalIn;
  const balance = totalCharged - totalPaid;

  const invNum = `HC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
  const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

  const rows = entries.map(e => `
  <tr>
    <td>${(e.created_at ?? '').slice(0, 10)}</td>
    <td>${e.type ?? '—'}</td>
    <td style="color:#6b7280;max-width:200px">${e.description ?? '—'}</td>
    <td><span class="${e.direction?.toUpperCase() === 'IN' ? 'badge-in' : 'badge-out'}">${e.direction?.toUpperCase() === 'IN' ? '↓ IN' : '↑ OUT'}</span></td>
    <td>${fmt(e.amount)}</td>
  </tr>`).join('');

  const html = `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="UTF-8">
<title>Invoice ${invNum} — HomestaCars</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'SF Pro Display','Segoe UI',sans-serif;background:#f0f2f5;color:#0f1117;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .print-bar{text-align:center;padding:24px 0 16px;background:#f0f2f5}
  .print-btn{padding:11px 32px;background:#4ba6ea;color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;letter-spacing:.3px;box-shadow:0 4px 12px rgba(75,166,234,.35)}
  .print-btn:hover{background:#3a95d9}
  .page{max-width:800px;margin:0 auto 48px;background:#fff;border-radius:18px;overflow:hidden;box-shadow:0 12px 48px rgba(0,0,0,.10)}
  .hdr{background:linear-gradient(135deg,#0d1117 0%,#1c2a3a 100%);padding:40px 48px;display:flex;justify-content:space-between;align-items:flex-start}
  .brand-name{font-size:24px;font-weight:800;color:#fff;letter-spacing:-.5px}
  .brand-dot{color:#4ba6ea}
  .brand-tag{font-size:10px;color:rgba(255,255,255,.4);text-transform:uppercase;letter-spacing:2px;margin-top:5px}
  .inv-meta{text-align:right}
  .inv-label{font-size:10px;font-weight:700;color:#4ba6ea;text-transform:uppercase;letter-spacing:2px}
  .inv-number{font-size:28px;font-weight:800;color:#fff;margin-top:4px;letter-spacing:-.5px}
  .inv-date{font-size:12px;color:rgba(255,255,255,.45);margin-top:5px}
  .accent{height:3px;background:linear-gradient(90deg,#4ba6ea 0%,#93d2ff 100%)}
  .body{padding:40px 48px}
  .info-grid{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-bottom:36px}
  .info-section h4{font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:14px;padding-bottom:8px;border-bottom:1px solid #f0f0f0}
  .info-row{display:flex;justify-content:space-between;align-items:baseline;margin-bottom:9px;gap:12px}
  .info-key{font-size:11px;color:#9ca3af;white-space:nowrap}
  .info-val{font-size:12px;font-weight:600;color:#0f1117;text-align:right}
  .sec-title{font-size:9px;font-weight:800;color:#9ca3af;text-transform:uppercase;letter-spacing:1.5px;margin-bottom:12px;padding-bottom:8px;border-bottom:1px solid #f0f0f0}
  table{width:100%;border-collapse:collapse}
  th{padding:9px 12px;font-size:9px;font-weight:700;color:#9ca3af;text-transform:uppercase;letter-spacing:.8px;text-align:left;border-bottom:1.5px solid #f0f0f0}
  th:last-child{text-align:right}
  td{padding:11px 12px;font-size:12px;color:#374151;border-bottom:1px solid #f9f9f9;vertical-align:middle}
  td:last-child{text-align:right;font-weight:600;color:#0f1117}
  .badge-in{display:inline-block;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:800;color:#16a34a;background:rgba(34,197,94,.1)}
  .badge-out{display:inline-block;padding:2px 8px;border-radius:20px;font-size:9px;font-weight:800;color:#dc2626;background:rgba(239,68,68,.1)}
  .totals{margin-top:28px;display:flex;justify-content:flex-end}
  .totals-box{width:280px;background:#f8f9fb;border-radius:12px;padding:20px 24px}
  .t-row{display:flex;justify-content:space-between;align-items:center;padding:7px 0;font-size:13px;border-bottom:1px solid #eef0f2}
  .t-row:last-child{border-bottom:none;border-top:2px solid #e5e7eb;margin-top:8px;padding-top:12px}
  .t-lbl{color:#6b7280}
  .t-val{font-weight:600;color:#0f1117}
  .t-row.balance .t-lbl{font-weight:800;font-size:14px;color:#0f1117}
  .t-row.balance .t-val{font-weight:800;font-size:16px;color:#4ba6ea}
  .footer{padding:22px 48px;background:#f8f9fb;display:flex;justify-content:space-between;align-items:center;border-top:1px solid #f0f0f0}
  .footer-brand{font-size:14px;font-weight:800;color:#0f1117}
  .footer-info{font-size:11px;color:#9ca3af;line-height:1.9;text-align:right}
  @media print{body{background:#fff}.page{box-shadow:none;border-radius:0;margin:0;max-width:100%}.print-bar{display:none}}
</style>
</head>
<body>
<div class="print-bar"><button class="print-btn" onclick="window.print()">🖨&nbsp; Print Invoice</button></div>
<div class="page">
  <div class="hdr">
    <div>
      <div class="brand-name">Homesta<span class="brand-dot">Cars</span></div>
      <div class="brand-tag">Premium Car Rental · Istanbul</div>
    </div>
    <div class="inv-meta">
      <div class="inv-label">Invoice</div>
      <div class="inv-number">${invNum}</div>
      <div class="inv-date">Issued ${today}</div>
    </div>
  </div>
  <div class="accent"></div>
  <div class="body">
    <div class="info-grid">
      <div class="info-section">
        <h4>Billed To</h4>
        <div class="info-row"><span class="info-key">Full Name</span><span class="info-val">${`${cust.first_name} ${cust.last_name}`.trim()}</span></div>
        ${cust.nationality ? `<div class="info-row"><span class="info-key">Nationality</span><span class="info-val">${cust.nationality}</span></div>` : ''}
        ${cust.id_number   ? `<div class="info-row"><span class="info-key">ID / Passport</span><span class="info-val">${cust.id_number}</span></div>` : ''}
        ${cust.phone       ? `<div class="info-row"><span class="info-key">Phone</span><span class="info-val">${cust.phone}</span></div>` : ''}
      </div>
      <div class="info-section">
        <h4>Vehicle</h4>
        <div class="info-row"><span class="info-key">Plate Number</span><span class="info-val">${car?.plate_number ?? '—'}</span></div>
        <div class="info-row"><span class="info-key">Model</span><span class="info-val">${car?.model_name ?? '—'}</span></div>
        <div class="info-row"><span class="info-key">Transactions</span><span class="info-val">${cust.entries.length} item${cust.entries.length !== 1 ? 's' : ''}</span></div>
      </div>
    </div>
    <div class="sec-title">Transaction Details</div>
    <table>
      <thead><tr><th>Date</th><th>Type</th><th>Description</th><th>Direction</th><th>Amount</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="totals">
      <div class="totals-box">
        <div class="t-row"><span class="t-lbl">Total Charged</span><span class="t-val">${fmt(totalCharged)}</span></div>
        <div class="t-row"><span class="t-lbl">Total Paid</span><span class="t-val">${fmt(totalPaid)}</span></div>
        <div class="t-row balance"><span class="t-lbl">Balance Due</span><span class="t-val">${fmt(Math.abs(balance))}</span></div>
      </div>
    </div>
  </div>
  <div class="footer">
    <div class="footer-brand">HomestaCars</div>
    <div class="footer-info">
      Şişli &amp; Kayaşehir, Istanbul, Turkey<br>
      Premium Car Rental Since 2025<br>
      This document serves as an official invoice.
    </div>
  </div>
</div>
</body></html>`;

  const win = window.open('', '_blank', 'width=920,height=780');
  if (!win) {
    handlers.onError('Popup blocked — allow popups for this site to print the invoice');
    return;
  }
  win.document.write(html);
  win.document.close();
}
