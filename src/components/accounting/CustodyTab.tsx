import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { useStaffProfiles } from '../../hooks/useStaffProfiles';
import { useTileFilter } from '../../hooks/useTileFilter';
import { formatTRY } from '../../lib/CurrencyContext';
import type { ExpenseCar } from '../../lib/custodyExpense';
import { employeeCustody, inReviewFilter, isLegacyApproval, REVIEW_FILTERS, reviewErrorKey, reviewStats, settlement, sheetLink, type PostedCar, type ReviewExpense } from '../../lib/expenseReview';
import { istanbulDate } from '../../lib/istanbulTime';
import { getActiveCars } from '../../lib/queries/custody';
import {
  deleteWalletEntry, getCustodyMovements, getFinanceSigners, getPostedCars, getSignatures, getWalletBalances, matchExpense, rejectExpense, signExpense,
  type ExpenseMatch, type FinanceSigner, type MatchResult, type Signatures,
} from '../../lib/queries/expenseReview';
import { AddWalletEntryModal, EditWalletTxnModal } from '../../pages/AccountingPage';
import PlateChip from '../booking/PlateChip';
import Button from '../Button';
import ConfirmDialog from '../custody/ConfirmDialog';
import ReasonDialog from '../custody/ReasonDialog';
import ReviewPill from '../custody/ReviewPill';
import { useExpenseCategoryLabel } from '../custody/useExpenseCategoryLabel';
import StaffAvatar from '../StaffAvatar';
import { CategoryChip } from '../suppliers/parts';
import { ReceiptThumb, StatTile } from '../WalletParts';
import MatchPopover from './MatchPopover';
import SignatureCell from './SignatureCell';

interface CustodyTabProps {
  userId: string | null;
  onOpenReceipt: (url: string) => void;
  onPendingChange: (count: number) => void;
  notify: (message: string, failed: boolean) => void;
}

const money = (total: number) => formatTRY(total);
const signed = (total: number) => `${total < 0 ? '−' : ''}${formatTRY(total)}`;
const pendingOf = (rows: ReviewExpense[]) => rows.filter(row => row.direction === 'OUT' && row.review_status === 'pending');
const errorOf = (failure: unknown) => (failure as { message?: string })?.message;

