import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import HoverTip from '../components/HoverTip';
import StaffAvatar from '../components/StaffAvatar';
import Button from '../components/Button';
import DateRangeFilter from '../components/DateRangeFilter';
import PlateChip from '../components/booking/PlateChip';
import { StatTile } from '../components/WalletParts';
import { useTileFilter } from '../hooks/useTileFilter';
import { asAction, asStatus, entryMatches, groupByBooking, insideIds, kabisDay, KABIS_FILTERS, type KabisAction, type KabisEntry, type KabisFilter, type KabisStatus } from '../lib/kabis';
import { useKabisLive } from '../lib/KabisLiveContext';
import { getKabisEntries } from '../lib/queries/kabis';

interface ToastState { message: string; kind: 'success' | 'error' }

// ─── Design tokens ────────────────────────────────────────────────────────────

/** Figures stay column-aligned across rows. */
const NUM: React.CSSProperties = { fontVariantNumeric: 'tabular-nums' };
const MONO: React.CSSProperties = { ...NUM, fontFamily: 'var(--font-mono)' };

/**
 * Two meanings, two colours: anything check-in is green, anything check-out is red,
 * the type pill and the status pill alike. A soft tint with darker text, as in the
 * rest of the app. Pending is neither, so it stays neutral grey.
 */
const CHECK_IN  = { color: '#166534', bg: 'rgba(34,197,94,0.13)',   dot: '#22C55E' };
const CHECK_OUT = { color: '#991B1B', bg: 'rgba(220,38,38,0.10)',   dot: '#DC2626' };
const NEUTRAL   = { color: '#4B5563', bg: 'rgba(107,114,128,0.12)', dot: '#9CA3AF' };

const STATUS_CONFIG: Record<KabisStatus, { color: string; bg: string; dot: string }> = {
  pending:     NEUTRAL,
  checked_in:  CHECK_IN,
  checked_out: CHECK_OUT,
};

/**
 * KABIS mirrors the government system: a delivery is registered as a check-in, a
 * pickup as a check-out. Each row therefore has exactly one target status — a
 * delivery can only ever become `checked_in`, a pickup only ever `checked_out`.
 */
const ACTION_CONFIG: Record<KabisAction, {
  color: string; bg: string; target: KabisStatus;
}> = {
  delivery: { ...CHECK_IN, target: 'checked_in' },
  pickup:   { ...CHECK_OUT, target: 'checked_out' },
};

const INPUT_STYLE: React.CSSProperties = {
  width: '100%', height: 44, padding: '0 12px',
  fontSize: 14, color: '#0f1117',
  background: '#fff', border: '1.5px solid #e5e7eb',
  borderRadius: 9, outline: 'none', fontFamily: 'inherit',
  boxSizing: 'border-box', transition: 'border-color 150ms ease',
};

const onFocus = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  { (e.target as HTMLElement).style.borderColor = '#4ba6ea'; };
const onBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
  { (e.target as HTMLElement).style.borderColor = '#e5e7eb'; };

// ─── Helpers ──────────────────────────────────────────────────────────────────

const dash = (v: string | null | undefined): string => (v?.trim() ? v.trim() : '—');

/** Dates follow the reader; kilometres stay Western-digit. */
function useDateLocale(): string {
  const { i18n } = useTranslation();
  return i18n.resolvedLanguage?.startsWith('ar') ? 'ar-u-nu-latn' : 'en-GB';
}

function formatDate(s: string | null, locale: string): string {
  if (!s) return '—';
  const d = new Date(s.length <= 10 ? s + 'T00:00:00' : s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' });
}

/** `entered_at` arrives as an ISO string; null and unparseable both render as an em dash. */
function formatDateTime(s: string | null, locale: string): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(locale, {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
}

/** numeric may arrive as a string; render with thousands separators or an em dash. */
function formatKm(v: number | string | null, kmUnit: string): string {
  if (v === null || v === '') return '—';
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? `${n.toLocaleString('en-US')} ${kmUnit}` : '—';
}

// ─── Small pieces ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: string }> = ({ status }) => {
  const { t } = useTranslation('kabis');
  const cfg = STATUS_CONFIG[asStatus(status)];
  const label = t(`status.${asStatus(status)}`);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
      color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap',
    }}>
      <span style={{ width: 6, height: 6, borderRadius: '50%', background: cfg.dot, flexShrink: 0 }} />
      {label}
    </span>
  );
};

