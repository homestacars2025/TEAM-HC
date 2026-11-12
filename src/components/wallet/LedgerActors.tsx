import React, { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { useDateLocale } from '../../hooks/useDateLocale';
import { formatLira, humanType } from '../../lib/bookingWallet';
import { cn } from '../../lib/utils';
import { getAvatarGradient } from '../../lib/staffAvatar';
import {
  actorInitials,
  auditActorIds,
  changedFields,
  fetchDeletedLedgerEntries,
  fetchLedgerHistory,
  fetchLedgerRefNames,
  loadLedgerActors,
  useLedgerActors,
  type AuditField,
  type LedgerActor,
  type LedgerAuditEntry,
  type LedgerRefNames,
} from '../../lib/ledgerActors';

/**
 * Who recorded a wallet line, and who last touched it: a 24px avatar at the end of
 * the row, a smaller one with a ✎ when it was edited, and the line's history on
 * click. Finance only: outside a provider that's `enabled`, none of it renders.
 * The same component as Admin's, in both languages and either direction.
 */

interface LedgerActorsValue {
  enabled: boolean;
  actors: Map<string, LedgerActor>;
}

const LedgerActorsContext = createContext<LedgerActorsValue>({ enabled: false, actors: new Map() });

/** Loads everyone on a list in one call. `enabled` is the finance check; the RPC is the backstop. */
export const LedgerActorsProvider: React.FC<{
  ids: Iterable<string | null | undefined>;
  enabled: boolean;
  children: React.ReactNode;
}> = ({ ids, enabled, children }) => {
  const { actors, error } = useLedgerActors(ids, enabled);
  const value = useMemo(() => ({ enabled: enabled && !error, actors }), [enabled, error, actors]);
  return <LedgerActorsContext.Provider value={value}>{children}</LedgerActorsContext.Provider>;
};

export const useLedgerActorsEnabled = (): boolean => useContext(LedgerActorsContext).enabled;

// ── Formatting ───────────────────────────────────────────────────────────────

/** "12 Nov 2026, 14:05", in Istanbul time, with Latin digits in Arabic too. */
function useStamp() {
  const locale = useDateLocale();
  const format = useMemo(() => new Intl.DateTimeFormat(locale, {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'Europe/Istanbul',
  }), [locale]);
  return useCallback((iso: string | null | undefined): string => {
    if (!iso) return '';
    const date = new Date(iso);
    return Number.isNaN(date.getTime()) ? '' : format.format(date);
  }, [format]);
}

const FIELD_KEY: Record<AuditField, string> = {
  amount: 'amount',
  type: 'type',
  direction: 'direction',
  description: 'description',
  car_id: 'car',
  booking_id: 'booking',
  account_id: 'account',
};

/** A floating label over an avatar, on hover or focus. */
const HoverTip: React.FC<{ content: string; children: React.ReactNode }> = ({ content, children }) => {
  const wrap = useRef<HTMLSpanElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const show = () => {
    const rect = wrap.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.top - 8, left: rect.left + rect.width / 2 });
  };
  return (
    <>
      <span ref={wrap} className="inline-flex" onMouseEnter={show} onMouseLeave={() => setPos(null)}>{children}</span>
      {pos && ReactDOM.createPortal(
        <div
          role="tooltip"
          className="pointer-events-none fixed z-[10003] max-w-[260px] -translate-x-1/2 -translate-y-full rounded-md bg-[#0f1117] px-2.5 py-1.5 text-center text-xs text-white shadow-md"
          style={{ top: pos.top, left: pos.left }}
        >
          <bdi dir="auto">{content}</bdi>
        </div>,
        document.body,
      )}
    </>
  );
};

// ── Avatars ──────────────────────────────────────────────────────────────────

const SystemGlyph: React.FC<{ size: number }> = ({ size }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <rect x="5" y="7" width="14" height="11" rx="3" />
    <path d="M12 3v4M9 12h.01M15 12h.01M9.5 15.5h5" />
  </svg>
);

