import React, { useEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useTileFilter } from '../hooks/useTileFilter';
import { useUrlSearch } from '../hooks/useUrlSearch';
import type { CarStatus, CarStatusCounts } from '../types';
import AlertSection from '../components/AlertSection';
import Button from '../components/Button';
import CarDatesSheet from '../components/cars/CarDatesSheet';
import CarEditor from '../components/cars/CarEditor';
import StatusArt from '../components/cars/StatusArt';
import { ComplianceBanner, ComplianceCard, ComplianceFailed, ComplianceModal, ComplianceTriangle } from '../components/cars/Compliance';
import { useCarCompliance } from '../hooks/useCarCompliance';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import type { CarCompliance, ComplianceField } from '../lib/carCompliance';

// ─── Car Table Types ──────────────────────────────────────────────────────────

interface CarTableRow {
  id: number;
  plate_number: string;
  model: string;
  current_km: number | string;
  year: number | string;
  status: string;
  contract_url:  string | null;
  invoice_url:   string | null;
  insurance_url: string | null;
  ruhsat_url:    string | null;
  kasko_url:     string | null;
}

type CarTableStatus = 'working' | 'parking' | 'maintenance' | 'selling' | 'replacement';

const STATUS_CONFIG: Record<CarTableStatus, { color: string; bg: string }> = {
  working:     { color: '#16a34a', bg: 'rgba(34,197,94,0.1)'  },
  parking:     { color: '#ea580c', bg: 'rgba(249,115,22,0.1)' },
  maintenance: { color: '#6b7280', bg: 'rgba(107,114,128,0.1)'},
  selling:     { color: '#ca8a04', bg: 'rgba(234,179,8,0.1)'  },
  replacement: { color: '#0891b2', bg: 'rgba(6,182,212,0.1)'  },
};

const CarStatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const { t } = useTranslation('cars');
  const cfg = STATUS_CONFIG[status as CarTableStatus];
  if (!cfg) return <span style={{ fontSize: 12, color: '#9ca3af' }}>{status || '—'}</span>;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 9px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      color: cfg.color, background: cfg.bg,
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.color, flexShrink: 0 }} />
      {t(`status.${status}`)}
    </span>
  );
};

// ─── Stat Card Types ───────────────────────────────────────────────────────────

interface StatCard {
  /** Also the locale key: `cards.<key>.label` / `.description`. */
  key: 'all' | CarStatus;
  accentColor: string;
  iconBg: string;
}

const CARDS: StatCard[] = [
  {
    key: 'all',
    accentColor: '#4ba6ea',
    iconBg: 'rgba(75,166,234,0.1)',
  },
  {
    key: 'working',
    accentColor: '#22c55e',
    iconBg: 'rgba(34,197,94,0.1)',
  },
  {
    key: 'parking',
    accentColor: '#ef4444',
    iconBg: 'rgba(239,68,68,0.1)',
  },
  {
    key: 'maintenance',
    accentColor: '#6b7280',
    iconBg: 'rgba(107,114,128,0.1)',
  },
  {
    key: 'selling',
    accentColor: '#eab308',
    iconBg: 'rgba(234,179,8,0.1)',
  },
  {
    key: 'replacement',
    accentColor: '#06b6d4',
    iconBg: 'rgba(6,182,212,0.1)',
  },
];

const CAR_FILTERS = ['working', 'parking', 'maintenance', 'selling', 'replacement'] as const;

interface HoverCardProps {
  card: StatCard;
  count: number;
  total: number;
  pressed: boolean;
  onPress: () => void;
}