const ActionBadge: React.FC<{ action: string }> = ({ action }) => {
  const { t } = useTranslation('kabis');
  const cfg = ACTION_CONFIG[asAction(action)];
  const label = t(`action.${asAction(action)}`);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '3px 10px', borderRadius: 20, fontSize: 12, fontWeight: 700,
      color: cfg.color, background: cfg.bg, whiteSpace: 'nowrap',
    }}>
      {label}
    </span>
  );
};

const Toast: React.FC<ToastState> = ({ message, kind }) =>
  ReactDOM.createPortal(
    <div style={{
      position: 'fixed', bottom: 28, insetInlineEnd: 28, zIndex: 2000,
      display: 'flex', alignItems: 'center', gap: 10,
      background: kind === 'success' ? '#0f1117' : '#ef4444',
      color: '#fff', borderRadius: 12, padding: '12px 20px',
      fontSize: 14, fontWeight: 500,
      boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
      animation: 'kbSlideUp 200ms ease',
      maxWidth: 'calc(100vw - 56px)',
    }}>
      {message}
    </div>,
    document.body,
  );

// ─── Confirm modal ────────────────────────────────────────────────────────────

const ConfirmModal: React.FC<{
  entry: KabisEntry;
  saving: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}> = ({ entry, saving, error, onCancel, onConfirm }) => {
  const { t } = useTranslation('kabis');
  const { t: tc } = useTranslation('common');
  const dateLocale = useDateLocale();
  const [note, setNote] = useState(entry.note ?? '');

  return ReactDOM.createPortal(
    <div
      onClick={e => { if (e.target === e.currentTarget) onCancel(); }}
      style={{
        position: 'fixed', inset: 0, zIndex: 1000,
        background: 'rgba(15,17,23,0.5)', backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, animation: 'kbFade 150ms ease',
      }}
    >
      <div className="surface-depth surface-float" style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 440,
        boxShadow: '0 24px 80px rgba(0,0,0,0.2)', animation: 'kbSlideUp 180ms ease',
      }}>
        <div style={{ padding: '20px 24px 14px', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1117', letterSpacing: '-0.3px' }}>
            {t(asAction(entry.action_type) === 'delivery' ? 'action.ctaDelivery' : 'action.ctaPickup')}
          </div>
          <div style={{ fontSize: 12.5, color: '#9ca3af', marginTop: 3, lineHeight: 1.6 }}>
            {t('confirmPrompt')}
          </div>
        </div>

        <div style={{ padding: '16px 24px 20px' }}>
          <div style={{
            background: 'var(--surface)', border: '1px solid var(--border-subtle)',
            borderRadius: 10, padding: '12px 14px',
            marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 7,
          }}>
            {[
              { k: t('table.plate'),     v: dash(entry.plate_number),      num: true  },
              { k: tc('fields.customer'),  v: dash(entry.customer_name),     num: false },
              { k: t('table.idNumber'), v: dash(entry.customer_id_number), num: true  },
              { k: t('km').toUpperCase(),        v: formatKm(entry.km, t('km')),            num: true  },
              { k: t('table.booking'),   v: dash(entry.booking_number),    num: true  },
              { k: t('table.type'),      v: t(`action.${asAction(entry.action_type)}`), num: false },
              { k: t('table.date'),      v: formatDate(entry.operation_date, dateLocale), num: true },
            ].map(item => (
              <div key={item.k} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, fontSize: 13 }}>
                <span style={{ color: '#9ca3af' }}>{item.k}</span>
                <span style={{ color: '#0f1117', fontWeight: 600, ...(item.num ? NUM : {}) }}>{item.v}</span>
              </div>
            ))}
          </div>

          <label style={{ display: 'block', fontSize: 12.5, fontWeight: 700, color: '#374151', marginBottom: 6 }}>
            {t('noteLabel')} <span style={{ color: '#9ca3af', fontWeight: 400 }}>{t('optional')}</span>
          </label>
          <textarea
            rows={2}
            value={note}
            onChange={e => setNote(e.target.value)}
            placeholder={t('confirm.notePlaceholder')}
            style={{ ...INPUT_STYLE, height: 'auto', padding: '10px 12px', resize: 'vertical', lineHeight: 1.6 }}
            onFocus={onFocus}
            onBlur={onBlur}
          />

          {error && (
            <div style={{
              marginTop: 12, padding: '10px 14px', background: '#fef2f2',
              border: '1px solid rgba(239,68,68,0.2)', borderRadius: 8,
              fontSize: 13, color: '#ef4444',
            }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', gap: 10, marginTop: 20, flexWrap: 'wrap' }}>
            <Button
              onClick={() => onConfirm(note)}
              disabled={saving}
              style={{ flex: 1, minWidth: 130 }}
>
              {saving ? t('confirm.saving') : t('confirm.confirm')}
            </Button>
            <Button variant="secondary"
              onClick={onCancel}
              disabled={saving}
            >
              {tc('actions.cancel')}
            </Button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const KabisPage: React.FC = () => {
  const { t } = useTranslation('kabis');
  const { t: tc } = useTranslation('common');
  const dateLocale = useDateLocale();
  const [entries, setEntries] = useState<KabisEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);

  const [filter, setFilter] = useTileFilter(KABIS_FILTERS);
  const [search, setSearch] = useState('');
  const [from, setFrom]     = useState('');
  const [to, setTo]         = useState('');

  const [confirmEntry, setConfirmEntry] = useState<KabisEntry | null>(null);
  const [saving, setSaving]             = useState(false);
  const [modalError, setModalError]     = useState<string | null>(null);
  const [revertingId, setRevertingId]   = useState<number | null>(null);

  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Arriving from a notification: highlight and scroll to that row.
  const [searchParams, setSearchParams] = useSearchParams();
  const highlightId = useMemo(() => {
    const raw = searchParams.get('entry');
    return raw && /^\d+$/.test(raw) ? Number(raw) : null;
  }, [searchParams]);
  const highlightRef = useRef<HTMLTableRowElement | null>(null);

  const showToast = useCallback((message: string, kind: 'success' | 'error') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, kind });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const fetchEntries = useCallback(async (quietly = false) => {
    if (!quietly) setLoading(true);
    setError(null);
    try {
      setEntries(await getKabisEntries());
    } catch (failure) {
      if (!quietly) setError((failure as { message?: string })?.message ?? t('loadFailed'));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => { fetchEntries(); }, [fetchEntries]);

  const { version: liveVersion } = useKabisLive();
  useEffect(() => { if (liveVersion > 0) fetchEntries(true); }, [liveVersion, fetchEntries]);

  useEffect(() => {
    if (!highlightId || loading) return;
    const node = highlightRef.current;
    if (node) node.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [highlightId, loading, entries]);

  const inside = useMemo(() => insideIds(entries), [entries]);

  // The tiles count what the search and dates leave, so a tile's number is what pressing it shows.
  const scoped = useMemo(() => entries.filter(entry => {
    const day = kabisDay(entry);
    return entryMatches(entry, search) && (!from || day >= from) && (!to || day <= to);
  }), [entries, search, from, to]);

  const inFilter = useCallback((entry: KabisEntry, tile: KabisFilter) => (
    tile === 'inside' ? inside.has(entry.id) : asStatus(entry.status) === tile
  ), [inside]);

  const counts = useMemo(() => Object.fromEntries(
    KABIS_FILTERS.map(tile => [tile, scoped.filter(entry => inFilter(entry, tile)).length]),
  ) as Record<KabisFilter, number>, [scoped, inFilter]);

  const filtered = useMemo(
    () => (filter === 'all' ? scoped : scoped.filter(entry => inFilter(entry, filter))),
    [scoped, filter, inFilter],
  );

  const grouped = searchParams.get('group') === '1';
  const setGrouped = (next: boolean) => setSearchParams(current => {
    const params = new URLSearchParams(current);
    if (next) params.set('group', '1');
    else params.delete('group');
    return params;
  }, { replace: true });

  const groups = useMemo(() => (grouped ? groupByBooking(filtered) : null), [grouped, filtered]);

  /**
   * The target status follows the row's own action type — never the other one.
   * Only status and note are written; the trigger stamps entered_by / entered_at.
   */
  const handleConfirm = useCallback(async (note: string) => {
    if (!confirmEntry) return;
    setSaving(true);
    setModalError(null);

    const target = ACTION_CONFIG[asAction(confirmEntry.action_type)].target;
    const { error: updateError } = await supabase
      .from('kabis_entries')
      .update({ status: target, note: note.trim() || null })
      .eq('id', confirmEntry.id);

    setSaving(false);
    if (updateError) { setModalError(updateError.message); return; }

    setConfirmEntry(null);
    showToast(t('toast.marked', { status: t(`status.${target}`) }), 'success');
    fetchEntries(true);
  }, [confirmEntry, showToast, fetchEntries, t]);

  /** Back to pending — the trigger clears entered_by / entered_at automatically. */
  const handleRevert = useCallback(async (entry: KabisEntry) => {
    setRevertingId(entry.id);
    const { error: updateError } = await supabase
      .from('kabis_entries')
      .update({ status: 'pending' })
      .eq('id', entry.id);
    setRevertingId(null);

    if (updateError) { showToast(t('undoFailed', { message: updateError.message }), 'error'); return; }
    showToast(t('toast.movedBack'), 'success');
    fetchEntries(true);
  }, [showToast, fetchEntries, t]);

  const clearHighlight = useCallback(() => {
    const next = new URLSearchParams(searchParams);
    next.delete('entry');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  const renderRow = (entry: KabisEntry) => {
    const status = asStatus(entry.status);
    const isHighlight = highlightId === entry.id;
    return (
      <tr key={entry.id} ref={isHighlight ? highlightRef : undefined} className={isHighlight ? 'is-selected' : status === 'pending' ? 'is-pending' : undefined}>
        <td data-label={t('table.type')}><ActionBadge action={entry.action_type} /></td>
        <td data-label={tc('fields.status')} className="hc-kb-end"><StatusBadge status={entry.status} /></td>
        <td data-label={t('table.date')} style={NUM} className="hc-kb-nowrap">{formatDate(entry.operation_date, dateLocale)}</td>
        <td data-label={t('table.plate')} className="hc-kb-end hc-kb-nowrap">{entry.plate_number ? <PlateChip plate={entry.plate_number} /> : '—'}</td>
        <td data-label={tc('fields.customer')} className="hc-kb-customer"><bdi dir="auto">{dash(entry.customer_name)}</bdi></td>
        <td data-label={t('table.idNumber')} style={MONO} className="hc-kb-nowrap">{dash(entry.customer_id_number)}</td>
        <td data-label={t('table.booking')} style={MONO} className="hc-kb-end hc-kb-nowrap">{dash(entry.booking_number)}</td>
        <td data-label={t('table.km')} style={NUM} className="hc-kb-nowrap">{formatKm(entry.km, t('km'))}</td>
        <td data-label={t('table.enteredBy')} className="hc-kb-by">
          {status === 'pending' ? '—' : (
            <span className="hc-kb-who">
              {entry.entered_by_name && <StaffAvatar profile={entry.entered_by_avatar} size={24} />}
              <span>
                {entry.entered_by_name ? (
                  <HoverTip content={entry.entered_by_name} className="hc-kb-who-name">
                    <strong><bdi dir="auto">{entry.entered_by_name}</bdi></strong>
                  </HoverTip>
                ) : <strong>—</strong>}
                <small style={NUM}>{formatDateTime(entry.entered_at, dateLocale)}</small>
              </span>
            </span>
          )}
          {entry.note && <p className="hc-kb-note">{t('notePrefix')} {entry.note}</p>}
        </td>
        <td className="hc-kb-action">
          {status === 'pending' ? (
            <Button onClick={() => { setModalError(null); setConfirmEntry(entry); }}>
              {t(asAction(entry.action_type) === 'delivery' ? 'action.ctaDelivery' : 'action.ctaPickup')}
            </Button>
          ) : (
            <Button variant="secondary" onClick={() => handleRevert(entry)} disabled={revertingId === entry.id}>
              {revertingId === entry.id ? t('table.undoing') : t('table.undo')}
            </Button>
          )}
        </td>
      </tr>
    );
  };

  return (
    <div className="kb-page" style={{
      minHeight: '100%',
      background: 'var(--surface)',
    }}>
      {/* ── Page header ── */}
      <div style={{ marginBottom: 26 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: '#4ba6ea' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#3A74C2', letterSpacing: '0.8px', textTransform: 'uppercase' }}>
            {t('eyebrow')}
          </span>
        </div>
        <h1 style={{ fontSize: 30, fontWeight: 500, letterSpacing: '-0.8px', color: '#0f1117', lineHeight: 1.1, marginBottom: 6 }}>
          {t('title')}
        </h1>
        <p style={{ fontSize: 15, color: '#6b7280', lineHeight: 1.6, margin: 0, maxWidth: 640 }}>
          {t('subtitle')}
        </p>
      </div>

      {/* ── Tiles, which are the filters ── */}
      <div className="hc-tiles hc-tiles-filter kb-tiles">
        <StatTile tone="total" label={t('tiles.all')} sub={t('tiles.allSub')} value={loading ? null : String(scoped.length)} pressed={filter === 'all'} onPress={() => setFilter('all')} />
        <StatTile tone="warn" label={t('tiles.pending')} sub={t('tiles.pendingSub')} value={loading ? null : String(counts.pending)} pressed={filter === 'pending'} onPress={() => setFilter('pending')} />
        <StatTile tone="received" label={t('tiles.checkedIn')} sub={t('tiles.checkedInSub')} value={loading ? null : String(counts.checked_in)} pressed={filter === 'checked_in'} onPress={() => setFilter('checked_in')} />
        <StatTile tone="paid" label={t('tiles.checkedOut')} sub={t('tiles.checkedOutSub')} value={loading ? null : String(counts.checked_out)} pressed={filter === 'checked_out'} onPress={() => setFilter('checked_out')} />
        <StatTile tone="balance" label={t('tiles.inside')} sub={t('tiles.insideSub')} value={loading ? null : String(counts.inside)} pressed={filter === 'inside'} onPress={() => setFilter('inside')} />
      </div>

      {/* ── Search and dates ── */}
      <div className="kb-filters">
        <input
          type="text"
          placeholder={t('search')}
          aria-label={t('search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={INPUT_STYLE}
          onFocus={onFocus}
          onBlur={onBlur}
        />
        <DateRangeFilter from={from} to={to} onChange={(start, end) => { setFrom(start); setTo(end); }} />
        <label className="kb-group-toggle">
          <input type="checkbox" className="hc-appr-check" checked={grouped} onChange={e => setGrouped(e.target.checked)} />
          {t('groupByBooking')}
        </label>
      </div>

      {/* ── Highlight banner ── */}
      {highlightId && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: 12, flexWrap: 'wrap', marginBottom: 14,
          background: 'rgba(75,166,234,0.08)', border: '1px solid rgba(75,166,234,0.3)',
          borderRadius: 10, padding: '10px 14px',
        }}>
          <span style={{ fontSize: 13, color: '#1f6ea8' }}>
            <Trans
              t={t}
              i18nKey="fromNotification"
              values={{ id: highlightId }}
              components={[<span />, <strong style={NUM} />]}
            />
          </span>
          <Button variant="secondary"
            onClick={clearHighlight}
          >
            {t('clearHighlight')}
          </Button>
        </div>
      )}

      {/* ── Table ── */}
      {error ? (
        <div style={{
          background: '#fff', borderRadius: 14, border: '1px solid #fecdd3',
          padding: '28px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 14, color: '#ef4444', marginBottom: 14 }}>{error}</div>
          <Button variant="secondary"
            onClick={() => fetchEntries()}
          >
            {t('tryAgain')}
          </Button>
        </div>
      ) : loading ? (
        <div className="surface-depth" style={{
          background: '#fff', borderRadius: 14, border: '1px solid var(--border-subtle)',
          padding: '48px 20px', textAlign: 'center', color: '#9ca3af', fontSize: 14,
        }}>
          {t('loading')}
        </div>
      ) : filtered.length === 0 ? (
        <div className="surface-depth" style={{
          background: '#fff', borderRadius: 14, border: '1px solid var(--border-subtle)',
          padding: '48px 20px', textAlign: 'center',
        }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: '#374151', marginBottom: 6 }}>
            {entries.length === 0 ? t('table.emptyNone') : t('table.emptyFiltered')}
          </div>
          <div style={{ fontSize: 13.5, color: '#9ca3af', lineHeight: 1.6 }}>
            {entries.length === 0 ? t('table.emptyNoneHint') : t('table.emptyHint')}
          </div>
        </div>
      ) : (
        <>
          <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 12 }}>
            {t('showing', { shown: filtered.length, count: entries.length })}
          </div>

          <div className="hc-cash-table kb-table">
            <table>
              <thead>
                <tr>
                  <th>{t('table.type')}</th>
                  <th>{tc('fields.status')}</th>
                  <th>{t('table.date')}</th>
                  <th>{t('table.plate')}</th>
                  <th>{tc('fields.customer')}</th>
                  <th>{t('table.idNumber')}</th>
                  <th>{t('table.booking')}</th>
                  <th>{t('table.km')}</th>
                  <th>{t('table.enteredBy')}</th>
                  <th aria-label={t('table.action')} />
                </tr>
              </thead>
              <tbody>
                {groups ? groups.map(group => (
                  <Fragment key={group.key}>
                    {group.bookingNumber && (
                      <tr className="kb-group-head">
                        <td colSpan={10}><strong style={MONO}>{group.bookingNumber}</strong> · <bdi dir="auto">{dash(group.entries[0].customer_name)}</bdi></td>
                      </tr>
                    )}
                    {group.entries.map(renderRow)}
                  </Fragment>
                )) : filtered.map(renderRow)}
              </tbody>
            </table>
          </div>
        </>
      )}

      {confirmEntry && (
        <ConfirmModal
          entry={confirmEntry}
          saving={saving}
          error={modalError}
          onCancel={() => { setConfirmEntry(null); setModalError(null); }}
          onConfirm={handleConfirm}
        />
      )}

      {toast && <Toast {...toast} />}

      <style>{`
        .kb-page  { padding: 24px 16px; }
        @media (min-width: 640px) {
          .kb-page  { padding: 32px 24px; }
        }
        @media (min-width: 1024px) { .kb-page { padding: 44px 40px; } }
        @keyframes kbFade    { from { opacity: 0 } to { opacity: 1 } }
        @keyframes kbSlideUp { from { transform: translateY(10px); opacity: 0 } to { transform: translateY(0); opacity: 1 } }
      `}</style>
    </div>
  );
};

export default KabisPage;
