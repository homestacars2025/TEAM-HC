import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import CustomerAvatar from '../CustomerAvatar';
import BannedBadge from '../customers/BannedBadge';
import PlateChip from '../booking/PlateChip';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { printCustomerInvoice } from '../../lib/printCustomerInvoice';
import {
  balanceTone, buildWallet, canMove, formatLira, hgsDay, hgsDetail, humanType, walletItems, walletTotal,
  type BookingNote, type BookingWallet, type HgsGroup, type WalletLine,
} from '../../lib/bookingWallet';
import { getCustomerWallet, type CustomerWalletData, type TransferResult } from '../../lib/queries/bookingWallet';
import { PortalHgsDialog } from './PortalHgsDialog';
import MoveBalanceSheet from './MoveBalanceSheet';
import { BalanceChip, CloseIcon, LineGlyph, MoveIcon } from './WalletParts';
import { DeletedLedgerEntries, LedgerActorsProvider, LedgerStamp, useLedgerActorsEnabled } from './LedgerActors';
import { usePageAccess } from '../../contexts/PageAccessContext';

const SHOWN_LINES = 6;

export function lineLabel(line: WalletLine, t: TFunction): string {
  switch (line.kind) {
    case 'deposit': return t(line.direction === 'IN' ? 'kinds.deposit' : 'kinds.depositReturned');
    case 'transfer': return t(line.direction === 'IN' ? 'kinds.movedIn' : 'kinds.movedOut');
    case 'other': return t(`types.${line.type.trim().toLowerCase()}`, { defaultValue: humanType(line.type) });
    default: return t(`kinds.${line.kind}`);
  }
}

const shortStamp = (iso: string | null, locale: string) =>
  iso ? new Date(iso).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/Istanbul' }) : '—';

interface LineActions {
  /** Absent where lines can't be changed from here. */
  onEdit?: (line: WalletLine) => void;
  onDelete?: (line: WalletLine) => void;
}

