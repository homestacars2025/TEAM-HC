import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import Button from '../components/Button';
import { StatTile } from '../components/WalletParts';
import IssueDetail from '../components/issues/IssueDetail';
import IssueForm from '../components/issues/IssueForm';
import ResolveSheet from '../components/issues/ResolveSheet';
import { IssueCard, IssueIcon } from '../components/issues/parts';
import { useDateLocale } from '../hooks/useDateLocale';
import { useMediaQuery } from '../hooks/useMediaQuery';
import { useStaffProfiles } from '../hooks/useStaffProfiles';
import { asIssueStatus, asIssueType, ISSUE_TYPES, issueStats, matchesIssue, type IssueRow, type IssueStatus, type IssueType } from '../lib/carIssues';
import { istanbulDate } from '../lib/istanbulTime';
import { getIssues, setIssueStatus } from '../lib/queries/carIssues';
import { getFineCars, type FineCar } from '../lib/queries/fines';

interface ToastState { message: string; type: 'success' | 'error' }

const Toast: React.FC<ToastState> = ({ message, type }) => ReactDOM.createPortal(
  <div role="status" className={`hc-page-toast ${type === 'error' ? 'is-error' : ''}`}>{message}</div>,
  document.body,
);

type Layout = 'board' | 'list';

const LAYOUT_KEY = 'hc_issues_layout';

const readLayout = (): Layout => {
  try {
    return localStorage.getItem(LAYOUT_KEY) === 'list' ? 'list' : 'board';
  } catch {
    return 'board';
  }
};