const PencilGlyph: React.FC = () => (
  <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

/** A photo when there is one, otherwise initials on the person's own colour. No `actor` and no `system`: still loading. */
export const ActorAvatar: React.FC<{
  actor?: LedgerActor | null;
  system?: boolean;
  size?: number;
  className?: string;
}> = ({ actor, system, size = 24, className }) => {
  const [failed, setFailed] = useState<string | null>(null);
  const base = cn('relative grid shrink-0 place-items-center overflow-hidden rounded-full ring-2 ring-white', className);
  const box: React.CSSProperties = { width: size, height: size };
  if (system) {
    return (
      <span className={cn(base, 'bg-[#f2f4f7] text-[#98a2b3]')} style={box} aria-hidden="true">
        <SystemGlyph size={Math.round(size * 0.62)} />
      </span>
    );
  }
  if (!actor) return <span className={cn(base, 'animate-pulse bg-[#eef0f3]')} style={box} aria-hidden="true" />;
  if (actor.avatarUrl && failed !== actor.avatarUrl) {
    return (
      <span className={base} style={box} aria-hidden="true">
        <img src={actor.avatarUrl} alt="" loading="lazy" onError={() => setFailed(actor.avatarUrl)} className="h-full w-full object-cover object-top" />
      </span>
    );
  }
  return (
    <span
      className={cn(base, 'font-semibold text-[#33465c]')}
      style={{ ...box, background: getAvatarGradient({ avatar_bg: actor.avatarBg }), fontSize: Math.max(8, Math.round(size * 0.4)) }}
      aria-hidden="true"
    >
      <bdi>{actorInitials(actor.fullName)}</bdi>
    </span>
  );
};

// ── A floating panel ─────────────────────────────────────────────────────────

const PANEL_WIDTH = 320;

/** Anchored under the trigger's end (above it when there's no room), inside the viewport, over the wallet sheet. */
const Popover: React.FC<{
  anchor: HTMLElement;
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}> = ({ anchor, label, onClose, children }) => {
  const panel = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    const place = () => {
      const rect = anchor.getBoundingClientRect();
      const rtl = getComputedStyle(anchor).direction === 'rtl';
      const width = Math.min(PANEL_WIDTH, window.innerWidth - 16);
      const preferred = rtl ? rect.left : rect.right - width;
      const left = Math.min(Math.max(8, preferred), window.innerWidth - width - 8);
      const below = window.innerHeight - rect.bottom;
      const maxHeight = Math.max(160, Math.min(420, (below >= 240 ? below : rect.top) - 16));
      setStyle(below >= 240 || below >= rect.top
        ? { left, width, top: rect.bottom + 6, maxHeight }
        : { left, width, bottom: window.innerHeight - rect.top + 6, maxHeight });
    };
    place();
    panel.current?.focus({ preventScroll: true });
    window.addEventListener('resize', place);
    return () => window.removeEventListener('resize', place);
  }, [anchor]);

  useEffect(() => {
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!panel.current?.contains(target) && !anchor.contains(target)) onClose();
    };
    const onScroll = (event: Event) => {
      if (!panel.current?.contains(event.target as Node)) onClose();
    };
    // Captured on window first, so Escape closes the popover and not the wallet under it.
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopImmediatePropagation();
      event.preventDefault();
      onClose();
      anchor.focus();
    };
    document.addEventListener('pointerdown', onPointer, true);
    window.addEventListener('scroll', onScroll, true);
    window.addEventListener('keydown', onKey, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      window.removeEventListener('scroll', onScroll, true);
      window.removeEventListener('keydown', onKey, true);
    };
  }, [anchor, onClose]);

  return ReactDOM.createPortal(
    <div
      ref={panel}
      role="dialog"
      aria-label={label}
      tabIndex={-1}
      dir={getComputedStyle(anchor).direction}
      style={{ position: 'fixed', zIndex: 10002, ...style }}
      className="overflow-y-auto overscroll-contain rounded-2xl border border-black/[0.07] bg-white p-1.5 text-start shadow-[0_12px_32px_-8px_rgba(0,0,0,0.18),0_2px_6px_rgba(0,0,0,0.06)] outline-none"
    >
      {children}
    </div>,
    document.body,
  );
};

// ── History ──────────────────────────────────────────────────────────────────

function useAuditValue(refs: LedgerRefNames | null) {
  const { t } = useTranslation('wallets');
  return useCallback((field: AuditField, value: unknown): string => {
    if (value === null || value === undefined || value === '') return field === 'account_id' ? t('actors.none') : '—';
    const id = Number(value);
    switch (field) {
      case 'amount': return formatLira(Number(value));
      case 'direction': return t(String(value).toUpperCase() === 'IN' ? 'direction.moneyIn' : 'direction.moneyOut');
      case 'type': return t(`types.${String(value).trim().toLowerCase()}`, { defaultValue: humanType(String(value)) });
      case 'car_id': return refs?.cars.get(id) ?? t('actors.carRef', { id: value });
      case 'booking_id': return refs?.bookings.get(id) ?? t('actors.bookingRef', { id: value });
      case 'account_id': return refs?.accounts.get(id) ?? t('actors.accountRef', { id: value });
      default: return String(value);
    }
  }, [t, refs]);
}

