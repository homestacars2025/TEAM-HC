import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../../components/Button';
import Icon3D from '../../components/Icon3D';
import { StatTile } from '../../components/WalletParts';
import { ConfirmationChip, ConfirmationPicker } from '../../components/hr/HrParts';
import { useBlockedPage } from '../../hooks/useBlockedPage';
import { useDateLocale } from '../../hooks/useDateLocale';
import { useTileFilter } from '../../hooks/useTileFilter';
import { istanbulDate } from '../../lib/istanbulTime';
import {
  INTERVIEW_FILTERS,
  bookSlot,
  getOpeningSlots,
  getShortlist,
  interviewCounts,
  matchesInterviewFilter,
  matchesShortlistSearch,
  openSlots,
  setConfirmation,
  slotDays,
  sortShortlist,
  type InterviewSlot,
  type ShortlistRow,
} from '../../lib/recruitment/interviews';
import { formatDayLabel, formatTime, istanbulDay, istanbulInstant, type InterviewConfirmation } from '../../lib/recruitment/model';

/**
 * Interviews (page `interviews`, or `hr`). A scheduler books shortlisted candidates
 * into the opening's slots and records whether they're coming. Everything comes from
 * the team view and two RPCs: no phone, CV, answers, scores or stage ever reaches
 * this screen.
 */

const TOAST_MS = 3200;

const CloseIcon: React.FC = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);
const ClockIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" /><path d="M12 7.5V12l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
);
const PinIcon: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0113 0c0 5.4-6.5 11-6.5 11z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><circle cx="12" cy="10" r="2.3" stroke="currentColor" strokeWidth="2" /></svg>
);
const DeclinedIcon = <><circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="2" /><path d="M9 9l6 6M15 9l-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></>;

/** "Tue 12 Nov · 10:20" in Istanbul time. */
const slotLabel = (iso: string, locale: string) => `${formatDayLabel(istanbulDay(iso), locale)} · ${formatTime(iso, locale)}`;

// ─── Book a slot ──────────────────────────────────────────────────────────────

