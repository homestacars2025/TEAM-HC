import React, { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { supabase } from '../lib/supabase';
import { useCurrency } from '../lib/CurrencyContext';

// ─── Types ────────────────────────────────────────────────────────────────────

interface CarRow {
  id: number;
  plate_number: string;
  model: string;
}

type SaveState = 'idle' | 'saving' | 'saved' | 'error';

type SortCol = 'index' | 'plate' | 'model' | 'yesterday' | 'today' | 'diff' | null;
type SortDir = 'asc' | 'desc';

interface SortState {
  col: SortCol;
  dir: SortDir;
}

interface RowState {
  inputValue: string;
  isDirty: boolean;
  saveState: SaveState;
  dbValue: number;
}

interface NoteState {
  value:   string;
  dbValue: string;
  saving:  boolean;
  saved:   boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const c = new Date(d);
  c.setDate(c.getDate() + n);
  return c;
}

function formatDate(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function isToday(d: Date): boolean {
  return toDateStr(d) === toDateStr(new Date());
}

function parseToll(raw: string): number | null {
  const n = parseFloat(raw.replace(',', '.'));
  if (isNaN(n) || n < 0) return null;
  return n;
}

// ─── KGM Page ─────────────────────────────────────────────────────────────────

const KGMPage: React.FC = () => {
  const { fmt, symbol } = useCurrency();
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [cars, setCars] = useState<CarRow[]>([]);
  const [yesterdayMap, setYesterdayMap] = useState<Map<number, number>>(new Map());
  const [rowStates, setRowStates] = useState<Map<number, RowState>>(new Map());
  const [loadingCars, setLoadingCars] = useState(true);
  const [loadingTolls, setLoadingTolls] = useState(false);
  const [sort, setSort] = useState<SortState>({ col: null, dir: 'asc' });
  const [noteStates, setNoteStates] = useState<Map<number, NoteState>>(new Map());
  const [userId, setUserId] = useState<string | null>(null);
  const fetchAbort = useRef<AbortController | null>(null);
  const inputRef = useRef<Map<number, HTMLInputElement>>(new Map());

  // ── Auth user ────────────────────────────────────────────────────────────
  useEffect(() => {
    supabase.auth.getUser().then(({ data, error }) => {
      if (error) { console.error('[KGM] auth.getUser error:', error); return; }
      setUserId(data.user?.id ?? null);
    });
  }, []);

  // ── Fetch cars once ──────────────────────────────────────────────────────
  useEffect(() => {
    let active = true;
    (async () => {
      const { data } = await supabase
        .from('cars')
        .select('id, plate_number, model_group(name)')
        .order('plate_number');
      if (!active || !data) return;
      const rows: CarRow[] = (
        data as Array<{
          id: number;
          plate_number: string;
          model_group: { name: string } | { name: string }[] | null;
        }>
      ).map(c => {
        const mg = c.model_group;
        const model = Array.isArray(mg)
          ? (mg[0]?.name ?? '—')
          : (mg as { name: string } | null)?.name ?? '—';
        return { id: c.id, plate_number: c.plate_number, model };
      });
      setCars(rows);
      setLoadingCars(false);
    })();
    return () => { active = false; };
  }, []);

  // ── Fetch toll data whenever date or cars change ──────────────────────────
  const fetchTolls = useCallback(async (date: Date, carList: CarRow[]) => {
    if (carList.length === 0) return;

    if (fetchAbort.current) fetchAbort.current.abort();
    fetchAbort.current = new AbortController();

    setLoadingTolls(true);

    const todayStr = toDateStr(date);
    const prevStr = toDateStr(addDays(date, -1));

    const [{ data: todayData }, { data: prevData }] = await Promise.all([
      supabase.from('kgm').select('car_id, toll_amount, note').eq('date', todayStr),
      supabase.from('kgm').select('car_id, toll_amount').eq('date', prevStr),
    ]);

    const todayDbMap = new Map<number, { toll_amount: number; note: string }>();
    (todayData ?? []).forEach(
      (r: { car_id: number; toll_amount: number; note: string | null }) =>
        todayDbMap.set(r.car_id, { toll_amount: r.toll_amount, note: r.note ?? '' })
    );

    const yMap = new Map<number, number>();
    (prevData ?? []).forEach(
      (r: { car_id: number; toll_amount: number }) => yMap.set(r.car_id, r.toll_amount)
    );

    const states = new Map<number, RowState>();
    const notes = new Map<number, NoteState>();
    carList.forEach(car => {
      const today = todayDbMap.get(car.id);
      const dbVal = today?.toll_amount ?? 0;
      const noteVal = today?.note ?? '';
      states.set(car.id, {
        inputValue: dbVal === 0 ? '' : String(dbVal),
        isDirty: false,
        saveState: 'idle',
        dbValue: dbVal,
      });
      notes.set(car.id, { value: noteVal, dbValue: noteVal, saving: false, saved: false });
    });

    setYesterdayMap(yMap);
    setRowStates(states);
    setNoteStates(notes);
    setLoadingTolls(false);
  }, []);

  useEffect(() => {
    if (!loadingCars) fetchTolls(selectedDate, cars);
  }, [selectedDate, cars, loadingCars, fetchTolls]);

  // ── Input change ──────────────────────────────────────────────────────────
  const handleInputChange = useCallback((carId: number, value: string) => {
    setRowStates(prev => {
      const next = new Map(prev);
      const row = next.get(carId);
      if (!row) return prev;
      next.set(carId, { ...row, inputValue: value, isDirty: true, saveState: 'idle' });
      return next;
    });
  }, []);

  // ── Save single row ───────────────────────────────────────────────────────
  const handleSave = useCallback(async (carId: number) => {
    const row = rowStates.get(carId);
    if (!row) return;

    const amount = parseToll(row.inputValue);
    if (amount === null) {
      setRowStates(prev => {
        const next = new Map(prev);
        const r = next.get(carId);
        if (r) next.set(carId, { ...r, saveState: 'error' });
        return next;
      });
      return;
    }

    setRowStates(prev => {
      const next = new Map(prev);
      const r = next.get(carId);
      if (r) next.set(carId, { ...r, saveState: 'saving' });
      return next;
    });

    const dateStr  = toDateStr(selectedDate);
    const noteVal  = noteStates.get(carId)?.value ?? '';

    const { data: existing } = await supabase
      .from('kgm')
      .select('id')
      .eq('car_id', carId)
      .eq('date', dateStr)
      .maybeSingle();

    let err: { message: string } | null = null;
    if (existing?.id) {
      const { error } = await supabase
        .from('kgm')
        .update({ toll_amount: amount, note: noteVal || null })
        .eq('id', existing.id);
      if (error) console.error('[KGM] update toll error:', error);
      err = error;
    } else {
      const plateNumber = cars.find(c => c.id === carId)?.plate_number ?? null;
      const { error } = await supabase
        .from('kgm')
        .insert({ car_id: carId, plate_number: plateNumber, date: dateStr, toll_amount: amount, note: noteVal || null, created_by: userId });
      if (error) console.error('[KGM] insert toll error:', error);
      err = error;
    }

    setRowStates(prev => {
      const next = new Map(prev);
      const r = next.get(carId);
      if (!r) return prev;
      if (err) {
        next.set(carId, { ...r, saveState: 'error' });
      } else {
        next.set(carId, {
          ...r,
          isDirty: false,
          saveState: 'saved',
          dbValue: amount,
          inputValue: String(amount),
        });
        setTimeout(() => {
          setRowStates(p2 => {
            const n2 = new Map(p2);
            const r2 = n2.get(carId);
            if (r2 && r2.saveState === 'saved') n2.set(carId, { ...r2, saveState: 'idle' });
            return n2;
          });
        }, 2000);
      }
      return next;
    });
  }, [rowStates, noteStates, selectedDate, userId, cars]);

  // ── Note change ───────────────────────────────────────────────────────────
  const handleNoteChange = useCallback((carId: number, value: string) => {
    setNoteStates(prev => {
      const next = new Map(prev);
      const r = next.get(carId);
      if (!r) return prev;
      next.set(carId, { ...r, value });
      return next;
    });
  }, []);

  // ── Save note ─────────────────────────────────────────────────────────────
  const saveNote = useCallback(async (carId: number) => {
    const ns = noteStates.get(carId);
    if (!ns || ns.saving) return;

    setNoteStates(prev => {
      const next = new Map(prev);
      const r = next.get(carId);
      if (r) next.set(carId, { ...r, saving: true, saved: false });
      return next;
    });

    const dateStr = toDateStr(selectedDate);
    const { data: existing } = await supabase
      .from('kgm').select('id').eq('car_id', carId).eq('date', dateStr).maybeSingle();

    if (existing?.id) {
      const { error } = await supabase.from('kgm').update({ note: ns.value || null }).eq('id', existing.id);
      if (error) console.error('[KGM] update note error:', error);
    } else {
      const plateNumber = cars.find(c => c.id === carId)?.plate_number ?? null;
      const { error } = await supabase.from('kgm').insert({ car_id: carId, plate_number: plateNumber, date: dateStr, note: ns.value || null, created_by: userId });
      if (error) console.error('[KGM] insert note error:', error);
    }

    setNoteStates(prev => {
      const next = new Map(prev);
      const r = next.get(carId);
      if (r) next.set(carId, { value: r.value, dbValue: r.value, saving: false, saved: true });
      return next;
    });
    setTimeout(() => {
      setNoteStates(prev => {
        const next = new Map(prev);
        const r = next.get(carId);
        if (r && r.saved) next.set(carId, { ...r, saved: false });
        return next;
      });
    }, 2000);
  }, [noteStates, selectedDate, userId, cars]);

  // ── Navigation ────────────────────────────────────────────────────────────
  const goTo = (n: number) => setSelectedDate(d => addDays(d, n));

  // ── Sorting ───────────────────────────────────────────────────────────────
  const handleSort = useCallback((col: Exclude<SortCol, null>) => {
    setSort(prev => {
      if (prev.col !== col) return { col, dir: 'asc' };
      if (prev.dir === 'asc') return { col, dir: 'desc' };
      return { col: null, dir: 'asc' };
    });
  }, []);

  // ── Totals ────────────────────────────────────────────────────────────────
  const totalYesterday = cars.reduce((s, c) => s + (yesterdayMap.get(c.id) ?? 0), 0);
  const totalToday = cars.reduce((s, c) => {
    const row = rowStates.get(c.id);
    if (!row) return s;
    const v = parseToll(row.inputValue);
    return s + (v !== null ? v : row.dbValue);
  }, 0);
  const totalDiff = totalToday - totalYesterday;

  const isLoading = loadingCars || loadingTolls;

  // ── Sorted rows ───────────────────────────────────────────────────────────
  const sortedCars = useMemo(() => {
    if (sort.col === null) return cars;
    const arr = [...cars];
    arr.sort((a, b) => {
      let aVal: string | number = 0;
      let bVal: string | number = 0;
      switch (sort.col) {
        case 'index':
          aVal = cars.indexOf(a);
          bVal = cars.indexOf(b);
          break;
        case 'plate':
          aVal = a.plate_number;
          bVal = b.plate_number;
          break;
        case 'model':
          aVal = a.model;
          bVal = b.model;
          break;
        case 'yesterday':
          aVal = yesterdayMap.get(a.id) ?? 0;
          bVal = yesterdayMap.get(b.id) ?? 0;
          break;
        case 'today': {
          const rA = rowStates.get(a.id);
          const rB = rowStates.get(b.id);
          aVal = rA ? (parseToll(rA.inputValue) ?? rA.dbValue) : 0;
          bVal = rB ? (parseToll(rB.inputValue) ?? rB.dbValue) : 0;
          break;
        }
        case 'diff': {
          const rA = rowStates.get(a.id);
          const rB = rowStates.get(b.id);
          const tA = rA ? (parseToll(rA.inputValue) ?? rA.dbValue) : 0;
          const tB = rB ? (parseToll(rB.inputValue) ?? rB.dbValue) : 0;
          aVal = tA - (yesterdayMap.get(a.id) ?? 0);
          bVal = tB - (yesterdayMap.get(b.id) ?? 0);
          break;
        }
      }
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        return sort.dir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sort.dir === 'asc'
        ? (aVal as number) - (bVal as number)
        : (bVal as number) - (aVal as number);
    });
    return arr;
  }, [cars, sort, yesterdayMap, rowStates]);

  // ── Print ─────────────────────────────────────────────────────────────────
  const handlePrint = () => {
    const dateStr = toDateStr(selectedDate);

    const rowsHtml = cars.map((car, idx) => {
      const row = rowStates.get(car.id);
      const inputValue = row?.inputValue ?? '';
      const dbValue = row?.dbValue ?? 0;
      const yVal = yesterdayMap.get(car.id) ?? 0;
      const tValParsed = parseToll(inputValue);
      const tVal = tValParsed !== null ? tValParsed : dbValue;
      const diff = tVal - yVal;
      const diffColor = diff > 0 ? '#16a34a' : diff < 0 ? '#dc2626' : '#6b7280';
      const diffStr = tVal === 0 && yVal === 0 ? '—' : `${diff > 0 ? '+' : diff < 0 ? '-' : ''}${fmt(diff)}`;
      const bg = idx % 2 === 1 ? '#f9fafb' : '#ffffff';
      return `<tr style="background:${bg}">
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;font-weight:700">${car.plate_number}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;color:#6b7280">${car.model}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;font-weight:700">${tVal === 0 ? '—' : fmt(tVal)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;color:#9ca3af">${yVal === 0 ? '—' : fmt(yVal)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #f0f0f0;font-size:12px;text-align:right;font-weight:700;color:${diffColor}">${diffStr}</td>
      </tr>`;
    }).join('');

    const cardDiffBg = totalDiff > 0 ? '#16a34a' : totalDiff < 0 ? '#dc2626' : '#9ca3af';
    const footerDiffColor = totalDiff > 0 ? '#16a34a' : totalDiff < 0 ? '#dc2626' : '#6b7280';
    const now = new Date();
    const generatedAt = now.toLocaleString('en-GB', {
      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <title>KGM-${dateStr}</title>
  <style>
    @page { size: A4 landscape; margin: 20mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif; color: #111827; }
  </style>
</head>
<body>
  <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;border-bottom:2px solid #e5e7eb;padding-bottom:16px">
    <div>
      <div style="font-size:22px;font-weight:800;color:#0f1117;letter-spacing:-0.5px">KGM Daily Report</div>
      <div style="font-size:12px;color:#6b7280;margin-top:4px">Generated: ${generatedAt}</div>
    </div>
    <div style="text-align:right">
      <div style="font-size:16px;font-weight:700;color:#0f1117">${formatDate(selectedDate)}</div>
    </div>
  </div>
  <div style="display:flex;gap:16px;margin-bottom:24px">
    <div style="flex:1;padding:16px 20px;border-radius:10px;background:#4ba6ea;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;opacity:0.85;margin-bottom:6px">Today Total</div>
      <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px">${fmt(totalToday)}</div>
    </div>
    <div style="flex:1;padding:16px 20px;border-radius:10px;background:#6b7280;color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;opacity:0.85;margin-bottom:6px">Yesterday Total</div>
      <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px">${fmt(totalYesterday)}</div>
    </div>
    <div style="flex:1;padding:16px 20px;border-radius:10px;background:${cardDiffBg};color:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact">
      <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.7px;opacity:0.85;margin-bottom:6px">Difference</div>
      <div style="font-size:28px;font-weight:800;letter-spacing:-0.5px">${totalDiff > 0 ? '+' : totalDiff < 0 ? '-' : ''}${fmt(totalDiff)}</div>
    </div>
  </div>
  <table style="width:100%;border-collapse:collapse;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif">
    <thead>
      <tr style="background:#f9fafb;-webkit-print-color-adjust:exact;print-color-adjust:exact">
        <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb">Plate</th>
        <th style="padding:10px 12px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb">Model</th>
        <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb">Today</th>
        <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb">Yesterday</th>
        <th style="padding:10px 12px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:#6b7280;border-bottom:2px solid #e5e7eb">Difference</th>
      </tr>
    </thead>
    <tbody>${rowsHtml}</tbody>
    <tfoot>
      <tr style="background:#f3f4f6;-webkit-print-color-adjust:exact;print-color-adjust:exact">
        <td colspan="2" style="padding:10px 12px;font-weight:700;font-size:13px;border-top:2px solid #e5e7eb">Total (${cars.length} vehicles)</td>
        <td style="padding:10px 12px;text-align:right;font-weight:800;font-size:13px;border-top:2px solid #e5e7eb;color:#0f1117">${fmt(totalToday)}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:700;font-size:13px;border-top:2px solid #e5e7eb;color:#6b7280">${fmt(totalYesterday)}</td>
        <td style="padding:10px 12px;text-align:right;font-weight:800;font-size:13px;border-top:2px solid #e5e7eb;color:${footerDiffColor}">${totalDiff > 0 ? '+' : totalDiff < 0 ? '-' : ''}${fmt(totalDiff)}</td>
      </tr>
    </tfoot>
  </table>
  <div style="margin-top:24px;padding-top:12px;border-top:1px solid #e5e7eb;text-align:center;font-size:11px;color:#9ca3af">
    Homesta Cars - KGM Toll Management System
  </div>
  <script>
    window.onload = function() {
      window.print();
      setTimeout(function() { window.close(); }, 500);
    };
  </script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=1100,height=800');
    if (!win) return;
    win.document.write(html);
    win.document.close();
  };

  return (
    <>
      <style>{`
        /* ── Screen styles ── */
        .kgm-row:hover td { background: #f9fafb !important; }
        .kgm-input {
          width: 86px;
          padding: 7px 10px;
          font-size: 14px;
          font-family: inherit;
          font-weight: 600;
          color: #0f1117;
          text-align: right;
          background: transparent;
          border: 1.5px solid transparent;
          border-radius: 8px;
          outline: none;
          transition: border-color 160ms ease, background 160ms ease;
          -moz-appearance: textfield;
        }
        .kgm-input::-webkit-outer-spin-button,
        .kgm-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
        .kgm-input:hover { border-color: #e5e7eb; background: #fff; }
        .kgm-input:focus { border-color: #4ba6ea !important; background: #fff; box-shadow: 0 0 0 3px rgba(75,166,234,0.1); }
        .kgm-input.is-error { border-color: #fca5a5 !important; }
        .kgm-save-btn {
          padding: 5px 11px;
          border-radius: 7px;
          border: none;
          background: #4ba6ea;
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          opacity: 0;
          transform: translateX(-4px);
          transition: opacity 160ms ease, transform 160ms ease, background 120ms ease;
          pointer-events: none;
          white-space: nowrap;
        }
        .kgm-save-btn.visible { opacity: 1; transform: translateX(0); pointer-events: auto; }
        .kgm-save-btn:hover { background: #2e8fd4; }
        .kgm-save-btn.saving { background: #93c5fd; cursor: default; pointer-events: none; }
        .kgm-note-input {
          width: 100%;
          padding: 7px 10px;
          font-size: 13px;
          font-family: inherit;
          color: #374151;
          background: transparent;
          border: 1.5px solid transparent;
          border-radius: 8px;
          outline: none;
          transition: border-color 160ms ease, background 160ms ease, opacity 160ms ease;
        }
        .kgm-note-input::placeholder { color: #d1d5db; }
        .kgm-note-input:hover { border-color: #e5e7eb; background: #fff; }
        .kgm-note-input:focus { border-color: #4ba6ea !important; background: #fff; box-shadow: 0 0 0 3px rgba(75,166,234,0.1); }
        .kgm-note-input.is-saving { opacity: 0.5; pointer-events: none; }
        .kgm-note-save-btn {
          flex-shrink: 0;
          padding: 5px 11px;
          border-radius: 7px;
          border: none;
          background: #4ba6ea;
          color: #fff;
          font-size: 12px;
          font-weight: 700;
          font-family: inherit;
          cursor: pointer;
          opacity: 0;
          transform: translateX(-4px);
          transition: opacity 160ms ease, transform 160ms ease, background 120ms ease;
          pointer-events: none;
          white-space: nowrap;
        }
        .kgm-note-save-btn.visible { opacity: 1; transform: translateX(0); pointer-events: auto; }
        .kgm-note-save-btn:hover { background: #2e8fd4; }
        .kgm-note-save-btn.saving { background: #93c5fd; cursor: default; pointer-events: none; }
        .kgm-note-save-btn.saved  { background: #16a34a; cursor: default; pointer-events: none; }

      `}</style>

      {/* ── Screen UI ── */}
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', background: '#fff' }}>

        {/* ── Page Header ── */}
        <div style={{
          padding: '36px 40px 24px',
          borderBottom: '1px solid #f0f0f0',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: '#4ba6ea', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
              Operations
            </span>
          </div>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.8px', color: '#0f1117', marginBottom: 6, lineHeight: 1.1 }}>
            KGM Tolls
          </h1>
          <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.5 }}>
            Daily toll records across all vehicles.
          </p>
        </div>

        {/* ── Date Header ── */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          padding: '28px 36px 20px',
          borderBottom: '1px solid #f0f0f0',
          flexShrink: 0,
          position: 'relative',
        }}>
          <NavArrow direction="left" onClick={() => goTo(-1)} />

          <div style={{ textAlign: 'center', minWidth: 300 }}>
            <div style={{ fontSize: 20, fontWeight: 700, color: '#0f1117', letterSpacing: '-0.5px', lineHeight: 1.2 }}>
              {formatDate(selectedDate)}
            </div>
            {!isToday(selectedDate) && (
              <button
                onClick={() => setSelectedDate(new Date())}
                style={{
                  marginTop: 6, padding: '3px 12px', borderRadius: 20,
                  border: '1px solid #e5e7eb', background: 'transparent',
                  color: '#9ca3af', fontSize: 12, fontWeight: 500,
                  cursor: 'pointer', fontFamily: 'inherit', transition: 'all 140ms ease',
                }}
                onMouseEnter={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#4ba6ea'; b.style.color = '#4ba6ea'; }}
                onMouseLeave={e => { const b = e.currentTarget as HTMLButtonElement; b.style.borderColor = '#e5e7eb'; b.style.color = '#9ca3af'; }}
              >
                Go to today
              </button>
            )}
          </div>

          <NavArrow direction="right" onClick={() => goTo(1)} disabled={isToday(selectedDate)} />

          {/* Print button — absolute top-right */}
          <button
            onClick={handlePrint}
            style={{
              position: 'absolute',
              right: 36,
              top: '50%',
              transform: 'translateY(-50%)',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              padding: '9px 16px',
              borderRadius: 9,
              border: 'none',
              background: '#4ba6ea',
              color: '#fff',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
              transition: 'background 140ms ease',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#2e8fd4'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 9V2h12v7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <rect x="6" y="14" width="12" height="8" rx="1" stroke="currentColor" strokeWidth="2"/>
            </svg>
            Print
          </button>
        </div>

        {/* ── Table ── */}
        <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
          {isLoading ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#9ca3af', fontSize: 14 }}>
              Loading…
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 48 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 180 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 220 }} />
              </colgroup>
              <thead>
                <tr>
                  <Th style={{ textAlign: 'center' }} sortKey="index" activeSort={sort} onSort={handleSort}>#</Th>
                  <Th sortKey="plate" activeSort={sort} onSort={handleSort}>Plate</Th>
                  <Th sortKey="model" activeSort={sort} onSort={handleSort}>Model</Th>
                  <Th style={{ textAlign: 'right' }} sortKey="yesterday" activeSort={sort} onSort={handleSort}>Yesterday</Th>
                  <Th style={{ textAlign: 'right' }} sortKey="today" activeSort={sort} onSort={handleSort}>Today</Th>
                  <Th style={{ textAlign: 'right' }} sortKey="diff" activeSort={sort} onSort={handleSort}>Difference</Th>
                  <Th>Note</Th>
                </tr>
              </thead>
              <tbody>
                {sortedCars.map((car, idx) => {
                  const row = rowStates.get(car.id);
                  const inputValue = row?.inputValue ?? '';
                  const isDirty = row?.isDirty ?? false;
                  const saveState = row?.saveState ?? 'idle';
                  const dbValue = row?.dbValue ?? 0;

                  const yVal = yesterdayMap.get(car.id) ?? 0;
                  const tValParsed = parseToll(inputValue);
                  const tVal = tValParsed !== null ? tValParsed : dbValue;
                  const diff = tVal - yVal;

                  const noteState = noteStates.get(car.id);
                  const noteValue = noteState?.value ?? '';
                  const noteSaving = noteState?.saving ?? false;

                  return (
                    <tr key={car.id} className="kgm-row">
                      <td style={{ padding: '14px 0', textAlign: 'center' }}>
                        <span style={{ fontSize: 12, color: '#c0c4cc', fontWeight: 500 }}>{idx + 1}</span>
                      </td>
                      <td style={{ padding: '14px 12px 14px 16px', overflow: 'hidden' }}>
                        <div style={{
                          display: 'inline-block', background: '#f3f4f6', borderRadius: 6,
                          padding: '3px 9px', fontSize: 13, fontWeight: 700, color: '#0f1117',
                          letterSpacing: '0.3px', whiteSpace: 'nowrap', overflow: 'hidden',
                          textOverflow: 'ellipsis', maxWidth: '100%',
                        }}>
                          {car.plate_number}
                        </div>
                      </td>
                      <td style={{ padding: '14px 12px', overflow: 'hidden' }}>
                        <span style={{
                          fontSize: 13, color: '#9ca3af', whiteSpace: 'nowrap',
                          overflow: 'hidden', textOverflow: 'ellipsis', display: 'block',
                        }}>
                          {car.model}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <span style={{ fontSize: 14, color: yVal === 0 ? '#d1d5db' : '#9ca3af', fontWeight: 500, whiteSpace: 'nowrap' }}>
                          {yVal === 0 ? '—' : fmt(yVal)}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px 10px 8px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                          {saveState === 'saved' && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                              <path d="M20 6L9 17l-5-5" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                          )}
                          {saveState === 'error' && (
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
                              <circle cx="12" cy="12" r="9" stroke="#ef4444" strokeWidth="2"/>
                              <path d="M12 8v4M12 16v.5" stroke="#ef4444" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                          )}
                          <button
                            className={`kgm-save-btn${isDirty ? ' visible' : ''}${saveState === 'saving' ? ' saving' : ''}`}
                            onClick={() => handleSave(car.id)}
                            disabled={saveState === 'saving'}
                          >
                            {saveState === 'saving' ? 'Saving…' : 'Save'}
                          </button>
                          <input
                            ref={el => {
                              if (el) inputRef.current.set(car.id, el);
                              else inputRef.current.delete(car.id);
                            }}
                            type="number"
                            min="0"
                            step="0.01"
                            value={inputValue}
                            placeholder="0"
                            className={`kgm-input${saveState === 'error' ? ' is-error' : ''}`}
                            onChange={e => handleInputChange(car.id, e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter' && isDirty) handleSave(car.id); }}
                          />
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <span style={{
                          fontSize: 14, fontWeight: 700, whiteSpace: 'nowrap',
                          color: diff > 0 ? '#22c55e' : diff < 0 ? '#ef4444' : '#d1d5db',
                        }}>
                          {tVal === 0 && yVal === 0 ? '—' : `${diff > 0 ? '+' : diff < 0 ? '-' : ''}${fmt(diff)}`}
                        </span>
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <input
                            type="text"
                            value={noteValue}
                            placeholder="Add note…"
                            className={`kgm-note-input${noteSaving ? ' is-saving' : ''}`}
                            style={{ flex: 1, minWidth: 0 }}
                            onChange={e => handleNoteChange(car.id, e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); saveNote(car.id); } }}
                            disabled={noteSaving}
                          />
                          <button
                            className={[
                              'kgm-note-save-btn',
                              (noteState?.value !== noteState?.dbValue || noteState?.saved) ? 'visible' : '',
                              noteSaving ? 'saving' : '',
                              noteState?.saved ? 'saved' : '',
                            ].filter(Boolean).join(' ')}
                            onClick={() => saveNote(car.id)}
                            disabled={noteSaving}
                          >
                            {noteSaving ? 'Saving…' : noteState?.saved ? '✓ Saved' : 'Save'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {/* ── Sticky Footer ── */}
        {!isLoading && cars.length > 0 && (
          <div style={{ borderTop: '2px solid #f0f0f0', background: '#fafafa', flexShrink: 0 }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: 48 }} />
                <col style={{ width: 120 }} />
                <col style={{ width: 180 }} />
                <col style={{ width: 140 }} />
                <col style={{ width: 160 }} />
                <col style={{ width: 130 }} />
                <col style={{ width: 220 }} />
              </colgroup>
              <tbody>
                <tr>
                  <td />
                  <td colSpan={2} style={{ padding: '14px 16px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.7px' }}>Total</span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#6b7280', whiteSpace: 'nowrap' }}>
                      {fmt(totalYesterday)}
                    </span>
                  </td>
                  <td style={{ padding: '14px 12px', textAlign: 'right' }}>
                    <span style={{ fontSize: 15, fontWeight: 800, color: '#0f1117', whiteSpace: 'nowrap' }}>
                      {fmt(totalToday)}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <span style={{
                      fontSize: 15, fontWeight: 800, whiteSpace: 'nowrap',
                      color: totalDiff > 0 ? '#22c55e' : totalDiff < 0 ? '#ef4444' : '#9ca3af',
                    }}>
                      {totalDiff > 0 ? '+' : totalDiff < 0 ? '-' : ''}{fmt(totalDiff)}
                    </span>
                  </td>
                  <td />
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

    </>
  );
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ThProps extends React.ThHTMLAttributes<HTMLTableCellElement> {
  sortKey?: Exclude<SortCol, null>;
  activeSort?: SortState;
  onSort?: (col: Exclude<SortCol, null>) => void;
}

const Th: React.FC<ThProps> = ({ children, style, sortKey, activeSort, onSort, ...rest }) => {
  const isActive = !!(sortKey && activeSort?.col === sortKey);
  const indicator = sortKey
    ? isActive
      ? activeSort!.dir === 'asc' ? '↑' : '↓'
      : '↕'
    : null;

  return (
    <th
      onClick={sortKey && onSort ? () => onSort(sortKey) : undefined}
      style={{
        padding: '12px 16px',
        fontSize: 11,
        fontWeight: 700,
        color: isActive ? '#4ba6ea' : '#9ca3af',
        textTransform: 'uppercase',
        letterSpacing: '0.7px',
        textAlign: 'left',
        background: '#fff',
        borderBottom: '1.5px solid #f0f0f0',
        position: 'sticky',
        top: 0,
        zIndex: 1,
        cursor: sortKey ? 'pointer' : 'default',
        userSelect: 'none',
        transition: 'color 140ms ease',
        ...style,
      }}
      {...rest}
    >
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}>
        {children}
        {indicator && (
          <span style={{
            fontSize: 12,
            color: isActive ? '#4ba6ea' : '#d1d5db',
            transition: 'color 140ms ease',
            lineHeight: 1,
          }}>
            {indicator}
          </span>
        )}
      </span>
    </th>
  );
};

interface NavArrowProps {
  direction: 'left' | 'right';
  onClick: () => void;
  disabled?: boolean;
}

const NavArrow: React.FC<NavArrowProps> = ({ direction, onClick, disabled = false }) => {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 36, height: 36, borderRadius: 10,
        border: `1.5px solid ${hovered && !disabled ? '#4ba6ea' : '#e5e7eb'}`,
        background: hovered && !disabled ? 'rgba(75,166,234,0.06)' : '#fff',
        color: disabled ? '#d1d5db' : hovered ? '#4ba6ea' : '#6b7280',
        cursor: disabled ? 'not-allowed' : 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 140ms ease', flexShrink: 0,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
        {direction === 'left'
          ? <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          : <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
        }
      </svg>
    </button>
  );
};

export default KGMPage;
