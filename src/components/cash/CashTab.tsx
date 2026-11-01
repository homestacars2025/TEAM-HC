import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '../../contexts/CurrentUserContext';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { useStaffProfiles } from '../../hooks/useStaffProfiles';
import { useTileFilter } from '../../hooks/useTileFilter';
import {
  accountFilter, canReverse, cashErrorKey, envelopeCustomer, holdingSummary, inCashFilter, isInternalTransfer, isOverdue, MOVEMENT_GROUPS, movementGroup, movementInFilter, pendingSettlement,
  type AccountBalance, type CashAccount, type Envelope, type Movement,
} from '../../lib/envelopes';
import { istanbulDate } from '../../lib/istanbulTime';
import { adminReceiveEnvelopes, completeMovement, getAccountBalances, getCashAccounts, getEnvelopes, getMovements, reverseMovement } from '../../lib/queries/envelopes';
import { formatMoney, SUPPLIER_CURRENCIES, type SupplierCurrency } from '../../lib/suppliers';
import { relativeSignal } from '../../lib/tracking';
import PlateChip from '../booking/PlateChip';
import Button from '../Button';
import ConfirmDialog from '../custody/ConfirmDialog';
import ReasonDialog from '../custody/ReasonDialog';
import StaffAvatar from '../StaffAvatar';
import { StatTile, selectClass, type TileTone } from '../WalletParts';
import DateFilter from './DateFilter';
import ReceiveEnvelope from './ReceiveEnvelope';
import TransferDialog from './TransferDialog';

const STATUS_TONE: Record<Envelope['status'], string> = { with_employee: 'is-amber', in_safe: 'is-green', with_admin: 'is-blue', cancelled: 'is-old' };

const Money: React.FC<{ amount: number; currency: SupplierCurrency; lira?: number | null }> = ({ amount, currency, lira }) => (
  <span className="hc-cash-money">
    <bdi dir="ltr">{formatMoney(amount, currency)}</bdi>
    {currency !== 'TRY' && lira !== null && lira !== undefined && <small><bdi dir="ltr">≈ {formatMoney(lira, 'TRY')}</bdi></small>}
  </span>
);

const errorOf = (failure: unknown) => (failure as { message?: string })?.message;

