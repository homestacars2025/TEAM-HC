import React, { useEffect, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCurrency } from '../lib/CurrencyContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FinancialTransaction {
  id: number;
  created_at: string;
  investor_id: number | null;
  month_key: string;
  sheet_type: string | null;
  car_id: number | null;
  category: string | null;
  amount: number;
  note: string | null;
  direction: string;
  date: string;
}

interface CustomerLedgerEntry {
  id: number;
  booking_id: number | null;
  customer_id: string | null;
  car_id: number | null;
  type: string | null;
  description: string | null;
  amount: number;
  direction: string;
  created_at: string;
  created_by: string | null;
  transaction_type: string | null;
  // joined via FK
  customers: {
    id: string;
    first_name: string;
    last_name: string;
    phone: string | null;
    nationality: string | null;
    id_number: string | null;
  } | null;
  bookings: {
    id: number;
    booking_number: string;
    start_date: string | null;
    end_date: string | null;
  } | null;
}

interface InvestorOption {
  id: string;
  display_name: string;
}

interface CarInfo {
  id: number;
  plate_number: string;
  model_name: string;
}

type PanelKey = 'company' | 'personal' | 'buy_sell' | `car:${number}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

function currentMonthKey() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel(key: string) {
  const [y, m] = key.split('-').map(Number);
  return `${MONTHS[m - 1]} ${y}`;
}

function moveMonth(key: string, delta: number) {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function fmtDate(d: string | null) {
  if (!d) return '—';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}.${p[1]}.${p[0]}` : d;
}

function sumTx(txs: FinancialTransaction[], filter: (t: FinancialTransaction) => boolean): number {
  return txs.filter(filter).reduce((a, t) => a + (t.amount ?? 0), 0);
}

// ─── Month Navigator ──────────────────────────────────────────────────────────

const MonthNavigator: React.FC<{ monthKey: string; onChange: (k: string) => void }> = ({ monthKey, onChange }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
    <button
      onClick={() => onChange(moveMonth(monthKey, -1))}
      style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
    <span style={{ fontSize: 14, fontWeight: 700, color: '#0f1117', minWidth: 120, textAlign: 'center' }}>{monthLabel(monthKey)}</span>
    <button
      onClick={() => onChange(moveMonth(monthKey, 1))}
      style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280' }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
    </button>
  </div>
);

// ─── Mini Stat Card ───────────────────────────────────────────────────────────

const MiniStatCard: React.FC<{
  title: string;
  amount: number;
  label: string;
  color: string;
  bg: string;
  loading?: boolean;
  onClick?: () => void;
}> = ({ title, amount, label, color, bg, loading, onClick }) => {
  const { fmt } = useCurrency();
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0',
        padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 160ms ease, box-shadow 160ms ease',
      }}
      onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.09)'; } }}
      onMouseLeave={e => { if (onClick) { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; } }}
    >
      <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 12 }}>{title}</div>
      {loading ? (
        <div style={{ height: 28, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 10 }} />
      ) : (
        <div style={{ fontSize: 22, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.5px', marginBottom: 10 }}>{fmt(amount)}</div>
      )}
      <span style={{ fontSize: 11, fontWeight: 600, color, background: bg, borderRadius: 20, padding: '2px 8px' }}>{label}</span>
    </div>
  );
};

// ─── Sheet Card (clickable, for All Sheets view) ───────────────────────────────

const SheetCard: React.FC<{
  title: string;
  subtitle?: string;
  count: number;
  balance: number;
  onClick: () => void;
}> = ({ title, subtitle, count, balance, onClick }) => {
  const { fmt } = useCurrency();
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0',
        padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
        cursor: 'pointer', transition: 'transform 160ms ease, box-shadow 160ms ease',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(-2px)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 6px 20px rgba(0,0,0,0.09)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'translateY(0)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; }}
    >
      <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1117', marginBottom: subtitle ? 2 : 10 }}>{title}</div>
      {subtitle && <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 10 }}>{subtitle}</div>}
      <div style={{ fontSize: 11, color: '#9ca3af', marginBottom: 6 }}>{count} records</div>
      <div style={{ fontSize: 20, fontWeight: 800, color: balance < 0 ? '#dc2626' : '#0f1117', letterSpacing: '-0.5px' }}>
        {balance < 0 ? '-' : ''}{fmt(balance)}
      </div>
    </div>
  );
};

// ─── Summary View ─────────────────────────────────────────────────────────────

