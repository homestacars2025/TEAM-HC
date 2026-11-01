import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useCurrentUser } from '../../contexts/CurrentUserContext';
import { formatDay, useDateLocale } from '../../hooks/useDateLocale';
import { useStaffProfiles } from '../../hooks/useStaffProfiles';
import { useCurrency } from '../../lib/CurrencyContext';
import type { ExpenseCar } from '../../lib/custodyExpense';
import { getActiveCars } from '../../lib/queries/custody';
import { reviewErrorKey, suggestedMatch, suggestionsFor, type ReviewExpense } from '../../lib/expenseReview';
import {
  getPendingExpenses, getSignatures, matchExpense, rejectExpense, signExpense,
  type ExpenseMatch, type FinanceSigner, type MatchResult, type Signatures,
} from '../../lib/queries/expenseReview';
import Button from '../Button';
import ConfirmDialog from '../custody/ConfirmDialog';
import ReasonDialog from '../custody/ReasonDialog';
import { useExpenseCategoryLabel } from '../custody/useExpenseCategoryLabel';
import { ReceiptThumb } from '../WalletParts';
import MatchPopover from './MatchPopover';
import SignatureCell from './SignatureCell';

interface SuggestionOptions {
  scope: 'car' | 'company';
  /** `YYYY-MM` of the sheet on screen. */
  month: string;
  /** For the popover's car picker. Left out, the list is fetched when the popover opens. */
  cars?: ExpenseCar[];
  userId: string | null;
  /** A row is on a sheet now, so the sheet has to reload. */
  onPosted: (result: MatchResult) => void;
  /** How many left the pending list, for the badge on the tab. */
  onAnswered: (count: number) => void;
  notify: (message: string, failed: boolean) => void;
}

const errorOf = (failure: unknown) => (failure as { message?: string })?.message;

