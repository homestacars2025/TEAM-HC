import React, { useEffect, useState, useCallback } from 'react';
import ReactDOM from 'react-dom';
import PhoneInput from 'react-phone-input-2';
import 'react-phone-input-2/lib/style.css';
import { supabase } from '../lib/supabase';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Customer {
  id: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  nationality: string | null;
  id_type: string | null;
  id_number: string | null;
  driving_license: string | null;
  address: string | null;
  birth_date: string | null;
  notes: string | null;
}

interface CustomerBooking {
  id: number;
  booking_number: string;
  start_date: string;
  end_date: string;
  car_id: number;
  status: string | null;
  insurance_type: string | null;
  cars: { plate_number: string; model_group: { name: string } | { name: string }[] | null } | null;
}

interface InsightBooking {
  id: number;
  start_date: string;
  end_date: string;
  customer_id: string | null;
  customers: { first_name: string; last_name: string } | { first_name: string; last_name: string }[] | null;
}

interface BookingInsights {
  avgDays:       number;
  topCustomer:   { name: string; count: number } | null;
  longestRental: { name: string; days: number }  | null;
}

type EditForm = Omit<Customer, 'id'>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return '—';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d;
}

function statusStyle(status: string | null): { color: string; bg: string } {
  switch (status) {
    case 'confirmed': return { color: '#2563eb', bg: 'rgba(37,99,235,0.08)' };
    case 'completed': return { color: '#16a34a', bg: 'rgba(34,197,94,0.08)' };
    case 'cancelled': return { color: '#dc2626', bg: 'rgba(239,68,68,0.08)' };
    case 'pending':   return { color: '#d97706', bg: 'rgba(217,119,6,0.08)' };
    default:          return { color: '#6b7280', bg: 'rgba(107,114,128,0.08)' };
  }
}

// Maps nationality adjectives (lowercase) → ISO 3166-1 alpha-2 code.
// Flag emoji is then derived programmatically — no library needed.


function initials(c: Customer): string {
  return `${c.first_name.charAt(0)}${c.last_name.charAt(0)}`.toUpperCase();
}

// ─── Edit Customer Modal ───────────────────────────────────────────────────────