const ActionChip: React.FC<{ action: 'update' | 'delete' | 'create' }> = ({ action }) => {
  const { t } = useTranslation('wallets');
  return (
    <span className={cn(
      'inline-flex h-[18px] shrink-0 items-center rounded-full px-1.5 text-[10.5px] font-semibold',
      action === 'delete' ? 'bg-[#fef3f2] text-[#b42318]' : action === 'update' ? 'bg-[#6EA4E7]/[0.14] text-[#2f6db5]' : 'bg-[#f2f4f7] text-[#667085]',
    )}>
      {t(action === 'delete' ? 'actors.deleted' : action === 'update' ? 'actors.edited' : 'actors.recorded')}
    </span>
  );
};

interface HistoryState {
  entries: LedgerAuditEntry[];
  refs: LedgerRefNames | null;
  actors: Map<string, LedgerActor>;
}

const HistoryEvent: React.FC<{
  actor: LedgerActor | undefined;
  system?: boolean;
  action: 'update' | 'delete' | 'create';
  at: string | null | undefined;
  children?: React.ReactNode;
}> = ({ actor, system, action, at, children }) => {
  const { t } = useTranslation('wallets');
  const stamp = useStamp();
  return (
    <li className="flex gap-2.5 rounded-xl px-2.5 py-2">
      <ActorAvatar actor={actor} system={system} size={24} className="mt-0.5 ring-0" />
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[12.5px] font-semibold text-[#0f1117]"><bdi dir="auto">{system ? t('actors.system') : actor?.fullName ?? t('actors.someone')}</bdi></span>
          <ActionChip action={action} />
        </div>
        <div className="text-[11.5px] text-[#98a2b3]"><bdi dir="ltr" className="hc-num">{stamp(at)}</bdi></div>
        {children}
      </div>
    </li>
  );
};

const LedgerHistory: React.FC<{
  ledgerId: string;
  createdBy: string | null;
  createdAt: string | null | undefined;
  creator: LedgerActor | undefined;
}> = ({ ledgerId, createdBy, createdAt, creator }) => {
  const { t } = useTranslation('wallets');
  const [state, setState] = useState<HistoryState | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const valueOf = useAuditValue(state?.refs ?? null);

  useEffect(() => {
    let active = true;
    setError(false);
    (async () => {
      const entries = await fetchLedgerHistory(ledgerId);
      const [refs, actors] = await Promise.all([fetchLedgerRefNames(entries), loadLedgerActors(auditActorIds(entries))]);
      if (active) setState({ entries, refs, actors });
    })().catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [ledgerId, attempt]);

  return (
    <div>
      <div className="px-2.5 pb-1 pt-1.5 text-[12px] font-semibold text-[#98a2b3]">{t('actors.history')}</div>
      {error ? (
        <div role="alert" className="px-2.5 pb-2 text-[12.5px] text-[#667085]">
          {t('actors.historyError')}{' '}
          <button type="button" className="min-h-[32px] font-semibold text-[#2f6db5] hover:underline" onClick={() => setAttempt((n) => n + 1)}>{t('actors.retry')}</button>
        </div>
      ) : !state ? (
        <div aria-busy="true" className="space-y-2 px-2.5 py-2">
          <div className="h-3 w-3/4 animate-pulse rounded bg-[#eef0f3]" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-[#f2f4f7]" />
        </div>
      ) : (
        <ol className="divide-y divide-[#f2f4f7]">
          {state.entries.map((entry) => {
            const changes = changedFields(entry.oldRow, entry.newRow);
            return (
              <HistoryEvent
                key={entry.id}
                actor={entry.changedBy ? state.actors.get(entry.changedBy) : undefined}
                system={!entry.changedBy}
                action={entry.action}
                at={entry.changedAt}
              >
                {entry.action === 'update' && changes.length > 0 && (
                  <dl className="mt-1.5 grid grid-cols-[auto_minmax(0,1fr)] gap-x-2 gap-y-1 text-[12px]">
                    {changes.map((change) => (
                      <React.Fragment key={change.field}>
                        <dt className="text-[#98a2b3]">{t(`actors.fields.${FIELD_KEY[change.field]}`)}</dt>
                        <dd className="min-w-0 break-words text-[#344054]">
                          <bdi dir="auto" className="text-[#98a2b3] line-through decoration-[#d0d5dd]">{valueOf(change.field, change.from)}</bdi>
                          <span aria-hidden="true" className="mx-1 inline-block text-[#c0c5cd] rtl:-scale-x-100">→</span>
                          <span className="sr-only"> {t('actors.changedTo')} </span>
                          <bdi dir="auto" className="font-medium">{valueOf(change.field, change.to)}</bdi>
                        </dd>
                      </React.Fragment>
                    ))}
                  </dl>
                )}
                {entry.action === 'update' && changes.length === 0 && (
                  <div className="mt-1 text-[12px] text-[#98a2b3]">{t('actors.otherChanged')}</div>
                )}
              </HistoryEvent>
            );
          })}
          <HistoryEvent actor={creator} system={!createdBy} action="create" at={createdAt} />
        </ol>
      )}
      {state && state.entries.length === 0 && !error && (
        <p className="px-2.5 pb-2 text-[11.5px] text-[#98a2b3]">{t('actors.notEdited')}</p>
      )}
    </div>
  );
};

// ── The avatars on a row ─────────────────────────────────────────────────────

/**
 * The creator's avatar, the last editor's on top with a ✎, and the line's history
 * on click. Renders nothing outside an enabled provider.
 */
export const LedgerStamp: React.FC<{
  ledgerId: string;
  createdBy: string | null | undefined;
  createdAt: string | null | undefined;
  updatedBy: string | null | undefined;
  updatedAt: string | null | undefined;
}> = ({ ledgerId, createdBy = null, createdAt, updatedBy = null, updatedAt }) => {
  const { t } = useTranslation('wallets');
  const stamp = useStamp();
  const { enabled, actors } = useContext(LedgerActorsContext);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!enabled) return null;

  const creator = createdBy ? actors.get(createdBy) : undefined;
  const editor = updatedBy ? actors.get(updatedBy) : undefined;
  const someone = t('actors.someone');
  const recorded = createdBy
    ? t('actors.recordedBy', { name: creator?.fullName ?? someone, when: stamp(createdAt) })
    : t('actors.systemTip');
  const edited = updatedBy ? t('actors.lastEdited', { name: editor?.fullName ?? someone, when: stamp(updatedAt) }) : null;

  return (
    <>
      <button
        ref={button}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={[recorded, edited, t('actors.showHistory')].filter(Boolean).join('. ')}
        onClick={() => setOpen((value) => !value)}
        className={cn(
          'inline-flex h-9 w-10 shrink-0 items-center justify-center rounded-full border-0 bg-transparent p-0 transition-colors hover:bg-[#f2f4f7] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/35 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11',
          open && 'bg-[#f2f4f7]',
        )}
      >
        <HoverTip content={recorded}>
          <ActorAvatar actor={creator} system={!createdBy} size={24} />
        </HoverTip>
        {updatedBy && edited && (
          <HoverTip content={edited}>
            <span className="relative -ms-1.5 mt-2.5 inline-flex">
              <ActorAvatar actor={editor} size={18} />
              <span aria-hidden="true" className="absolute -bottom-0.5 -end-1 grid h-[11px] w-[11px] place-items-center rounded-full bg-[#6EA4E7] text-white ring-[1.5px] ring-white">
                <PencilGlyph />
              </span>
            </span>
          </HoverTip>
        )}
      </button>
      {open && button.current && (
        <Popover anchor={button.current} label={t('actors.history')} onClose={close}>
          <LedgerHistory ledgerId={ledgerId} createdBy={createdBy} createdAt={createdAt} creator={creator} />
        </Popover>
      )}
    </>
  );
};

// ── Deleted entries ──────────────────────────────────────────────────────────

interface DeletedState {
  entries: LedgerAuditEntry[];
  refs: LedgerRefNames;
  actors: Map<string, LedgerActor>;
}

const DeletedRow: React.FC<{ entry: LedgerAuditEntry; refs: LedgerRefNames; actors: Map<string, LedgerActor> }> = ({ entry, refs, actors }) => {
  const { t } = useTranslation('wallets');
  const stamp = useStamp();
  const row = entry.oldRow ?? {};
  const received = String(row.direction ?? '').toUpperCase() === 'IN';
  const bookingId = Number(row.booking_id);
  const deleter = entry.changedBy ? actors.get(entry.changedBy) : undefined;
  const createdBy = (row.created_by as string | null | undefined) ?? null;
  const creator = createdBy ? actors.get(createdBy) : undefined;
  const type = String(row.type ?? '');
  const label = type ? t(`types.${type.trim().toLowerCase()}`, { defaultValue: humanType(type) }) : '—';
  return (
    <li className="flex items-start gap-3 border-b border-[#f2f4f7] py-2.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="truncate text-[13.5px] font-semibold text-[#0f1117] line-through decoration-[#d0d5dd]">{label}</span>
          {Number.isFinite(bookingId) && bookingId > 0 && (
            <bdi dir="ltr" className="text-[11.5px] text-[#98a2b3]">{refs.bookings.get(bookingId) ?? `#${bookingId}`}</bdi>
          )}
        </div>
        {typeof row.description === 'string' && row.description && (
          <div className="truncate text-[12px] text-[#667085]"><bdi dir="auto">{row.description}</bdi></div>
        )}
        <div className="mt-1 flex min-w-0 items-center gap-1.5 text-[12px] text-[#667085]">
          <ActorAvatar actor={deleter} system={!entry.changedBy} size={18} className="ring-0" />
          <span className="min-w-0 truncate">
            {t('actors.deletedBy', { name: entry.changedBy ? deleter?.fullName ?? t('actors.someone') : t('actors.system') })}
            {' · '}<bdi dir="ltr" className="hc-num">{stamp(entry.changedAt)}</bdi>
          </span>
        </div>
        <div className="mt-0.5 truncate text-[11.5px] text-[#98a2b3]">
          {createdBy ? t('actors.recordedByShort', { name: creator?.fullName ?? t('actors.someone') }) : t('actors.autoEntry')}
          {typeof row.created_at === 'string' && <> · <bdi dir="ltr" className="hc-num">{stamp(row.created_at)}</bdi></>}
        </div>
      </div>
      <span className={cn('hc-num shrink-0 text-[13.5px] font-semibold line-through decoration-[#d0d5dd]', received ? 'text-[#067647]/70' : 'text-[#b42318]/70')}>
        <bdi dir="ltr">{received ? '+' : '−'}{formatLira(Number(row.amount) || 0)}</bdi>
      </span>
    </li>
  );
};

/** "Deleted entries": the lines removed from this customer's wallet, who removed them and when. */
export const DeletedLedgerEntries: React.FC<{ customerId: string; refreshKey?: number }> = ({ customerId, refreshKey = 0 }) => {
  const { t } = useTranslation('wallets');
  const enabled = useLedgerActorsEnabled();
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<DeletedState | null>(null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!open || !enabled) return undefined;
    let active = true;
    setError(false);
    (async () => {
      const entries = await fetchDeletedLedgerEntries(customerId);
      const [refs, actors] = await Promise.all([fetchLedgerRefNames(entries), loadLedgerActors(auditActorIds(entries))]);
      if (active) setState({ entries, refs, actors });
    })().catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [open, enabled, customerId, refreshKey, attempt]);

  if (!enabled) return null;
  const panelId = `deleted-ledger-${customerId}`;

  return (
    <section aria-label={t('actors.deletedEntries')} className="rounded-2xl border border-[#eaecf0] bg-white">
      <button
        type="button"
        aria-pressed={open}
        aria-controls={open ? panelId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl border-0 bg-transparent px-4 text-start transition-colors hover:bg-[#f9fafb] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[#6EA4E7]/35"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] bg-[#f2f4f7] text-[#667085]">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13" /></svg>
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold text-[#0f1117]">{t('actors.deletedEntries')}</span>
          <span className="block text-[12px] text-[#98a2b3]">
            {open && state ? t('actors.deletedCount', { count: state.entries.length }) : t('actors.deletedHint')}
          </span>
        </span>
        <span aria-hidden="true" className={cn('relative h-[22px] w-[38px] shrink-0 rounded-full transition-colors', open ? 'bg-[#6EA4E7]' : 'bg-[#d0d5dd]')}>
          <span className={cn('absolute top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-[inset-inline-start]', open ? 'start-[19px]' : 'start-[3px]')} />
        </span>
      </button>
      {open && (
        <div id={panelId} className="border-t border-[#f2f4f7] px-4 pb-1">
          {error ? (
            <div role="alert" className="py-4 text-[12.5px] text-[#667085]">
              {t('actors.deletedError')}{' '}
              <button type="button" className="min-h-[32px] font-semibold text-[#2f6db5] hover:underline" onClick={() => setAttempt((n) => n + 1)}>{t('actors.retry')}</button>
            </div>
          ) : !state ? (
            <div aria-busy="true" className="space-y-2 py-4">
              <div className="h-3 w-2/3 animate-pulse rounded bg-[#eef0f3]" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-[#f2f4f7]" />
            </div>
          ) : state.entries.length === 0 ? (
            <p className="py-4 text-[12.5px] text-[#98a2b3]">{t('actors.deletedEmpty')}</p>
          ) : (
            <ul>
              {state.entries.map((entry) => <DeletedRow key={entry.id} entry={entry} refs={state.refs} actors={state.actors} />)}
            </ul>
          )}
        </div>
      )}
    </section>
  );
};