/** Pending custody expenses that belong on the sheet on screen, and what can be done to them. */
export function useSuggestions({ scope, month, cars, userId, onPosted, onAnswered, notify }: SuggestionOptions) {
  const { t } = useTranslation('finance');
  const [rows, setRows] = useState<ReviewExpense[]>([]);
  const [signatures, setSignatures] = useState<Signatures>(new Map());
  const [busy, setBusy] = useState<Set<number>>(new Set());
  const [editing, setEditing] = useState<{ row: ReviewExpense; anchor: DOMRect } | null>(null);
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<ReviewExpense | null>(null);
  const [rejectBusy, setRejectBusy] = useState(false);
  const [rejectError, setRejectError] = useState<string | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);
  const [loadedCars, setLoadedCars] = useState<ExpenseCar[] | null>(null);
  const [carsFailed, setCarsFailed] = useState(false);
  const [carsAttempt, setCarsAttempt] = useState(0);
  const working = useRef(new Set<number>());

  useEffect(() => {
    if (!editing || cars || loadedCars) return undefined;
    let cancelled = false;
    setCarsFailed(false);
    getActiveCars()
      .then(data => { if (!cancelled) setLoadedCars(data); })
      .catch(() => { if (!cancelled) setCarsFailed(true); });
    return () => { cancelled = true; };
  }, [editing, cars, loadedCars, carsAttempt]);

  // A suggestion is extra: if this fails the sheet underneath is still the whole truth.
  const load = useCallback(() => Promise.all([getPendingExpenses(scope), getSignatures()]).then(([pending, marks]) => {
    setRows(pending);
    setSignatures(marks);
  }).catch(() => {}), [scope]);

  useEffect(() => { void load(); }, [load]);

  const shown = useMemo(() => suggestionsFor(rows, month), [rows, month]);
  const total = shown.reduce((sum, row) => sum + row.amount, 0);

  const drop = (id: number) => setRows(current => current.filter(row => row.id !== id));
  const mark = (id: number, on: boolean) => setBusy(current => {
    const next = new Set(current);
    if (on) next.add(id);
    else next.delete(id);
    return next;
  });

  /** Throws, so a caller can keep its own dialog open. */
  const post = async (row: ReviewExpense, match: ExpenseMatch) => {
    const result = await matchExpense(row.id, match);
    drop(row.id);
    onAnswered(1);
    onPosted(result);
  };

  const add = async (row: ReviewExpense) => {
    if (working.current.has(row.id)) return;
    working.current.add(row.id);
    mark(row.id, true);
    try {
      await post(row, suggestedMatch(row, scope));
      notify(t('review.toast.approved', { count: 1 }), false);
    } catch (failure) {
      const key = reviewErrorKey(errorOf(failure));
      notify(t(`review.errors.${key}`), true);
      if (key === 'alreadyDone') void load();
    }
    working.current.delete(row.id);
    mark(row.id, false);
  };

  /** One at a time: each posts to a sheet, and a failure must only leave its own row. */
  const addAll = async () => {
    setConfirmingAll(false);
    const todo = shown.filter(row => !working.current.has(row.id));
    let done = 0;
    for (const row of todo) {
      working.current.add(row.id);
      mark(row.id, true);
      try {
        await post(row, suggestedMatch(row, scope));
        done += 1;
      } catch {
        // Counted below, and the row stays where it is.
      }
      working.current.delete(row.id);
      mark(row.id, false);
    }
    if (done === todo.length) notify(t('review.toast.approved', { count: done }), false);
    else {
      notify(t('review.toast.partial', { done, total: todo.length }), true);
      void load();
    }
  };

  const confirmEdit = async (match: ExpenseMatch) => {
    if (!editing) return;
    setEditBusy(true);
    setEditError(null);
    try {
      await post(editing.row, match);
      setEditing(null);
      notify(t('review.toast.approved', { count: 1 }), false);
    } catch (failure) {
      const key = reviewErrorKey(errorOf(failure));
      setEditError(t(`review.errors.${key}`));
      if (key === 'alreadyDone') void load();
    }
    setEditBusy(false);
  };

  const confirmReject = async (reason: string) => {
    if (!rejecting) return;
    setRejectBusy(true);
    setRejectError(null);
    try {
      await rejectExpense(rejecting.id, reason);
      drop(rejecting.id);
      onAnswered(1);
      setRejecting(null);
      notify(t('review.toast.rejected'), false);
    } catch (failure) {
      setRejectError(t(`review.errors.${reviewErrorKey(errorOf(failure))}`));
    }
    setRejectBusy(false);
  };

  const toggleSignature = async (row: ReviewExpense) => {
    if (!userId || working.current.has(row.id)) return;
    const on = !signatures.get(row.id)?.has(userId);
    const flip = (value: boolean) => setSignatures(current => {
      const next = new Map(current);
      const marks = new Map(next.get(row.id) ?? []);
      if (value) marks.set(userId, new Date().toISOString());
      else marks.delete(userId);
      return next.set(row.id, marks);
    });
    working.current.add(row.id);
    flip(on);
    try {
      await signExpense(row.id, on);
    } catch (failure) {
      flip(!on);
      notify(t(`review.errors.${reviewErrorKey(errorOf(failure))}`), true);
    }
    working.current.delete(row.id);
  };

  return {
    scope, cars: cars ?? loadedCars, carsFailed, retryCars: () => setCarsAttempt(n => n + 1), userId, shown, total, signatures, busy, add, toggleSignature,
    editing, editBusy, editError, confirmEdit, setEditError,
    setEditing, rejecting, setRejecting, rejectBusy, rejectError, setRejectError, confirmReject,
    confirmingAll, setConfirmingAll, addAll,
  };
}

export type Suggestions = ReturnType<typeof useSuggestions>;

const wholeAmount = (text: string) => text.replace(/[.,]0+$/, '');

export const SuggestionBanner: React.FC<{ suggestions: Suggestions }> = ({ suggestions: s }) => {
  const { t } = useTranslation('finance');
  const { fmt } = useCurrency();
  if (s.shown.length === 0) return null;
  return (
    <div role="status" className="hc-sug-banner surface-depth">
      <p>{t('suggested.banner', { count: s.shown.length, total: wholeAmount(fmt(s.total)) })}</p>
      <Button onClick={() => s.setConfirmingAll(true)}>{t('suggested.addAll')}</Button>
    </div>
  );
};