const StatCardComponent: React.FC<HoverCardProps> = ({ card, count, total, pressed, onPress }) => {
  const { t } = useTranslation('cars');
  const pct = total > 0 && card.key !== 'all' ? Math.round((count / total) * 100) : null;

  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={onPress}
      className={`hc-car-tile surface-depth ${pressed ? 'is-active' : ''}`}
      style={{ '--tile-accent': card.accentColor } as React.CSSProperties}
    >
      {/* Colored top bar */}
      <div className="hc-car-tile-bar" />
      <StatusArt name={card.key === 'all' ? 'total' : card.key} className="hc-car-tile-art" />
      {pressed && (
        <span aria-hidden="true" className="hc-tile-check">
          <svg width="11" height="11" viewBox="0 0 24 24" fill="none"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </span>
      )}

      <div className="hc-car-tile-body">
        {/* Room for the render */}
        <div className="hc-car-tile-top" />

        {/* Number + percentage */}
        <div className="hc-car-tile-figures">
          <div style={{
            fontSize: 52,
            fontWeight: 800,
            letterSpacing: '-3px',
            color: '#0f1117',
            lineHeight: 1,
            fontVariantNumeric: 'tabular-nums',
          }}>
            {count}
          </div>
          {pct !== null && (
            <span className="hc-car-tile-pct" style={{
              fontSize: 12,
              fontWeight: 600,
              color: card.accentColor,
              background: card.iconBg,
              borderRadius: 20,
              padding: '3px 9px',
              letterSpacing: '0.2px',
            }}>
              {pct}%
            </span>
          )}
        </div>

        {/* Label + description */}
        <div>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#0f1117', marginBottom: 2 }}>
            {t(`cards.${card.key}.label`)}
          </div>
          <div style={{ fontSize: 13, color: '#9ca3af', lineHeight: 1.4 }}>
            {t(`cards.${card.key}.description`)}
          </div>
        </div>
      </div>
    </button>
  );
};