const SummaryView: React.FC<{ txs: FinancialTransaction[]; loading: boolean; monthKey: string }> = ({ txs, loading, monthKey }) => {
  const { fmt } = useCurrency();
  const [carsMap, setCarsMap] = useState<Map<number, { plate: string; model: string }>>(new Map());

  useEffect(() => {
    let cancelled = false;
    supabase.from('cars').select('id, plate_number, model_group(name)').then(({ data }) => {
      if (cancelled || !data) return;
      const m = new Map<number, { plate: string; model: string }>();
      (data as any[]).forEach(c => {
        const mg = c.model_group;
        const model = Array.isArray(mg) ? (mg[0]?.name ?? '—') : ((mg as { name: string } | null)?.name ?? '—');
        m.set(c.id, { plate: c.plate_number, model });
      });
      setCarsMap(m);
    });
    return () => { cancelled = true; };
  }, []);

  // ── Calculations ──────────────────────────────────────────────────────────
  const income      = sumTx(txs, t => t.direction?.toLowerCase() === 'in');
  const expenses    = sumTx(txs, t => t.direction?.toLowerCase() === 'out');
  const rentIncome  = sumTx(txs, t => t.category === 'Rent Collection' && t.direction?.toLowerCase() === 'in');
  const net         = income - expenses;
  const commission  = sumTx(txs, t => t.category === 'Commission');

  const fuel        = sumTx(txs, t => t.category === 'Petrol'           && t.direction?.toLowerCase() === 'out');
  const oil         = sumTx(txs, t => t.category === 'Oil'              && t.direction?.toLowerCase() === 'out');
  const wash        = sumTx(txs, t => t.category === 'Wash'             && t.direction?.toLowerCase() === 'out');
  const maint       = sumTx(txs, t => t.category === 'Maintenance'      && t.direction?.toLowerCase() === 'out');
  const companyExp  = sumTx(txs, t => t.category === 'Company Expenses' && t.direction?.toLowerCase() === 'out');
  const personalExp = sumTx(txs, t => t.category === 'Personal'         && t.direction?.toLowerCase() === 'out');

  const expenseTotal = expenses;
  const other = Math.max(0, expenses - (fuel + oil + wash + maint));

  const expenseItems = [
    { label: 'Fuel',             value: fuel,        color: '#22c55e', bg: 'rgba(34,197,94,0.1)'   },
    { label: 'Oil',              value: oil,         color: '#eab308', bg: 'rgba(234,179,8,0.1)'   },
    { label: 'Washing',          value: wash,        color: '#3b82f6', bg: 'rgba(59,130,246,0.1)'  },
    { label: 'Maintenance',      value: maint,       color: '#64748b', bg: 'rgba(100,116,139,0.1)' },
    { label: 'Other',            value: other,       color: '#94a3b8', bg: 'rgba(148,163,184,0.1)' },
  ].filter(e => e.value > 0).sort((a, b) => {
    if (a.label === 'Other') return 1;
    if (b.label === 'Other') return -1;
    return b.value - a.value;
  });

  const carNetMap = new Map<number, number>();
  txs
    .filter(t => t.car_id != null)
    .forEach(t => {
      const delta = t.direction?.toUpperCase() === 'IN' ? (t.amount ?? 0) : -(t.amount ?? 0);
      carNetMap.set(t.car_id!, (carNetMap.get(t.car_id!) ?? 0) + delta);
    });
  const topCars = Array.from(carNetMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([carId, net]) => ({
      carId, amount: net,
      plate: carsMap.get(carId)?.plate ?? `#${carId}`,
      model: carsMap.get(carId)?.model ?? '—',
    }));
  const maxCarAmount = Math.max(...topCars.map(c => Math.abs(c.amount)), 1);

  const metrics = [
    {
      label: 'Cars Rental Income', value: rentIncome,
      color: '#22c55e', iconBg: 'rgba(34,197,94,0.08)',
      badge: 'Income', badgeColor: '#16a34a', badgeBg: 'rgba(34,197,94,0.1)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M5 17H3a1 1 0 01-1-1v-5l2.76-5.52A1 1 0 015.65 5h12.7a1 1 0 01.89.55L22 11v5a1 1 0 01-1 1h-2" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="7.5" cy="17.5" r="2.5" stroke="#22c55e" strokeWidth="1.8"/>
          <circle cx="16.5" cy="17.5" r="2.5" stroke="#22c55e" strokeWidth="1.8"/>
        </svg>
      ),
    },
    {
      label: 'Total Expenses', value: expenses,
      color: '#ef4444', iconBg: 'rgba(239,68,68,0.08)',
      badge: 'Expense', badgeColor: '#dc2626', badgeBg: 'rgba(239,68,68,0.1)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      label: 'Net Profit', value: net,
      color: net >= 0 ? '#22c55e' : '#ef4444',
      iconBg: net >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
      badge: net >= 0 ? 'Profit' : 'Loss',
      badgeColor: net >= 0 ? '#16a34a' : '#dc2626',
      badgeBg: net >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <polyline points="22 7 13.5 15.5 8.5 10.5 2 17" stroke={net >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <polyline points="16 7 22 7 22 13" stroke={net >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      label: 'Commission', value: commission,
      color: '#4ba6ea', iconBg: 'rgba(75,166,234,0.08)',
      badge: 'Revenue', badgeColor: '#0369a1', badgeBg: 'rgba(75,166,234,0.1)',
      icon: (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
          <rect x="2" y="5" width="20" height="14" rx="2" stroke="#4ba6ea" strokeWidth="1.8"/>
          <path d="M2 10h20" stroke="#4ba6ea" strokeWidth="1.8"/>
          <path d="M6 15h4M14 15h4" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Hero commission card (unchanged) ── */}
      {loading ? (
        <div style={{ height: 140, borderRadius: 16, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : (
        <div style={{ background: 'linear-gradient(135deg, #4ba6ea 0%, #2e8fd4 100%)', borderRadius: 16, padding: '28px 32px', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, opacity: 0.75, textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 8 }}>HomestaCars Commission · {monthLabel(monthKey)}</div>
            <div style={{ fontSize: 44, fontWeight: 800, letterSpacing: '-2px', lineHeight: 1 }}>{fmt(commission)}</div>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, textAlign: 'right' }}>
            <div>
              <div style={{ fontSize: 10, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Total Income</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(income)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Total Expenses</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(expenses)}</div>
            </div>
            <div>
              <div style={{ fontSize: 10, opacity: 0.7, textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 2 }}>Cars Rent Income</div>
              <div style={{ fontSize: 18, fontWeight: 700 }}>{fmt(rentIncome)}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Key Metrics Row ── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
        {metrics.map(m => (
          <div key={m.label} style={{
            background: '#fff', borderRadius: 14, border: '1px solid #f0f0f0',
            padding: '20px 22px', boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
            position: 'relative', overflow: 'hidden',
          }}>
            <div style={{
              position: 'absolute', top: 0, left: 0, right: 0, height: 3,
              background: `linear-gradient(90deg, ${m.color} 0%, ${m.color}00 100%)`,
              borderRadius: '14px 14px 0 0',
            }} />
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, marginTop: 4 }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', lineHeight: 1.35, paddingRight: 8 }}>{m.label}</div>
              <div style={{ width: 34, height: 34, borderRadius: 9, flexShrink: 0, background: m.iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {m.icon}
              </div>
            </div>
            {loading ? (
              <div style={{ height: 28, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 12 }} />
            ) : (
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.8px', marginBottom: 12 }}>{fmt(m.value)}</div>
            )}
            <span style={{ fontSize: 11, fontWeight: 600, color: m.badgeColor, background: m.badgeBg, borderRadius: 20, padding: '2px 9px' }}>{m.badge}</span>
          </div>
        ))}
      </div>

      {/* ── Expenses Breakdown + Top Earning Cars ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

        {/* Expenses Breakdown */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #f8f9fa' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1117' }}>Expenses Breakdown</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{monthLabel(monthKey)}</div>
          </div>
          <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {loading ? (
              [1, 2, 3, 4].map(i => (
                <div key={i} style={{ height: 32, borderRadius: 8, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
              ))
            ) : expenseItems.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#9ca3af', fontSize: 13 }}>No expense data this month.</div>
            ) : expenseItems.map(item => {
              const pct = expenseTotal > 0 ? (item.value / expenseTotal) * 100 : 0;
              return (
                <div key={item.label}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 7 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, fontWeight: 500, color: '#374151' }}>{item.label}</span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1117' }}>{fmt(item.value)}</span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: item.color, background: item.bg, borderRadius: 20, padding: '1px 7px', minWidth: 42, textAlign: 'center' }}>
                        {pct.toFixed(1)}%
                      </span>
                    </div>
                  </div>
                  <div style={{ height: 6, borderRadius: 99, background: '#f3f4f6', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      background: `linear-gradient(90deg, ${item.color} 0%, ${item.color}bb 100%)`,
                      width: `${pct}%`,
                      transition: 'width 500ms ease',
                    }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Earning Cars */}
        <div style={{ background: '#fff', borderRadius: 16, border: '1px solid #f0f0f0', boxShadow: '0 1px 6px rgba(0,0,0,0.04)', overflow: 'hidden' }}>
          <div style={{ padding: '20px 24px', borderBottom: '1px solid #f8f9fa' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#0f1117' }}>Top Earning Cars</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{monthLabel(monthKey)}</div>
          </div>
          <div style={{ padding: '8px 0' }}>
            {loading ? (
              [1, 2, 3, 4, 5].map(i => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 24px' }}>
                  <div style={{ width: 26, height: 26, borderRadius: 8, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', flexShrink: 0 }} />
                  <div style={{ flex: 1, height: 14, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                  <div style={{ width: 72, height: 14, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
                </div>
              ))
            ) : topCars.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '32px 24px', color: '#9ca3af', fontSize: 13 }}>No car transactions this month.</div>
            ) : topCars.map((car, idx) => (
              <div key={car.carId} style={{
                display: 'flex', alignItems: 'center', gap: 14, padding: '13px 24px',
                borderBottom: idx < topCars.length - 1 ? '1px solid #f8f9fa' : 'none',
              }}>
                <div style={{
                  width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                  background: idx === 0 ? 'rgba(234,179,8,0.12)' : idx === 1 ? 'rgba(148,163,184,0.12)' : idx === 2 ? 'rgba(180,120,80,0.1)' : '#f3f4f6',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 11, fontWeight: 800,
                  color: idx === 0 ? '#ca8a04' : idx === 1 ? '#64748b' : idx === 2 ? '#92400e' : '#9ca3af',
                }}>
                  {idx + 1}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1117', letterSpacing: '0.2px' }}>{car.plate}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{car.model}</div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5, minWidth: 100 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, letterSpacing: '-0.3px', color: car.amount >= 0 ? '#0f1117' : '#dc2626' }}>
                    {car.amount < 0 ? '-' : ''}{fmt(Math.abs(car.amount))}
                  </div>
                  <div style={{ width: 80, height: 4, borderRadius: 99, background: '#f3f4f6', overflow: 'hidden' }}>
                    <div style={{
                      height: '100%', borderRadius: 99,
                      background: car.amount >= 0
                        ? 'linear-gradient(90deg, #4ba6ea 0%, #2e8fd4 100%)'
                        : 'linear-gradient(90deg, #ef4444 0%, #dc2626 100%)',
                      width: `${(Math.abs(car.amount) / maxCarAmount) * 100}%`,
                    }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
};

// ─── Select Investor Modal ────────────────────────────────────────────────────

const SelectInvestorModal: React.FC<{
  investors: InvestorOption[];
  onSelect: (inv: InvestorOption) => void;
  onClose: () => void;
}> = ({ investors, onSelect, onClose }) => {
  const [selectedId, setSelectedId] = useState('');

  const handleConfirm = () => {
    const inv = investors.find(i => i.id === selectedId);
    if (inv) onSelect(inv);
  };

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 400, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease', overflow: 'hidden' }}>
        <div style={{ padding: '22px 24px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117' }}>Select Investor</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>
        <div style={{ padding: '20px 24px' }}>
          <select
            value={selectedId}
            onChange={e => setSelectedId(e.target.value)}
            style={{ width: '100%', padding: '10px 12px', fontSize: 14, border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none', color: '#0f1117', background: '#fff', fontFamily: 'inherit', marginBottom: 16, boxSizing: 'border-box' }}
          >
            <option value="">Select investor…</option>
            {investors.map(inv => <option key={inv.id} value={String(inv.id)}>{inv.display_name}</option>)}
          </select>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 14, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>
              Cancel
            </button>
            <button
              onClick={handleConfirm}
              disabled={!selectedId}
              style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: selectedId ? '#4ba6ea' : '#d1d5db', color: '#fff', fontSize: 14, fontWeight: 600, cursor: selectedId ? 'pointer' : 'not-allowed', fontFamily: 'inherit' }}
            >
              View Report
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Transaction Panel Modal ──────────────────────────────────────────────────

const TransactionPanelModal: React.FC<{
  title: string;
  transactions: FinancialTransaction[];
  loading: boolean;
  onClose: () => void;
  onRefresh: () => void;
}> = ({ title, transactions, loading, onClose, onRefresh }) => {
  const { fmt, symbol } = useCurrency();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState<{ date: string; direction: string; category: string; amount: string; note: string }>({ date: '', direction: 'out', category: '', amount: '', note: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const startEdit = (t: FinancialTransaction) => {
    setEditingId(t.id);
    setEditForm({ date: t.date ?? '', direction: t.direction ?? 'out', category: t.category ?? '', amount: String(t.amount ?? ''), note: t.note ?? '' });
    setConfirmDeleteId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    await supabase.from('financial_transactions').update({
      date:      editForm.date      || null,
      direction: editForm.direction,
      category:  editForm.category  || null,
      amount:    parseFloat(editForm.amount) || 0,
      note:      editForm.note      || null,
    }).eq('id', editingId);
    setSaving(false);
    setEditingId(null);
    onRefresh();
  };

  const handleDelete = async (id: number) => {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    await supabase.from('financial_transactions').delete().eq('id', id);
    setConfirmDeleteId(null);
    onRefresh();
  };

  const inBtn: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: 'none', background: '#4ba6ea', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' };
  const cancelBtn: React.CSSProperties = { padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' };
  const editInput: React.CSSProperties = { padding: '4px 8px', border: '1.5px solid #4ba6ea', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none' };

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 860, maxHeight: '85vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117' }}>{title}</div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ overflowY: 'auto', flex: 1 }}>
          {loading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#4ba6ea' }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
              </svg>
            </div>
          ) : transactions.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 24px', color: '#9ca3af', fontSize: 13 }}>No transactions found.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 660 }}>
                <thead>
                  <tr>
                    {['Date', 'Direction', 'Category', `Amount (${symbol})`, 'Description', 'Actions'].map(h => (
                      <th key={h} style={{ padding: '9px 14px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'left', borderBottom: '1.5px solid #f0f0f0', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t, i) => editingId === t.id ? (
                    <tr key={t.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f7f7', background: 'rgba(75,166,234,0.03)' }}>
                      <td style={{ padding: '8px 14px' }}>
                        <input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} style={{ ...editInput, width: 120 }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <select value={editForm.direction} onChange={e => setEditForm(f => ({ ...f, direction: e.target.value }))} style={{ ...editInput }}>
                          <option value="in">IN</option>
                          <option value="out">OUT</option>
                        </select>
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <input type="text" value={editForm.category} onChange={e => setEditForm(f => ({ ...f, category: e.target.value }))} style={{ ...editInput, width: 120 }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <input type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} style={{ ...editInput, width: 90 }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <input type="text" value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} style={{ ...editInput, width: '100%', boxSizing: 'border-box' }} />
                      </td>
                      <td style={{ padding: '8px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button onClick={handleSaveEdit} disabled={saving} style={inBtn}>{saving ? '…' : 'Save'}</button>
                          <button onClick={() => setEditingId(null)} style={cancelBtn}>Cancel</button>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    <tr key={t.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f7f7' }}>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>{t.date ?? '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        {t.direction?.toLowerCase() === 'in'
                          ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#16a34a', background: 'rgba(34,197,94,0.1)' }}>↓ IN</span>
                          : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#dc2626', background: 'rgba(239,68,68,0.1)' }}>↑ OUT</span>
                        }
                      </td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#374151' }}>{t.category ?? t.sheet_type ?? '—'}</td>
                      <td style={{ padding: '10px 14px', fontSize: 13, fontWeight: 700, color: '#0f1117', whiteSpace: 'nowrap' }}>{fmt(t.amount)}</td>
                      <td style={{ padding: '10px 14px', fontSize: 12, color: '#6b7280', maxWidth: 200 }}>{t.note ?? '—'}</td>
                      <td style={{ padding: '10px 14px' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            onClick={() => startEdit(t)}
                            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}
                            onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; }}
                            onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; }}
                          >
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          </button>
                          <button
                            onClick={() => handleDelete(t.id)}
                            style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${confirmDeleteId === t.id ? '#ef4444' : '#e5e7eb'}`, background: confirmDeleteId === t.id ? '#ef4444' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: confirmDeleteId === t.id ? '#fff' : '#9ca3af', transition: 'all 140ms ease' }}
                            onMouseEnter={e => { if (confirmDeleteId !== t.id) { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#ef4444'; b.style.color = '#ef4444'; } }}
                            onMouseLeave={e => { if (confirmDeleteId !== t.id) { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; } }}
                          >
                            {confirmDeleteId === t.id
                              ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                              : <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            }
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Investor Sheet View (transactions list for one sheet_type) ──────────────

const InvestorSheetView: React.FC<{
  investorId: string;
  sheetType: string;
  sheetLabel: string;
  monthKey: string;
  onBack: () => void;
}> = ({ investorId, sheetType, sheetLabel, monthKey, onBack }) => {
  const { fmt, symbol } = useCurrency();
  const [txs,             setTxs]             = useState<FinancialTransaction[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [editingId,       setEditingId]       = useState<number | null>(null);
  const [editForm,        setEditForm]        = useState({ date: '', direction: 'out', amount: '', note: '' });
  const [saving,          setSaving]          = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [showAdd,         setShowAdd]         = useState(false);
  const [addForm,         setAddForm]         = useState({ date: new Date().toISOString().slice(0, 10), direction: 'out', amount: '', note: '' });
  const [addSaving,       setAddSaving]       = useState(false);

  const fetchTxs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('financial_transactions')
      .select('*')
      .eq('investor_id', investorId)
      .eq('sheet_type', sheetType)
      .eq('month_key', monthKey)
      .order('date', { ascending: false });
    setTxs((data ?? []) as FinancialTransaction[]);
    setLoading(false);
  };

  useEffect(() => { fetchTxs(); }, [investorId, sheetType, monthKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const startEdit = (t: FinancialTransaction) => {
    setEditingId(t.id);
    setEditForm({ date: t.date ?? '', direction: t.direction ?? 'out', amount: String(t.amount ?? ''), note: t.note ?? '' });
    setConfirmDeleteId(null);
  };

  const handleSaveEdit = async () => {
    if (!editingId) return;
    setSaving(true);
    await supabase.from('financial_transactions').update({
      date:      editForm.date || null,
      direction: editForm.direction,
      amount:    parseFloat(editForm.amount) || 0,
      note:      editForm.note || null,
    }).eq('id', editingId);
    setSaving(false);
    setEditingId(null);
    fetchTxs();
  };

  const handleDelete = async (id: number) => {
    if (confirmDeleteId !== id) { setConfirmDeleteId(id); return; }
    await supabase.from('financial_transactions').delete().eq('id', id);
    setConfirmDeleteId(null);
    fetchTxs();
  };

  const handleAdd = async () => {
    if (!addForm.amount) return;
    setAddSaving(true);
    await supabase.from('financial_transactions').insert({
      investor_id: investorId,
      sheet_type:  sheetType,
      month_key:   monthKey,
      date:        addForm.date || null,
      direction:   addForm.direction,
      amount:      parseFloat(addForm.amount) || 0,
      note:        addForm.note || null,
    });
    setAddSaving(false);
    setShowAdd(false);
    setAddForm({ date: new Date().toISOString().slice(0, 10), direction: 'out', amount: '', note: '' });
    fetchTxs();
  };

  const backBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 9, border: '1px solid #e5e7eb',
    background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151',
    cursor: 'pointer', fontFamily: 'inherit',
  };
  const inp: React.CSSProperties = { padding: '5px 8px', border: '1.5px solid #4ba6ea', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none' };
  const th: React.CSSProperties = { padding: '9px 14px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'left', borderBottom: '1.5px solid #f0f0f0', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: '#374151' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={backBtnStyle}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f1117' }}>{sheetLabel}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{monthLabel(monthKey)}</div>
          </div>
        </div>
      </div>

      {/* Table */}
      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#4ba6ea' }}>
              <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
            </svg>
          </div>
        ) : txs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 24px', color: '#9ca3af', fontSize: 13 }}>No transactions found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr>
                  {['Date', 'Direction', `Amount (${symbol})`, 'Note', 'Actions'].map(h => (
                    <th key={h} style={th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {txs.map((t, i) => editingId === t.id ? (
                  <tr key={t.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f7f7', background: 'rgba(75,166,234,0.03)' }}>
                    <td style={td}><input type="date" value={editForm.date} onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))} style={{ ...inp, width: 130 }} /></td>
                    <td style={td}>
                      <select value={editForm.direction} onChange={e => setEditForm(f => ({ ...f, direction: e.target.value }))} style={inp}>
                        <option value="in">IN</option>
                        <option value="out">OUT</option>
                      </select>
                    </td>
                    <td style={td}><input type="number" value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} style={{ ...inp, width: 90 }} /></td>
                    <td style={td}><input type="text" value={editForm.note} onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))} style={{ ...inp, width: '100%', boxSizing: 'border-box' }} /></td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={handleSaveEdit} disabled={saving} style={{ padding: '4px 12px', borderRadius: 6, border: 'none', background: '#4ba6ea', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>{saving ? '…' : 'Save'}</button>
                        <button onClick={() => setEditingId(null)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f7f7' }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                    <td style={td}>
                      {t.direction?.toLowerCase() === 'in'
                        ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#16a34a', background: 'rgba(34,197,94,0.1)' }}>↓ IN</span>
                        : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#dc2626', background: 'rgba(239,68,68,0.1)' }}>↑ OUT</span>
                      }
                    </td>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap' }}>{fmt(Number(t.amount))}</td>
                    <td style={{ ...td, color: '#6b7280', maxWidth: 220 }}>{t.note ?? '—'}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => startEdit(t)}
                          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          style={{ width: 28, height: 28, borderRadius: 6, border: `1px solid ${confirmDeleteId === t.id ? '#ef4444' : '#e5e7eb'}`, background: confirmDeleteId === t.id ? '#ef4444' : '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: confirmDeleteId === t.id ? '#fff' : '#9ca3af', transition: 'all 140ms ease' }}
                          onMouseEnter={e => { if (confirmDeleteId !== t.id) { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#ef4444'; b.style.color = '#ef4444'; } }}
                          onMouseLeave={e => { if (confirmDeleteId !== t.id) { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; } }}
                        >
                          {confirmDeleteId === t.id
                            ? <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/></svg>
                            : <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                          }
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Edit Financial Transaction Modal ────────────────────────────────────────

const CAR_TX_CATEGORIES: Record<'IN' | 'OUT', string[]> = {
  IN:  ['Rent Collection', 'Commission', 'Other'],
  OUT: ['Petrol', 'Oil', 'Wash', 'Maintenance', 'Commission', 'Other'],
};

interface EditFinTxForm {
  date:      string;
  direction: 'IN' | 'OUT';
  category:  string;
  amount:    string;
  note:      string;
}

const EditFinancialTxModal: React.FC<{
  entry:   FinancialTransaction;
  onClose: () => void;
  onSaved: () => void;
}> = ({ entry, onClose, onSaved }) => {
  const { symbol } = useCurrency();
  const [form,   setForm]   = useState<EditFinTxForm>({
    date:      entry.date ?? '',
    direction: (entry.direction?.toUpperCase() === 'IN' ? 'IN' : 'OUT') as 'IN' | 'OUT',
    category:  entry.category ?? '',
    amount:    String(entry.amount ?? ''),
    note:      entry.note ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = <K extends keyof EditFinTxForm>(k: K, v: EditFinTxForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const categories = CAR_TX_CATEGORIES[form.direction];

  const handleSave = async () => {
    const amount = parseFloat(form.amount);
    if (!form.date || isNaN(amount) || amount <= 0) {
      setError('Date and a valid amount are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('financial_transactions')
      .update({
        date:      form.date,
        direction: form.direction,
        category:  form.category || null,
        amount,
        note:      form.note || null,
      })
      .eq('id', entry.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
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

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117' }}>Edit Transaction</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>ID #{entry.id}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Date + Direction */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <label style={lbl}>Date</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inp}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
            </div>
            <div>
              <label style={lbl}>Direction</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['IN', 'OUT'] as const).map(d => (
                  <button key={d} onClick={() => { set('direction', d); set('category', ''); }}
                    style={{ flex: 1, height: 38, borderRadius: 9, border: `1.5px solid ${form.direction === d ? (d === 'IN' ? '#22c55e' : '#ef4444') : '#e5e7eb'}`, background: form.direction === d ? (d === 'IN' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)') : '#fff', color: form.direction === d ? (d === 'IN' ? '#16a34a' : '#dc2626') : '#6b7280', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease' }}>
                    {d === 'IN' ? '↓ IN' : '↑ OUT'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Category */}
          <div>
            <label style={lbl}>Category</label>
            <select value={form.category} onChange={e => set('category', e.target.value)} style={inp}
              onFocus={e => { (e.target as HTMLSelectElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLSelectElement).style.borderColor = '#e5e7eb'; }}>
              <option value="">— Select —</option>
              {categories.map(c => <option key={c} value={c}>{c}</option>)}
              {form.category && !categories.includes(form.category) && (
                <option value={form.category}>{form.category}</option>
              )}
            </select>
          </div>

          {/* Amount */}
          <div>
            <label style={lbl}>Amount ({symbol})</label>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} style={inp}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
          </div>

          {/* Note */}
          <div>
            <label style={lbl}>Note</label>
            <input type="text" placeholder="Optional note…" value={form.note} onChange={e => set('note', e.target.value)} style={inp}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: saving ? '#d1d5db' : '#4ba6ea', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Investor Car Sheet View (transactions for one car) ──────────────────────

interface CarOption { id: number; plate_number: string; model_name: string; }

const InvestorCarSheetView: React.FC<{
  investorId: string;
  car: CarOption;
  monthKey: string;
  onBack: () => void;
}> = ({ investorId, car, monthKey, onBack }) => {
  const { fmt, symbol } = useCurrency();
  const [txs,       setTxs]       = useState<FinancialTransaction[]>([]);
  const [loading,   setLoading]   = useState(true);
  const [editModal, setEditModal] = useState<FinancialTransaction | null>(null);

  const fetchTxs = async () => {
    setLoading(true);
    const { data } = await supabase
      .from('financial_transactions')
      .select('*')
      .eq('investor_id', investorId)
      .eq('sheet_type', 'car')
      .eq('car_id', car.id)
      .eq('month_key', monthKey)
      .order('date', { ascending: false });
    setTxs((data ?? []) as FinancialTransaction[]);
    setLoading(false);
  };

  useEffect(() => { fetchTxs(); }, [investorId, car.id, monthKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleDelete = async (id: number) => {
    if (!window.confirm('Delete this transaction? This cannot be undone.')) return;
    await supabase.from('financial_transactions').delete().eq('id', id);
    fetchTxs();
  };

  const bBtn: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' };
  const inp: React.CSSProperties = { padding: '5px 8px', border: '1.5px solid #4ba6ea', borderRadius: 6, fontSize: 12, fontFamily: 'inherit', outline: 'none' };
  const th: React.CSSProperties = { padding: '9px 14px', fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: 'left', borderBottom: '1.5px solid #f0f0f0', whiteSpace: 'nowrap' };
  const td: React.CSSProperties = { padding: '10px 14px', fontSize: 13, color: '#374151' };

  const total = txs.reduce((sum, t) => t.direction?.toLowerCase() === 'in' ? sum + Number(t.amount) : sum - Number(t.amount), 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button onClick={onBack} style={bBtn}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            Back
          </button>
          <div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0f1117' }}>{car.plate_number}</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{car.model_name} · {monthLabel(monthKey)}</div>
            {!loading && txs.length > 0 && (
              <div style={{ fontSize: 15, fontWeight: 700, color: total >= 0 ? '#16a34a' : '#dc2626', marginTop: 4 }}>
                {total >= 0 ? '+' : '-'}{fmt(total)}
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#4ba6ea' }}><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/></svg>
          </div>
        ) : txs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '40px 24px', color: '#9ca3af', fontSize: 13 }}>No transactions found.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 560 }}>
              <thead>
                <tr>{['Date', 'Direction', 'Category', `Amount (${symbol})`, 'Note', 'Actions'].map(h => <th key={h} style={th}>{h}</th>)}</tr>
              </thead>
              <tbody>
                {txs.map((t, i) => (
                  <tr key={t.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f7f7' }}>
                    <td style={{ ...td, whiteSpace: 'nowrap' }}>{fmtDate(t.date)}</td>
                    <td style={td}>{t.direction?.toUpperCase() === 'IN' ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#16a34a', background: 'rgba(34,197,94,0.1)' }}>↓ IN</span> : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700, color: '#dc2626', background: 'rgba(239,68,68,0.1)' }}>↑ OUT</span>}</td>
                    <td style={{ ...td, color: '#6b7280' }}>{t.category ?? '—'}</td>
                    <td style={{ ...td, fontWeight: 700, whiteSpace: 'nowrap', color: t.direction?.toUpperCase() === 'IN' ? '#16a34a' : '#dc2626' }}>{fmt(Number(t.amount))}</td>
                    <td style={{ ...td, color: '#6b7280', maxWidth: 180 }}>{t.note ?? '—'}</td>
                    <td style={td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => setEditModal(t)}
                          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                        <button
                          onClick={() => handleDelete(t.id)}
                          style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', transition: 'all 140ms ease' }}
                          onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#ef4444'; b.style.color = '#ef4444'; }}
                          onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; }}
                        >
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {editModal && (
        <EditFinancialTxModal
          entry={editModal}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); fetchTxs(); }}
        />
      )}
    </div>
  );
};

// ─── Investor Car List View (grid of cars for this investor) ──────────────────

const InvestorCarListView: React.FC<{
  investorId: string;
  monthKey: string;
  txs: FinancialTransaction[];
  onBack: () => void;
}> = ({ investorId, monthKey, txs, onBack }) => {
  const { fmt } = useCurrency();
  const [cars,        setCars]        = useState<CarOption[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [selectedCar, setSelectedCar] = useState<CarOption | null>(null);

  useEffect(() => {
    supabase
      .from('cars')
      .select('id, plate_number, model_group:model_group_id(name)')
      .eq('investor_id', investorId)
      .then(({ data }) => {
        const raw = (data ?? []) as unknown as { id: number; plate_number: string; model_group: { name: string } | null }[];
        setCars(raw.map(c => ({ id: c.id, plate_number: c.plate_number, model_name: c.model_group?.name ?? '—' })));
        setCarsLoading(false);
      });
  }, [investorId]);

  if (selectedCar) {
    return <InvestorCarSheetView investorId={investorId} car={selectedCar} monthKey={monthKey} onBack={() => setSelectedCar(null)} />;
  }

  const carTxs = txs.filter(t => t.sheet_type === 'car');

  // Pre-compute per-car stats and sort: active first
  const carsWithStats = cars
    .map(car => ({
      car,
      total: carTxs.filter(t => t.car_id === car.id).reduce((s, t) => t.direction?.toUpperCase() === 'IN' ? s + Number(t.amount) : s - Number(t.amount), 0),
      count: carTxs.filter(t => t.car_id === car.id).length,
    }))
    .sort((a, b) => b.count - a.count);

  // Summary bar totals
  const totalIncome   = carsWithStats.reduce((s, c) => s + c.total, 0);
  const activeCars    = carsWithStats.filter(c => c.count > 0).length;
  const totalRecords  = carsWithStats.reduce((s, c) => s + c.count, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          onClick={onBack}
          style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M19 12H5M12 19l-7-7 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
          Back
        </button>
        <div>
          <div style={{ fontSize: 22, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.4px' }}>Cars Rental Income</div>
          <div style={{ fontSize: 13, color: '#9ca3af', marginTop: 3 }}>{monthLabel(monthKey)}</div>
        </div>
      </div>

      {/* Summary bar */}
      {!carsLoading && cars.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {[
            { label: 'Total Income',   value: fmt(totalIncome),      mono: true  },
            { label: 'Active Cars',    value: String(activeCars),    mono: false },
            { label: 'Total Records',  value: String(totalRecords),  mono: false },
          ].map(stat => (
            <div key={stat.label} style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', padding: '18px 20px', boxShadow: '0 1px 4px rgba(0,0,0,0.04)' }}>
              <div style={{ fontSize: 24, fontWeight: 800, color: '#0f1117', letterSpacing: stat.mono ? '-0.5px' : '-0.3px', marginBottom: 6 }}>{stat.value}</div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.6px' }}>{stat.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Cars grid */}
      {carsLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', padding: '20px', height: 140, animation: 'pulse 1.5s ease-in-out infinite' }} />
          ))}
        </div>
      ) : cars.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', padding: '40px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
          No cars found for this investor.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 16 }}>
          {carsWithStats.map(({ car, total, count }) => {
            const active    = count > 0;
            const negative  = active && total < 0;
            const accentClr = !active ? '#9ca3af' : negative ? '#dc2626' : '#16a34a';
            const accentBg  = !active ? 'rgba(156,163,175,0.1)' : negative ? 'rgba(239,68,68,0.1)' : 'rgba(34,197,94,0.1)';
            const iconColor = accentClr;
            const iconBg    = accentBg;
            const borderLeft = `4px solid ${!active ? '#e5e7eb' : negative ? '#dc2626' : '#16a34a'}`;
            return (
              <div
                key={car.id}
                onClick={() => setSelectedCar(car)}
                style={{
                  background: '#fff', borderRadius: 12,
                  border: '1px solid #f0f0f0', borderLeft,
                  padding: '20px', boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
                  cursor: 'pointer', opacity: active ? 1 : 0.7,
                  transition: 'transform 160ms ease, box-shadow 160ms ease',
                }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1.02)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.transform = 'scale(1)'; (e.currentTarget as HTMLDivElement).style.boxShadow = '0 1px 4px rgba(0,0,0,0.05)'; }}
              >
                {/* Icon */}
                <div style={{ width: 38, height: 38, borderRadius: '50%', background: iconBg, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 14 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke={iconColor} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><rect x="9" y="11" width="14" height="10" rx="2" stroke={iconColor} strokeWidth="1.8"/><circle cx="12" cy="16" r="1.2" fill={iconColor}/><circle cx="20" cy="16" r="1.2" fill={iconColor}/></svg>
                </div>
                {/* Plate */}
                <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117', marginBottom: 3, letterSpacing: '0.2px' }}>{car.plate_number}</div>
                {/* Model */}
                <div style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>{car.model_name}</div>
                {/* Amount */}
                <div style={{ fontSize: 18, fontWeight: 700, color: accentClr, letterSpacing: '-0.3px', marginBottom: 10 }}>{fmt(total)}</div>
                {/* Records badge */}
                <span style={{
                  display: 'inline-block', fontSize: 11, fontWeight: 600,
                  padding: '3px 10px', borderRadius: 20,
                  color: active ? '#2563eb' : '#9ca3af',
                  background: active ? 'rgba(37,99,235,0.08)' : 'rgba(156,163,175,0.1)',
                }}>
                  {count} record{count !== 1 ? 's' : ''}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// ─── Investor Summary View (self-contained: fetches, back button, month nav) ──

const InvestorSummaryView: React.FC<{
  investorId: string;
  onBack: () => void;
  hideBackButton?: boolean;
}> = ({ investorId, onBack, hideBackButton = false }) => {
  const { fmt } = useCurrency();
  const [monthKey,        setMonthKey]        = useState(currentMonthKey());
  const [txs,             setTxs]             = useState<FinancialTransaction[]>([]);
  const [loading,         setLoading]         = useState(true);
  const [sheetView,       setSheetView]       = useState<{ type: string; label: string } | null>(null);
  const [showCarsList,    setShowCarsList]    = useState(false);
  const [carCount,        setCarCount]        = useState<number | null>(null);
  const [commissionRate,  setCommissionRate]  = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([
      supabase.from('financial_transactions').select('*').eq('investor_id', investorId).eq('month_key', monthKey),
      supabase.from('cars').select('id', { count: 'exact', head: true }).eq('investor_id', investorId),
      supabase.from('investors').select('commission_rate').eq('id', investorId).single(),
    ]).then(([txRes, carsRes, invRes]) => {
      if (cancelled) return;
      setTxs((txRes.data ?? []) as FinancialTransaction[]);
      setCarCount(carsRes.count ?? 0);
      setCommissionRate((invRes.data as { commission_rate: number | null } | null)?.commission_rate ?? null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [investorId, monthKey]);

  const sumBy = (type: string) =>
    txs.filter(t => t.sheet_type === type).reduce((sum, t) =>
      t.direction?.toUpperCase() === 'IN' ? sum + Number(t.amount) : sum - Number(t.amount), 0);

  const carsRentalIncome = sumBy('car');
  const companyExpenses  = sumBy('company_expenses');
  const personalExpenses = sumBy('personal_expenses');
  const buySell          = sumBy('buy_sell');

  const netProfit = carsRentalIncome + buySell;

  const fuelTotal = Math.abs(txs
    .filter(t => t.category === 'Petrol')
    .reduce((sum, t) => t.direction?.toUpperCase() === 'IN' ? sum + Number(t.amount) : sum - Number(t.amount), 0));

  const oilTotal = Math.abs(txs
    .filter(t => t.category === 'Oil')
    .reduce((sum, t) => t.direction?.toUpperCase() === 'IN' ? sum + Number(t.amount) : sum - Number(t.amount), 0));

  const washTotal = Math.abs(txs
    .filter(t => t.category === 'Wash')
    .reduce((sum, t) => t.direction?.toUpperCase() === 'IN' ? sum + Number(t.amount) : sum - Number(t.amount), 0));

  const maintenanceTotal = Math.abs(txs
    .filter(t => t.category === 'Maintenance')
    .reduce((sum, t) => t.direction?.toUpperCase() === 'IN' ? sum + Number(t.amount) : sum - Number(t.amount), 0));

  if (showCarsList) {
    return (
      <InvestorCarListView
        investorId={investorId}
        monthKey={monthKey}
        txs={txs}
        onBack={() => setShowCarsList(false)}
      />
    );
  }

  if (sheetView) {
    return (
      <InvestorSheetView
        investorId={investorId}
        sheetType={sheetView.type}
        sheetLabel={sheetView.label}
        monthKey={monthKey}
        onBack={() => setSheetView(null)}
      />
    );
  }

  const backBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6,
    padding: '7px 14px', borderRadius: 9, border: '1px solid #e5e7eb',
    background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151',
    cursor: 'pointer', fontFamily: 'inherit',
  };

  const heroBreakdown = [
    { label: 'Cars Rental Income', value: carsRentalIncome, positive: true },
    { label: 'Company Expenses',   value: companyExpenses,  positive: companyExpenses >= 0 },
    { label: 'Personal Expenses',  value: personalExpenses, positive: personalExpenses >= 0 },
  ];

  const summaryCards: Array<{ title: string; amount: number; customDisplay?: string; badge: string; badgeColor: string; badgeBg: string; accentColor: string; onClick?: () => void; icon: React.ReactNode }> = [
    {
      title: 'Cars Rental Income',
      amount: carsRentalIncome,
      badge: 'Income',
      badgeColor: '#16a34a',
      badgeBg: 'rgba(34,197,94,0.1)',
      accentColor: '#22c55e',
      onClick: () => setShowCarsList(true),
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M5 17H3a1 1 0 01-1-1v-5l2.76-5.52A1 1 0 015.65 5h12.7a1 1 0 01.89.55L22 11v5a1 1 0 01-1 1h-2" stroke="#22c55e" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="7.5" cy="17.5" r="2.5" stroke="#22c55e" strokeWidth="1.8"/>
          <circle cx="16.5" cy="17.5" r="2.5" stroke="#22c55e" strokeWidth="1.8"/>
        </svg>
      ),
    },
    {
      title: 'Company Expenses',
      amount: companyExpenses,
      badge: companyExpenses >= 0 ? 'Income' : 'Expense',
      badgeColor: companyExpenses >= 0 ? '#16a34a' : '#dc2626',
      badgeBg: companyExpenses >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
      accentColor: companyExpenses >= 0 ? '#22c55e' : '#ef4444',
      onClick: () => setSheetView({ type: 'company_expenses', label: 'Company Expenses' }),
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" stroke={companyExpenses >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M9 22V12h6v10" stroke={companyExpenses >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      title: 'Personal Expenses',
      amount: personalExpenses,
      badge: personalExpenses >= 0 ? 'Income' : 'Expense',
      badgeColor: personalExpenses >= 0 ? '#16a34a' : '#dc2626',
      badgeBg: personalExpenses >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
      accentColor: personalExpenses >= 0 ? '#22c55e' : '#ef4444',
      onClick: () => setSheetView({ type: 'personal_expenses', label: 'Personal Expenses' }),
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" stroke={personalExpenses >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <circle cx="12" cy="7" r="4" stroke={personalExpenses >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
    {
      title: 'Buy & Sell',
      amount: buySell,
      badge: buySell >= 0 ? 'Gain' : 'Loss',
      badgeColor: buySell >= 0 ? '#16a34a' : '#dc2626',
      badgeBg: buySell >= 0 ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)',
      accentColor: buySell >= 0 ? '#22c55e' : '#ef4444',
      onClick: () => setSheetView({ type: 'buy_sell', label: 'Buy & Sell' }),
      icon: (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M7 16V4M7 4L4 7M7 4l3 3M17 8v12M17 20l3-3M17 20l-3-3" stroke={buySell >= 0 ? '#22c55e' : '#ef4444'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
  ];

  const runningCostCards = [
    {
      title: 'Fuel',
      amount: fuelTotal,
      color: '#22c55e',
      iconBg: 'rgba(34,197,94,0.1)',
      badgeColor: '#16a34a',
      badgeBg: 'rgba(34,197,94,0.1)',
      icon: (c: string) => (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M3 22V8.5L7.5 4H14L18 8v2" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M3 13h11M14 22V8" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M18 10h1a2 2 0 012 2v5a1 1 0 01-1 1h-1" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      title: 'Oil',
      amount: oilTotal,
      color: '#eab308',
      iconBg: 'rgba(234,179,8,0.1)',
      badgeColor: '#ca8a04',
      badgeBg: 'rgba(234,179,8,0.1)',
      icon: (c: string) => (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M12 2C12 2 5 9.5 5 14a7 7 0 0014 0C19 9.5 12 2 12 2z" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          <path d="M9 15a3 3 0 003 3" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      title: 'Washing',
      amount: washTotal,
      color: '#3b82f6',
      iconBg: 'rgba(59,130,246,0.1)',
      badgeColor: '#2563eb',
      badgeBg: 'rgba(59,130,246,0.1)',
      icon: (c: string) => (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M5 12h14M5 12a7 7 0 0014 0M5 12a7 7 0 0114 0" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M12 5V3M8 6L7 4M16 6l1-4" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
          <path d="M5 19h14" stroke={c} strokeWidth="1.8" strokeLinecap="round"/>
        </svg>
      ),
    },
    {
      title: 'Maintenance',
      amount: maintenanceTotal,
      color: '#64748b',
      iconBg: 'rgba(100,116,139,0.1)',
      badgeColor: '#475569',
      badgeBg: 'rgba(100,116,139,0.1)',
      icon: (c: string) => (
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
          <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke={c} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ),
    },
  ];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 32 }}>

      {/* ── Header ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          {!hideBackButton && (
            <>
              <button onClick={onBack} style={backBtnStyle}>
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                  <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Back
              </button>
              <div style={{ width: 1, height: 22, background: '#e5e7eb', flexShrink: 0 }} />
            </>
          )}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 2 }}>
              Investor Report
            </div>
            <div style={{ fontSize: 18, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.4px', lineHeight: 1.1 }}>
              Financial Overview
            </div>
          </div>
        </div>
        <MonthNavigator monthKey={monthKey} onChange={setMonthKey} />
      </div>

      {/* ── Fleet info chips ── */}
      {!loading && (carCount !== null || commissionRate !== null) && (
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginTop: -16 }}>
          {carCount !== null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: 20, background: 'rgba(124,58,237,0.07)', border: '1px solid rgba(124,58,237,0.18)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 17H3a1 1 0 01-1-1v-5l2.76-5.52A1 1 0 015.65 5h12.7a1 1 0 01.89.55L22 11v5a1 1 0 01-1 1h-2" stroke="#7c3aed" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><circle cx="7.5" cy="17.5" r="2.5" stroke="#7c3aed" strokeWidth="2"/><circle cx="16.5" cy="17.5" r="2.5" stroke="#7c3aed" strokeWidth="2"/></svg>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#7c3aed' }}>{carCount} {carCount === 1 ? 'car' : 'cars'}</span>
            </div>
          )}
          {commissionRate !== null && (
            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 13px', borderRadius: 20, background: 'rgba(8,145,178,0.07)', border: '1px solid rgba(8,145,178,0.18)' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="#0891b2" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              <span style={{ fontSize: 12, fontWeight: 600, color: '#0891b2' }}>{commissionRate}% commission</span>
            </div>
          )}
        </div>
      )}

      {/* ── Hero card ── */}
      {loading ? (
        <div style={{ height: 184, borderRadius: 20, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
      ) : (
        <div style={{
          background: 'linear-gradient(135deg, #0f172a 0%, #1a2744 55%, #0f1f30 100%)',
          borderRadius: 20,
          padding: '36px 40px',
          color: '#fff',
          position: 'relative',
          overflow: 'hidden',
          boxShadow: netProfit >= 0
            ? '0 20px 60px rgba(22,163,74,0.18), 0 4px 20px rgba(0,0,0,0.28)'
            : '0 20px 60px rgba(220,38,38,0.18), 0 4px 20px rgba(0,0,0,0.28)',
          border: `1px solid ${netProfit >= 0 ? 'rgba(34,197,94,0.14)' : 'rgba(239,68,68,0.14)'}`,
        }}>
          {/* Radial glow — top right */}
          <div style={{
            position: 'absolute', top: -100, right: -80, width: 380, height: 380,
            borderRadius: '50%',
            background: netProfit >= 0 ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)',
            filter: 'blur(80px)', pointerEvents: 'none',
          }} />
          {/* Radial glow — bottom left */}
          <div style={{
            position: 'absolute', bottom: -80, left: 60, width: 240, height: 240,
            borderRadius: '50%',
            background: 'rgba(75,166,234,0.06)',
            filter: 'blur(60px)', pointerEvents: 'none',
          }} />

          <div style={{ position: 'relative', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 40 }}>

            {/* Left: net profit */}
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{
                  width: 7, height: 7, borderRadius: '50%', flexShrink: 0,
                  background: netProfit >= 0 ? '#22c55e' : '#ef4444',
                  boxShadow: `0 0 10px ${netProfit >= 0 ? 'rgba(34,197,94,0.9)' : 'rgba(239,68,68,0.9)'}`,
                }} />
                <span style={{ fontSize: 11, fontWeight: 600, letterSpacing: '1.2px', textTransform: 'uppercase', color: 'rgba(255,255,255,0.42)' }}>
                  Net {netProfit >= 0 ? 'Profit' : 'Loss'}
                </span>
              </div>
              <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: '-2.5px', lineHeight: 1, color: '#fff' }}>
                {netProfit < 0 ? '-' : ''}{fmt(netProfit)}
              </div>
              <div style={{ marginTop: 18 }}>
                <span style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  fontSize: 12, fontWeight: 600, padding: '5px 13px', borderRadius: 20,
                  background: netProfit >= 0 ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
                  color: netProfit >= 0 ? '#4ade80' : '#f87171',
                  border: `1px solid ${netProfit >= 0 ? 'rgba(34,197,94,0.28)' : 'rgba(239,68,68,0.28)'}`,
                }}>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="2"/>
                    <path d="M3 9h18M8 2v4M16 2v4" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  {monthLabel(monthKey)}
                </span>
              </div>
            </div>

            {/* Right: breakdown */}
            <div style={{ display: 'flex', flexDirection: 'column', minWidth: 250, alignSelf: 'center' }}>
              {heroBreakdown.map((item, i) => (
                <div key={item.label} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 20,
                  padding: '13px 0',
                  borderBottom: i < heroBreakdown.length - 1 ? '1px solid rgba(255,255,255,0.07)' : 'none',
                }}>
                  <span style={{ fontSize: 11, fontWeight: 500, color: 'rgba(255,255,255,0.38)', letterSpacing: '0.2px', whiteSpace: 'nowrap' }}>
                    {item.label}
                  </span>
                  <span style={{ fontSize: 17, fontWeight: 700, whiteSpace: 'nowrap', color: item.positive ? '#4ade80' : '#f87171' }}>
                    {'display' in item ? (item as { display: string }).display : fmt(item.value)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Summary ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: '0.8px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Summary
          </span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #e5e7eb 0%, transparent 80%)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {summaryCards.map(card => (
            <div
              key={card.title}
              onClick={card.onClick}
              style={{
                background: '#fff', borderRadius: 14, border: '1px solid #f0f0f0',
                padding: '20px 22px', cursor: card.onClick ? 'pointer' : 'default',
                boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
                transition: 'transform 160ms ease, box-shadow 160ms ease, border-color 160ms ease',
                position: 'relative', overflow: 'hidden',
              }}
              onMouseEnter={card.onClick ? e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = 'translateY(-3px)';
                el.style.boxShadow = '0 10px 28px rgba(0,0,0,0.09)';
                el.style.borderColor = card.accentColor + '35';
              } : undefined}
              onMouseLeave={card.onClick ? e => {
                const el = e.currentTarget as HTMLDivElement;
                el.style.transform = 'translateY(0)';
                el.style.boxShadow = '0 1px 6px rgba(0,0,0,0.04)';
                el.style.borderColor = '#f0f0f0';
              } : undefined}
            >
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${card.accentColor} 0%, ${card.accentColor}00 100%)`,
                borderRadius: '14px 14px 0 0',
              }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', lineHeight: 1.35, paddingRight: 8 }}>{card.title}</div>
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: card.badgeBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {card.icon}
                </div>
              </div>
              {loading ? (
                <div style={{ height: 28, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 12 }} />
              ) : (
                <div style={{ fontSize: 24, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.8px', marginBottom: 12 }}>
                  {'customDisplay' in card ? (card as { customDisplay: string }).customDisplay : fmt(card.amount)}
                </div>
              )}
              <span style={{ fontSize: 11, fontWeight: 600, color: card.badgeColor, background: card.badgeBg, borderRadius: 20, padding: '2px 9px' }}>
                {card.badge}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Vehicle Running Costs ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <span style={{ fontSize: 11, fontWeight: 700, color: '#374151', letterSpacing: '0.8px', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
            Vehicle Running Costs
          </span>
          <div style={{ flex: 1, height: 1, background: 'linear-gradient(90deg, #e5e7eb 0%, transparent 80%)' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 16 }}>
          {runningCostCards.map(card => (
            <div
              key={card.title}
              style={{
                background: '#fff', borderRadius: 14, border: '1px solid #f0f0f0',
                padding: '20px 22px',
                boxShadow: '0 1px 6px rgba(0,0,0,0.04)',
                position: 'relative', overflow: 'hidden',
              }}
            >
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: 3,
                background: `linear-gradient(90deg, ${card.color} 0%, ${card.color}00 100%)`,
                borderRadius: '14px 14px 0 0',
              }} />
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 14, marginTop: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#6b7280', paddingRight: 8 }}>{card.title}</div>
                <div style={{
                  width: 34, height: 34, borderRadius: 9, flexShrink: 0,
                  background: card.iconBg,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {card.icon(card.color)}
                </div>
              </div>
              {loading ? (
                <div style={{ height: 28, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 12 }} />
              ) : (
                <div style={{ fontSize: 24, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.8px', marginBottom: 12 }}>
                  {fmt(card.amount)}
                </div>
              )}
              <span style={{ fontSize: 11, fontWeight: 600, color: card.badgeColor, background: card.badgeBg, borderRadius: 20, padding: '2px 9px' }}>
                Expense
              </span>
            </div>
          ))}
        </div>
      </div>

    </div>
  );
};

// ─── Tab 1: Overview ──────────────────────────────────────────────────────────

const OverviewTab: React.FC = () => {
  const [monthKey, setMonthKey] = useState(currentMonthKey());
  const [txs, setTxs]           = useState<FinancialTransaction[]>([]);
  const [loading, setLoading]   = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    supabase.from('financial_transactions').select('*').eq('month_key', monthKey).then(({ data }) => {
      if (cancelled) return;
      setTxs((data ?? []) as FinancialTransaction[]);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [monthKey]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <MonthNavigator monthKey={monthKey} onChange={setMonthKey} />
      </div>
      <SummaryView txs={txs} loading={loading} monthKey={monthKey} />
    </div>
  );
};

// ─── Tab 2: Investor Sheets ───────────────────────────────────────────────────

const InvestorSheetsTab: React.FC<{ onViewReport: (id: string) => void }> = ({ onViewReport: _onViewReport }) => {
  const [investors,        setInvestors]        = useState<InvestorOption[]>([]);
  const [selectedInvestor, setSelectedInvestor] = useState<InvestorOption | null>(null);
  const [autoSelectDone,   setAutoSelectDone]   = useState(false);

  // Load investors + current-month txs in parallel, auto-select top earner
  useEffect(() => {
    let cancelled = false;
    const mk = currentMonthKey();
    Promise.all([
      supabase.from('investors').select('id, company_name, profiles!fk_investor_profile(full_name)'),
      supabase.from('financial_transactions').select('investor_id, amount, direction').eq('month_key', mk),
    ]).then(([invRes, txRes]) => {
      if (cancelled) return;
      const raw = (invRes.data ?? []) as unknown as { id: string; company_name: string | null; profiles: { full_name: string } | null }[];
      const invList: InvestorOption[] = raw.map(r => ({
        id:           String(r.id),
        display_name: r.company_name || r.profiles?.full_name || `Investor #${r.id}`,
      }));
      setInvestors(invList);

      const incomeMap = new Map<string, number>();
      (txRes.data ?? []).forEach((t: { investor_id: string | null; amount: number; direction: string | null }) => {
        if (!t.investor_id || t.direction?.toLowerCase() !== 'in') return;
        const id = String(t.investor_id);
        incomeMap.set(id, (incomeMap.get(id) ?? 0) + (t.amount ?? 0));
      });

      let topId: string | null = null;
      let topAmt = -1;
      incomeMap.forEach((amt, id) => { if (amt > topAmt) { topAmt = amt; topId = id; } });
      const autoSelect = invList.find(i => i.id === topId) ?? invList[0] ?? null;
      if (autoSelect) setSelectedInvestor(autoSelect);
      setAutoSelectDone(true);
    });
    return () => { cancelled = true; };
  }, []);

  if (!autoSelectDone) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', padding: 60 }}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#4ba6ea' }}>
          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
        </svg>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

      {/* ── Investor dropdown ── */}
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 6 }}>
          Investor
        </div>
        <div style={{ position: 'relative', display: 'inline-block' }}>
          <select
            value={selectedInvestor?.id ?? ''}
            onChange={e => {
              const inv = investors.find(i => i.id === e.target.value);
              if (inv) setSelectedInvestor(inv);
            }}
            style={{
              appearance: 'none', WebkitAppearance: 'none',
              padding: '10px 38px 10px 14px',
              fontSize: 15, fontWeight: 700, color: '#0f1117',
              background: '#fff', border: '1.5px solid #e5e7eb',
              borderRadius: 10, cursor: 'pointer', fontFamily: 'inherit',
              outline: 'none', minWidth: 240,
              boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
              transition: 'border-color 140ms ease',
            }}
            onFocus={e => { e.currentTarget.style.borderColor = '#4ba6ea'; }}
            onBlur={e => { e.currentTarget.style.borderColor = '#e5e7eb'; }}
          >
            {investors.map(inv => (
              <option key={inv.id} value={inv.id}>{inv.display_name}</option>
            ))}
          </select>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
            style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', color: '#6b7280' }}>
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* ── Full investor report rendered inline ── */}
      {selectedInvestor && (
        <InvestorSummaryView
          key={selectedInvestor.id}
          investorId={selectedInvestor.id}
          onBack={() => {}}
          hideBackButton
        />
      )}

    </div>
  );
};

// ─── Add Customer Transaction Modal ──────────────────────────────────────────

interface AddCustomerTxForm {
  date:             string;
  type:             string;
  description:      string;
  amount:           string;
  direction:        'in' | 'out';
  transaction_type: string;
}

const EMPTY_CUST_TX_FORM: AddCustomerTxForm = {
  date:             new Date().toISOString().slice(0, 10),
  type:             '',
  description:      '',
  amount:           '',
  direction:        'in',
  transaction_type: '',
};

const AddCustomerTxModal: React.FC<{
  customerName: string;
  customerId:   string;
  carId:        number;
  onClose:      () => void;
  onSaved:      () => void;
}> = ({ customerName, customerId, carId, onClose, onSaved }) => {
  const [form,   setForm]   = useState<AddCustomerTxForm>(EMPTY_CUST_TX_FORM);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = (k: keyof AddCustomerTxForm, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    const amount = parseFloat(form.amount);
    if (!form.date || isNaN(amount) || amount <= 0) {
      setError('Date and a valid amount are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('customer_accounting_ledger').insert({
      customer_id:      customerId,
      car_id:           carId,
      created_at:       form.date,
      type:             form.type             || null,
      description:      form.description      || null,
      amount,
      direction:        form.direction.toUpperCase(),
      transaction_type: form.transaction_type || null,
    });
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 13,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    fontFamily: 'inherit', color: '#0f1117', background: '#fff',
    boxSizing: 'border-box', transition: 'border-color 140ms ease',
  };

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117' }}>Add Transaction</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>{customerName}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Date + Direction row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</div>
              <input
                type="date"
                value={form.date}
                onChange={e => set('date', e.target.value)}
                style={inputStyle}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Direction</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['in', 'out'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => set('direction', d)}
                    style={{
                      flex: 1, height: 38, borderRadius: 9, border: `1.5px solid ${form.direction === d ? (d === 'in' ? '#22c55e' : '#ef4444') : '#e5e7eb'}`,
                      background: form.direction === d ? (d === 'in' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)') : '#fff',
                      color: form.direction === d ? (d === 'in' ? '#16a34a' : '#dc2626') : '#6b7280',
                      fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 140ms ease',
                    }}
                  >
                    {d === 'in' ? '↓ IN' : '↑ OUT'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Type + Transaction Type row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</div>
              <input
                type="text"
                placeholder="e.g. Payment, Deposit…"
                value={form.type}
                onChange={e => set('type', e.target.value)}
                style={inputStyle}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
              />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Transaction Type</div>
              <input
                type="text"
                placeholder="e.g. cash, transfer…"
                value={form.transaction_type}
                onChange={e => set('transaction_type', e.target.value)}
                style={inputStyle}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
              />
            </div>
          </div>

          {/* Amount */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount (TRY)</div>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="0.00"
              value={form.amount}
              onChange={e => set('amount', e.target.value)}
              style={inputStyle}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }}
            />
          </div>

          {/* Description */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</div>
            <textarea
              placeholder="Optional note…"
              value={form.description}
              onChange={e => set('description', e.target.value)}
              rows={2}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#e5e7eb'; }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>
              {error}
            </div>
          )}

          {/* Actions */}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button
              onClick={onClose}
              style={{ padding: '9px 18px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: saving ? '#d1d5db' : '#4ba6ea', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
            >
              {saving ? 'Saving…' : 'Add Transaction'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const EditTxModal: React.FC<{
  entry:   CustomerLedgerEntry;
  onClose: () => void;
  onSaved: () => void;
}> = ({ entry, onClose, onSaved }) => {
  const [form,   setForm]   = useState<AddCustomerTxForm>({
    date:             entry.created_at.slice(0, 10),
    type:             entry.type             ?? '',
    description:      entry.description      ?? '',
    amount:           String(entry.amount),
    direction:        ((entry.direction?.toLowerCase() ?? 'in') as 'in' | 'out'),
    transaction_type: entry.transaction_type ?? '',
  });
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const set = (k: keyof AddCustomerTxForm, v: string) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    const amount = parseFloat(form.amount);
    if (!form.date || isNaN(amount) || amount <= 0) {
      setError('Date and a valid amount are required.');
      return;
    }
    setSaving(true);
    setError(null);
    const { error: err } = await supabase
      .from('customer_accounting_ledger')
      .update({
        created_at:       form.date,
        type:             form.type             || null,
        description:      form.description      || null,
        amount,
        direction:        form.direction.toUpperCase(),
        transaction_type: form.transaction_type || null,
      })
      .eq('id', entry.id);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 13,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    fontFamily: 'inherit', color: '#0f1117', background: '#fff',
    boxSizing: 'border-box', transition: 'border-color 140ms ease',
  };

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 480, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#0f1117' }}>Edit Transaction</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>ID #{entry.id}</div>
          </div>
          <button onClick={onClose} style={{ width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Form */}
        <div style={{ padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Date + Direction */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</div>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inputStyle}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Direction</div>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['in', 'out'] as const).map(d => (
                  <button key={d} onClick={() => set('direction', d)} style={{ flex: 1, height: 38, borderRadius: 9, border: `1.5px solid ${form.direction === d ? (d === 'in' ? '#22c55e' : '#ef4444') : '#e5e7eb'}`, background: form.direction === d ? (d === 'in' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)') : '#fff', color: form.direction === d ? (d === 'in' ? '#16a34a' : '#dc2626') : '#6b7280', fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease' }}>
                    {d === 'in' ? '↓ IN' : '↑ OUT'}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Type + Transaction Type */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</div>
              <input type="text" placeholder="e.g. Payment, Deposit…" value={form.type} onChange={e => set('type', e.target.value)} style={inputStyle}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
            </div>
            <div>
              <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Transaction Type</div>
              <input type="text" placeholder="e.g. cash, transfer…" value={form.transaction_type} onChange={e => set('transaction_type', e.target.value)} style={inputStyle}
                onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
                onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
            </div>
          </div>

          {/* Amount */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount (TRY)</div>
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} style={inputStyle}
              onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; }} />
          </div>

          {/* Description */}
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6b7280', marginBottom: 5, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</div>
            <textarea placeholder="Optional note…" value={form.description} onChange={e => set('description', e.target.value)} rows={2}
              style={{ ...inputStyle, resize: 'vertical', minHeight: 60 }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#e5e7eb'; }} />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 4 }}>
            <button onClick={onClose} style={{ padding: '9px 18px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
            <button onClick={handleSave} disabled={saving} style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: saving ? '#d1d5db' : '#4ba6ea', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
              {saving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Tab 3: Customer Sheets ───────────────────────────────────────────────────

const CustomerSheetsTab: React.FC = () => {
  const { fmt } = useCurrency();
  const [cars,          setCars]          = useState<CarInfo[]>([]);
  const [carsLoading,   setCarsLoading]   = useState(true);
  const [search,        setSearch]        = useState('');
  const [carCustomers,  setCarCustomers]  = useState<Map<number, string[]>>(new Map());
  const [selectedCarId, setSelectedCarId] = useState<number | null>(null);
  const [ledger,        setLedger]        = useState<CustomerLedgerEntry[]>([]);
  const [ledgerLoading, setLedgerLoading] = useState(false);
  const [openBookings,  setOpenBookings]  = useState<Set<string>>(new Set());
  const [addModal,      setAddModal]      = useState<{ customerId: string; customerName: string } | null>(null);
  const [editModal,     setEditModal]     = useState<CustomerLedgerEntry | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);   // entry id pending delete
  const [deleting,      setDeleting]      = useState(false);

  // Load cars + car→customer index at mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [carsRes, mgRes, ccRes] = await Promise.all([
        supabase.from('cars').select('id, plate_number, model_group_id'),
        supabase.from('model_group').select('id, name'),
        supabase.from('customer_accounting_ledger').select('car_id, customers(first_name, last_name)'),
      ]);
      if (cancelled) return;

      const models  = (mgRes.data   ?? []) as { id: number; name: string }[];
      const rawCars = (carsRes.data ?? []) as { id: number; plate_number: string; model_group_id: number | null }[];
      const sorted  = rawCars
        .map(c => ({
          id:           c.id,
          plate_number: c.plate_number,
          model_name:   models.find(m => m.id === c.model_group_id)?.name ?? '—',
        }))
        .sort((a, b) => a.model_name.localeCompare(b.model_name) || a.plate_number.localeCompare(b.plate_number));
      setCars(sorted);

      // Build car_id → unique customer names index for search
      const tmp = new Map<number, Set<string>>();
      (ccRes.data ?? []).forEach((row: { car_id: number | null; customers: { first_name: string; last_name: string }[] | { first_name: string; last_name: string } | null }) => {
        if (!row.car_id || !row.customers) return;
        const cust = Array.isArray(row.customers) ? row.customers[0] : row.customers;
        if (!cust) return;
        const name = `${cust.first_name} ${cust.last_name}`.trim().toLowerCase();
        if (!tmp.has(row.car_id)) tmp.set(row.car_id, new Set());
        tmp.get(row.car_id)!.add(name);
      });
      const cc = new Map<number, string[]>();
      tmp.forEach((names, id) => cc.set(id, Array.from(names)));
      setCarCustomers(cc);

      setCarsLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const fetchLedger = (carId: number) => {
    let cancelled = false;
    setLedgerLoading(true);
    supabase
      .from('customer_accounting_ledger')
      .select('*, customers(id, first_name, last_name, phone, nationality, id_number), bookings(id, booking_number, start_date, end_date)')
      .eq('car_id', carId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (cancelled) return;
        setLedger((data ?? []) as CustomerLedgerEntry[]);
        setLedgerLoading(false);
      });
    return () => { cancelled = true; };
  };

  useEffect(() => {
    if (!selectedCarId) return;
    return fetchLedger(selectedCarId);
  }, [selectedCarId]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleBooking = (key: string) =>
    setOpenBookings(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });

  const handleDelete = async (id: number) => {
    setDeleting(true);
    await supabase.from('customer_accounting_ledger').delete().eq('id', id);
    setDeleting(false);
    setDeleteConfirm(null);
    if (selectedCarId) fetchLedger(selectedCarId);
  };

  const printInvoice = (_customerIdStr: string, entries: CustomerLedgerEntry[]) => {
    const info    = entries[0]?.customers ?? null;
    const car     = selectedCar;
    const invNum  = `HC-${new Date().getFullYear()}-${String(Date.now()).slice(-5)}`;
    const today   = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });

    const totalCharged = entries.filter(e => e.direction?.toUpperCase() === 'OUT').reduce((s, e) => s + e.amount, 0);
    const totalPaid    = entries.filter(e => e.direction?.toUpperCase() === 'IN' ).reduce((s, e) => s + e.amount, 0);
    const balance      = totalCharged - totalPaid;

    const rows = entries.map(e => `
      <tr>
        <td>${e.created_at.slice(0, 10)}</td>
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
  @media print{
    body{background:#fff}
    .page{box-shadow:none;border-radius:0;margin:0;max-width:100%}
    .print-bar{display:none}
  }
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
        <div class="info-row"><span class="info-key">Full Name</span><span class="info-val">${info ? `${info.first_name} ${info.last_name}`.trim() : '—'}</span></div>
        ${info?.nationality ? `<div class="info-row"><span class="info-key">Nationality</span><span class="info-val">${info.nationality}</span></div>` : ''}
        ${info?.id_number   ? `<div class="info-row"><span class="info-key">ID / Passport</span><span class="info-val">${info.id_number}</span></div>` : ''}
        ${info?.phone       ? `<div class="info-row"><span class="info-key">Phone</span><span class="info-val">${info.phone}</span></div>` : ''}
      </div>
      <div class="info-section">
        <h4>Vehicle</h4>
        <div class="info-row"><span class="info-key">Plate Number</span><span class="info-val">${car?.plate_number ?? '—'}</span></div>
        <div class="info-row"><span class="info-key">Model</span><span class="info-val">${car?.model_name ?? '—'}</span></div>
        <div class="info-row"><span class="info-key">Transactions</span><span class="info-val">${entries.length} item${entries.length !== 1 ? 's' : ''}</span></div>
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
    if (win) { win.document.write(html); win.document.close(); }
  };

  const selectedCar = cars.find(c => c.id === selectedCarId);

  // Filter cars list by search query (plate number OR customer name)
  const filteredCars = (() => {
    const q = search.trim().toLowerCase();
    if (!q) return cars;
    return cars.filter(car => {
      if (car.plate_number.toLowerCase().includes(q)) return true;
      return (carCustomers.get(car.id) ?? []).some(name => name.includes(q));
    });
  })();

  // Group ledger by customer_id
  const customerGroups: [string, CustomerLedgerEntry[]][] = selectedCarId
    ? Object.entries(
        ledger.reduce<Record<string, CustomerLedgerEntry[]>>((acc, entry) => {
          const key = String(entry.customer_id ?? 'unknown');
          if (!acc[key]) acc[key] = [];
          acc[key].push(entry);
          return acc;
        }, {}),
      )
    : [];

  return (
    <>
      <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
        {/* Car list */}
        <div style={{ width: 240, flexShrink: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.8px', marginBottom: 12 }}>All Cars</div>
          <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
            {/* Search bar */}
            {!carsLoading && cars.length > 0 && (
              <div style={{ padding: '10px 12px', borderBottom: '1px solid #f0f0f0' }}>
                <div style={{ position: 'relative' }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                    <circle cx="11" cy="11" r="7" stroke="#9ca3af" strokeWidth="2"/>
                    <path d="M20 20l-3-3" stroke="#9ca3af" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                  <input
                    type="text"
                    placeholder="Plate or customer…"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    style={{ width: '100%', padding: '7px 9px 7px 29px', fontSize: 12, border: '1.5px solid #e5e7eb', borderRadius: 8, outline: 'none', fontFamily: 'inherit', background: '#f9f9fb', color: '#0f1117', boxSizing: 'border-box', transition: 'border-color 140ms ease' }}
                    onFocus={e => { (e.target as HTMLInputElement).style.borderColor = '#4ba6ea'; (e.target as HTMLInputElement).style.background = '#fff'; }}
                    onBlur={e => { (e.target as HTMLInputElement).style.borderColor = '#e5e7eb'; (e.target as HTMLInputElement).style.background = '#f9f9fb'; }}
                  />
                  {search && (
                    <button
                      onClick={() => setSearch('')}
                      style={{ position: 'absolute', right: 7, top: '50%', transform: 'translateY(-50%)', width: 16, height: 16, borderRadius: 4, border: 'none', background: '#e5e7eb', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                    >
                      <svg width="8" height="8" viewBox="0 0 24 24" fill="none">
                        <path d="M18 6L6 18M6 6l12 12" stroke="#6b7280" strokeWidth="2.5" strokeLinecap="round"/>
                      </svg>
                    </button>
                  )}
                </div>
              </div>
            )}

            {carsLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} style={{ padding: '12px 16px', borderBottom: '1px solid #f7f7f7' }}>
                  <div style={{ height: 13, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', marginBottom: 6 }} />
                  <div style={{ height: 10, borderRadius: 5, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', width: '60%' }} />
                </div>
              ))
            ) : filteredCars.length === 0 ? (
              <div style={{ padding: '24px 16px', textAlign: 'center', color: '#9ca3af', fontSize: 12 }}>
                {cars.length === 0 ? 'No cars found.' : 'No cars match your search.'}
              </div>
            ) : (
              filteredCars.map((car, i) => (
                <div
                  key={car.id}
                  onClick={() => setSelectedCarId(car.id === selectedCarId ? null : car.id)}
                  style={{
                    padding: '11px 16px', cursor: 'pointer',
                    borderBottom: i < filteredCars.length - 1 ? '1px solid #f7f7f7' : 'none',
                    borderLeft: `3px solid ${car.id === selectedCarId ? '#4ba6ea' : 'transparent'}`,
                    background: car.id === selectedCarId ? 'rgba(75,166,234,0.05)' : '#fff',
                    transition: 'all 120ms ease',
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700, color: car.id === selectedCarId ? '#4ba6ea' : '#0f1117' }}>{car.plate_number}</div>
                  <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>{car.model_name}</div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Ledger panel */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {!selectedCarId ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 220, color: '#9ca3af', fontSize: 13, background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0' }}>
              Select a car to view customer transactions.
            </div>
          ) : ledgerLoading ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.7s linear infinite', color: '#4ba6ea' }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56"/>
              </svg>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#0f1117' }}>
                {selectedCar?.plate_number} — {selectedCar?.model_name}
              </div>
              {customerGroups.length === 0 ? (
                <div style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', padding: '32px 24px', textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                  No customer transactions for this car.
                </div>
              ) : (
                customerGroups.map(([customerIdStr, entries]) => {
                  const joinedCustomer = entries[0]?.customers ?? null;
                  const customerName   = joinedCustomer
                    ? `${joinedCustomer.first_name} ${joinedCustomer.last_name}`.trim()
                    : customerIdStr === 'unknown' ? 'Unknown Customer' : `Customer #${customerIdStr.slice(0, 8)}`;

                  // Sub-group entries by booking_id
                  const bookingGroups = Object.entries(
                    entries.reduce<Record<string, CustomerLedgerEntry[]>>((acc, e) => {
                      const k = String(e.booking_id ?? 'none');
                      if (!acc[k]) acc[k] = [];
                      acc[k].push(e);
                      return acc;
                    }, {}),
                  );

                  const btnBase: React.CSSProperties = {
                    display: 'flex', alignItems: 'center', gap: 6,
                    height: 32, padding: '0 12px', borderRadius: 8,
                    border: '1.5px solid #e5e7eb', background: '#fff',
                    fontSize: 12, fontWeight: 600, color: '#374151',
                    cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0,
                    transition: 'all 140ms ease',
                  };

                  return (
                    <div key={customerIdStr} style={{ background: '#fff', borderRadius: 12, border: '1px solid #f0f0f0', overflow: 'hidden' }}>
                      {/* Customer group header */}
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                          <div style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0, background: 'rgba(75,166,234,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                              <circle cx="12" cy="8" r="4" stroke="#4ba6ea" strokeWidth="1.8"/>
                              <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round"/>
                            </svg>
                          </div>
                          <div>
                            <div style={{ fontSize: 13, fontWeight: 700, color: '#0f1117', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{customerName}</div>
                            <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>
                              {entries.length} transaction{entries.length !== 1 ? 's' : ''} · {bookingGroups.length} booking{bookingGroups.length !== 1 ? 's' : ''}
                            </div>
                          </div>
                        </div>

                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                          {/* Print Invoice */}
                          <button
                            onClick={() => printInvoice(customerIdStr, entries)}
                            style={btnBase}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; (e.currentTarget as HTMLButtonElement).style.color = '#4ba6ea'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                              <path d="M6 9V3h12v6M6 18H4a1 1 0 01-1-1v-6a1 1 0 011-1h16a1 1 0 011 1v6a1 1 0 01-1 1h-2M6 14h12v7H6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            Invoice
                          </button>

                          {/* Add Transaction */}
                          <button
                            onClick={() => customerIdStr !== 'unknown' && setAddModal({ customerId: customerIdStr, customerName })}
                            style={btnBase}
                            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; (e.currentTarget as HTMLButtonElement).style.color = '#4ba6ea'; }}
                            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e.currentTarget as HTMLButtonElement).style.color = '#374151'; }}
                          >
                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                            </svg>
                            Add Transaction
                          </button>
                        </div>
                      </div>

                      {/* Booking sub-groups (collapsible) */}
                      {bookingGroups.map(([bookingKey, bookingEntries]) => {
                        const collapseKey = `${customerIdStr}|${bookingKey}`;
                        const isOpen      = openBookings.has(collapseKey);
                        const bookingRef   = bookingEntries[0]?.bookings?.booking_number;
                        const bookingLabel = bookingKey === 'none' ? 'No Booking'
                          : bookingRef ? `Booking ${bookingRef}` : `Booking #${bookingKey}`;
                        const dates        = bookingEntries.map(e => e.created_at.slice(0, 10)).sort();
                        const firstDate    = dates[0];
                        const lastDate     = dates[dates.length - 1];
                        const netTotal     = bookingEntries.reduce((s, e) => s + (e.direction?.toUpperCase() === 'IN' ? e.amount : -e.amount), 0);

                        return (
                          <div key={bookingKey} style={{ borderBottom: '1px solid #f3f4f6' }}>
                            {/* Toggle header */}
                            <div
                              onClick={() => toggleBooking(collapseKey)}
                              style={{ padding: '9px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: 'pointer', background: isOpen ? 'rgba(75,166,234,0.03)' : '#fafafa', transition: 'background 120ms ease', userSelect: 'none' }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ transition: 'transform 200ms ease', transform: isOpen ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}>
                                  <path d="M9 18l6-6-6-6" stroke="#9ca3af" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                                </svg>
                                <span style={{ fontSize: 12, fontWeight: 700, color: isOpen ? '#4ba6ea' : '#374151' }}>{bookingLabel}</span>
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>
                                  {firstDate === lastDate ? firstDate : `${firstDate} – ${lastDate}`}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                <span style={{ fontSize: 11, color: '#9ca3af' }}>{bookingEntries.length} tx</span>
                                <span style={{ fontSize: 12, fontWeight: 700, color: netTotal >= 0 ? '#16a34a' : '#dc2626' }}>
                                  {netTotal >= 0 ? '+' : ''}{fmt(netTotal)}
                                </span>
                              </div>
                            </div>

                            {/* Transactions table */}
                            {isOpen && (
                              <div style={{ overflowX: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 480 }}>
                                  <thead>
                                    <tr>
                                      {['Date', 'Type', 'Description', 'Amount', 'Direction', ''].map((h, hi) => (
                                        <th key={hi} style={{ padding: '8px 14px', fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px', textAlign: h === '' ? 'right' : 'left', borderBottom: '1px solid #f0f0f0', whiteSpace: 'nowrap' }}>{h}</th>
                                      ))}
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {bookingEntries.map((e, i) => {
                                      const isPendingDelete = deleteConfirm === e.id;
                                      return (
                                        <tr key={e.id} style={{ borderTop: i === 0 ? 'none' : '1px solid #f7f7f7', background: isPendingDelete ? 'rgba(239,68,68,0.03)' : undefined }}>
                                          <td style={{ padding: '9px 14px', fontSize: 12, color: '#374151', whiteSpace: 'nowrap' }}>{e.created_at.slice(0, 10)}</td>
                                          <td style={{ padding: '9px 14px', fontSize: 12, color: '#374151' }}>{e.type ?? '—'}</td>
                                          <td style={{ padding: '9px 14px', fontSize: 12, color: '#6b7280', maxWidth: 200 }}>{e.description ?? '—'}</td>
                                          <td style={{ padding: '9px 14px', fontSize: 13, fontWeight: 700, color: '#0f1117', whiteSpace: 'nowrap' }}>{fmt(e.amount)}</td>
                                          <td style={{ padding: '9px 14px' }}>
                                            {e.direction?.toUpperCase() === 'IN'
                                              ? <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: '#16a34a', background: 'rgba(34,197,94,0.1)' }}>↓ IN</span>
                                              : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, padding: '2px 7px', borderRadius: 20, fontSize: 10, fontWeight: 700, color: '#dc2626', background: 'rgba(239,68,68,0.1)' }}>↑ OUT</span>
                                            }
                                          </td>
                                          <td style={{ padding: '6px 12px', whiteSpace: 'nowrap', textAlign: 'right' }}>
                                            {isPendingDelete ? (
                                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                                                <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 600 }}>Delete?</span>
                                                <button
                                                  onClick={() => handleDelete(e.id)}
                                                  disabled={deleting}
                                                  style={{ height: 26, padding: '0 10px', borderRadius: 6, border: 'none', background: '#dc2626', color: '#fff', fontSize: 11, fontWeight: 700, cursor: deleting ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}
                                                >
                                                  {deleting ? '…' : 'Yes'}
                                                </button>
                                                <button
                                                  onClick={() => setDeleteConfirm(null)}
                                                  style={{ height: 26, padding: '0 10px', borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', color: '#374151', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                                                >
                                                  No
                                                </button>
                                              </div>
                                            ) : (
                                              <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                                                {/* Edit */}
                                                <button
                                                  onClick={() => setEditModal(e)}
                                                  title="Edit"
                                                  style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', transition: 'all 140ms ease' }}
                                                  onMouseEnter={e2 => { (e2.currentTarget as HTMLButtonElement).style.borderColor = '#4ba6ea'; (e2.currentTarget as HTMLButtonElement).style.color = '#4ba6ea'; (e2.currentTarget as HTMLButtonElement).style.background = 'rgba(75,166,234,0.06)'; }}
                                                  onMouseLeave={e2 => { (e2.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e2.currentTarget as HTMLButtonElement).style.color = '#6b7280'; (e2.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
                                                >
                                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                                    <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                  </svg>
                                                </button>
                                                {/* Delete */}
                                                <button
                                                  onClick={() => setDeleteConfirm(e.id)}
                                                  title="Delete"
                                                  style={{ width: 28, height: 28, borderRadius: 7, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6b7280', transition: 'all 140ms ease' }}
                                                  onMouseEnter={e2 => { (e2.currentTarget as HTMLButtonElement).style.borderColor = '#fca5a5'; (e2.currentTarget as HTMLButtonElement).style.color = '#dc2626'; (e2.currentTarget as HTMLButtonElement).style.background = 'rgba(239,68,68,0.06)'; }}
                                                  onMouseLeave={e2 => { (e2.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb'; (e2.currentTarget as HTMLButtonElement).style.color = '#6b7280'; (e2.currentTarget as HTMLButtonElement).style.background = '#fff'; }}
                                                >
                                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
                                                    <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    <path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                    <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                                                    <path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                                                  </svg>
                                                </button>
                                              </div>
                                            )}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Transaction Modal */}
      {addModal && selectedCarId && (
        <AddCustomerTxModal
          customerName={addModal.customerName}
          customerId={addModal.customerId}
          carId={selectedCarId}
          onClose={() => setAddModal(null)}
          onSaved={() => { if (selectedCarId) fetchLedger(selectedCarId); }}
        />
      )}

      {/* Edit Transaction Modal */}
      {editModal && (
        <EditTxModal
          entry={editModal}
          onClose={() => setEditModal(null)}
          onSaved={() => { setEditModal(null); if (selectedCarId) fetchLedger(selectedCarId); }}
        />
      )}
    </>
  );
};

// ─── Investor Report Page (routed: /dashboard/accounting/report?investor_id=X) ─

export const InvestorReportPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate       = useNavigate();
  const investorId     = String(searchParams.get('investor_id') ?? '');

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>
      <InvestorSummaryView
        investorId={investorId}
        onBack={() => navigate('/dashboard/accounting')}
      />
      <style>{`
        @keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin    { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

// ─── Global Add Transaction Modal ─────────────────────────────────────────────

interface AddFinTxForm {
  investor_id:  string;
  sheet_target: string;   // 'company_expenses' | 'personal_expenses' | 'buy_sell' | `car:${id}`
  direction:    'IN' | 'OUT';
  category:     string;
  amount:       string;
  date:         string;
  note:         string;
}

const EMPTY_FIN_TX: AddFinTxForm = {
  investor_id:  '',
  sheet_target: '',
  direction:    'IN',
  category:     '',
  amount:       '',
  date:         new Date().toISOString().slice(0, 10),
  note:         '',
};

// Maps sheet_type (or 'car') + direction → category options
const FIN_TX_CATEGORIES: Record<string, Partial<Record<'IN' | 'OUT', string[]>>> = {
  company_expenses: {
    IN:  ['Other'],
    OUT: ['MTV', 'MÜŞAVIR MALİ', 'Rent', 'Other'],
  },
  personal_expenses: {
    IN:  ['Other'],
    OUT: ['Other'],
  },
  buy_sell: {
    IN:  ['Deposit', 'Car Sale', 'Other'],
    OUT: ['Car Purchase', 'Noter', 'Sigorta', 'Kasko', 'Other'],
  },
  car: {
    IN:  ['Rent Collection', 'Other'],
    OUT: ['Petrol', 'Oil', 'Wash', 'Maintenance', 'Other'],
  },
};

function getCategoryOptions(sheetTarget: string, direction: 'IN' | 'OUT'): string[] {
  const sheetType = sheetTarget.startsWith('car:') ? 'car' : sheetTarget;
  return FIN_TX_CATEGORIES[sheetType]?.[direction] ?? ['Other'];
}

const AddFinancialTxModal: React.FC<{
  onClose:  () => void;
  onSaved:  () => void;
}> = ({ onClose, onSaved }) => {
  const [form,           setForm]           = useState<AddFinTxForm>(EMPTY_FIN_TX);
  const [saving,         setSaving]         = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [investors,      setInvestors]      = useState<{ id: string; company_name: string }[]>([]);
  const [cars,           setCars]           = useState<{ id: number; label: string }[]>([]);
  const [commissionRate, setCommissionRate] = useState<number | null>(null);

  // Fetch investors once on mount
  useEffect(() => {
    supabase.from('investors').select('id, company_name').order('company_name').then(({ data }) => {
      setInvestors((data ?? []) as { id: string; company_name: string }[]);
    });
  }, []);

  // When investor changes: reset sheet + category, reload filtered cars + commission rate
  useEffect(() => {
    if (!form.investor_id) {
      setCommissionRate(null);
      setCars([]);
      return;
    }
    // Reset target sheet and category so stale car selections are cleared
    setForm(prev => ({ ...prev, sheet_target: '', category: '' }));
    Promise.all([
      supabase.from('investors').select('commission_rate').eq('id', form.investor_id).single(),
      supabase.from('cars').select('id, plate_number, model_group:model_group_id(name)').eq('investor_id', form.investor_id),
    ]).then(([invRes, carsRes]) => {
      setCommissionRate((invRes.data as { commission_rate: number | null } | null)?.commission_rate ?? null);
      const raw = (carsRes.data ?? []) as unknown as { id: number; plate_number: string; model_group: { name: string } | null }[];
      setCars(
        raw
          .map(c => ({ id: c.id, label: `${c.plate_number} — ${c.model_group?.name ?? '—'}` }))
          .sort((a, b) => a.label.localeCompare(b.label)),
      );
    });
  }, [form.investor_id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Reset category whenever sheet or direction changes
  useEffect(() => {
    setForm(prev => ({ ...prev, category: '' }));
  }, [form.sheet_target, form.direction]); // eslint-disable-line react-hooks/exhaustive-deps

  const set = <K extends keyof AddFinTxForm>(k: K, v: AddFinTxForm[K]) =>
    setForm(prev => ({ ...prev, [k]: v }));

  const handleSave = async () => {
    const amount = parseFloat(form.amount);
    if (!form.investor_id)  { setError('Select an investor.'); return; }
    if (!form.sheet_target) { setError('Select a target sheet.'); return; }
    if (!form.date)         { setError('Date is required.'); return; }
    if (isNaN(amount) || amount <= 0) { setError('Enter a valid amount.'); return; }

    const month_key  = form.date.slice(0, 7);
    const isCarSheet = form.sheet_target.startsWith('car:');
    const sheet_type = isCarSheet ? 'car' : form.sheet_target;
    const car_id     = isCarSheet ? parseInt(form.sheet_target.replace('car:', ''), 10) : null;

    const isRentCollection = sheet_type === 'car' && form.category === 'Rent Collection';

    const baseRow = {
      investor_id: form.investor_id,
      sheet_type,
      car_id:      car_id ?? null,
      month_key,
      date:        form.date,
      note:        form.note || null,
    };

    const rows = isRentCollection && commissionRate != null
      ? [
          // Row 1 — Rent Collection as entered
          { ...baseRow, direction: form.direction, category: 'Rent Collection', amount },
          // Row 2 — Commission auto-generated
          { ...baseRow, direction: 'OUT', category: 'Commission', amount: parseFloat((amount * (commissionRate / 100)).toFixed(2)), note: 'Homesta COM' },
        ]
      : [
          { ...baseRow, direction: form.direction, category: form.category || null, amount },
        ];

    setSaving(true);
    setError(null);
    const { error: err } = await supabase.from('financial_transactions').insert(rows);
    setSaving(false);
    if (err) { setError(err.message); return; }
    onSaved();
    onClose();
  };

  const inp: React.CSSProperties = {
    width: '100%', padding: '9px 12px', fontSize: 13,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    fontFamily: 'inherit', color: '#0f1117', background: '#fff',
    boxSizing: 'border-box', transition: 'border-color 140ms ease',
  };
  const focusBlue = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    { (e.target as HTMLElement).style.borderColor = '#4ba6ea'; };
  const blurGray  = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    { (e.target as HTMLElement).style.borderColor = '#e5e7eb'; };
  const lbl: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: '#6b7280',
    textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: 5,
    display: 'block',
  };

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, zIndex: 1000, background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, animation: 'fadeIn 160ms ease' }}
    >
      <div style={{ background: '#fff', borderRadius: 18, width: '100%', maxWidth: 560, boxShadow: '0 24px 60px rgba(0,0,0,0.18)', animation: 'slideUp 200ms ease', overflow: 'hidden', maxHeight: '90vh', display: 'flex', flexDirection: 'column' }}>

        {/* Header */}
        <div style={{ padding: '22px 28px 18px', borderBottom: '1px solid #f0f0f0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117' }}>Add Transaction</div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>Insert into financial_transactions</div>
          </div>
          <button onClick={onClose} style={{ width: 32, height: 32, borderRadius: 9, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/></svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 28px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* 1. Investor */}
          <div>
            <label style={lbl}>Investor / Company</label>
            <select value={form.investor_id} onChange={e => set('investor_id', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray}>
              <option value="">— Select investor —</option>
              {investors.map(inv => (
                <option key={inv.id} value={inv.id}>{inv.company_name}</option>
              ))}
            </select>
          </div>

          {/* 2. Target Sheet */}
          <div>
            <label style={lbl}>Target Sheet</label>
            <select value={form.sheet_target} onChange={e => set('sheet_target', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray}>
              <option value="">— Select sheet —</option>
              <optgroup label="Fixed Sheets">
                <option value="company_expenses">Company Expenses</option>
                <option value="personal_expenses">Personal Expenses</option>
                <option value="buy_sell">Buy &amp; Sell</option>
              </optgroup>
              {cars.length > 0 && (
                <optgroup label="Car Sheets">
                  {cars.map(c => (
                    <option key={c.id} value={`car:${c.id}`}>{c.label}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>

          {/* 3. Direction + 6. Date row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>Direction</label>
              <div style={{ display: 'flex', gap: 6 }}>
                {(['IN', 'OUT'] as const).map(d => (
                  <button
                    key={d}
                    onClick={() => set('direction', d)}
                    style={{
                      flex: 1, height: 40, borderRadius: 9, fontFamily: 'inherit', cursor: 'pointer',
                      fontSize: 12, fontWeight: 700, transition: 'all 140ms ease',
                      border: `1.5px solid ${form.direction === d ? (d === 'IN' ? '#22c55e' : '#ef4444') : '#e5e7eb'}`,
                      background: form.direction === d ? (d === 'IN' ? 'rgba(34,197,94,0.08)' : 'rgba(239,68,68,0.08)') : '#fff',
                      color: form.direction === d ? (d === 'IN' ? '#16a34a' : '#dc2626') : '#6b7280',
                    }}
                  >
                    {d === 'IN' ? '↓ IN' : '↑ OUT'}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label style={lbl}>Date</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
          </div>

          {/* 4. Category + 5. Amount row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div>
              <label style={lbl}>Category</label>
              <select
                value={form.category}
                onChange={e => set('category', e.target.value)}
                disabled={!form.sheet_target}
                style={{ ...inp, color: form.category ? '#0f1117' : '#9ca3af', cursor: form.sheet_target ? 'pointer' : 'not-allowed', opacity: form.sheet_target ? 1 : 0.6 }}
                onFocus={focusBlue}
                onBlur={blurGray}
              >
                <option value="">{form.sheet_target ? '— Select category —' : '— Select sheet first —'}</option>
                {getCategoryOptions(form.sheet_target, form.direction).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={lbl}>Amount (TRY)</label>
              <input type="number" min="0" step="0.01" placeholder="0.00" value={form.amount} onChange={e => set('amount', e.target.value)} style={inp} onFocus={focusBlue} onBlur={blurGray} />
            </div>
          </div>

          {/* Commission preview banner */}
          {(() => {
            const isCarRentCollection =
              form.sheet_target.startsWith('car:') &&
              form.category === 'Rent Collection' &&
              commissionRate != null;
            if (!isCarRentCollection) return null;
            const amt      = parseFloat(form.amount);
            const hasAmt   = !isNaN(amt) && amt > 0;
            const commAmt  = hasAmt ? parseFloat((amt * (commissionRate / 100)).toFixed(2)) : null;
            return (
              <div style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '11px 14px', borderRadius: 10,
                background: 'rgba(75,166,234,0.07)', border: '1.5px solid rgba(75,166,234,0.25)',
                animation: 'fadeIn 180ms ease',
              }}>
                <span style={{ fontSize: 15, lineHeight: 1, marginTop: 1 }}>⚡</span>
                <div style={{ fontSize: 12.5, color: '#1d6fa8', lineHeight: 1.55 }}>
                  <span style={{ fontWeight: 700 }}>Commission will be auto-deducted: </span>
                  <span style={{ fontWeight: 600 }}>{commissionRate}%</span>
                  {commAmt !== null && (
                    <span> = <span style={{ fontWeight: 700 }}>{commAmt.toLocaleString('tr-TR', { minimumFractionDigits: 2 })} TRY</span></span>
                  )}
                  <div style={{ fontSize: 11, color: '#4ba6ea', marginTop: 3, fontWeight: 500 }}>
                    A separate Commission row will be inserted automatically.
                  </div>
                </div>
              </div>
            );
          })()}

          {/* 7. Note */}
          <div>
            <label style={lbl}>Note</label>
            <textarea placeholder="Optional note…" value={form.note} onChange={e => set('note', e.target.value)} rows={2}
              style={{ ...inp, resize: 'vertical', minHeight: 58 }}
              onFocus={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#4ba6ea'; }}
              onBlur={e => { (e.target as HTMLTextAreaElement).style.borderColor = '#e5e7eb'; }}
            />
          </div>

          {error && (
            <div style={{ fontSize: 12, color: '#ef4444', background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8, padding: '8px 12px' }}>{error}</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '16px 28px', borderTop: '1px solid #f0f0f0', display: 'flex', gap: 10, justifyContent: 'flex-end', flexShrink: 0 }}>
          <button onClick={onClose} style={{ padding: '9px 20px', borderRadius: 9, border: '1.5px solid #e5e7eb', background: '#fff', fontSize: 13, fontWeight: 500, color: '#374151', cursor: 'pointer', fontFamily: 'inherit' }}>Cancel</button>
          <button onClick={handleSave} disabled={saving} style={{ padding: '9px 22px', borderRadius: 9, border: 'none', background: saving ? '#d1d5db' : '#4ba6ea', color: '#fff', fontSize: 13, fontWeight: 600, cursor: saving ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {saving ? 'Saving…' : 'Add Transaction'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Main Page ────────────────────────────────────────────────────────────────

type AccountingTab = 'overview' | 'investor' | 'customer';

const AccountingPage: React.FC = () => {
  const [activeTab,        setActiveTab]        = useState<AccountingTab>('overview');
  const [view,             setView]             = useState<'tabs' | 'investor-report'>('tabs');
  const [activeInvestorId, setActiveInvestorId] = useState<string | null>(null);
  const [showAddTx,        setShowAddTx]        = useState(false);
  const [refreshKey,       setRefreshKey]       = useState(0);

  const handleViewReport = (id: string) => {
    setActiveInvestorId(id);
    setView('investor-report');
  };

  if (view === 'investor-report' && activeInvestorId) {
    return (
      <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>
        <InvestorSummaryView
          investorId={activeInvestorId}
          onBack={() => { setView('tabs'); setActiveTab('investor'); }}
        />
        <style>{`
          @keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
          @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
          @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
          @keyframes spin    { to { transform: rotate(360deg); } }
        `}</style>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)', padding: '44px 40px' }}>
      {/* Page header */}
      <div style={{ marginBottom: 32, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>Finance</span>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', marginBottom: 6, lineHeight: 1.1 }}>Accounting</h1>
          <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>Financial overview, investor reports, and customer billing.</p>
        </div>
        <button
          onClick={() => setShowAddTx(true)}
          style={{
            flexShrink: 0, display: 'flex', alignItems: 'center', gap: 7,
            padding: '10px 18px', borderRadius: 11, border: 'none',
            background: '#4ba6ea', color: '#fff',
            fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
            boxShadow: '0 2px 10px rgba(75,166,234,0.3)',
            transition: 'background 140ms ease, box-shadow 140ms ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#3a95d9'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 4px 16px rgba(75,166,234,0.4)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 2px 10px rgba(75,166,234,0.3)'; }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"/>
          </svg>
          Add Transaction
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 28, background: '#f3f4f6', padding: 4, borderRadius: 12, width: 'fit-content' }}>
        {([
          { key: 'overview',  label: 'Overview'         },
          { key: 'investor',  label: 'Investor Sheets'  },
          { key: 'customer',  label: 'Customer Sheets'  },
        ] as { key: AccountingTab; label: string }[]).map(tab => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            style={{
              padding: '8px 20px', borderRadius: 9, border: 'none', cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 13, fontWeight: activeTab === tab.key ? 600 : 500,
              color: activeTab === tab.key ? '#0f1117' : '#6b7280',
              background: activeTab === tab.key ? '#fff' : 'transparent',
              boxShadow: activeTab === tab.key ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
              transition: 'all 140ms ease',
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === 'overview'  && <OverviewTab        key={refreshKey} />}
      {activeTab === 'investor'  && <InvestorSheetsTab  key={refreshKey} onViewReport={handleViewReport} />}
      {activeTab === 'customer'  && <CustomerSheetsTab  key={refreshKey} />}

      {/* Global Add Transaction */}
      {showAddTx && (
        <AddFinancialTxModal
          onClose={() => setShowAddTx(false)}
          onSaved={() => { setShowAddTx(false); setRefreshKey(k => k + 1); }}
        />
      )}

      <style>{`
        @keyframes pulse   { 0%, 100% { opacity: 1; } 50% { opacity: 0.45; } }
        @keyframes fadeIn  { from { opacity: 0; } to { opacity: 1; } }
        @keyframes slideUp { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin    { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
};

export default AccountingPage;