const CustodyTab: React.FC<CustodyTabProps> = ({ userId, onOpenReceipt, onPendingChange, notify }) => {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const locale = useDateLocale();
  const categoryLabel = useExpenseCategoryLabel();
  const staff = useStaffProfiles();
  const [filter, setFilter] = useTileFilter(REVIEW_FILTERS);

  const [rows, setRows] = useState<ReviewExpense[] | null>(null);
  const [signers, setSigners] = useState<FinanceSigner[]>([]);
  const [signatures, setSignatures] = useState<Signatures>(new Map());
  const [balances, setBalances] = useState<Map<string, number>>(new Map());
  const [posted, setPosted] = useState<Map<number, PostedCar>>(new Map());
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [opened, setOpened] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const [matching, setMatching] = useState<{ row: ReviewExpense; anchor: DOMRect } | null>(null);
  const [matchBusy, setMatchBusy] = useState(false);
  const [matchError, setMatchError] = useState<string | null>(null);
  const [cars, setCars] = useState<ExpenseCar[] | null>(null);
  const [carsFailed, setCarsFailed] = useState(false);
  const [carsAttempt, setCarsAttempt] = useState(0);

  const [rejecting, setRejecting] = useState<ReviewExpense | null>(null);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<ReviewExpense | null>(null);
  const [deleting, setDeleting] = useState<ReviewExpense | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const working = useRef(new Set<number>());

  const load = useCallback(async () => {
    const [movements, people, marks, wallets] = await Promise.all([getCustodyMovements(), getFinanceSigners(), getSignatures(), getWalletBalances()]);
    const postedIds = movements.flatMap(row => (row.posted_car_tx_id === null ? [] : [row.posted_car_tx_id]));
    const postedCars = await getPostedCars(postedIds);
    return { movements, people, marks, wallets, postedCars };
  }, []);

  const apply = useCallback(({ movements, people, marks, wallets, postedCars }: Awaited<ReturnType<typeof load>>) => {
    setRows(movements);
    setSigners(people);
    setSignatures(marks);
    setBalances(wallets);
    setPosted(postedCars);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    load()
      .then(data => { if (!cancelled) apply(data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [load, apply, attempt]);

  useEffect(() => {
    if (rows) onPendingChange(pendingOf(rows).length);
  }, [rows, onPendingChange]);

  useEffect(() => {
    if (!matching || cars) return undefined;
    let cancelled = false;
    setCarsFailed(false);
    getActiveCars()
      .then(data => { if (!cancelled) setCars(data); })
      .catch(() => { if (!cancelled) setCarsFailed(true); });
    return () => { cancelled = true; };
  }, [matching, cars, carsAttempt]);

  const refresh = useCallback(() => load().then(apply).catch(() => {}), [load, apply]);
  const patch = (id: number, change: Partial<ReviewExpense>) => setRows(current => (current ?? []).map(row => (row.id === id ? { ...row, ...change } : row)));

  const setSignature = useCallback((id: number, on: boolean, at = new Date().toISOString()) => {
    if (!userId) return;
    setSignatures(current => {
      const next = new Map(current);
      const marks = new Map(next.get(id) ?? []);
      if (on) marks.set(userId, at);
      else marks.delete(userId);
      next.set(id, marks);
      return next;
    });
  }, [userId]);

  const month = istanbulDate().slice(0, 7);
  const mine = useMemo(() => {
    const ids = new Set<number>();
    signatures.forEach((marks, id) => { if (userId && marks.has(userId)) ids.add(id); });
    return ids;
  }, [signatures, userId]);
  const context = useMemo(() => ({ month, signed: mine }), [month, mine]);
  const stats = useMemo(() => reviewStats(rows ?? [], context), [rows, context]);
  const shown = useMemo(() => (rows ?? []).filter(row => inReviewFilter(row, filter, context)), [rows, filter, context]);
  const employees = useMemo(() => employeeCustody(shown, balances, month), [shown, balances, month]);
  // A person's figures are theirs whatever the filter is hiding.
  const whole = useMemo(() => new Map(employeeCustody(rows ?? [], balances, month).map(item => [item.employeeId, item])), [rows, balances, month]);

  const selectable = useMemo(() => pendingOf(shown), [shown]);
  const chosen = useMemo(() => selectable.filter(row => selected.has(row.id)), [selectable, selected]);
  const chosenTotal = chosen.reduce((sum, row) => sum + row.amount, 0);

  const toggleSignature = async (row: ReviewExpense) => {
    if (!userId || working.current.has(row.id)) return;
    const on = !signatures.get(row.id)?.has(userId);
    working.current.add(row.id);
    setSignature(row.id, on);
    try {
      await signExpense(row.id, on);
    } catch (failure) {
      setSignature(row.id, !on);
      notify(t(`review.errors.${reviewErrorKey(errorOf(failure))}`), true);
    }
    working.current.delete(row.id);
  };

  // Sections open for pending rows, so without this the last answer would snap one shut.
  const keepOpen = (row: ReviewExpense) => setOpened(current => ({ ...current, [row.employee_id]: true }));

  const applyMatch = (row: ReviewExpense, result: MatchResult, carId: number | null) => {
    keepOpen(row);
    patch(row.id, { review_status: 'approved', reviewed_at: new Date().toISOString(), posted_car_tx_id: result.car_tx_id, posted_company_expense_id: result.company_expense_id });
    setSignature(row.id, true);
    const postedCarId = carId ?? row.car_id;
    if (result.car_tx_id !== null && postedCarId !== null) {
      const plate = cars?.find(car => car.id === postedCarId)?.plate_number ?? row.car?.plate_number ?? '';
      setPosted(current => new Map(current).set(result.car_tx_id as number, { id: result.car_tx_id as number, car_id: postedCarId, plate_number: plate }));
    }
  };

  const confirmMatch = async (match: ExpenseMatch) => {
    if (!matching) return;
    const { row } = matching;
    setMatchBusy(true);
    setMatchError(null);
    try {
      applyMatch(row, await matchExpense(row.id, match), match.carId);
      setMatching(null);
      notify(t('review.toast.approved', { count: 1 }), false);
    } catch (failure) {
      const key = reviewErrorKey(errorOf(failure));
      setMatchError(t(`review.errors.${key}`));
      if (key === 'alreadyDone') void refresh();
    }
    setMatchBusy(false);
  };

  /** One at a time: each posts to a sheet, and a failure must only leave its own row. */
  const matchChosen = async () => {
    const todo = chosen.filter(row => !working.current.has(row.id));
    setSelected(new Set());
    let done = 0;
    let lastError: string | undefined;
    for (const row of todo) {
      working.current.add(row.id);
      try {
        applyMatch(row, await matchExpense(row.id, { target: null, carId: null, category: null, note: null }), null);
        done += 1;
      } catch (failure) {
        lastError = errorOf(failure);
      }
      working.current.delete(row.id);
    }
    if (lastError) {
      notify(t('review.toast.partial', { done, total: todo.length }), true);
      void refresh();
    } else if (done > 0) {
      notify(t('review.toast.approved', { count: done }), false);
    }
  };

  const reject = async (reason: string) => {
    if (!rejecting) return;
    setRejectBusy(true);
    setRejectError(null);
    try {
      await rejectExpense(rejecting.id, reason);
      keepOpen(rejecting);
      patch(rejecting.id, { review_status: 'rejected', review_note: reason, reviewed_at: new Date().toISOString() });
      setSelected(current => { const next = new Set(current); next.delete(rejecting.id); return next; });
      setRejecting(null);
      notify(t('review.toast.rejected'), false);
    } catch (failure) {
      setRejectError(t(`review.errors.${reviewErrorKey(errorOf(failure))}`));
    }
    setRejectBusy(false);
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await deleteWalletEntry(deleting.id);
      setDeleting(null);
      notify(t('custody.deleted'), false);
      await refresh();
    } catch {
      setDeleting(null);
      notify(t('review.errors.generic'), true);
    }
    setDeleteBusy(false);
  };

  const toggle = (id: number) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const loading = rows === null && !failed;
  const tile = (group: { count: number }) => (loading ? '' : t('review.tiles.expenses', { count: group.count }));
  const amountTile = (group: { total: number }) => (loading ? null : money(group.total));

  const destination = (row: ReviewExpense) => {
    const where = settlement(row, posted);
    if (!where || where.kind === 'legacy') return null;
    if (where.kind === 'other') return <span className="hc-appr-settled">{t('review.settled.other')}</span>;
    const link = sheetLink(row, posted);
    const label = where.kind === 'car' ? t('review.settled.car', { plate: where.plate ?? '' }) : t('review.settled.company');
    return link ? <Link to={link} className="hc-appr-posted">{label}</Link> : <span className="hc-appr-settled">{label}</span>;
  };

  return (
    <div className="hc-appr">
      {failed && (
        <div role="alert" className="hc-form-error mb-4 flex flex-wrap items-center justify-between gap-2">
          {t('review.loadFailed')}
          <Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>{tc('actions.tryAgain')}</Button>
        </div>
      )}

      <div className="hc-tiles hc-tiles-filter hc-tiles-six">
        <StatTile tone="total" label={t('review.tiles.all')} value={loading ? null : String(stats.all.count)} sub={loading ? '' : money(stats.all.total)} pressed={filter === 'all'} onPress={() => setFilter('all')} />
        <StatTile tone="warn" label={t('review.tiles.pending')} value={amountTile(stats.pending)} sub={tile(stats.pending)} pressed={filter === 'pending'} onPress={() => setFilter('pending')} />
        <StatTile tone="balance" label={t('review.tiles.unsigned')} value={amountTile(stats.unsigned)} sub={tile(stats.unsigned)} pressed={filter === 'unsigned'} onPress={() => setFilter('unsigned')} />
        <StatTile tone="received" label={t('review.tiles.approved')} value={amountTile(stats.approved)} sub={tile(stats.approved)} pressed={filter === 'approved'} onPress={() => setFilter('approved')} />
        <StatTile tone="negative" label={t('review.tiles.rejected')} value={amountTile(stats.rejected)} sub={tile(stats.rejected)} pressed={filter === 'rejected'} onPress={() => setFilter('rejected')} />
        <StatTile tone="paid" label={t('review.tiles.noReceipt')} value={amountTile(stats.noReceipt)} sub={tile(stats.noReceipt)} pressed={filter === 'noReceipt'} onPress={() => setFilter('noReceipt')} />
      </div>

      <div className="hc-appr-tools">
        <Button variant="secondary" onClick={() => setAdding(true)}>{t('custody.add')}</Button>
      </div>

      {loading ? (
        <div role="status" aria-label={t('review.loading')} className="hc-fine-list">
          {[0, 1, 2].map(row => <div key={row} className="hc-fine-skeleton" />)}
        </div>
      ) : !failed && employees.length === 0 ? (
        <p className="hc-records-empty">{filter === 'pending' || filter === 'unsigned' ? t('review.emptyPending') : t('review.empty')}</p>
      ) : (
        <div className="hc-appr-groups">
          {employees.map(group => {
            const person = staff?.get(group.employeeId);
            const name = person?.full_name ?? t('review.employee');
            const totals = whole.get(group.employeeId) ?? group;
            const open = opened[group.employeeId] ?? (filter !== 'all' || totals.pending > 0);
            const panel = `hc-custody-${group.employeeId}`;
            return (
              <section key={group.employeeId} className="hc-appr-group surface-depth" aria-label={name}>
                <button type="button" className="hc-appr-head" aria-expanded={open} aria-controls={panel} onClick={() => setOpened(current => ({ ...current, [group.employeeId]: !open }))}>
                  <StaffAvatar profile={person} size={36} />
                  <span className="hc-appr-who">
                    <strong dir="auto">{name}</strong>
                    {totals.pending > 0 && <small>{t('custody.pending', { count: totals.pending })}</small>}
                  </span>
                  <span className="hc-appr-figures">
                    <span><small>{t('custody.balance')}</small><b className={totals.balance < 0 ? 'is-minus' : undefined}><bdi dir="ltr">{signed(totals.balance)}</bdi></b></span>
                    <span><small>{t('custody.received')}</small><b><bdi dir="ltr">{money(totals.received)}</bdi></b></span>
                    <span><small>{t('custody.spent')}</small><b><bdi dir="ltr">{money(totals.spent)}</bdi></b></span>
                  </span>
                  <svg className="hc-appr-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
                {open && (
                  <div id={panel} className="hc-appr-table">
                    <table>
                      <thead>
                        <tr>
                          <th scope="col"><span className="sr-only">{t('custody.select')}</span></th>
                          <th scope="col">{t('custody.date')}</th>
                          <th scope="col">{t('custody.on')}</th>
                          <th scope="col">{t('custody.category')}</th>
                          <th scope="col">{t('custody.supplier')}</th>
                          <th scope="col">{t('custody.description')}</th>
                          <th scope="col" className="is-num">{t('custody.amount')}</th>
                          <th scope="col">{t('custody.receipt')}</th>
                          <th scope="col">{t('custody.status')}</th>
                          {signers.map(signer => (
                            <th key={signer.profile_id} scope="col" className="hc-sig-head" title={signer.full_name ?? undefined}>
                              <StaffAvatar profile={signer} size={26} />
                              <span className="sr-only">{signer.full_name}</span>
                            </th>
                          ))}
                          <th scope="col"><span className="sr-only">{t('custody.actions')}</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map(row => {
                          const expense = row.direction === 'OUT';
                          const pending = expense && row.review_status === 'pending';
                          const locked = row.posted_car_tx_id !== null || row.posted_company_expense_id !== null;
                          return (
                            <tr key={row.id} data-entry={row.id} className={selected.has(row.id) && pending ? 'is-selected' : undefined}>
                              <td className="hc-appr-c-pick">
                                {pending && <input type="checkbox" className="hc-appr-check" aria-label={t('review.select', { amount: money(row.amount) })} checked={selected.has(row.id)} onChange={() => toggle(row.id)} />}
                              </td>
                              <td className="hc-appr-c-date">{formatDay(row.transaction_date, locale)}</td>
                              <td className="hc-appr-c-on">
                                {!expense ? <span className="hc-pill is-green">{t('custody.in')}</span>
                                  : row.car ? <PlateChip plate={row.car.plate_number} />
                                  : row.expense_scope === 'company' ? <span className="hc-appr-company">{t('review.company')}</span> : <span className="hc-trk-muted">—</span>}
                              </td>
                              <td data-label={t('custody.category')}>{categoryLabel(row.category)}</td>
                              <td data-label={t('custody.supplier')}>
                                {row.supplier ? <span className="inline-flex flex-wrap items-center gap-1"><bdi>{row.supplier.name}</bdi><CategoryChip category={row.supplier.category} /></span> : <span className="hc-trk-muted">—</span>}
                              </td>
                              <td data-label={t('custody.description')} className="hc-appr-c-desc" dir="auto">
                                {row.description || '—'}
                                {row.review_status === 'rejected' && row.review_note && expense && <span className="hc-appr-reason">{row.review_note}</span>}
                              </td>
                              <td className={`is-num hc-appr-c-amount ${expense ? '' : 'is-in'}`}><bdi dir="ltr">{expense ? '−' : '+'}{money(row.amount)}</bdi></td>
                              <td className="hc-appr-c-receipt"><ReceiptThumb url={row.receipt_url} label={t('review.receipt')} onOpen={onOpenReceipt} /></td>
                              <td className="hc-appr-c-status">{expense && <ReviewPill status={row.review_status} note={row.review_note} legacy={isLegacyApproval(row)} />}</td>
                              {signers.map(signer => (
                                <td key={signer.profile_id} className="hc-sig-cell">
                                  {expense && (
                                    <SignatureCell
                                      signer={signer}
                                      signedAt={signatures.get(row.id)?.get(signer.profile_id)}
                                      onToggle={signer.profile_id === userId ? () => void toggleSignature(row) : undefined}
                                    />
                                  )}
                                </td>
                              ))}
                              <td className="hc-appr-c-actions">
                                <div className="hc-appr-actions">
                                  {pending && (
                                    <>
                                      <button type="button" className="is-approve" onClick={e => { setMatchError(null); setMatching({ row, anchor: e.currentTarget.getBoundingClientRect() }); }}>{t('review.match')}</button>
                                      <button type="button" className="is-reject" onClick={() => { setRejectError(null); setRejecting(row); }}>{t('review.reject')}</button>
                                    </>
                                  )}
                                  {destination(row)}
                                  {!locked && (
                                    <span className="hc-appr-edit">
                                      <button type="button" aria-label={tc('actions.edit')} title={tc('actions.edit')} onClick={() => setEditing(row)}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 013 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                      </button>
                                      <button type="button" aria-label={tc('actions.delete')} title={tc('actions.delete')} className="is-delete" onClick={() => setDeleting(row)}>
                                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                      </button>
                                    </span>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}

      {chosen.length > 0 && (
        <div className="hc-appr-bar surface-depth surface-float" role="region" aria-label={t('review.bulkLabel')}>
          <span>{t('review.chosen', { count: chosen.length, total: money(chosenTotal) })}</span>
          <Button onClick={() => void matchChosen()}>{t('review.matchSelected')}</Button>
        </div>
      )}

      {matching && (
        <MatchPopover
          row={matching.row}
          anchor={matching.anchor}
          cars={cars}
          carsFailed={carsFailed}
          onRetryCars={() => setCarsAttempt(n => n + 1)}
          busy={matchBusy}
          error={matchError}
          onClose={() => setMatching(null)}
          onConfirm={match => void confirmMatch(match)}
        />
      )}

      {rejecting && (
        <ReasonDialog
          title={t('review.rejectDialog.title')}
          body={t('review.rejectDialog.body', { amount: money(rejecting.amount) })}
          label={t('review.rejectDialog.reason')}
          confirmLabel={t('review.reject')}
          busy={rejectBusy}
          error={rejectError}
          onConfirm={reason => void reject(reason)}
          onCancel={() => setRejecting(null)}
        />
      )}

      {adding && (
        <AddWalletEntryModal
          userId={userId}
          onClose={() => setAdding(false)}
          onSaved={() => { setAdding(false); notify(t('custody.added'), false); void refresh(); }}
          onError={() => notify(t('review.errors.generic'), true)}
        />
      )}

      {editing && (
        <EditWalletTxnModal
          row={{ ...editing, category: editing.category ?? '' }}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); notify(t('custody.updated'), false); void refresh(); }}
          onError={() => notify(t('review.errors.generic'), true)}
        />
      )}

      {deleting && (
        <ConfirmDialog
          title={t('custody.deleteTitle')}
          body={t('custody.deleteBody', { amount: money(deleting.amount) })}
          confirmLabel={tc('actions.delete')}
          cancelLabel={tc('actions.cancel')}
          busy={deleteBusy}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
};

export default CustodyTab;