const LineRow: React.FC<LineActions & { line: WalletLine; onPartner: (bookingId: number) => void; inGroup?: boolean }> = ({ line, onPartner, onEdit, onDelete, inGroup = false }) => {
  const { t } = useTranslation('wallets');
  const locale = useDateLocale();
  const isIn = line.direction === 'IN';
  // A payment belongs to an envelope and a transfer to its other half, so neither changes alone.
  const editable = !line.pay_method && line.kind !== 'transfer';
  const detail = line.kind === 'transfer' ? line.note : line.description;
  const hgs = inGroup ? hgsDetail(line) : null;
  const stamped = useLedgerActorsEnabled();
  return (
    <li className={`hc-cw-line is-${line.kind}${hgs ? ' is-detail' : ''}${stamped ? ' has-stamp' : ''}`}>
      {!hgs && <LineGlyph kind={line.kind} />}
      {hgs ? (
        <span className="hc-cw-line-text">
          <span className="hc-cw-line-label"><bdi dir={hgs.pass ? 'ltr' : 'auto'}>{hgs.route ?? t('kinds.hgs')}</bdi></span>
          <span className="hc-cw-line-meta">
            {hgs.toll && <bdi dir="ltr" className="hc-cw-line-desc">{hgs.toll}</bdi>}
            <span className="hc-cw-line-date">
              {hgs.date ? formatDay(hgs.date, locale) : '—'}
              {hgs.time && <> · <span dir="ltr" className="hc-num">{hgs.time}</span></>}
            </span>
          </span>
        </span>
      ) : (
        <span className="hc-cw-line-text">
          <span className="hc-cw-line-label">
            {lineLabel(line, t)}
            {line.partner && (line.partner.id != null
              ? <button type="button" className="hc-cw-partner" onClick={() => onPartner(line.partner!.id as number)}><bdi dir="ltr">{line.partner.number}</bdi></button>
              : <bdi dir="ltr" className="hc-cw-partner is-plain">{line.partner.number}</bdi>)}
          </span>
          <span className="hc-cw-line-meta">
            {detail && <bdi dir="auto" className="hc-cw-line-desc">{detail}</bdi>}
            <span className="hc-cw-line-date">{shortStamp(line.created_at, locale)}</span>
          </span>
        </span>
      )}
      <span className={`hc-cw-line-amount hc-num ${isIn ? 'is-in' : 'is-out'}`}><bdi dir="ltr">{isIn ? '+' : '−'}{formatLira(line.amount)}</bdi></span>
      {(onEdit || onDelete) && (
        <span className="hc-cw-line-actions">
          {editable && onEdit && (
            <button type="button" className="hc-cw-icon" onClick={() => onEdit(line)} aria-label={t('table.edit')} title={t('table.edit')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          {editable && onDelete && (
            <button type="button" className="hc-cw-icon is-danger" onClick={() => onDelete(line)} aria-label={t('table.delete')} title={t('table.delete')}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M8 6V4a2 2 0 012-2h4a2 2 0 012 2v2m3 0v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6h14z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
          {!editable && <span className="hc-cw-locked">{t('table.locked')}</span>}
        </span>
      )}
      <LedgerStamp ledgerId={line.id} createdBy={line.created_by} createdAt={line.created_at} updatedBy={line.updated_by} updatedAt={line.updated_at} />
    </li>
  );
};

/** "from 28/09 to 22/10 · 42 passes". */
export function hgsSummary(group: HgsGroup, t: TFunction): string {
  const crossesYear = !!group.from && !!group.to && group.from.slice(0, 4) !== group.to.slice(0, 4);
  const when = !group.from || !group.to
    ? null
    : group.from === group.to
      ? t('hgs.on', { date: hgsDay(group.from) })
      : t('hgs.range', { from: hgsDay(group.from, crossesYear), to: hgsDay(group.to, crossesYear) });
  const passes = group.passes > 0 ? t('hgs.passes', { count: group.passes }) : null;
  const entries = group.entries > 0 ? t('hgs.entries', { count: group.entries }) : null;
  const count = passes && entries ? t('hgs.both', { passes, entries }) : passes ?? entries;
  return [when, count].filter(Boolean).join(' · ');
}

/** One HGS batch of a booking as one row; the chevron opens its lines underneath. Open, they print too. */
const HgsGroupRow: React.FC<LineActions & { group: HgsGroup; open: boolean; onToggle: () => void; onPartner: (bookingId: number) => void }> = ({ group, open, onToggle, onPartner, onEdit, onDelete }) => {
  const { t } = useTranslation('wallets');
  const listId = useId();
  const isIn = group.signed > 0;
  return (
    <li className={`hc-cw-hgs${open ? ' is-open' : ''}`}>
      <button type="button" className="hc-cw-line is-hgs hc-cw-hgs-head" aria-expanded={open} aria-controls={listId} onClick={onToggle}>
        <LineGlyph kind="hgs" />
        <span className="hc-cw-line-text">
          <span className="hc-cw-line-label">{t('kinds.hgs')}</span>
          <span className="hc-cw-line-meta"><span className="hc-cw-line-date">{hgsSummary(group, t)}</span></span>
        </span>
        <span className={`hc-cw-line-amount hc-num ${isIn ? 'is-in' : 'is-out'}`}><bdi dir="ltr">{isIn ? '+' : group.signed < 0 ? '−' : ''}{formatLira(group.signed)}</bdi></span>
        <svg className="hc-cw-hgs-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
        <span className="sr-only">{t(open ? 'hgs.hide' : 'hgs.show', { count: group.lines.length })}</span>
      </button>
      {open && (
        <ul id={listId} className="hc-cw-hgs-lines">
          {group.lines.map(line => <LineRow key={line.id} line={line} inGroup onPartner={onPartner} onEdit={onEdit} onDelete={onDelete} />)}
        </ul>
      )}
    </li>
  );
};

const NoteRow: React.FC<{ note: BookingNote }> = ({ note }) => {
  const { t } = useTranslation('wallets');
  const locale = useDateLocale();
  const plates = <><bdi dir="ltr">{note.from}</bdi> <span aria-hidden="true">→</span> <bdi dir="ltr">{note.to}</bdi></>;
  return (
    <li className="hc-cw-note">
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      <span>
        {note.kind === 'carChanged' ? t('notes.carChanged') : t('notes.replacement')} {plates}
        {note.kind === 'replacement' && note.date && <> · {formatDay(note.date, locale)}</>}
      </span>
    </li>
  );
};

const BookingCard: React.FC<LineActions & {
  entry: BookingWallet;
  movable: boolean;
  focused: boolean;
  onMove: () => void;
  onAdd?: () => void;
  /** Charge the booking its HGS from the portal data; absent when it can't be. */
  onPortalHgs?: () => void;
  /** With the HGS lines one by one, when they're open on screen. */
  onPrint: (hgsDetails: boolean) => void;
  printing: boolean;
  onPartner: (bookingId: number) => void;
}> = ({ entry, movable, focused, onMove, onAdd, onPortalHgs, onPrint, printing, onPartner, onEdit, onDelete }) => {
  const { t } = useTranslation('wallets');
  const locale = useDateLocale();
  const [showAll, setShowAll] = useState(false);
  /** The HGS batches open on screen, by key; each opens on its own. */
  const [hgsOpen, setHgsOpen] = useState<ReadonlySet<string>>(() => new Set());
  const toggleHgs = (key: string) => setHgsOpen(open => {
    const next = new Set(open);
    if (!next.delete(key)) next.add(key);
    return next;
  });
  const { booking, lines } = entry;
  const items = useMemo(() => walletItems(lines), [lines]);
  const shown = showAll ? items : items.slice(0, SHOWN_LINES);
  return (
    <article id={`wallet-booking-${booking.id}`} className={`hc-cw-booking surface-depth${focused ? ' is-focus' : ''}`} tabIndex={-1} aria-label={booking.booking_number ?? `#${booking.id}`}>
      <header className="hc-cw-booking-head">
        <div className="hc-cw-booking-id">
          <div className="hc-cw-booking-title">
            <strong className="hc-num"><bdi dir="ltr">{booking.booking_number ?? `#${booking.id}`}</bdi></strong>
            {booking.is_currently_active && <span className="hc-cw-pill is-live">{t('wallet.onRent')}</span>}
            {booking.status === 'cancelled' && <span className="hc-cw-pill">{t('wallet.cancelled')}</span>}
          </div>
          <div className="hc-cw-booking-car">
            {booking.plate && <PlateChip plate={booking.plate} />}
            {booking.model && <bdi dir="auto">{booking.model}</bdi>}
          </div>
          <div className="hc-cw-booking-dates">{formatDay(booking.start_date.slice(0, 10), locale)} <span aria-hidden="true">→</span> {formatDay(booking.end_date.slice(0, 10), locale)}</div>
        </div>
        <BalanceChip balance={entry.balance} />
      </header>

      {lines.length === 0
        ? <p className="hc-cw-empty-lines">{t('wallet.noLines')}</p>
        : (
          <ul className="hc-cw-lines">
            {shown.map(item => item.kind === 'hgs'
              ? <HgsGroupRow key={`hgs-${item.group.key}`} group={item.group} open={hgsOpen.has(item.group.key)} onToggle={() => toggleHgs(item.group.key)} onPartner={onPartner} onEdit={onEdit} onDelete={onDelete} />
              : <LineRow key={item.line.id} line={item.line} onPartner={onPartner} onEdit={onEdit} onDelete={onDelete} />)}
          </ul>
        )}
      {items.length > SHOWN_LINES && (
        <button type="button" className="hc-cw-more" onClick={() => setShowAll(value => !value)}>
          {showAll ? t('wallet.showLess') : t('wallet.showAll', { count: items.length })}
        </button>
      )}

      {entry.notes.length > 0 && <ul className="hc-cw-notes">{entry.notes.map((note, index) => <NoteRow key={index} note={note} />)}</ul>}

      <footer className="hc-cw-booking-foot">
        {movable && (
          <button type="button" className="hc-cw-move-btn" onClick={onMove}><MoveIcon />{t('move.action')}</button>
        )}
        {onAdd && (
          <button type="button" className="hc-cw-soft" onClick={onAdd}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></svg>
            {t('addTransactionShort')}
          </button>
        )}
        {onPortalHgs && (
          <button type="button" className="hc-cw-soft" onClick={onPortalHgs}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M8 3L5 21M16 3l3 18M12 4v2.5M12 10.5v3M12 17.5V20" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
            {t('portalHgs.action')}
          </button>
        )}
        {lines.length > 0 && (
          <button type="button" className="hc-cw-soft" onClick={() => onPrint(hgsOpen.size > 0)} disabled={printing}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9V2h12v7M6 18H4a2 2 0 01-2-2v-5a2 2 0 012-2h16a2 2 0 012 2v5a2 2 0 01-2 2h-2M6 14h12v8H6v-8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
            {printing ? t('form.preparing') : t('form.print')}
          </button>
        )}
      </footer>
    </article>
  );
};

/**
 * One customer's wallet: the total of every booking, then the bookings newest first,
 * each with its own balance and lines. Opens from Customer wallets and from a booking.
 */
const CustomerWalletSheet: React.FC<LineActions & {
  customerId: string;
  /** Scrolled to and outlined, when opened from a booking. */
  focusBookingId?: number | null;
  /** Bumped by the owner after it changed a line, to read the wallet again. */
  version?: number;
  onClose: () => void;
  /** A form of the page's is open on top, and Escape belongs to it. */
  covered?: boolean;
  /** After money moved, so the page behind can catch up. */
  onChanged?: () => void;
  onAdd?: (bookingId: number, customerName: string) => void;
}> = ({ customerId, focusBookingId = null, version = 0, covered = false, onClose, onChanged, onAdd, onEdit, onDelete }) => {
  const { t } = useTranslation('wallets');
  const { t: tc } = useTranslation('common');
  const sheet = useRef<HTMLDivElement>(null);
  const [data, setData] = useState<CustomerWalletData | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [moving, setMoving] = useState<number | null>(null);
  const [focused, setFocused] = useState<number | null>(focusBookingId);
  const [printing, setPrinting] = useState<number | null>(null);
  const [portalHgs, setPortalHgs] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const scrolled = useRef(false);

  useEffect(() => {
    let active = true;
    setFailed(false);
    getCustomerWallet(customerId)
      .then(next => { if (active) setData(next); })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [customerId, version, reload]);

  useEffect(() => {
    if (!toast) return undefined;
    const timer = window.setTimeout(() => setToast(null), 2600);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => { sheet.current?.focus(); }, []);

  // The move sheet and the HGS dialog take Escape first while they are open.
  const layered = covered || portalHgs != null;
  useEffect(() => {
    if (layered) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, layered]);

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, []);

  const wallet = useMemo(() => (data ? buildWallet(data.rows, data.bookings, data.replacements) : []), [data]);
  const total = walletTotal(wallet);
  const name = data ? [data.customer.first_name, data.customer.last_name].filter(Boolean).join(' ').trim() || t('unknownCustomer') : '';

  const goTo = useCallback((bookingId: number) => {
    setFocused(bookingId);
    const card = document.getElementById(`wallet-booking-${bookingId}`);
    card?.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    card?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    if (scrolled.current || focusBookingId == null || wallet.length === 0) return;
    scrolled.current = true;
    window.requestAnimationFrame(() => goTo(focusBookingId));
  }, [wallet, focusBookingId, goTo]);

  const print = async (entry: BookingWallet, hgsDetails: boolean) => {
    if (printing != null || !data) return;
    setPrinting(entry.booking.id);
    // Newest first, the order the invoice expects, and only this booking's lines.
    await printCustomerInvoice(customerId, entry.lines.map(line => ({
      created_at: line.created_at, type: line.type, description: line.description, direction: line.direction, amount: line.amount, car_id: line.car_id, event_no: line.event_no,
    })), { onError: message => setToast(message), hgsDetails });
    setPrinting(null);
  };

  const moved = (result: TransferResult) => {
    setMoving(null);
    setToast(t('move.done', { amount: formatLira(result.amount), number: result.to }));
    setReload(value => value + 1);
    onChanged?.();
  };

  const movingEntry = moving != null ? wallet.find(entry => entry.booking.id === moving) ?? null : null;
  const portalEntry = portalHgs != null ? wallet.find(entry => entry.booking.id === portalHgs) ?? null : null;
  const hgsPosted = (count: number, amount: number) => {
    setPortalHgs(null);
    setToast(t('portalHgs.posted', { count, amount: formatLira(amount) }));
    setReload(value => value + 1);
    onChanged?.();
  };
  const tone = balanceTone(total);
  // Finance sees who recorded and edited each line; `ledger_actor_cards` answers no one else anyway.
  const { canAccessPage } = usePageAccess();
  const actorIds = useMemo(() => (data?.rows ?? []).flatMap(row => [row.created_by, row.updated_by]), [data]);

  return ReactDOM.createPortal(
    <LedgerActorsProvider ids={actorIds} enabled={canAccessPage('accounting')}>
    <div className="hc-ce-backdrop hc-cw-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        ref={sheet}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-label={name ? t('wallet.title', { name }) : t('wallet.loading')}
        className="hc-ce hc-cw surface-float"
      >
        <header className="hc-ce-head hc-cw-head">
          <CustomerAvatar size={44} />
          <div className="hc-ce-head-text">
            <h2><bdi dir="auto">{name || t('wallet.loading')}</bdi></h2>
            {data?.customer.is_banned && <BannedBadge reason={data.customer.ban_reason} showReason />}
          </div>
          <button type="button" className="hc-ce-close" onClick={onClose} aria-label={tc('actions.close')}><CloseIcon /></button>
        </header>

        <div className="hc-ce-body hc-cw-body">
          {failed ? (
            <div className="hc-cw-state" role="alert">
              <p>{t('loadError')}</p>
              <button type="button" className="hc-cw-soft" onClick={() => setReload(value => value + 1)}>{t('wallet.retry')}</button>
            </div>
          ) : !data ? (
            <div className="hc-cw-state" role="status"><span className="hc-cw-spinner" aria-hidden="true" />{t('wallet.loading')}</div>
          ) : (
            <>
              <section className={`hc-cw-total is-${tone}`} aria-label={t('wallet.total')}>
                <span className="hc-cw-total-label">{t('wallet.total')}</span>
                <span className="hc-cw-total-value">
                  {tone === 'settled' ? t('wallet.settled') : <>{t(`wallet.${tone}`)} <bdi dir="ltr" className="hc-num">{formatLira(total)}</bdi></>}
                </span>
                <span className="hc-cw-total-sub">{t('wallet.across', { count: wallet.length })}</span>
              </section>

              {wallet.length === 0
                ? <p className="hc-cw-state">{t('wallet.noBookings')}</p>
                : wallet.map(entry => (
                  <BookingCard
                    key={entry.booking.id}
                    entry={entry}
                    movable={canMove(wallet, entry)}
                    focused={focused === entry.booking.id}
                    onMove={() => setMoving(entry.booking.id)}
                    onAdd={onAdd ? () => onAdd(entry.booking.id, name) : undefined}
                    onPortalHgs={entry.booking.car_id != null && entry.booking.status !== 'cancelled' ? () => setPortalHgs(entry.booking.id) : undefined}
                    onPrint={hgsDetails => void print(entry, hgsDetails)}
                    printing={printing === entry.booking.id}
                    onPartner={goTo}
                    onEdit={onEdit}
                    onDelete={onDelete}
                  />
                ))}
              <DeletedLedgerEntries customerId={customerId} refreshKey={version + reload} />
            </>
          )}
        </div>

        {toast && <div role="status" className="hc-ce-toast">{toast}</div>}
      </div>
      {portalEntry && <PortalHgsDialog entry={portalEntry} onClose={() => setPortalHgs(null)} onPosted={hgsPosted} />}
      {movingEntry && <MoveBalanceSheet from={movingEntry} wallet={wallet} onClose={() => setMoving(null)} onMoved={moved} />}
    </div>
    </LedgerActorsProvider>,
    document.body,
  );
};

export default CustomerWalletSheet;