/** Rare and undoes real money, so it waits behind a menu rather than sitting on every row. */
const RowMenu: React.FC<{ label: string; action: string; onAction: () => void }> = ({ label, action, onAction }) => {
  const [open, setOpen] = useState(false);
  const [above, setAbove] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  // The table's containment means the last row can't scroll a menu into view, so it flips.
  const toggle = () => {
    setAbove(window.innerHeight - (root.current?.getBoundingClientRect().bottom ?? 0) < 64);
    setOpen(current => !current);
  };

  useEffect(() => {
    if (!open) return undefined;
    const onPointer = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={root} className="hc-cash-menu">
      <button type="button" aria-label={label} title={label} aria-haspopup="menu" aria-expanded={open} className="is-more" onClick={toggle}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>
      </button>
      {open && (
        <div role="menu" className={`hc-cash-menu-list surface-depth surface-float${above ? ' is-above' : ''}`}>
          <button type="button" role="menuitem" onClick={() => { setOpen(false); onAction(); }}>{action}</button>
        </div>
      )}
    </div>
  );
};

const CashTab: React.FC<{ notify: (message: string, failed: boolean) => void }> = ({ notify }) => {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const locale = useDateLocale();
  const staff = useStaffProfiles();
  const { profile } = useCurrentUser();
  const isAdmin = profile?.role === 'admin';

  const [accounts, setAccounts] = useState<CashAccount[]>([]);
  const [balances, setBalances] = useState<AccountBalance[]>([]);
  const [envelopes, setEnvelopes] = useState<Envelope[] | null>(null);
  const [movements, setMovements] = useState<Movement[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [now, setNow] = useState(() => Date.now());

  const [receiving, setReceiving] = useState(false);
  const [transferring, setTransferring] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [confirmingAdmin, setConfirmingAdmin] = useState(false);
  const [adminBusy, setAdminBusy] = useState(false);
  const [reversing, setReversing] = useState<Movement | null>(null);
  const [reverseBusy, setReverseBusy] = useState(false);
  const [reverseError, setReverseError] = useState<string | null>(null);
  const [completing, setCompleting] = useState<number | null>(null);

  const [kind, setKind] = useState('all');
  const [account, setAccount] = useState('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [showInternal, setShowInternal] = useState(false);

  const load = useCallback(async () => {
    const [nextAccounts, nextBalances, nextEnvelopes, nextMovements] = await Promise.all([getCashAccounts(), getAccountBalances(), getEnvelopes(), getMovements()]);
    setAccounts(nextAccounts);
    setBalances(nextBalances);
    setEnvelopes(nextEnvelopes);
    setMovements(nextMovements);
    setNow(Date.now());
  }, []);

  useEffect(() => {
    setFailed(false);
    load().catch(() => setFailed(true));
  }, [load, attempt]);

  const filters = useMemo(() => ['staff', 'pos', ...accounts.map(item => accountFilter(item.id))], [accounts]);
  const [filter, setFilter] = useTileFilter(filters);

  const accountName = useCallback((id: number | null) => accounts.find(item => item.id === id)?.name ?? null, [accounts]);
  const holding = useMemo(() => holdingSummary(envelopes ?? [], now), [envelopes, now]);
  const settlement = useMemo(() => pendingSettlement(movements), [movements]);
  const reversed = useMemo(() => new Set(movements.map(item => item.reverses_id).filter((id): id is number => id !== null)), [movements]);

  const shownEnvelopes = useMemo(() => (envelopes ?? []).filter(item => inCashFilter(item, filter)), [envelopes, filter]);
  const shownMovements = useMemo(() => movements.filter(item => {
    const day = istanbulDate(new Date(item.created_at));
    const group = movementGroup(item, accounts);
    const listed = group !== null || (isAdmin && showInternal && isInternalTransfer(item, accounts));
    return listed && movementInFilter(item, filter)
      && (kind === 'all' || group === kind)
      && (account === 'all' || String(item.from_account_id) === account || String(item.to_account_id) === account)
      && (!from || day >= from) && (!to || day <= to);
  }), [movements, accounts, isAdmin, showInternal, filter, kind, account, from, to]);

  const selectable = useMemo(() => shownEnvelopes.filter(item => item.status === 'in_safe'), [shownEnvelopes]);
  const chosen = useMemo(() => selectable.filter(item => selected.has(item.id)), [selectable, selected]);

  const holderName = useCallback((envelope: Envelope) => staff?.get(envelope.holder_profile_id)?.full_name ?? t('review.employee'), [staff, t]);
  const refresh = () => load().catch(() => {});

  const adminReceive = async () => {
    setAdminBusy(true);
    try {
      const count = await adminReceiveEnvelopes(chosen.map(item => item.id));
      setSelected(new Set());
      notify(t('cash.adminReceived', { count }), false);
      await refresh();
    } catch (failure) {
      notify(t(`cash.errors.${cashErrorKey(errorOf(failure))}`), true);
    }
    setAdminBusy(false);
    setConfirmingAdmin(false);
  };

  const arrived = async (movement: Movement) => {
    setCompleting(movement.id);
    try {
      await completeMovement(movement.id);
      notify(t('cash.arrivedDone'), false);
      await refresh();
    } catch (failure) {
      notify(t(`cash.errors.${cashErrorKey(errorOf(failure))}`), true);
    }
    setCompleting(null);
  };

  const reverse = async (reason: string) => {
    if (!reversing) return;
    setReverseBusy(true);
    setReverseError(null);
    try {
      const ref = await reverseMovement(reversing.id, reason);
      setReversing(null);
      notify(t('cash.reversed', { ref }), false);
      await refresh();
    } catch (failure) {
      setReverseError(t(`cash.errors.${cashErrorKey(errorOf(failure))}`));
    }
    setReverseBusy(false);
  };

  const loading = envelopes === null && !failed;

  const accountTile = (item: CashAccount) => {
    const own = balances.filter(row => row.account_id === item.id);
    const inCurrency = (currency: SupplierCurrency) => own.find(row => row.currency === currency)?.balance ?? 0;
    const others = SUPPLIER_CURRENCIES.filter(currency => currency !== 'TRY' && inCurrency(currency) !== 0);
    const tone: TileTone = item.is_final ? 'balance' : item.kind === 'pos' ? 'paid' : item.kind === 'bank' ? 'received' : 'total';
    return (
      <StatTile
        key={item.id}
        tone={tone}
        label={item.name}
        value={loading ? null : formatMoney(inCurrency('TRY'), 'TRY')}
        sub={others.length ? others.map(currency => formatMoney(inCurrency(currency), currency)).join(' · ') : t(`cash.kinds.${item.is_final ? 'final' : item.kind}`)}
        pressed={filter === accountFilter(item.id)}
        onPress={() => setFilter(accountFilter(item.id))}
      />
    );
  };

  return (
    <div className="hc-cash">
      {failed && (
        <div role="alert" className="hc-form-error mb-4 flex flex-wrap items-center justify-between gap-2">
          {t('cash.loadFailed')}
          <Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>{tc('actions.tryAgain')}</Button>
        </div>
      )}

      <div className="hc-tiles hc-tiles-filter hc-cash-tiles">
        <StatTile tone="total" label={t('cash.tiles.all')} value={loading ? null : String(accounts.length)} sub={t('cash.tiles.accounts')} pressed={filter === 'all'} onPress={() => setFilter('all')} />
        {accounts.map(accountTile)}
        <StatTile
          tone={holding.overdue ? 'negative' : 'warn'}
          label={t('cash.tiles.staff')}
          value={loading ? null : String(holding.count)}
          sub={holding.totals.length ? holding.totals.map(row => formatMoney(row.total, row.currency)).join(' · ') : t('cash.tiles.staffNone')}
          pressed={filter === 'staff'}
          onPress={() => setFilter('staff')}
        />
        <StatTile
          tone="paid"
          label={t('cash.tiles.pos')}
          value={loading ? null : settlement.totals[0] ? formatMoney(settlement.totals[0].total, settlement.totals[0].currency) : formatMoney(0, 'TRY')}
          sub={settlement.next ? t('cash.tiles.next', { date: formatDay(settlement.next, locale) }) : t('cash.tiles.posNone')}
          pressed={filter === 'pos'}
          onPress={() => setFilter('pos')}
        />
      </div>

      <div className="hc-cash-actions">
        <Button onClick={() => setReceiving(true)}>{t('cash.receive.title')}</Button>
        {isAdmin && <Button variant="secondary" onClick={() => setTransferring(true)}>{t('cash.transfer.title')}</Button>}
      </div>

      <section className="hc-cash-section" aria-label={t('cash.envelopes')}>
        <h2>{t('cash.envelopes')}</h2>
        {loading ? <div className="hc-fine-skeleton" /> : shownEnvelopes.length === 0 ? <p className="hc-records-empty">{t('cash.noEnvelopes')}</p> : (
          <div className="hc-cash-table">
            <table>
              <thead>
                <tr>
                  {isAdmin && <th scope="col"><span className="sr-only">{t('custody.select')}</span></th>}
                  <th scope="col">{t('cash.table.ref')}</th>
                  <th scope="col">{t('cash.table.staff')}</th>
                  <th scope="col">{t('cash.table.customer')}</th>
                  <th scope="col">{t('cash.table.plate')}</th>
                  <th scope="col" className="is-num">{t('cash.table.amount')}</th>
                  <th scope="col">{t('cash.table.age')}</th>
                  <th scope="col">{t('cash.table.status')}</th>
                </tr>
              </thead>
              <tbody>
                {shownEnvelopes.map(envelope => {
                  const person = staff?.get(envelope.holder_profile_id);
                  return (
                    <tr key={envelope.id} className={selected.has(envelope.id) ? 'is-selected' : undefined}>
                      {isAdmin && (
                        <td className="hc-cash-c-pick">
                          {envelope.status === 'in_safe' && (
                            <input
                              type="checkbox"
                              className="hc-appr-check"
                              aria-label={envelope.ref}
                              checked={selected.has(envelope.id)}
                              onChange={() => setSelected(current => { const next = new Set(current); if (next.has(envelope.id)) next.delete(envelope.id); else next.add(envelope.id); return next; })}
                            />
                          )}
                        </td>
                      )}
                      <td className="hc-cash-c-ref"><strong dir="ltr" className="hc-num">{envelope.ref}</strong></td>
                      <td className="hc-cash-c-who"><span className="inline-flex min-w-0 items-center gap-2"><StaffAvatar profile={person} size={24} /><span dir="auto" className="truncate">{holderName(envelope)}</span></span></td>
                      <td data-label={t('cash.table.customer')} dir="auto">{envelopeCustomer(envelope) || '—'}</td>
                      <td data-label={t('cash.table.plate')}>{envelope.car ? <PlateChip plate={envelope.car.plate_number} /> : '—'}</td>
                      <td data-label={t('cash.table.amount')} className="is-num">
                        <Money amount={envelope.amount} currency={envelope.currency} />
                        {!!envelope.difference && <span className="hc-cash-diff">{t('cash.counted', { amount: formatMoney(envelope.counted_amount ?? 0, envelope.currency) })}</span>}
                      </td>
                      <td data-label={t('cash.table.age')} className={isOverdue(envelope, now) ? 'hc-cash-late' : undefined}>{relativeSignal(envelope.created_at, now, locale) ?? t('cash.justNow')}</td>
                      <td className="hc-cash-c-status"><span className={`hc-pill ${STATUS_TONE[envelope.status]}`}>{t(`cash.status.${envelope.status}`)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {isAdmin && chosen.length > 0 && (
          <div className="hc-appr-bar surface-depth surface-float" role="region" aria-label={t('cash.envelopes')}>
            <span>{t('cash.chosen', { count: chosen.length })}</span>
            <Button onClick={() => setConfirmingAdmin(true)}>{t('cash.adminReceive')}</Button>
          </div>
        )}
      </section>

      <section className="hc-cash-section" aria-label={t('cash.movements')}>
        <h2>{t('cash.movements')}</h2>
        <div className="hc-cash-filters">
          <select className={selectClass} aria-label={t('cash.filters.account')} value={account} onChange={e => setAccount(e.target.value)}>
            <option value="all">{t('cash.filters.allAccounts')}</option>
            {accounts.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
          <select className={selectClass} aria-label={t('cash.filters.kind')} value={kind} onChange={e => setKind(e.target.value)}>
            <option value="all">{t('cash.filters.allKinds')}</option>
            {MOVEMENT_GROUPS.map(item => <option key={item} value={item}>{t(`cash.movementKinds.${item}`)}</option>)}
          </select>
          <DateFilter from={from} to={to} onChange={(start, end) => { setFrom(start); setTo(end); }} />
          {isAdmin && (
            <label className="hc-cash-internal">
              <input type="checkbox" className="hc-appr-check" checked={showInternal} onChange={e => setShowInternal(e.target.checked)} />
              {t('cash.showInternal')}
            </label>
          )}
        </div>

        {loading ? <div className="hc-fine-skeleton" /> : shownMovements.length === 0 ? <p className="hc-records-empty">{t('cash.noMovements')}</p> : (
          <div className="hc-cash-table hc-cash-ledger">
            <table>
              <thead>
                <tr>
                  <th scope="col">{t('cash.table.ref')}</th>
                  <th scope="col">{t('cash.table.date')}</th>
                  <th scope="col">{t('cash.table.kind')}</th>
                  <th scope="col">{t('cash.table.route')}</th>
                  <th scope="col" className="is-num">{t('cash.table.amount')}</th>
                  <th scope="col">{t('cash.table.by')}</th>
                  <th scope="col">{t('cash.table.note')}</th>
                  <th scope="col"><span className="sr-only">{t('custody.actions')}</span></th>
                </tr>
              </thead>
              <tbody>
                {shownMovements.map(movement => {
                  const person = movement.created_by ? staff?.get(movement.created_by) : undefined;
                  const pending = movement.status === 'pending' && movement.kind === 'pos_settlement';
                  const group = movementGroup(movement, accounts);
                  const isReversed = reversed.has(movement.id);
                  return (
                    <tr key={movement.id} className={isReversed ? 'is-reversed' : pending ? 'is-pending' : undefined}>
                      <td className="hc-cash-c-ref"><strong dir="ltr" className="hc-num">{movement.ref}</strong></td>
                      <td className="hc-cash-c-date">{formatDay(istanbulDate(new Date(movement.created_at)), locale)}</td>
                      <td className="hc-cash-c-kind">{group && <span className="hc-sup-chip">{t(`cash.movementKinds.${group}`)}</span>}</td>
                      <td data-label={t('cash.table.route')} className="hc-cash-c-route">
                        <span>{accountName(movement.from_account_id) ?? '—'}</span>
                        <svg className="hc-trk-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                        <span>{accountName(movement.to_account_id) ?? '—'}</span>
                      </td>
                      <td data-label={t('cash.table.amount')} className="is-num"><Money amount={movement.amount} currency={movement.currency} lira={movement.amount_try} /></td>
                      <td className="hc-cash-c-by" title={person?.full_name ?? undefined}>{person ? <StaffAvatar profile={person} size={24} /> : '—'}</td>
                      <td data-label={t('cash.table.note')} className="hc-cash-c-note" dir="auto">
                        {movement.note || '—'}
                        {pending && movement.expected_at && <span className="hc-cash-expected">{t('cash.expected', { date: formatDay(movement.expected_at, locale) })}</span>}
                      </td>
                      <td className="hc-cash-c-actions">
                        {pending && <button type="button" className="is-go" disabled={completing === movement.id} onClick={() => void arrived(movement)}>{t('cash.arrived')}</button>}
                        {isAdmin && canReverse(movement, reversed) && <RowMenu label={t('cash.more')} action={t('cash.reverse')} onAction={() => { setReverseError(null); setReversing(movement); }} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {receiving && envelopes && (
        <ReceiveEnvelope envelopes={envelopes} accounts={accounts} holderName={holderName} onClose={() => setReceiving(false)} onDone={ref => { setReceiving(false); notify(t('cash.receive.done', { ref }), false); void refresh(); }} />
      )}
      {transferring && (
        <TransferDialog accounts={accounts} onClose={() => setTransferring(false)} onDone={ref => { setTransferring(false); notify(t('cash.transfer.done', { ref }), false); void refresh(); }} />
      )}
      {confirmingAdmin && (
        <ConfirmDialog
          title={t('cash.adminConfirmTitle', { count: chosen.length })}
          body={t('cash.adminConfirmBody')}
          confirmLabel={t('cash.adminReceive')}
          cancelLabel={tc('actions.cancel')}
          tone="primary"
          busy={adminBusy}
          onConfirm={() => void adminReceive()}
          onCancel={() => setConfirmingAdmin(false)}
        />
      )}
      {reversing && (
        <ReasonDialog
          title={t('cash.reverseTitle', { ref: reversing.ref })}
          body={t('cash.reverseBody')}
          label={t('review.rejectDialog.reason')}
          confirmLabel={t('cash.reverse')}
          busy={reverseBusy}
          error={reverseError}
          onConfirm={reason => void reverse(reason)}
          onCancel={() => setReversing(null)}
        />
      )}
    </div>
  );
};

export default CashTab;