const SkeletonCard: React.FC = () => (
  <div className="surface-depth" style={{
    background: '#ffffff',
    borderRadius: 16,
    overflow: 'hidden',
  }}>
    <div style={{ height: 4, background: '#f3f4f6' }} />
    <div style={{ padding: '24px' }}>
      <div style={{ width: 42, height: 42, borderRadius: 11, background: '#f3f4f6', marginBottom: 20, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: '50%', height: 52, borderRadius: 8, background: '#f3f4f6', marginBottom: 14, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: '65%', height: 15, borderRadius: 6, background: '#f3f4f6', marginBottom: 6, animation: 'pulse 1.5s ease-in-out infinite' }} />
      <div style={{ width: '45%', height: 13, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite' }} />
    </div>
  </div>
);

// ─── Add Car Modal ────────────────────────────────────────────────────────────

interface ModelGroupOption { id: number; name: string; }
interface InvestorOption   { id: number; full_name: string; }

const AddCarModal: React.FC<{ onClose: () => void; onAdded: () => void }> = ({ onClose, onAdded }) => {
  const { t } = useTranslation('cars');
  const [modelGroups, setModelGroups]   = useState<ModelGroupOption[]>([]);
  const [investors,   setInvestors]     = useState<InvestorOption[]>([]);
  const [loadingData, setLoadingData]   = useState(true);

  const [modelGroupId, setModelGroupId] = useState('');
  const [plate,        setPlate]        = useState('');
  const [investorId,   setInvestorId]   = useState('');
  const [saving,       setSaving]       = useState(false);
  const [formError,    setFormError]    = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [mgRes, invRes] = await Promise.all([
        supabase.from('model_group').select('id, name').order('name'),
        supabase.from('investors').select('id, profiles!fk_investor_profile(full_name)'),
      ]);
      if (cancelled) return;
      setModelGroups((mgRes.data ?? []) as ModelGroupOption[]);
      const raw = (invRes.data ?? []) as unknown as { id: number; profiles: { full_name: string } | null }[];
      setInvestors(raw.map(r => ({ id: r.id, full_name: r.profiles?.full_name ?? '—' })));
      setLoadingData(false);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async () => {
    setFormError(null);
    if (!modelGroupId) { setFormError(t('modal.errors.modelGroup')); return; }
    if (!plate.trim()) { setFormError(t('modal.errors.plate')); return; }
    if (!investorId)   { setFormError(t('modal.errors.investor')); return; }

    setSaving(true);
    const { error } = await supabase.from('cars').insert({
      plate_number:    plate.trim().toUpperCase(),
      model_group_id:  Number(modelGroupId),
      investor_id:     Number(investorId),
    });
    setSaving(false);

    if (error) { setFormError(error.message); return; }
    onAdded();
    onClose();
  };

  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: 12, fontWeight: 600,
    color: '#374151', marginBottom: 5, letterSpacing: '0.1px',
  };
  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '10px 12px', fontSize: 14,
    border: '1.5px solid #e5e7eb', borderRadius: 9, outline: 'none',
    color: '#0f1117', background: '#fff', boxSizing: 'border-box',
    fontFamily: 'inherit', appearance: 'none',
  };
  const selectStyle: React.CSSProperties = { ...inputStyle, cursor: 'pointer' };

  return ReactDOM.createPortal(
    <div
      onClick={handleBackdrop}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,17,23,0.45)', backdropFilter: 'blur(3px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20,
        animation: 'fadeIn 160ms ease',
      }}
    >
      <div className="surface-depth surface-float" style={{
        background: '#fff', borderRadius: 16, width: '100%', maxWidth: 460,
        boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        animation: 'slideUp 200ms ease',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          padding: '22px 24px 18px',
          borderBottom: '1px solid #f0f0f0',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.3px' }}>
              {t('modal.title')}
            </div>
            <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 2 }}>
              {t('modal.subtitle')}
            </div>
          </div>
          <button
            onClick={onClose}
            style={{
              width: 30, height: 30, borderRadius: 8, border: '1px solid #e5e7eb',
              background: '#fff', cursor: 'pointer', display: 'flex',
              alignItems: 'center', justifyContent: 'center', color: '#9ca3af',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: '22px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Model Group */}
          <div>
            <label style={labelStyle}>{t('modal.modelGroup')} <span style={{ color: '#ef4444' }}>*</span></label>
            <select
              value={modelGroupId}
              onChange={e => setModelGroupId(e.target.value)}
              disabled={loadingData}
              style={selectStyle}
            >
              <option value="">
                {loadingData ? t('modal.loading') : t('modal.selectModelGroup')}
              </option>
              {modelGroups.map(mg => (
                <option key={mg.id} value={String(mg.id)}>{mg.name}</option>
              ))}
            </select>
          </div>

          {/* Plate Number */}
          <div>
            <label style={labelStyle}>{t('modal.plateNumber')} <span style={{ color: '#ef4444' }}>*</span></label>
            <input
              type="text"
              placeholder={t('modal.platePlaceholder')}
              value={plate}
              onChange={e => setPlate(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); }}
              style={inputStyle}
            />
          </div>

          {/* Investor */}
          <div>
            <label style={labelStyle}>{t('modal.investor')} <span style={{ color: '#ef4444' }}>*</span></label>
            <select
              value={investorId}
              onChange={e => setInvestorId(e.target.value)}
              disabled={loadingData}
              style={selectStyle}
            >
              <option value="">
                {loadingData ? t('modal.loading') : t('modal.selectInvestor')}
              </option>
              {investors.map(inv => (
                <option key={inv.id} value={String(inv.id)}>{inv.full_name}</option>
              ))}
            </select>
          </div>

          {/* Error */}
          {formError && (
            <div style={{
              display: 'flex', alignItems: 'flex-start', gap: 8,
              background: 'rgba(239,68,68,0.06)', border: '1px solid rgba(239,68,68,0.2)',
              borderRadius: 9, padding: '10px 12px',
            }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, marginTop: 1 }}>
                <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
                <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
              </svg>
              <span style={{ fontSize: 13, color: '#dc2626' }}>{formError}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          padding: '16px 24px',
          borderTop: '1px solid #f0f0f0',
          display: 'flex', gap: 10, justifyContent: 'flex-end',
        }}>
          <Button variant="secondary"
            onClick={onClose}
          >
            {t('modal.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={saving || loadingData}
          >
            {saving && (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" style={{ animation: 'spin 0.6s linear infinite' }}>
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" strokeDasharray="28 56" />
              </svg>
            )}
            {saving ? t('modal.creating') : t('modal.create')}
          </Button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

// ─── Page ─────────────────────────────────────────────────────────────────────

const CarsPage: React.FC = () => {
  const { t, i18n } = useTranslation('cars');
  /**
   * Western digits in both languages, as agreed for a Turkish fleet: plate
   * numbers, booking refs and KGM records are all Latin, and Arabic-Indic
   * figures beside them make a column harder to scan, not easier. Plain `ar`
   * resolves to Arabic-Indic on some engines, so the numbering system is pinned.
   */
  const numberLocale = i18n.resolvedLanguage?.startsWith('ar') ? 'ar-u-nu-latn' : 'en-US';
  const [counts, setCounts]         = useState<CarStatusCounts | null>(null);
  const [loading, setLoading]       = useState(true);
  const [error, setError]           = useState<string | null>(null);
  const [showAddCar, setShowAddCar] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [cars, setCars]             = useState<CarTableRow[]>([]);
  const [carsLoading, setCarsLoading] = useState(true);
  const [tableSearch, setTableSearch] = useState('');
  useUrlSearch(setTableSearch);
  const [sortCol,  setSortCol]  = useState<'plate_number' | 'model' | 'year' | 'current_km' | 'status' | null>(null);
  const [sortDir,  setSortDir]  = useState<'asc' | 'desc'>('asc');
  const [totalCars, setTotalCars] = useState(0);

  const compliance = useCarCompliance();
  const { cars: checkedCars, summary } = compliance;
  const [complianceOpen, setComplianceOpen] = useState(false);
  const [fixing, setFixing] = useState<CarCompliance | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const [carFilter, setCarFilter] = useTileFilter(CAR_FILTERS);
  const warned = useRef(false);
  const [params, setParams] = useSearchParams();
  const linkedCar = params.get('car');
  const [highlighted, setHighlighted] = useState<number | null>(null);
  const isAdmin = useCurrentUser().profile?.role === 'admin';
  const [editing, setEditing] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // A notification points at one car. The warning below comes first on any visit, so the
  // row waits for it: highlighted behind the dialog, nobody would see it.
  useEffect(() => {
    if (!linkedCar || carsLoading || !compliance.settled || complianceOpen || fixing) return;
    if (summary.count > 0 && !warned.current) return;
    setTableSearch('');
    setOnlyIssues(false);
    setHighlighted(Number(linkedCar));
    setParams(current => { current.delete('car'); return current; }, { replace: true });
  }, [linkedCar, carsLoading, compliance.settled, complianceOpen, fixing, summary.count, setParams]);

  useEffect(() => {
    if (highlighted === null) return;
    const frame = window.requestAnimationFrame(() => {
      document.querySelector(`[data-car-id="${highlighted}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
    const timer = window.setTimeout(() => setHighlighted(null), 4000);
    return () => { window.cancelAnimationFrame(frame); window.clearTimeout(timer); };
  }, [highlighted]);

  // Once per visit, and on every visit: there is no way to dismiss it for good.
  useEffect(() => {
    if (warned.current || summary.count === 0) return;
    warned.current = true;
    setComplianceOpen(true);
  }, [summary.count]);

  useEffect(() => {
    if (checkedCars && summary.count === 0) {
      setComplianceOpen(false);
      setOnlyIssues(false);
    }
  }, [checkedCars, summary.count]);

  const expiryCell = (car: CarCompliance | undefined, field: ComplianceField, date: string | null | undefined) => {
    const issue = car?.issues.find(item => item.field === field);
    if (car && issue) {
      return (
        <button type="button" className={`hc-issue hc-issue-button ${issue.kind === 'expired' ? 'is-expired' : 'is-missing'}`} onClick={() => setFixing(car)}>
          {t(`compliance.cell.${issue.kind}`)}
        </button>
      );
    }
    if (!date) return <span style={{ color: '#9ca3af' }}>—</span>;
    return new Date(`${date}T12:00:00Z`).toLocaleDateString(numberLocale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const handleSort = (col: 'plate_number' | 'model' | 'year' | 'current_km' | 'status') => {
    if (sortCol !== col) { setSortCol(col); setSortDir('asc'); }
    else if (sortDir === 'asc') { setSortDir('desc'); }
    else { setSortCol(null); setSortDir('asc'); }
  };

  useEffect(() => {
    let cancelled = false;

    const fetchCars = async () => {
      setLoading(true);
      setError(null);

      const [{ data: activeCarData, count, error: countError }, { data: allAvail, error: availError }] = await Promise.all([
        supabase.from('cars').select('id', { count: 'exact' }).eq('is_active', true),
        supabase.from('car_availability').select('id, status'),
      ]);

      if (cancelled) return;

      if (countError || availError) {
        setError((countError ?? availError)!.message);
        setLoading(false);
        return;
      }

      setTotalCars(count ?? 0);

      const activeIds = new Set((activeCarData ?? []).map(c => (c as { id: number }).id));
      const availability = (allAvail ?? []).filter(a => activeIds.has((a as { id: number; status: string }).id));

      const working     = availability.filter(c => (c as { status: string }).status?.toLowerCase() === 'working').length;
      const parking     = availability.filter(c => (c as { status: string }).status?.toLowerCase() === 'parking').length;
      const maintenance = availability.filter(c => (c as { status: string }).status?.toLowerCase() === 'maintenance').length;
      const selling     = availability.filter(c => (c as { status: string }).status?.toLowerCase() === 'selling').length;
      const replacement = availability.filter(c => (c as { status: string }).status?.toLowerCase() === 'replacement').length;

      setCounts({ working, parking, maintenance, selling, replacement });
      setLoading(false);
    };

    fetchCars();
    return () => { cancelled = true; };
  }, [refreshKey]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setCarsLoading(true);
      const [carsRes, trackingRes, registrationsRes, availabilityRes, modelGroupsRes] = await Promise.all([
        supabase.from('cars').select('id, plate_number, model_group_id').eq('is_active', true).order('id', { ascending: false }),
        supabase.from('car_tracking').select('car_id, current_km, updated_at').order('updated_at', { ascending: false }),
        supabase.from('cars_registration').select('car_id, manufacture_year, purchase_contract_url, purchase_invoice_url, insurance_file_url, ruhsat_url, kasko'),
        supabase.from('car_availability').select('id, status'),
        supabase.from('model_group').select('id, name'),
      ]);
      if (cancelled) return;

      const rawCars        = (carsRes.data         ?? []) as { id: number; plate_number: string; model_group_id: number | null }[];
      const rawTracking    = (trackingRes.data      ?? []) as { car_id: number; current_km: number; updated_at: string }[];
      const rawRegs        = (registrationsRes.data ?? []) as { car_id: number; manufacture_year: number | null; purchase_contract_url: string | null; purchase_invoice_url: string | null; insurance_file_url: string | null; ruhsat_url: string | null; kasko: string | null }[];
      const rawAvailability= (availabilityRes.data  ?? []) as { id: number; status: string }[];
      const rawModels      = (modelGroupsRes.data   ?? []) as { id: number; name: string }[];

      // Deduplicate tracking — keep only the first (latest) record per car_id
      const seenCarIds = new Set<number>();
      const latestTracking = rawTracking.filter(t => {
        if (seenCarIds.has(t.car_id)) return false;
        seenCarIds.add(t.car_id);
        return true;
      });

      const combined: CarTableRow[] = rawCars.map(car => {
        const reg = rawRegs.find(r => r.car_id === car.id);
        return {
          id:            car.id,
          plate_number:  car.plate_number,
          model:         rawModels.find(m => m.id === car.model_group_id)?.name ?? '—',
          current_km:    latestTracking.find(t => t.car_id === car.id)?.current_km ?? '—',
          year:          reg?.manufacture_year ?? '—',
          status:        rawAvailability.find(a => a.id === car.id)?.status ?? '—',
          contract_url:  reg?.purchase_contract_url ?? null,
          invoice_url:   reg?.purchase_invoice_url ?? null,
          insurance_url: reg?.insurance_file_url ?? null,
          ruhsat_url:    reg?.ruhsat_url ?? null,
          kasko_url:     reg?.kasko ?? null,
        };
      });

      setCars(combined);
      setCarsLoading(false);
    })();
    return () => { cancelled = true; };
  }, [refreshKey]);

  const total = totalCars;

  const countFor = (key: StatCard['key']): number => {
    if (!counts) return 0;
    if (key === 'all') return total;
    return counts[key];
  };

  return (
    <div className="hc-cars-page" style={{
      minHeight: '100%',
      background: 'var(--surface)',
    }}>
      {/* Page header */}
      <div style={{ marginBottom: 24, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background: '#4ba6ea',
            }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#3A74C2', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              {t('eyebrow')}
            </span>
          </div>
          <h1 style={{
            fontSize: 30,
            fontWeight: 500,
            letterSpacing: '-0.8px',
            color: '#0f1117',
            marginBottom: 6,
            lineHeight: 1.1,
          }}>
            {t('title')}
          </h1>
          <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>
            {t('subtitle')}
          </p>
        </div>
      </div>

      <ComplianceBanner summary={summary} onView={() => setComplianceOpen(true)} />
      {compliance.failed && !checkedCars && <ComplianceFailed onRetry={compliance.refresh} />}

      {/* Error state */}
      {error && (
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          background: '#fff',
          border: '1px solid rgba(239,68,68,0.2)',
          borderInlineStart: '4px solid #ef4444',
          borderRadius: 12,
          padding: '14px 18px',
          marginBottom: 32,
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="1.8"/>
            <path d="M12 8v4M12 16h.01" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#0f1117', marginBottom: 2 }}>{t('errorTitle')}</div>
            <div style={{ fontSize: 13, color: '#6b7280' }}>{error}</div>
          </div>
        </div>
      )}

      {/* Stat cards */}
      <div className="hc-cars-stats">
        {loading
          ? CARDS.map(c => <SkeletonCard key={c.key} />)
          : CARDS.map(card => (
              <StatCardComponent
                key={card.key}
                card={card}
                count={countFor(card.key)}
                total={total}
                pressed={carFilter === card.key}
                onPress={() => setCarFilter(card.key)}
              />
            ))
        }
      </div>

      {/* Alert sections */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#f97316' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#f97316', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            {t('alerts.label')}
          </span>
        </div>
        <div className="hc-cars-alerts">
          <ComplianceCard summary={summary} onView={() => setComplianceOpen(true)} />
          <AlertSection
            viewName="upcoming_returns"
            title={t('alerts.upcomingReturns')}
            accentColor="#4ba6ea"
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M3 10h13M3 10l4-4M3 10l4 4" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 14H8M21 14l-4-4M21 14l-4 4" stroke="#4ba6ea" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <AlertSection
            viewName="upcoming_insurance"
            title={t('alerts.insuranceExpiry')}
            accentColor="#f97316"
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="#f97316" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
          <AlertSection
            viewName="upcoming_inspection"
            title={t('alerts.inspectionExpiry')}
            accentColor="#8b5cf6"
            icon={
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
                <path d="M9 11l3 3L22 4" stroke="#8b5cf6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11" stroke="#8b5cf6" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            }
          />
        </div>
      </div>

      {/* Fleet Table */}
      <div style={{ marginTop: 32 }}>
        {/* Section header + search */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, marginBottom: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#3A74C2', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              {t('table.label')}
            </span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
          {summary.count > 0 && (
            <button type="button" aria-pressed={onlyIssues} className="hc-issues-filter" onClick={() => setOnlyIssues(on => !on)}>
              {t('compliance.filter')}
              <span>{summary.count}</span>
            </button>
          )}
          {/* Search */}
          <div style={{ position: 'relative' }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', insetInlineStart: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              type="text"
              placeholder={t('table.searchPlaceholder')}
              value={tableSearch}
              onChange={e => setTableSearch(e.target.value)}
              style={{
                paddingInlineStart: 32, paddingInlineEnd: 12, paddingTop: 8, paddingBottom: 8,
                fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 9,
                outline: 'none', color: '#0f1117', background: '#fff',
                width: 'min(220px, calc(100vw - 160px))', fontFamily: 'inherit',
              }}
            />
          </div>
          </div>
        </div>

        {/* Table card */}
        <div className="surface-depth" style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border-subtle)', overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 1120 }}>
              <thead>
                <tr>
                  {([
                    { key: 'plateNumber', col: 'plate_number' },
                    { key: 'model',       col: 'model'        },
                    { key: 'year',        col: 'year'         },
                    { key: 'currentKm',   col: 'current_km'   },
                    { key: 'status',      col: 'status'       },
                  ] as const).map(({ key, col }) => {
                    const active = sortCol === col;
                    return (
                      <th
                        key={col}
                        onClick={() => handleSort(col)}
                        style={{
                          padding: '9px 14px', fontSize: 11, fontWeight: 700,
                          color: active ? '#3A74C2' : '#9ca3af',
                          textTransform: 'uppercase', letterSpacing: '0.7px',
                          textAlign: 'start', background: '#fff',
                          borderBottom: '1.5px solid #f0f0f0',
                          whiteSpace: 'nowrap', userSelect: 'none',
                          cursor: 'pointer',
                        }}
                        onMouseEnter={e => { if (!active) (e.currentTarget as HTMLTableCellElement).style.color = '#6b7280'; }}
                        onMouseLeave={e => { if (!active) (e.currentTarget as HTMLTableCellElement).style.color = '#9ca3af'; }}
                      >
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          {t(`columns.${key}`)}
                          {active ? (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none">
                              {sortDir === 'asc'
                                ? <path d="M12 19V5M5 12l7-7 7 7" stroke="#4ba6ea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                                : <path d="M12 5v14M5 12l7 7 7-7" stroke="#4ba6ea" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                              }
                            </svg>
                          ) : (
                            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" style={{ opacity: 0 }} className="sort-hint">
                              <path d="M12 5v14M7 9l5-5 5 5M7 15l5 5 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                        </span>
                      </th>
                    );
                  })}
                  {(['insuranceExpiry', 'inspectionExpiry'] as const).map(key => (
                    <th key={key} style={{
                      padding: '9px 14px', fontSize: 11, fontWeight: 700,
                      color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px',
                      textAlign: 'start', background: '#fff',
                      borderBottom: '1.5px solid #f0f0f0',
                      whiteSpace: 'nowrap', userSelect: 'none',
                    }}>
                      {t(`columns.${key}`)}
                    </th>
                  ))}
                  {([
                    { key: 'insurance_url', labelKey: 'insurance' },
                    { key: 'ruhsat_url',    labelKey: 'ruhsat'    },
                    { key: 'kasko_url',     labelKey: 'kasko'     },
                  ] as const).map(col => {
                    const have = cars.filter(c => !!c[col.key]).length;
                    const tot  = cars.length;
                    return (
                      <th key={col.key} style={{
                        padding: '9px 14px', fontSize: 11, fontWeight: 700,
                        color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px',
                        textAlign: 'center', background: '#fff',
                        borderBottom: '1.5px solid #f0f0f0',
                        whiteSpace: 'nowrap', userSelect: 'none',
                      }}>
                        <div>{t(`columns.${col.labelKey}`)}</div>
                        {!carsLoading && tot > 0 && (
                          <div style={{ fontSize: 10, fontWeight: 500, color: '#c0c4cc', marginTop: 1, letterSpacing: 0 }}>
                            ({have}/{tot})
                          </div>
                        )}
                      </th>
                    );
                  })}
                  <th className="hc-car-edit-cell" style={{ padding: '9px 14px', background: '#fff', borderBottom: '1.5px solid #f0f0f0' }}>
                    <span className="sr-only">{t('columns.actions')}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {carsLoading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <tr key={i}>
                      {Array.from({ length: 11 }).map((__, j) => (
                        <td key={j} style={{ padding: '12px 14px' }}>
                          <div style={{ height: 14, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', width: j === 0 ? '80px' : j >= 7 ? '20px' : '60%', margin: j >= 7 ? '0 auto' : undefined }} />
                        </td>
                      ))}
                    </tr>
                  ))
                ) : (() => {
                  const q = tableSearch.trim().toLowerCase();
                  const filtered = cars.filter(car => {
                    if (onlyIssues && !compliance.byId.get(car.id)?.severity) return false;
                    if (carFilter !== 'all' && car.status.toLowerCase() !== carFilter) return false;
                    if (!q) return true;
                    return car.plate_number.toLowerCase().includes(q) || car.model.toLowerCase().includes(q);
                  });

                  if (sortCol) {
                    filtered.sort((a, b) => {
                      let av: string | number;
                      let bv: string | number;
                      if (sortCol === 'year' || sortCol === 'current_km') {
                        av = a[sortCol] === '—' ? 0 : Number(a[sortCol]);
                        bv = b[sortCol] === '—' ? 0 : Number(b[sortCol]);
                      } else {
                        av = String(a[sortCol]).toLowerCase();
                        bv = String(b[sortCol]).toLowerCase();
                      }
                      if (av < bv) return sortDir === 'asc' ? -1 : 1;
                      if (av > bv) return sortDir === 'asc' ? 1 : -1;
                      return 0;
                    });
                  }

                  if (filtered.length === 0) {
                    return (
                      <tr>
                        <td colSpan={12} style={{ padding: '36px 14px', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
                          {carFilter !== 'all' && !tableSearch && !onlyIssues ? (
                            <div className="hc-car-empty">
                              <StatusArt name={carFilter} />
                              {t('table.noStatus')}
                            </div>
                          ) : tableSearch || onlyIssues || carFilter !== 'all' ? t('table.noMatch') : t('table.none')}
                        </td>
                      </tr>
                    );
                  }

                  return filtered.map((car, idx) => {
                    const checked = compliance.byId.get(car.id);
                    return (
                    <tr
                      key={car.plate_number + idx}
                      data-car-id={car.id}
                      className={[checked?.severity && `hc-car-row is-${checked.severity}`, car.id === highlighted && 'hc-car-found'].filter(Boolean).join(' ') || undefined}
                      style={{ borderTop: idx === 0 ? 'none' : '1px solid #f7f7f7' }}
                    >
                      <td style={{ padding: '12px 14px' }}>
                        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 700, color: '#0f1117', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.3px' }}>
                          {checked?.severity && <ComplianceTriangle severity={checked.severity} size={18} />}
                          <span className="hc-num">{car.plate_number}</span>
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151' }}>
                        {car.model}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                        {car.year}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                        {car.current_km !== '—'
                          ? `${Number(car.current_km).toLocaleString(numberLocale)} ${t('table.km')}`
                          : '—'}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {car.status && car.status !== '—' ? <CarStatusBadge status={car.status} /> : <span style={{ fontSize: 12, color: '#9ca3af' }}>—</span>}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>{expiryCell(checked, 'insurance', checked?.insuranceExpiry)}</td>
                      <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151', whiteSpace: 'nowrap' }}>{expiryCell(checked, 'inspection', checked?.inspectionExpiry)}</td>
                      {([car.insurance_url, car.ruhsat_url, car.kasko_url] as (string | null)[]).map((url, di) => (
                        <td key={di} style={{ padding: '12px 14px', textAlign: 'center' }}>
                          {url ? (
                            <a href={url} target="_blank" rel="noreferrer" title={t('table.openDocument')} style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#3A74C2' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" opacity="0.15"/>
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="#4ba6ea" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M14 2v6h6" stroke="#4ba6ea" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M9 13h6M9 17h4" stroke="#4ba6ea" strokeWidth="1.4" strokeLinecap="round"/>
                              </svg>
                            </a>
                          ) : (
                            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#d1d5db' }}>
                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                                <path d="M9 13h6M9 17h4" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round"/>
                              </svg>
                            </span>
                          )}
                        </td>
                      ))}
                      <td className="hc-car-edit-cell" style={{ padding: '8px 14px', textAlign: 'end' }}>
                        <button type="button" className="hc-car-edit" aria-label={t('editor.editCar', { plate: car.plate_number })} onClick={() => setEditing(car.id)}>
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 20h4L18.5 9.5a2.1 2.1 0 00-3-3L5 17v3z" stroke="currentColor" strokeWidth="1.9" strokeLinejoin="round" /><path d="M13.5 8.5l3 3" stroke="currentColor" strokeWidth="1.9" /></svg>
                          {t('editor.editButton')}
                        </button>
                      </td>
                    </tr>
                    );
                  });
                })()}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        th:hover .sort-hint { opacity: 0.4 !important; }
        @keyframes fadeIn {
          from { opacity: 0; }
          to   { opacity: 1; }
        }
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      {showAddCar && (
        <AddCarModal
          onClose={() => setShowAddCar(false)}
          onAdded={() => { setRefreshKey(k => k + 1); compliance.refresh(); }}
        />
      )}

      {complianceOpen && summary.severity && (
        <ComplianceModal summary={summary} onFix={setFixing} onClose={() => setComplianceOpen(false)} covered={!!fixing} />
      )}
      {editing !== null && (
        <CarEditor
          carId={editing}
          isAdmin={isAdmin}
          locale={numberLocale}
          onClose={changed => {
            setEditing(null);
            if (changed) setRefreshKey(k => k + 1);
          }}
          onSaved={() => {
            setEditing(null);
            setToast(t('editor.saved'));
            setRefreshKey(k => k + 1);
            compliance.refresh();
          }}
        />
      )}
      {toast && ReactDOM.createPortal(
        <div role="status" className="hc-toast-in fixed inset-x-3 bottom-6 z-[9400] mx-auto max-w-sm rounded-2xl bg-[#0f1117] px-4 py-3 text-center text-sm font-semibold text-white shadow-lg">{toast}</div>,
        document.body,
      )}
      {fixing && (
        <CarDatesSheet
          car={fixing}
          locale={numberLocale}
          onClose={() => setFixing(null)}
          onSaved={() => { setFixing(null); compliance.refresh(); }}
        />
      )}
    </div>
  );
};

export default CarsPage;