const BookSlotSheet: React.FC<{
  candidate: ShortlistRow;
  slots: InterviewSlot[];
  initialDay: string | null;
  onClose: () => void;
  onBooked: (slot: InterviewSlot) => void;
  onFailed: (reason: string) => void;
}> = ({ candidate, slots, initialDay, onClose, onBooked, onFailed }) => {
  const { t } = useTranslation('hr');
  const locale = useDateLocale();
  useBlockedPage();
  const free = useMemo(() => openSlots(slots), [slots]);
  const days = useMemo(() => slotDays(free), [free]);
  const [day, setDay] = useState<string | null>(initialDay && days.includes(initialDay) ? initialDay : days[0] ?? null);
  const [busy, setBusy] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const shown = free.filter(slot => istanbulDay(slot.startsAt) === day);

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, busy]);

  const pick = async (slot: InterviewSlot) => {
    setBusy(slot.id);
    try {
      await bookSlot(candidate.id, slot.id);
      onBooked(slot);
    } catch (reason) {
      setBusy(null);
      onFailed(reason instanceof Error ? reason.message : String(reason));
    }
  };

  return ReactDOM.createPortal(
    <div className="hc-ce-backdrop" onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
      <div role="dialog" aria-modal="true" aria-labelledby="hc-iv-sheet-title" className="hc-ce hc-iv-sheet surface-float">
        <header className="hc-ce-head">
          <div className="hc-ce-head-text">
            <h2 id="hc-iv-sheet-title">{t('interviews.sheet.title')}</h2>
            <p className="mt-0.5 text-[13px] text-black/55"><bdi dir="auto">{t('interviews.sheet.for', { name: candidate.fullName })}</bdi></p>
            {candidate.slotStartsAt && <p className="mt-1 text-[12.5px] text-[#3A74C2]">{t('interviews.sheet.current', { time: slotLabel(candidate.slotStartsAt, locale) })}</p>}
          </div>
          <button ref={closeRef} type="button" className="hc-ce-close" onClick={onClose} disabled={!!busy} aria-label={t('interviews.sheet.close')}><CloseIcon /></button>
        </header>
        <div className="hc-fh-scroll">
          {days.length > 0 && (
            <div role="group" aria-label={t('interviews.day')} className="hc-iv-days mb-4">
              {days.map(value => (
                <button key={value} type="button" aria-pressed={day === value} onClick={() => setDay(value)}>{formatDayLabel(value, locale)}</button>
              ))}
            </div>
          )}
          {shown.length === 0 ? (
            <div className="hc-ce-state text-center">
              <Icon3D name="pending" size={64} />
              <p className="text-[14px] font-medium text-foreground">{t('interviews.sheet.noSlots')}</p>
              <p className="max-w-[300px] text-[13px] text-black/50">{t('interviews.sheet.noSlotsBody')}</p>
            </div>
          ) : (
            <div className="hc-iv-slots">
              {shown.map(slot => (
                <button key={slot.id} type="button" disabled={!!busy} onClick={() => pick(slot)} aria-label={t('interviews.sheet.pick', { time: slotLabel(slot.startsAt, locale) })}
                  className={busy === slot.id ? 'is-busy' : undefined}>
                  <bdi dir="ltr" className="hc-num">{formatTime(slot.startsAt, locale)}</bdi>
                  <small dir="ltr" className="hc-num">{formatTime(slot.endsAt, locale)}</small>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ─── A candidate ──────────────────────────────────────────────────────────────

const CandidateCard: React.FC<{
  row: ShortlistRow;
  onBook: () => void;
  onConfirm: (status: InterviewConfirmation) => void;
  saving: boolean;
}> = ({ row, onBook, onConfirm, saving }) => {
  const { t } = useTranslation('hr');
  const locale = useDateLocale();
  const facts = [row.age !== null ? t('common.years', { age: row.age }) : null, row.nationality, row.district].filter((value): value is string => !!value);
  return (
    <article className="hc-iv-card surface-depth" aria-label={row.fullName}>
      <div className="hc-iv-card-main">
        <div className="min-w-0">
          <h3 dir="auto">{row.fullName}</h3>
          {facts.length > 0 && <p className="hc-iv-facts">{facts.map(fact => <span key={fact} dir="auto">{fact}</span>)}</p>}
        </div>
        <ConfirmationChip status={row.confirmation} />
      </div>
      <div className="hc-iv-slot">
        {row.slotStartsAt ? (
          <>
            <span className="hc-iv-slot-time"><ClockIcon /><bdi>{slotLabel(row.slotStartsAt, locale)}</bdi></span>
            {row.location && <span className="hc-iv-slot-place"><PinIcon /><bdi dir="auto">{row.location}</bdi></span>}
          </>
        ) : <span className="text-black/45">{t('interviews.noSlot')}</span>}
      </div>
      <div className="hc-iv-actions">
        <ConfirmationPicker value={row.confirmation} onChange={onConfirm} disabled={saving} label={t('interviews.confirmationLabel', { name: row.fullName })} />
        <Button variant={row.slotId ? 'secondary' : 'primary'} className="hc-iv-book" onClick={onBook} disabled={saving}>
          {row.slotId ? t('interviews.change') : t('interviews.book')}
        </Button>
      </div>
    </article>
  );
};

// ─── Page ─────────────────────────────────────────────────────────────────────

const InterviewsPage: React.FC = () => {
  const { t } = useTranslation(['hr', 'common']);
  const locale = useDateLocale();
  const [params, setParams] = useSearchParams();
  const [filter, setFilter] = useTileFilter(INTERVIEW_FILTERS);
  const [rows, setRows] = useState<ShortlistRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [slots, setSlots] = useState<InterviewSlot[]>([]);
  const [search, setSearch] = useState('');
  const [booking, setBooking] = useState<ShortlistRow | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const toastTimer = useRef(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    getShortlist().then(next => { if (active) setRows(next); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [reload]);

  const openings = useMemo(() => {
    const seen = new Map<string, string>();
    (rows ?? []).forEach(row => { if (!seen.has(row.openingId)) seen.set(row.openingId, row.openingTitle); });
    return Array.from(seen, ([id, title]) => ({ id, title })).sort((a, b) => a.title.localeCompare(b.title));
  }, [rows]);
  const requestedOpening = params.get('opening');
  const openingId = openings.some(o => o.id === requestedOpening) ? requestedOpening : openings[0]?.id ?? null;
  const day = params.get('day');

  const loadSlots = useCallback(() => {
    if (!openingId) { setSlots([]); return () => undefined; }
    let active = true;
    // From the start of today in Istanbul, so this morning's slots still show.
    getOpeningSlots(openingId, istanbulInstant(istanbulDate(), '00:00')).then(next => { if (active) setSlots(next); }).catch(() => { if (active) setSlots([]); });
    return () => { active = false; };
  }, [openingId]);
  useEffect(() => loadSlots(), [loadSlots, reload]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const say = (text: string, bad = false) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, bad });
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  };

  const setParam = (key: string, value: string | null) => setParams(current => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value); else next.delete(key);
    if (key === 'opening') next.delete('day');
    return next;
  }, { replace: true });

  const forOpening = useMemo(() => (rows ?? []).filter(row => row.openingId === openingId), [rows, openingId]);
  const days = useMemo(() => slotDays(slots), [slots]);
  const onDay = useMemo(
    () => forOpening.filter(row => !day || !row.slotStartsAt || istanbulDay(row.slotStartsAt) === day),
    [forOpening, day],
  );
  const counts = useMemo(() => interviewCounts(onDay), [onDay]);
  const shown = useMemo(
    () => sortShortlist(onDay.filter(row => matchesInterviewFilter(row, filter) && matchesShortlistSearch(row, search))),
    [onDay, filter, search],
  );

  const confirm = async (row: ShortlistRow, status: InterviewConfirmation) => {
    if (row.confirmation === status) return;
    setSaving(row.id);
    setRows(current => current?.map(item => (item.id === row.id ? { ...item, confirmation: status, ...(status === 'not_coming' ? { slotId: null, slotStartsAt: null, slotEndsAt: null } : {}) } : item)) ?? current);
    try {
      await setConfirmation(row.id, status);
      say(t('interviews.confirmed', { name: row.fullName, status: t(`confirmation.${status}`) }));
    } catch (reason) {
      say(t('interviews.failed', { reason: reason instanceof Error ? reason.message : String(reason) }), true);
    } finally {
      setSaving(null);
      setReload(value => value + 1);
    }
  };

  const loading = rows === null && !failed;
  const count = (n: number) => (loading ? null : n.toLocaleString('tr-TR'));

  return (
    <div className="hc-pi hc-iv">
      <header className="hc-pi-head">
        <div>
          <h1>{t('interviews.title')}</h1>
          <p>{t('interviews.subtitle')}</p>
        </div>
      </header>

      {failed ? (
        <div className="hc-ce-state rounded-[16px] border border-[var(--border-subtle)] bg-white" role="alert">
          <p>{t('common.loadError')}</p>
          <Button variant="secondary" onClick={() => setReload(value => value + 1)}>{t('common:actions.tryAgain')}</Button>
        </div>
      ) : !loading && openings.length === 0 ? (
        <div className="hc-ce-state rounded-[20px] border border-dashed border-black/[0.12] bg-white text-center">
          <Icon3D name="total" size={72} />
          <p className="text-[15px] font-medium text-foreground">{t('interviews.noOpenings')}</p>
          <p className="max-w-[340px] text-[13px] text-black/50">{t('interviews.noOpeningsBody')}</p>
        </div>
      ) : (
        <>
          <div className="hc-iv-pickers">
            <label className="hc-iv-opening">
              <span className="hc-field-label">{t('interviews.opening')}</span>
              <select className="hc-input" value={openingId ?? ''} onChange={event => setParam('opening', event.target.value)} disabled={loading}>
                {openings.map(opening => <option key={opening.id} value={opening.id}>{opening.title}</option>)}
              </select>
            </label>
            <div className="min-w-0">
              <span className="hc-field-label">{t('interviews.day')}</span>
              <div role="group" aria-label={t('interviews.day')} className="hc-iv-days">
                <button type="button" aria-pressed={!day} onClick={() => setParam('day', null)}>{t('interviews.allDays')}</button>
                {days.map(value => (
                  <button key={value} type="button" aria-pressed={day === value} onClick={() => setParam('day', value)}>{formatDayLabel(value, locale)}</button>
                ))}
              </div>
            </div>
          </div>

          <div className="hc-tiles hc-tiles-filter hc-bk-tiles hc-mg-tiles" role="group" aria-label={t('interviews.tiles.label')}>
            <StatTile tone="st-all" art={<Icon3D name="total" className="hc-tile-art" />} label={t('interviews.tiles.shortlisted')} sub={t('interviews.tiles.shortlistedSub')} value={count(counts.all)} pressed={filter === 'all'} onPress={() => setFilter('all')} />
            <StatTile tone="st-pending" art={<Icon3D name="pending" className="hc-tile-art" />} label={t('interviews.tiles.booked')} sub={t('interviews.tiles.bookedSub')} value={count(counts.booked)} pressed={filter === 'booked'} onPress={() => setFilter('booked')} />
            <StatTile tone="st-booked" art={<Icon3D name="confirmed" className="hc-tile-art" />} label={t('interviews.tiles.coming')} sub={t('interviews.tiles.comingSub')} value={count(counts.coming)} pressed={filter === 'coming'} onPress={() => setFilter('coming')} />
            <StatTile tone="negative" icon={DeclinedIcon} label={t('interviews.tiles.notComing')} sub={t('interviews.tiles.notComingSub')} value={count(counts.not_coming)} pressed={filter === 'not_coming'} onPress={() => setFilter('not_coming')} />
          </div>

          <input type="search" className="hc-input hc-iv-search !mt-0" placeholder={t('common.search')} aria-label={t('common.search')} value={search} onChange={event => setSearch(event.target.value)} />

          {loading ? (
            <div className="hc-iv-list" aria-hidden="true">{Array.from({ length: 4 }, (_, index) => <div key={index} className="hc-iv-card is-skeleton" />)}</div>
          ) : shown.length === 0 ? (
            <div className="hc-ce-state rounded-[20px] border border-dashed border-black/[0.12] text-center">
              <p className="text-[15px] font-medium text-foreground">{t('interviews.empty')}</p>
              <p className="text-[13px] text-black/50">{t('interviews.emptyBody')}</p>
              <Button variant="secondary" onClick={() => { setSearch(''); setFilter('all'); setParam('day', null); }}>{t('interviews.showAll')}</Button>
            </div>
          ) : (
            <div className="hc-iv-list">
              {shown.map(row => (
                <CandidateCard key={row.id} row={row} saving={saving === row.id} onBook={() => setBooking(row)} onConfirm={status => confirm(row, status)} />
              ))}
            </div>
          )}
        </>
      )}

      {booking && (
        <BookSlotSheet
          candidate={booking}
          slots={slots}
          initialDay={day}
          onClose={() => setBooking(null)}
          onBooked={slot => {
            say(t('interviews.booked', { name: booking.fullName, time: slotLabel(slot.startsAt, locale) }));
            setBooking(null);
            setReload(value => value + 1);
          }}
          onFailed={reason => { say(t('interviews.failed', { reason }), true); setReload(value => value + 1); }}
        />
      )}
      {toast && ReactDOM.createPortal(
        <div role="status" className={`hc-toast-in fixed inset-x-3 bottom-6 z-[9400] mx-auto max-w-sm rounded-2xl px-4 py-3 text-center text-sm font-semibold text-white shadow-lg ${toast.bad ? 'bg-[#b42318]' : 'bg-[#0f1117]'}`}>{toast.text}</div>,
        document.body,
      )}
    </div>
  );
};

export default InterviewsPage;
