import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { useStaffProfiles } from '../../hooks/useStaffProfiles';
import { useTileFilter } from '../../hooks/useTileFilter';
import { formatTRY } from '../../lib/CurrencyContext';
import { groupByEmployee, inReviewFilter, postingTarget, REVIEW_FILTERS, reviewErrorKey, reviewStats, sheetLink, type ReviewExpense } from '../../lib/expenseReview';
import { istanbulDate } from '../../lib/istanbulTime';
import { approveExpense, getReviewExpenses, rejectExpense } from '../../lib/queries/expenseReview';
import Button from '../Button';
import PlateChip from '../booking/PlateChip';
import ReasonDialog from '../custody/ReasonDialog';
import ReviewPill from '../custody/ReviewPill';
import { useExpenseCategoryLabel } from '../custody/useExpenseCategoryLabel';
import StaffAvatar from '../StaffAvatar';
import { CategoryChip } from '../suppliers/parts';
import { ReceiptThumb, StatTile } from '../WalletParts';

interface ExpenseApprovalsProps {
  onOpenReceipt: (url: string) => void;
  onPendingChange: (count: number) => void;
  notify: (message: string, failed: boolean) => void;
}

const money = (total: number) => formatTRY(total);

const ExpenseApprovals: React.FC<ExpenseApprovalsProps> = ({ onOpenReceipt, onPendingChange, notify }) => {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const locale = useDateLocale();
  const categoryLabel = useExpenseCategoryLabel();
  const staff = useStaffProfiles();
  const [filter, setFilter] = useTileFilter(REVIEW_FILTERS);
  const [rows, setRows] = useState<ReviewExpense[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [rejecting, setRejecting] = useState<ReviewExpense | null>(null);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const working = useRef(new Set<number>());

  const load = useCallback(() => {
    setFailed(false);
    return getReviewExpenses().then(setRows);
  }, []);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    getReviewExpenses()
      .then(data => { if (!cancelled) setRows(data); })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [attempt]);

  useEffect(() => {
    if (rows) onPendingChange(rows.filter(row => row.review_status === 'pending').length);
  }, [rows, onPendingChange]);

  const patch = (id: number, change: Partial<ReviewExpense>) => setRows(current => (current ?? []).map(row => (row.id === id ? { ...row, ...change } : row)));

  const month = istanbulDate().slice(0, 7);
  const stats = useMemo(() => reviewStats(rows ?? [], month), [rows, month]);
  const shown = useMemo(() => (rows ?? []).filter(row => inReviewFilter(row, filter, month)), [rows, filter, month]);
  const groups = useMemo(() => groupByEmployee(shown), [shown]);

  // Only what is on screen can be confirmed in one go.
  const selectable = useMemo(() => shown.filter(row => row.review_status === 'pending'), [shown]);
  const chosen = useMemo(() => selectable.filter(row => selected.has(row.id)), [selectable, selected]);
  const chosenTotal = chosen.reduce((sum, row) => sum + row.amount, 0);

  const approve = async (targets: ReviewExpense[]) => {
    const todo = targets.filter(row => !working.current.has(row.id));
    if (todo.length === 0) return;
    todo.forEach(row => working.current.add(row.id));
    const reviewedAt = new Date().toISOString();
    setRows(current => (current ?? []).map(row => (todo.some(item => item.id === row.id) ? { ...row, review_status: 'approved', reviewed_at: reviewedAt } : row)));
    setSelected(new Set());

    let done = 0;
    let lastError: string | undefined;
    // One at a time: each posts to a sheet, and a failure must only undo its own row.
    for (const row of todo) {
      try {
        const posted = await approveExpense(row.id);
        patch(row.id, { posted_car_tx_id: posted.car_tx_id, posted_company_expense_id: posted.company_expense_id });
        done += 1;
      } catch (failure) {
        lastError = (failure as { message?: string })?.message;
        patch(row.id, { review_status: 'pending', reviewed_at: null });
      }
      working.current.delete(row.id);
    }

    if (lastError) {
      const key = reviewErrorKey(lastError);
      notify(todo.length > 1 ? t('review.toast.partial', { done, total: todo.length }) : t(`review.errors.${key}`), true);
      if (key === 'alreadyDone') void load().catch(() => {});
    } else {
      notify(t('review.toast.approved', { count: done }), false);
    }
  };

  const reject = async (reason: string) => {
    if (!rejecting) return;
    setRejectBusy(true);
    setRejectError(null);
    try {
      await rejectExpense(rejecting.id, reason);
      patch(rejecting.id, { review_status: 'rejected', review_note: reason, reviewed_at: new Date().toISOString() });
      setSelected(current => { const next = new Set(current); next.delete(rejecting.id); return next; });
      setRejecting(null);
      notify(t('review.toast.rejected'), false);
    } catch (failure) {
      setRejectError(t(`review.errors.${reviewErrorKey((failure as { message?: string })?.message)}`));
    }
    setRejectBusy(false);
  };

  const toggle = (id: number) => setSelected(current => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  const toggleGroup = (ids: number[]) => setSelected(current => {
    const next = new Set(current);
    const all = ids.every(id => next.has(id));
    ids.forEach(id => (all ? next.delete(id) : next.add(id)));
    return next;
  });

  const loading = rows === null && !failed;
  const figure = (value: number) => (loading ? null : String(value));
  const tile = (group: { count: number }) => (loading ? '' : t('review.tiles.expenses', { count: group.count }));

  return (
    <div className="hc-appr">
      {failed && (
        <div role="alert" className="hc-form-error mb-4 flex flex-wrap items-center justify-between gap-2">
          {t('review.loadFailed')}
          <Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>{tc('actions.tryAgain')}</Button>
        </div>
      )}

      <div className="hc-tiles hc-tiles-filter">
        <StatTile tone="total" label={t('review.tiles.all')} value={figure(stats.all.count)} sub={loading ? '' : money(stats.all.total)} pressed={filter === 'all'} onPress={() => setFilter('all')} />
        <StatTile tone="warn" label={t('review.tiles.pending')} value={loading ? null : money(stats.pending.total)} sub={tile(stats.pending)} pressed={filter === 'pending'} onPress={() => setFilter('pending')} />
        <StatTile tone="received" label={t('review.tiles.approved')} value={loading ? null : money(stats.approved.total)} sub={tile(stats.approved)} pressed={filter === 'approved'} onPress={() => setFilter('approved')} />
        <StatTile tone="negative" label={t('review.tiles.rejected')} value={loading ? null : money(stats.rejected.total)} sub={tile(stats.rejected)} pressed={filter === 'rejected'} onPress={() => setFilter('rejected')} />
        <StatTile tone="paid" label={t('review.tiles.noReceipt')} value={loading ? null : money(stats.noReceipt.total)} sub={tile(stats.noReceipt)} pressed={filter === 'noReceipt'} onPress={() => setFilter('noReceipt')} />
      </div>

      {loading ? (
        <div role="status" aria-label={t('review.loading')} className="hc-fine-list mt-4">
          {[0, 1, 2].map(row => <div key={row} className="hc-fine-skeleton" />)}
        </div>
      ) : !failed && groups.length === 0 ? (
        <p className="hc-records-empty">{filter === 'pending' || filter === 'all' ? t('review.emptyPending') : t('review.empty')}</p>
      ) : (
        <div className="hc-appr-groups">
          {groups.map(group => {
            const person = staff?.get(group.employeeId);
            const pendingIds = group.rows.filter(row => row.review_status === 'pending').map(row => row.id);
            return (
              <section key={group.employeeId} className="hc-appr-group surface-depth" aria-label={person?.full_name ?? t('review.employee')}>
                <header>
                  {pendingIds.length > 1 && (
                    <input type="checkbox" className="hc-appr-check" aria-label={t('review.selectAll', { name: person?.full_name ?? t('review.employee') })} checked={pendingIds.every(id => selected.has(id))} onChange={() => toggleGroup(pendingIds)} />
                  )}
                  <StaffAvatar profile={person} size={36} />
                  <div className="min-w-0 flex-1">
                    <h3 dir="auto" className="truncate">{person?.full_name ?? t('review.employee')}</h3>
                    {group.pendingTotal > 0 && <p>{t('review.waiting', { count: pendingIds.length, total: money(group.pendingTotal) })}</p>}
                  </div>
                </header>
                <ul>
                  {group.rows.map(row => {
                    const pending = row.review_status === 'pending';
                    const target = postingTarget(row);
                    const link = sheetLink(row);
                    const model = row.car?.model_group;
                    return (
                      <li key={row.id} className={`hc-appr-row ${selected.has(row.id) && pending ? 'is-selected' : ''}`} data-entry={row.id}>
                        <div className="hc-appr-pick">
                          {pending && <input type="checkbox" className="hc-appr-check" aria-label={t('review.select', { amount: money(row.amount) })} checked={selected.has(row.id)} onChange={() => toggle(row.id)} />}
                        </div>
                        <div className="hc-appr-target">
                          {row.car ? (
                            <>
                              {model?.image_url && <img src={model.image_url} alt="" loading="lazy" className="hc-appr-model" />}
                              <span className="flex min-w-0 flex-col items-start gap-1">
                                <PlateChip plate={row.car.plate_number} />
                                {model?.name && <small dir="auto">{model.name}</small>}
                              </span>
                            </>
                          ) : <span className="hc-appr-company">{t('review.company')}</span>}
                        </div>
                        <div className="hc-appr-body">
                          <div className="hc-appr-meta">
                            <span>{formatDay(row.transaction_date, locale)}</span>
                            <span>{categoryLabel(row.category)}</span>
                            {row.supplier && <span className="inline-flex items-center gap-1.5"><bdi>{row.supplier.name}</bdi><CategoryChip category={row.supplier.category} /></span>}
                          </div>
                          <p dir="auto">{row.description || '—'}</p>
                          <p className="hc-appr-post">
                            <svg className="hc-trk-chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                            {target.kind === 'car' ? t('review.post.car', { plate: target.plate }) : t('review.post.company')}
                          </p>
                          {row.review_status === 'rejected' && row.review_note && <p className="hc-appr-reason" dir="auto">{row.review_note}</p>}
                        </div>
                        <div className="hc-appr-amount"><bdi dir="ltr">{money(row.amount)}</bdi></div>
                        <div className="hc-appr-receipt"><ReceiptThumb url={row.receipt_url} label={t('review.receipt')} onOpen={onOpenReceipt} /></div>
                        <div className="hc-appr-actions">
                          {pending ? (
                            <>
                              <button type="button" className="is-approve" onClick={() => void approve([row])}>
                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M20 6L9 17l-5-5" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" /></svg>
                                {t('review.approve')}
                              </button>
                              <button type="button" className="is-reject" onClick={() => { setRejectError(null); setRejecting(row); }}>
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" /></svg>
                                {t('review.reject')}
                              </button>
                            </>
                          ) : link ? (
                            <Link to={link} className="hc-appr-posted">{t('review.posted')}</Link>
                          ) : <ReviewPill status={row.review_status} note={row.review_note} />}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      {chosen.length > 0 && (
        <div className="hc-appr-bar surface-depth surface-float" role="region" aria-label={t('review.bulkLabel')}>
          <span>{t('review.chosen', { count: chosen.length, total: money(chosenTotal) })}</span>
          <Button onClick={() => void approve(chosen)}>{t('review.approveSelected')}</Button>
        </div>
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
    </div>
  );
};

export default ExpenseApprovals;