const CarIssuesPage: React.FC = () => {
  const { t } = useTranslation('carIssues');
  const { t: tc } = useTranslation('common');
  const locale = useDateLocale();
  const profiles = useStaffProfiles();
  const canDrag = useMediaQuery('(hover: hover) and (pointer: fine)');
  const [issues, setIssues] = useState<IssueRow[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [cars, setCars] = useState<FineCar[] | null>(null);
  const [carsFailed, setCarsFailed] = useState(false);
  const [carsAttempt, setCarsAttempt] = useState(0);
  const [statusFilter, setStatusFilter] = useState<'all' | IssueStatus>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | IssueType>('all');
  const [search, setSearch] = useState('');
  const [layout, setLayout] = useState<Layout>(readLayout);
  const [adding, setAdding] = useState(false);
  const [detailId, setDetailId] = useState<number | null>(null);
  const [editing, setEditing] = useState<IssueRow | null>(null);
  const [resolving, setResolving] = useState<IssueRow | null>(null);
  const [dragged, setDragged] = useState<IssueRow | null>(null);
  const [dropTarget, setDropTarget] = useState<IssueStatus | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, type: ToastState['type'] = 'success') => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  const fetchIssues = useCallback(async () => {
    setFailed(false);
    try {
      setIssues(await getIssues());
    } catch {
      setFailed(true);
    }
  }, []);

  useEffect(() => { void fetchIssues(); }, [fetchIssues]);

  useEffect(() => {
    let active = true;
    setCarsFailed(false);
    getFineCars().then(rows => { if (active) setCars(rows); }).catch(() => { if (active) setCarsFailed(true); });
    return () => { active = false; };
  }, [carsAttempt]);

  const chooseLayout = (next: Layout) => {
    setLayout(next);
    try { localStorage.setItem(LAYOUT_KEY, next); } catch { /* a convenience only */ }
  };

  const today = useMemo(() => istanbulDate(), []);
  const stats = useMemo(() => issueStats(issues ?? [], today), [issues, today]);
  const detail = issues?.find(issue => issue.id === detailId) ?? null;

  const shown = useMemo(() => (issues ?? []).filter(issue => (
    (statusFilter === 'all' || asIssueStatus(issue.status) === statusFilter)
    && (typeFilter === 'all' || asIssueType(issue.type) === typeFilter)
    && matchesIssue(issue, search)
  )), [issues, statusFilter, typeFilter, search]);

  const changed = useCallback((message: string) => {
    showToast(message);
    void fetchIssues();
  }, [showToast, fetchIssues]);

  // The same two changes the detail panel makes, just started from a drop.
  const dropOn = async (status: IssueStatus) => {
    const issue = dragged;
    setDropTarget(null);
    setDragged(null);
    if (!issue || asIssueStatus(issue.status) === status) return;
    if (status === 'resolved') { setResolving(issue); return; }
    try {
      await setIssueStatus(issue.id, 'open');
      changed(t('toast.reopened'));
    } catch {
      showToast(t('errors.saveFailed'), 'error');
    }
  };

  const loading = issues === null && !failed;
  const card = (issue: IssueRow) => (
    <IssueCard
      key={issue.id}
      issue={issue}
      today={today}
      locale={locale}
      profiles={profiles}
      layout={layout}
      draggable={layout === 'board' && canDrag}
      onOpen={() => setDetailId(issue.id)}
      onDragStart={() => setDragged(issue)}
    />
  );

  const column = (status: IssueStatus) => {
    const cards = shown.filter(issue => asIssueStatus(issue.status) === status);
    return (
      <section
        key={status}
        aria-label={t(`status.${status}`)}
        className={`hc-board-column ${dropTarget === status ? 'is-target' : ''}`}
        onDragOver={e => { if (dragged) { e.preventDefault(); setDropTarget(status); } }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={e => { e.preventDefault(); void dropOn(status); }}
      >
        <h2><span className={`hc-board-dot is-${status}`} aria-hidden="true" />{t(`status.${status}`)}<small>{cards.length}</small></h2>
        <div className="hc-board-cards">
          {cards.length > 0 ? cards.map(card) : <p className="hc-records-empty">{t('empty.column')}</p>}
        </div>
      </section>
    );
  };

  const columns: IssueStatus[] = statusFilter === 'all' ? ['open', 'resolved'] : [statusFilter];

  return (
    <div className="hc-records-page">
      <header className="hc-records-head">
        <div className="min-w-0">
          <p className="hc-eyebrow">{t('eyebrow')}</p>
          <h1>{t('title')}</h1>
          <p>{t('subtitle')}</p>
        </div>
        <Button onClick={() => setAdding(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          {t('logIssue')}
        </Button>
      </header>

      {failed && (
        <div role="alert" className="hc-form-error mb-4 flex flex-wrap items-center justify-between gap-2">
          {t('errors.loadFailed')}
          <Button variant="secondary" onClick={() => void fetchIssues()}>{tc('actions.tryAgain')}</Button>
        </div>
      )}

      <div className="hc-tiles hc-tiles-four">
        <StatTile tone="negative" label={t('tiles.open')} value={loading ? null : String(stats.open)} sub={t('tiles.openSub')} />
        <StatTile tone="received" label={t('tiles.resolvedMonth')} value={loading ? null : String(stats.resolvedThisMonth)} sub={t('tiles.resolvedTotal', { count: stats.resolved })} />
        <StatTile tone="warn" label={t('tiles.accidents')} value={loading ? null : String(stats.accidents)} sub={t('tiles.accidentsSub')} />
        <StatTile tone="balance" label={t('tiles.average')} value={loading ? null : stats.averageDays === null ? '—' : String(stats.averageDays)} sub={t('tiles.averageSub')} />
      </div>

      <div className="hc-records-tools">
        <div role="group" aria-label={tc('fields.type')} className="hc-chip-row">
          <button type="button" className="hc-chip" aria-pressed={typeFilter === 'all'} onClick={() => setTypeFilter('all')}>{t('filters.allTypes')}</button>
          {ISSUE_TYPES.map(type => (
            <button key={type} type="button" className={`hc-chip hc-type-filter is-${type}`} aria-pressed={typeFilter === type} onClick={() => setTypeFilter(type)}>
              <IssueIcon type={type} size={13} />{t(`types.${type}`)}
            </button>
          ))}
        </div>
        <div className="hc-records-row">
          <div role="group" aria-label={tc('fields.status')} className="hc-seg">
            {(['all', 'open', 'resolved'] as const).map(status => (
              <button key={status} type="button" aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}>
                {status === 'all' ? t('filters.allStatuses') : t(`status.${status}`)}
              </button>
            ))}
          </div>
          <input className="hc-input hc-records-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('filters.search')} aria-label={t('filters.search')} />
          <div role="group" aria-label={t('layout.label')} className="hc-seg">
            {(['board', 'list'] as const).map(option => (
              <button key={option} type="button" aria-pressed={layout === option} onClick={() => chooseLayout(option)}>{t(`layout.${option}`)}</button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <p role="status" className="hc-records-empty">{t('loading')}</p>
      ) : (issues ?? []).length === 0 && !failed ? (
        <div className="hc-records-empty"><strong>{t('empty.noneTitle')}</strong><p>{t('empty.noneBody')}</p></div>
      ) : shown.length === 0 && !failed ? (
        <div className="hc-records-empty"><strong>{t('empty.filteredTitle')}</strong><p>{t('empty.filteredBody')}</p></div>
      ) : layout === 'board' ? (
        <div className={`hc-board ${columns.length === 1 ? 'is-single' : ''}`}>{columns.map(column)}</div>
      ) : (
        <div className="hc-issue-list">{shown.map(card)}</div>
      )}
      {!loading && <p className="mt-3 text-[13px] text-gray-500">{t('showing', { count: (issues ?? []).length, shown: shown.length })}</p>}

      {adding && <IssueForm cars={cars} carsFailed={carsFailed} onRetryCars={() => setCarsAttempt(n => n + 1)} onClose={() => setAdding(false)} onSaved={() => { setAdding(false); changed(t('toast.logged')); }} />}
      {detail && !editing && !resolving && (
        <IssueDetail
          issue={detail}
          onClose={() => setDetailId(null)}
          onChanged={message => { if (message === t('toast.deleted')) setDetailId(null); changed(message); }}
          onEdit={() => setEditing(detail)}
          onResolve={() => setResolving(detail)}
        />
      )}
      {editing && <IssueForm issue={editing} cars={cars} carsFailed={carsFailed} onRetryCars={() => setCarsAttempt(n => n + 1)} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); changed(t('toast.updated')); }} />}
      {resolving && <ResolveSheet issue={resolving} onClose={() => setResolving(null)} onResolved={() => { setResolving(null); changed(t('toast.resolved')); }} />}
      {toast && <Toast {...toast} />}
    </div>
  );
};

export default CarIssuesPage;
