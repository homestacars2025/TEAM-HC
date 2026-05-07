import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';

interface RawTrackingRow {
  id: number;
  car_id: number;
  plate_number: string | null;
  current_km: number | null;
  next_oil_change: number | null;
  updated_at: string;
}

interface RawCarRow {
  id: number;
  plate_number: string;
  model_group_id: number | null;
  model_group: { name: string } | null;
}

interface TrackingDisplayRow {
  id: number;
  car_id: number;
  plate_number: string;
  model: string;
  current_km: number | null;
  daily_km: number;
  next_oil_change: number | null;
}

const CarTrackingPage: React.FC = () => {
  const [displayRows, setDisplayRows] = useState<TrackingDisplayRow[]>([]);
  const [loading, setLoading]         = useState(true);
  const [search, setSearch]           = useState('');
  const [editingId, setEditingId]     = useState<number | null>(null);
  const [editValue, setEditValue]     = useState('');
  const [saving, setSaving]           = useState(false);
  const [sortCol, setSortCol]         = useState<keyof TrackingDisplayRow | null>(null);
  const [sortDir, setSortDir]         = useState<'asc' | 'desc'>('asc');
  const inputRef = useRef<HTMLInputElement>(null);

  const handleSort = (col: keyof TrackingDisplayRow) => {
    if (sortCol !== col) { setSortCol(col); setSortDir('asc'); }
    else if (sortDir === 'asc') { setSortDir('desc'); }
    else { setSortCol(null); setSortDir('asc'); }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: trackingData }, { data: carsData }] = await Promise.all([
        supabase
          .from('car_tracking')
          .select('*')
          .order('updated_at', { ascending: false }),
        supabase
          .from('cars')
          .select('id, plate_number, model_group_id, model_group:model_group_id(name)')
          .eq('is_active', true),
      ]);
      if (cancelled) return;

      const tracking = (trackingData ?? []) as any[];
      const cars     = (carsData     ?? []) as any[];

      // Deduplicate: keep only the latest record per car_id (already ordered latest first)
      const seen = new Set<number>();
      const rows: TrackingDisplayRow[] = [];
      for (const t of tracking) {
        if (seen.has(t.car_id)) continue;
        seen.add(t.car_id);
        const car = cars.find((c: any) => c.id === t.car_id);
        rows.push({
          id:              t.id,
          car_id:          t.car_id,
          plate_number:    t.plate_number ?? car?.plate_number ?? '—',
          model:           car?.model_group?.name ?? '—',
          current_km:      t.current_km ?? null,
          daily_km:        (t.current_km != null && t.km_at_midnight != null) ? t.current_km - t.km_at_midnight : 0,
          next_oil_change: t.next_oil_change ?? null,
        });
      }

      setDisplayRows(rows);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (editingId !== null) inputRef.current?.focus();
  }, [editingId]);

  const startEdit = (row: TrackingDisplayRow) => {
    setEditingId(row.id);
    setEditValue(row.next_oil_change !== null ? String(row.next_oil_change) : '');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const saveEdit = async (rowId: number) => {
    const value = editValue.trim() === '' ? null : Number(editValue.trim());
    if (value !== null && isNaN(value)) { cancelEdit(); return; }
    setSaving(true);
    const { error } = await supabase
      .from('car_tracking')
      .update({ next_oil_change: value })
      .eq('id', rowId);
    setSaving(false);
    if (!error) {
      setDisplayRows(prev =>
        prev.map(r => r.id === rowId ? { ...r, next_oil_change: value } : r)
      );
    }
    cancelEdit();
  };

  const q = search.trim().toLowerCase();
  const filtered = (() => {
    const rows = displayRows.filter(r => !q || r.plate_number.toLowerCase().includes(q));
    if (!sortCol) return rows;
    return [...rows].sort((a, b) => {
      const aVal = a[sortCol];
      const bVal = b[sortCol];
      if (aVal === null || aVal === undefined) return 1;
      if (bVal === null || bVal === undefined) return -1;
      if (typeof aVal === 'string') return sortDir === 'asc' ? aVal.localeCompare(bVal as string) : (bVal as string).localeCompare(aVal);
      return sortDir === 'asc' ? (aVal as number) - (bVal as number) : (bVal as number) - (aVal as number);
    });
  })();

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #f8fafc 0%, #f1f5f9 100%)',
      padding: '44px 40px',
    }}>
      {/* Page header */}
      <div style={{ marginBottom: 36 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            Fleet
          </span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', marginBottom: 6, lineHeight: 1.1 }}>
          Car Tracking
        </h1>
        <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>
          Live vehicle tracking data.
        </p>
      </div>

      {/* Section header + search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            All Vehicles
          </span>
        </div>
        <div style={{ position: 'relative' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: '#9ca3af', pointerEvents: 'none' }}>
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
            <path d="M21 21l-4.35-4.35" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
          </svg>
          <input
            type="text"
            placeholder="Search plate…"
            value={search}
            onChange={e => setSearch(e.target.value)}
            style={{
              paddingLeft: 32, paddingRight: 12, paddingTop: 8, paddingBottom: 8,
              fontSize: 13, border: '1.5px solid #e5e7eb', borderRadius: 9,
              outline: 'none', color: '#0f1117', background: '#fff',
              width: 220, fontFamily: 'inherit',
            }}
          />
        </div>
      </div>

      {/* Table card */}
      <div style={{ background: '#fff', borderRadius: 14, border: '1px solid #f0f0f0', overflow: 'hidden', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 800 }}>
            <thead>
              <tr>
                {([
                  { label: 'Plate Number',   col: 'plate_number'   },
                  { label: 'Model',          col: 'model'          },
                  { label: 'Current KM',     col: 'current_km'     },
                  { label: 'Daily KM',       col: 'daily_km'       },
                  { label: 'Next Oil Change',col: 'next_oil_change'},
                  { label: 'KM Remaining',   col: null             },
                ] as { label: string; col: keyof TrackingDisplayRow | null }[]).map(({ label, col }) => {
                  const active = col !== null && sortCol === col;
                  return (
                    <th
                      key={label}
                      onClick={() => col !== null && handleSort(col)}
                      style={{
                        padding: '9px 14px', fontSize: 11, fontWeight: 700,
                        color: active ? '#4ba6ea' : '#9ca3af',
                        textTransform: 'uppercase', letterSpacing: '0.7px',
                        textAlign: 'left', background: '#fff',
                        borderBottom: '1.5px solid #f0f0f0',
                        whiteSpace: 'nowrap', userSelect: 'none',
                        cursor: col !== null ? 'pointer' : 'default',
                      }}
                      onMouseEnter={e => { if (col !== null && !active) (e.currentTarget as HTMLTableCellElement).style.color = '#6b7280'; }}
                      onMouseLeave={e => { if (col !== null && !active) (e.currentTarget as HTMLTableCellElement).style.color = '#9ca3af'; }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                        {label}
                        {col !== null && (active ? (
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
                        ))}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                Array.from({ length: 6 }).map((_, i) => (
                  <tr key={i}>
                    {Array.from({ length: 6 }).map((__, j) => (
                      <td key={j} style={{ padding: '12px 14px' }}>
                        <div style={{ height: 14, borderRadius: 6, background: '#f3f4f6', animation: 'pulse 1.5s ease-in-out infinite', width: j === 0 ? '80px' : '60%' }} />
                      </td>
                    ))}
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ padding: '36px 14px', textAlign: 'center', fontSize: 13, color: '#9ca3af' }}>
                    {search ? 'No cars match your search.' : 'No tracking data found.'}
                  </td>
                </tr>
              ) : filtered.map((row, idx) => {
                const kmRemaining = row.next_oil_change && row.current_km
                  ? row.next_oil_change - row.current_km
                  : null;
                const isEditing = editingId === row.id;
                return (
                  <tr key={row.car_id} style={{ borderTop: idx === 0 ? 'none' : '1px solid #f7f7f7' }}>
                    <td style={{ padding: '12px 14px' }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: '#0f1117', fontVariantNumeric: 'tabular-nums', letterSpacing: '0.3px' }}>
                        {row.plate_number}
                      </span>
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151' }}>
                      {row.model}
                    </td>
                    <td style={{ padding: '12px 14px', fontSize: 13, color: '#374151', fontVariantNumeric: 'tabular-nums' }}>
                      {row.current_km !== null ? row.current_km.toLocaleString() + ' km' : '—'}
                    </td>
                    <td style={{ padding: '12px 14px', fontVariantNumeric: 'tabular-nums' }}>
                      {row.daily_km > 0 ? (
                        <span style={{ color: '#16a34a', fontWeight: 500 }}>+{row.daily_km.toLocaleString()} km</span>
                      ) : (
                        <span style={{ color: '#9ca3af' }}>0 km</span>
                      )}
                    </td>

                    {/* Next Oil Change — inline editable */}
                    <td style={{ padding: '12px 14px', fontSize: 13, fontVariantNumeric: 'tabular-nums' }}>
                      {isEditing ? (
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <input
                            ref={inputRef}
                            type="number"
                            value={editValue}
                            onChange={e => setEditValue(e.target.value)}
                            onKeyDown={e => {
                              if (e.key === 'Enter') saveEdit(row.id);
                              if (e.key === 'Escape') cancelEdit();
                            }}
                            style={{
                              width: 90, padding: '4px 8px', fontSize: 13,
                              border: '1.5px solid #4ba6ea', borderRadius: 7,
                              outline: 'none', fontFamily: 'inherit',
                              color: '#0f1117', background: '#fff',
                            }}
                          />
                          {/* Confirm */}
                          <button
                            onClick={() => saveEdit(row.id)}
                            disabled={saving}
                            style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#16a34a', padding: 0 }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                              <path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          </button>
                          {/* Cancel */}
                          <button
                            onClick={cancelEdit}
                            style={{ width: 26, height: 26, borderRadius: 6, border: '1px solid #e5e7eb', background: '#fff', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', padding: 0 }}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                            </svg>
                          </button>
                        </div>
                      ) : (
                        <div
                          onClick={() => startEdit(row)}
                          style={{ display: 'inline-flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
                        >
                          {row.next_oil_change !== null ? (
                            <span style={{ color: '#374151' }}>{row.next_oil_change.toLocaleString()} km</span>
                          ) : (
                            <span style={{ color: '#9ca3af' }}>—</span>
                          )}
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" style={{ color: '#c0c4cc', flexShrink: 0 }}>
                            <path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            <path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        </div>
                      )}
                    </td>

                    {/* KM Remaining */}
                    <td style={{ padding: '12px 14px', fontVariantNumeric: 'tabular-nums' }}>
                      {kmRemaining === null ? (
                        <span style={{ fontSize: 13, color: '#9ca3af' }}>—</span>
                      ) : kmRemaining > 1000 ? (
                        <span style={{ fontSize: 13, fontWeight: 500, color: '#16a34a' }}>+{kmRemaining.toLocaleString()} km</span>
                      ) : kmRemaining > 0 ? (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          color: '#ca8a04', background: '#fef9c3',
                        }}>
                          ⚠ {kmRemaining.toLocaleString()} km
                        </span>
                      ) : (
                        <span style={{
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          padding: '2px 8px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          color: '#dc2626', background: '#fee2e2',
                        }}>
                          ⚠ Overdue
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.45; }
        }
        th:hover .sort-hint { opacity: 0.4 !important; }
      `}</style>
    </div>
  );
};

export default CarTrackingPage;