export const SuggestionList: React.FC<{ suggestions: Suggestions; rows: ReviewExpense[]; onOpenReceipt: (url: string) => void }> = ({ suggestions: s, rows, onOpenReceipt }) => {
  const { t } = useTranslation('finance');
  const { fmt } = useCurrency();
  const locale = useDateLocale();
  const categoryLabel = useExpenseCategoryLabel();
  const staff = useStaffProfiles();
  const { profile } = useCurrentUser();
  const me = useMemo<FinanceSigner | null>(() => (s.userId ? { ...profile, profile_id: s.userId, full_name: profile?.full_name ?? null, role: 'staff' } : null), [s.userId, profile]);

  if (rows.length === 0) return null;

  return (
    <ul className="hc-sug-list" aria-label={t('suggested.label')}>
      {rows.map(row => {
        const busy = s.busy.has(row.id);
        return (
          <li key={row.id} className="hc-sug-row" data-suggested={row.id}>
            <div className="hc-sug-body">
              <div className="hc-sug-meta">
                <span>{formatDay(row.transaction_date, locale)}</span>
                <span>{categoryLabel(row.category)}</span>
              </div>
              <p dir="auto">{row.description || '—'}</p>
              <small dir="auto">{t('suggested.from', { employee: staff?.get(row.employee_id)?.full_name ?? t('review.employee') })}</small>
            </div>
            <div className="hc-sug-amount"><bdi dir="ltr">−{fmt(row.amount)}</bdi></div>
            <ReceiptThumb url={row.receipt_url} label={t('review.receipt')} onOpen={onOpenReceipt} />
            {me && <SignatureCell signer={me} signedAt={s.signatures.get(row.id)?.get(me.profile_id)} onToggle={() => void s.toggleSignature(row)} />}
            <div className="hc-sug-actions">
              <button type="button" className="is-add" disabled={busy} onClick={() => void s.add(row)}>{t('suggested.add')}</button>
              <button type="button" disabled={busy} onClick={e => { s.setEditError(null); s.setEditing({ row, anchor: e.currentTarget.getBoundingClientRect() }); }}>{t('suggested.edit')}</button>
              <button type="button" className="is-reject" disabled={busy} onClick={() => { s.setRejectError(null); s.setRejecting(row); }}>{t('review.reject')}</button>
            </div>
          </li>
        );
      })}
    </ul>
  );
};

export const SuggestionDialogs: React.FC<{ suggestions: Suggestions }> = ({ suggestions: s }) => {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const { fmt } = useCurrency();
  return (
    <>
      {s.editing && (
        <MatchPopover
          row={s.editing.row}
          anchor={s.editing.anchor}
          cars={s.cars}
          carsFailed={s.carsFailed}
          onRetryCars={s.retryCars}
          busy={s.editBusy}
          error={s.editError}
          onClose={() => s.setEditing(null)}
          onConfirm={match => void s.confirmEdit(match)}
        />
      )}
      {s.rejecting && (
        <ReasonDialog
          title={t('review.rejectDialog.title')}
          body={t('review.rejectDialog.body', { amount: fmt(s.rejecting.amount) })}
          label={t('review.rejectDialog.reason')}
          confirmLabel={t('review.reject')}
          busy={s.rejectBusy}
          error={s.rejectError}
          onConfirm={reason => void s.confirmReject(reason)}
          onCancel={() => s.setRejecting(null)}
        />
      )}
      {s.confirmingAll && (
        <ConfirmDialog
          title={t('suggested.confirmTitle', { count: s.shown.length })}
          body={t('suggested.confirmBody', { total: wholeAmount(fmt(s.total)) })}
          confirmLabel={t('suggested.addAll')}
          cancelLabel={tc('actions.cancel')}
          tone="primary"
          onConfirm={() => void s.addAll()}
          onCancel={() => s.setConfirmingAll(false)}
        />
      )}
    </>
  );
};