const EditCustomerModal: React.FC<{
  customer: Customer;
  onClose:  () => void;
  onSaved:  (updated: Customer) => void;
}> = ({ customer, onClose, onSaved }) => {
  const [form,   setForm]   = useState<EditForm>({
    first_name:      customer.first_name,
    last_name:       customer.last_name,
    phone:           customer.phone ? customer.phone.replace(/^\+/, '') : '',
    nationality:     customer.nationality     ?? '',
    id_type:         customer.id_type         ?? '',
    id_number:       customer.id_number       ?? '',
    driving_license: customer.driving_license ?? '',
    address:         customer.address         ?? '',
    birth_date:      customer.birth_date      ?? '',
    notes:           customer.notes           ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = (k: keyof EditForm, v: string) => setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    if (!form.first_name.trim()) { setError('First name is required.'); return; }
    setSaving(true);
    setError(null);
    const { data, error: err } = await supabase
      .from('customers')
      .update({
        first_name:      form.first_name.trim(),
        last_name:       form.last_name.trim(),
        phone:           form.phone ? `+${form.phone}` : null,
        nationality:     form.nationality?.trim()     || null,
        id_type:         form.id_type?.trim()         || null,
        id_number:       form.id_number?.trim()       || null,
        driving_license: form.driving_license?.trim() || null,
        address:         form.address?.trim()         || null,
        birth_date:      form.birth_date             || null,
        notes:           form.notes?.trim()           || null,
      })
      .eq('id', customer.id)
      .select()
      .single();
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved(data as Customer);
    onClose();
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 13,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    fontFamily: 'inherit', color: '#0f1117', background: '#fff',
    boxSizing: 'border-box', transition: 'border-color 140ms ease',
  };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5, display: 'block',
  };
  const g2: React.CSSProperties = { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 };
  const focusBlue = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    { (e.target as HTMLElement).style.borderColor = '#4ba6ea'; };
  const blurGray  = (e: React.FocusEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    { (e.target as HTMLElement).style.borderColor = '#e5e7eb'; };

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 560, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column', animation: 'slideUp 200ms ease' }}>

        {/* Header */}
        <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117' }}>Edit Customer</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{customer.first_name} {customer.last_name}</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>

          <div style={g2}>
            <div>
              <label style={lbl}>First Name</label>
              <input value={form.first_name} onChange={e => set('first_name', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
            <div>
              <label style={lbl}>Last Name</label>
              <input value={form.last_name}  onChange={e => set('last_name',  e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
          </div>

          <div style={g2}>
            <div>
              <label style={lbl}>Phone</label>
              <PhoneInput
                country="tr"
                value={form.phone ?? ''}
                onChange={v => setForm(prev => ({ ...prev, phone: v }))}
                containerClass="hc-phone-input"
                inputStyle={{ width: '100%', border: 'none', outline: 'none', fontSize: 13, color: '#0f1117', background: 'transparent', fontFamily: 'inherit', height: 38, padding: '0 12px 0 48px' }}
                buttonStyle={{ border: 'none', background: 'transparent', borderRight: '1px solid #f0f0f0' }}
              />
            </div>
            <div>
              <label style={lbl}>Nationality</label>
              <input value={form.nationality ?? ''} onChange={e => set('nationality', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
          </div>

          <div style={g2}>
            <div>
              <label style={lbl}>ID Type</label>
              <input value={form.id_type ?? ''}   onChange={e => set('id_type',   e.target.value)} placeholder="Passport, National ID…" style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
            <div>
              <label style={lbl}>ID Number</label>
              <input value={form.id_number ?? ''} onChange={e => set('id_number', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
          </div>

          <div style={g2}>
            <div>
              <label style={lbl}>Driving License</label>
              <input value={form.driving_license ?? ''} onChange={e => set('driving_license', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
            <div>
              <label style={lbl}>Birth Date</label>
              <input type="date" value={form.birth_date ?? ''} onChange={e => set('birth_date', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
          </div>

          <div>
            <label style={lbl}>Address</label>
            <input value={form.address ?? ''} onChange={e => set('address', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
          </div>

          <div>
            <label style={lbl}>Notes</label>
            <textarea value={form.notes ?? ''} onChange={e => set('notes', e.target.value)} rows={3}
              style={{ ...inp, resize: 'vertical', minHeight: 72 }}
              onFocus={focusBlue} onBlur={blurGray} />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: saving ? '#d1d5db' : '#4ba6ea', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving…' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Customer Detail View ─────────────────────────────────────────────────────

const CustomerDetailView: React.FC<{
  customer:  Customer;
  onBack:    () => void;
  onUpdated: (c: Customer) => void;
}> = ({ customer, onBack, onUpdated }) => {
  const [cust,     setCust]     = useState<Customer>(customer);
  const [bookings, setBookings] = useState<CustomerBooking[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [editOpen, setEditOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    supabase
      .from('bookings')
      .select('id, booking_number, start_date, end_date, car_id, status, insurance_type, cars(plate_number, model_group(name))')
      .eq('customer_id', cust.id)
      .order('start_date', { ascending: false })
      .then(({ data, error }) => {
        if (error) console.error('[Customers] bookings fetch error:', error);
        setBookings((data ?? []) as unknown as CustomerBooking[]);
        setLoading(false);
      });
  }, [cust.id]);

  const th: React.CSSProperties = {
    padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'left',
    borderBottom: '1.5px solid #f0f0f0', whiteSpace: 'nowrap', background: '#fafafa',
  };
  const td: React.CSSProperties = { padding: '12px 16px', fontSize: 13, color: '#374151', borderBottom: '1px solid #f7f7f7' };

  const InfoField: React.FC<{ label: string; value: string | null }> = ({ label, value }) => (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 14, color: value ? '#0f1117' : '#d1d5db', fontWeight: value ? 500 : 400 }}>{value || '—'}</div>
    </div>
  );

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 32, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <button
            onClick={onBack}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back
          </button>
          <div style={{ width: 1, height: 24, background: '#e5e7eb', flexShrink: 0 }} />
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, #4ba6ea 0%, #2e8fd4 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
              {initials(cust)}
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 2 }}>Customer</div>
              <div style={{ fontSize: 22, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {cust.first_name} {cust.last_name}
              </div>
            </div>
          </div>
        </div>
        <button
          onClick={() => setEditOpen(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '10px 18px', borderRadius: 11, border: 'none', background: '#4ba6ea', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', boxShadow: '0 2px 10px rgba(75,166,234,0.3)', flexShrink: 0 }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Edit Customer
        </button>
      </div>

      {/* Info card */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', padding: '28px 32px', marginBottom: 28, boxShadow: '0 1px 6px rgba(0,0,0,0.04)' }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 22 }}>Customer Information</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 24 }}>
          <InfoField label="Phone"           value={cust.phone} />
          <InfoField label="Nationality"     value={cust.nationality} />
          <InfoField label="ID Type"         value={cust.id_type} />
          <InfoField label="ID Number"       value={cust.id_number} />
          <InfoField label="Driving License" value={cust.driving_license} />
          <InfoField label="Birth Date"      value={cust.birth_date ? fmtDate(cust.birth_date) : null} />
          <InfoField label="Address"         value={cust.address} />
        </div>
        {cust.notes && (
          <div style={{ marginTop: 22, paddingTop: 22, borderTop: '1px solid #f0f0f0' }}>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>Notes</div>
            <div style={{ fontSize: 13, color: '#374151', lineHeight: 1.65 }}>{cust.notes}</div>
          </div>
        )}
      </div>

      {/* Booking history */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: '0.8px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>Booking History</span>
          {!loading && (
            <span style={{ fontSize: 12, fontWeight: 600, padding: '3px 10px', borderRadius: 20, background: 'rgba(75,166,234,0.1)', color: '#4ba6ea', whiteSpace: 'nowrap' }}>
              {bookings.length} {bookings.length === 1 ? 'rental' : 'rentals'}
            </span>
          )}
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #e5e7eb 0%, transparent 80%)' }} />
        </div>

        <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f0f0f0', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#4ba6ea' }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
              </svg>
            </div>
          ) : bookings.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '48px 24px', color: '#9ca3af', fontSize: 13 }}>No bookings found for this customer.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 680 }}>
                <thead>
                  <tr>
                    {['Booking #', 'Car', 'Start Date', 'End Date', 'Insurance', 'Status'].map(h => (
                      <th key={h} style={th}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {bookings.map(b => {
                    const sc       = statusStyle(b.status);
                    const carRaw   = Array.isArray(b.cars) ? b.cars[0] : b.cars;
                    const mgRaw    = carRaw?.model_group;
                    const mg       = Array.isArray(mgRaw) ? mgRaw[0] : mgRaw;
                    const carLabel = carRaw ? `${carRaw.plate_number}${mg ? ` — ${mg.name}` : ''}` : `Car #${b.car_id}`;
                    return (
                      <tr key={b.id}>
                        <td style={{ ...td, fontWeight: 700, fontFamily: 'monospace', fontSize: 12, letterSpacing: '0.3px' }}>{b.booking_number}</td>
                        <td style={{ ...td, fontWeight: 500 }}>{carLabel}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(b.start_date)}</td>
                        <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(b.end_date)}</td>
                        <td style={{ ...td, color: '#6b7280' }}>{b.insurance_type ?? '—'}</td>
                        <td style={td}>
                          <span style={{ display: 'inline-block', padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: sc.color, background: sc.bg, textTransform: 'capitalize' }}>
                            {b.status ?? '—'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {editOpen && (
        <EditCustomerModal
          customer={cust}
          onClose={() => setEditOpen(false)}
          onSaved={updated => { setCust(updated); onUpdated(updated); }}
        />
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }

        .hc-phone-input.react-tel-input {
          border: 1.5px solid #e5e7eb;
          border-radius: 9px;
          overflow: hidden;
          transition: border-color 140ms ease;
          height: 40px;
        }
        .hc-phone-input.react-tel-input:focus-within {
          border-color: #4ba6ea;
        }
        .hc-phone-input.react-tel-input .form-control {
          width: 100%;
          height: 38px;
          border: none;
          font-size: 13px;
          font-family: inherit;
          color: #0f1117;
          background: transparent;
          padding-left: 52px;
        }
        .hc-phone-input.react-tel-input .flag-dropdown {
          border: none;
          border-right: 1px solid #f0f0f0;
          background: #fafafa;
          border-radius: 0;
        }
        .hc-phone-input.react-tel-input .selected-flag {
          padding: 0 8px 0 10px;
          border-radius: 0;
          background: transparent;
        }
        .hc-phone-input.react-tel-input .selected-flag:hover,
        .hc-phone-input.react-tel-input .selected-flag:focus,
        .hc-phone-input.react-tel-input .flag-dropdown.open .selected-flag {
          background: #f3f4f6;
        }
        .hc-phone-input.react-tel-input .country-list {
          border-radius: 10px;
          box-shadow: 0 8px 30px rgba(0,0,0,0.12);
          border: 1px solid #f0f0f0;
          font-size: 13px;
          font-family: inherit;
        }
        .hc-phone-input.react-tel-input .country-list .country.highlight,
        .hc-phone-input.react-tel-input .country-list .country:hover {
          background: rgba(75,166,234,0.07);
        }
      `}</style>
    </div>
  );
};

// ─── Customers Page (list view) ───────────────────────────────────────────────

const CustomersPage: React.FC = () => {
  const [customers,       setCustomers]       = useState<Customer[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [search,          setSearch]          = useState('');
  const [selected,        setSelected]        = useState<Customer | null>(null);
  const [editModal,       setEditModal]       = useState<Customer | null>(null);
  const [insights,        setInsights]        = useState<BookingInsights | null>(null);
  const [insightsLoading, setInsightsLoading] = useState(true);

  useEffect(() => {
    supabase
      .from('customers')
      .select('*')
      .order('first_name', { ascending: true })
      .then(({ data, error }) => {
        if (error) console.error('[Customers] fetch error:', error);
        setCustomers((data ?? []) as Customer[]);
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    supabase
      .from('bookings')
      .select('id, start_date, end_date, customer_id, customers(first_name, last_name)')
      .not('start_date', 'is', null)
      .not('end_date', 'is', null)
      .then(({ data, error }) => {
        if (error) { console.error('[Customers] insights fetch error:', error); setInsightsLoading(false); return; }
        const rows = (data ?? []) as unknown as InsightBooking[];

        const withDays = rows
          .map(b => {
            const days = Math.round((new Date(b.end_date).getTime() - new Date(b.start_date).getTime()) / 86400000);
            const custRaw = Array.isArray(b.customers) ? b.customers[0] : b.customers;
            const name = custRaw ? `${custRaw.first_name} ${custRaw.last_name}` : null;
            return { ...b, days, name };
          })
          .filter(b => b.days > 0 && b.customer_id);

        const avgDays = withDays.length > 0
          ? Math.round(withDays.reduce((s, b) => s + b.days, 0) / withDays.length)
          : 0;

        const countMap = new Map<string, { name: string; count: number }>();
        for (const b of withDays) {
          const key = b.customer_id!;
          const existing = countMap.get(key);
          if (existing) { existing.count++; }
          else { countMap.set(key, { name: b.name ?? 'Unknown', count: 1 }); }
        }
        const topCustomer = countMap.size > 0
          ? [...countMap.values()].sort((a, b) => b.count - a.count)[0]
          : null;

        const longestRental = withDays.length > 0
          ? (() => { const b = [...withDays].sort((a, z) => z.days - a.days)[0]; return { name: b.name ?? 'Unknown', days: b.days }; })()
          : null;

        setInsights({ avgDays, topCustomer, longestRental });
        setInsightsLoading(false);
      });
  }, []);

  const handleUpdated = useCallback((updated: Customer) => {
    setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
  }, []);

  if (selected) {
    return (
      <CustomerDetailView
        customer={selected}
        onBack={() => setSelected(null)}
        onUpdated={handleUpdated}
      />
    );
  }

  const filtered = customers.filter(c => {
    if (!search.trim()) return true;
    const q    = search.toLowerCase();
    const name = `${c.first_name} ${c.last_name}`.toLowerCase();
    return name.includes(q) || (c.phone ?? '').toLowerCase().includes(q);
  });

  const th: React.CSSProperties = {
    padding: '10px 16px', fontSize: 11, fontWeight: 700, color: '#9ca3af',
    textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'left',
    borderBottom: '1.5px solid #f0f0f0', whiteSpace: 'nowrap', background: '#fafafa',
  };
  const td: React.CSSProperties = { padding: '13px 16px', fontSize: 13, color: '#374151' };

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>

      {/* Page header */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Management</span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', marginBottom: 6, lineHeight: 1.1 }}>Customers</h1>
        <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>Browse customer profiles and full rental history.</p>
      </div>

      {/* Analytics cards */}
      {(() => {
        // Nationality breakdown — derived from already-fetched customers
        const natMap = new Map<string, number>();
        for (const c of customers) {
          const n = c.nationality?.trim() || null;
          if (n) natMap.set(n, (natMap.get(n) ?? 0) + 1);
        }
        const topNat     = [...natMap.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
        const maxNatCount = topNat[0]?.[1] ?? 1;
        const totalWithNat = [...natMap.values()].reduce((s, v) => s + v, 0);

        const cardStyle: React.CSSProperties = {
          background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0',
          boxShadow: '0 1px 6px rgba(0,0,0,0.04)', padding: '22px 24px',
        };
        const cardTitle: React.CSSProperties = {
          fontSize: 11, fontWeight: 700, color: '#374151',
          textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 18,
        };
        const Spinner = () => (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '20px 0' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#4ba6ea' }}>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
            </svg>
          </div>
        );

        return (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16, marginBottom: 28 }}>

            {/* Card 1 — Nationality Breakdown */}
            <div style={cardStyle}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
                <span style={cardTitle}>Customer Nationalities</span>
                {!loading && totalWithNat > 0 && (
                  <span style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af' }}>{totalWithNat} with nationality</span>
                )}
              </div>
              {loading ? <Spinner /> : topNat.length === 0 ? (
                <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No data yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 11 }}>
                  {topNat.map(([nat, count]) => {
                    const pct = Math.round((count / totalWithNat) * 100);
                    const barW = Math.round((count / maxNatCount) * 100);
                    return (
                      <div key={nat}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                          <span style={{ fontSize: 13, fontWeight: 500, color: '#0f1117' }}>{nat}</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{count}</span>
                            <span style={{ fontSize: 11, color: '#9ca3af', minWidth: 32, textAlign: 'right' }}>{pct}%</span>
                          </div>
                        </div>
                        <div style={{ height: 4, borderRadius: 99, background: '#f1f5f9', overflow: 'hidden' }}>
                          <div style={{ height: '100%', width: `${barW}%`, borderRadius: 99, background: 'linear-gradient(90deg, #4ba6ea 0%, #2e8fd4 100%)', transition: 'width 400ms ease' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Card 2 — Booking Insights */}
            <div style={cardStyle}>
              <div style={cardTitle}>Booking Insights</div>
              {insightsLoading ? <Spinner /> : !insights ? (
                <div style={{ fontSize: 13, color: '#9ca3af', textAlign: 'center', padding: '16px 0' }}>No data yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

                  {/* Avg duration */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f7f7f7' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(75,166,234,0.08)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="#4ba6ea" strokeWidth="1.8"/><path d="M12 7v5l3 3" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round"/></svg>
                      </div>
                      <span style={{ fontSize: 13, color: '#6b7280' }}>Avg. rental duration</span>
                    </div>
                    <span style={{ fontSize: 16, fontWeight: 700, color: '#0f1117' }}>{insights.avgDays} <span style={{ fontSize: 12, fontWeight: 500, color: '#9ca3af' }}>days</span></span>
                  </div>

                  {/* Most frequent customer */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0', borderBottom: '1px solid #f7f7f7' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(22,163,74,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="#16a34a" strokeWidth="1.8"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#16a34a" strokeWidth="1.8" strokeLinecap="round"/></svg>
                      </div>
                      <span style={{ fontSize: 13, color: '#6b7280' }}>Most frequent customer</span>
                    </div>
                    {insights.topCustomer ? (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1117' }}>{insights.topCustomer.name}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{insights.topCustomer.count} bookings</div>
                      </div>
                    ) : <span style={{ fontSize: 13, color: '#9ca3af' }}>—</span>}
                  </div>

                  {/* Longest rental */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <div style={{ width: 32, height: 32, borderRadius: 9, background: 'rgba(217,119,6,0.07)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="#d97706" strokeWidth="1.8" strokeLinecap="round"/><rect x="9" y="11" width="14" height="10" rx="2" stroke="#d97706" strokeWidth="1.8"/></svg>
                      </div>
                      <span style={{ fontSize: 13, color: '#6b7280' }}>Longest rental</span>
                    </div>
                    {insights.longestRental ? (
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1117' }}>{insights.longestRental.name}</div>
                        <div style={{ fontSize: 11, color: '#9ca3af' }}>{insights.longestRental.days} days</div>
                      </div>
                    ) : <span style={{ fontSize: 13, color: '#9ca3af' }}>—</span>}
                  </div>

                </div>
              )}
            </div>

          </div>
        );
      })()}

      {/* Search + count row */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, marginBottom: 20, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', maxWidth: 360, flex: 1 }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
            style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="2"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search by name or phone…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{ width: '100%', padding: '10px 12px 10px 36px', fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 10, outline: 'none', fontFamily: 'inherit', color: '#0f1117', background: '#fff', boxSizing: 'border-box', transition: 'border-color 140ms ease' }}
            onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
            onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
          />
        </div>
        {!loading && (
          <span style={{ fontSize: 13, color: '#9ca3af', whiteSpace: 'nowrap' }}>
            {filtered.length} {filtered.length === 1 ? 'customer' : 'customers'}
          </span>
        )}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#4ba6ea' }}>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
            </svg>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 24px', color: '#9ca3af', fontSize: 13 }}>
            {search ? 'No customers match your search.' : 'No customers found.'}
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
              <thead>
                <tr>
                  {['Full Name', 'Phone', 'Nationality', 'ID Number', 'Driving License', ''].map((h, i) => (
                    <th key={i} style={{ ...th, ...(i === 5 ? { width: 60, textAlign: 'right' } : {}) }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((c, i) => (
                  <tr
                    key={c.id}
                    onClick={() => setSelected(c)}
                    style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f7f7', cursor: 'pointer', transition: 'background 100ms ease' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLTableRowElement).style.background = '#f8faff'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLTableRowElement).style.background = ''; }}
                  >
                    <td style={{ ...td, fontWeight: 600 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, #4ba6ea 0%, #2e8fd4 100%)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: 12, fontWeight: 700, flexShrink: 0, letterSpacing: '0.5px' }}>
                          {initials(c)}
                        </div>
                        {c.first_name} {c.last_name}
                      </div>
                    </td>
                    <td style={{ ...td, color: '#6b7280' }}>{c.phone ?? '—'}</td>
                    <td style={td}>{c.nationality ?? '—'}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{c.id_number ?? '—'}</td>
                    <td style={{ ...td, fontFamily: 'monospace', fontSize: 12 }}>{c.driving_license ?? '—'}</td>
                    <td style={{ ...td, textAlign: 'right' }}>
                      <button
                        onClick={e => { e.stopPropagation(); setEditModal(c); }}
                        title="Edit customer"
                        style={{ width: 32, height: 32, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', transition: 'all 140ms ease' }}
                        onMouseEnter={e => { const b = e.currentTarget; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; b.style.background = 'rgba(75,166,234,0.06)'; }}
                        onMouseLeave={e => { const b = e.currentTarget; b.style.borderColor = '#e5e7eb'; b.style.color = '#6b7280'; b.style.background = '#fff'; }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                          <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editModal && (
        <EditCustomerModal
          customer={editModal}
          onClose={() => setEditModal(null)}
          onSaved={updated => {
            setCustomers(prev => prev.map(c => c.id === updated.id ? updated : c));
            setEditModal(null);
          }}
        />
      )}

      <style>{`
        @keyframes spin    { to { transform: rotate(360deg); } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
      `}</style>
    </div>
  );
};

export default CustomersPage;
