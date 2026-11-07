import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button from '../components/Button';
import MonthSwitcher from '../components/MonthSwitcher';
import StatusArt from '../components/cars/StatusArt';
import { StatTile } from '../components/WalletParts';
import { GroupCarsDrawer } from '../components/modelGroups/GroupCarsDrawer';
import { ModelGroupCard, ModelGroupCardSkeleton } from '../components/modelGroups/ModelGroupCard';
import { ModelGroupSheet } from '../components/modelGroups/ModelGroupSheet';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { usePageAccess } from '../contexts/PageAccessContext';
import { useDateLocale } from '../hooks/useDateLocale';
import { useTileFilter } from '../hooks/useTileFilter';
import { useUrlSearch } from '../hooks/useUrlSearch';
import { useCurrency } from '../lib/CurrencyContext';
import {
  LOW_UTILIZATION,
  MODEL_FILTERS,
  MODEL_SORTS,
  fetchModelGroupStats,
  fetchModelGroups,
  fetchPricingTiers,
  filterCounts,
  firstSortDirection,
  matchesFilter,
  matchesSearch,
  modelGroupAccess,
  readSort,
  sortGroups,
  writeSort,
  type ModelGroupRow,
  type ModelGroupStats,
  type ModelSort,
  type PricingTier,
} from '../lib/modelGroups';
import { currentMonth, readMonth, shiftMonth } from '../lib/pendingInvoices';

/**
 * Model Groups: every group as a card with its specs, prices and rules, and how it did
 * in the month picked above. The tiles filter, search and sort narrow the grid. Admins
 * edit everything; staff with this page edit the specs and the photo. What bookings
 * really paid is accounting's figure, so only admins and Accounting see it.
 */

const TOAST_MS = 3200;

const ArrowIcon: React.FC<{ up: boolean }> = ({ up }) => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" style={{ transform: up ? 'rotate(180deg)' : undefined }}>
    <path d="M12 5v14M6 13l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const PlusIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);
const photoArt = <img src="/icons/3d/cars/photos.png" alt="" width={56} height={56} decoding="async" className="hc-tile-art" />;

interface Catalog {
  groups: ModelGroupRow[];
  tiers: PricingTier[];
}

const ModelGroupsPage: React.FC = () => {
  const { t } = useTranslation(['modelGroups', 'common']);
  const locale = useDateLocale();
  const { rates } = useCurrency();
  const { profile } = useCurrentUser();
  const { canAccessPage } = usePageAccess();
  const access = useMemo(() => modelGroupAccess(profile?.role, canAccessPage), [profile?.role, canAccessPage]);
  const usdRate = rates.find((rate) => rate.currency === 'USD')?.rate_to_try ?? null;

  const [params, setParams] = useSearchParams();
  const thisMonth = currentMonth();
  const read = readMonth(params.get('month'));
  const month = read === 'all' ? thisMonth : read;
  const monthDate = new Date(`${month}-01T12:00:00Z`);
  const monthLabel = monthDate.toLocaleDateString(locale, { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const monthName = monthDate.toLocaleDateString(locale, { month: 'long', timeZone: 'UTC' });

  const [filter, setFilter] = useTileFilter(MODEL_FILTERS);
  const sort = readSort(params.get('sort'));
  const [query, setQuery] = useState('');
  useUrlSearch(setQuery);

  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [catalogFailed, setCatalogFailed] = useState(false);
  const [stats, setStats] = useState<{ month: string; rows: Map<number, ModelGroupStats> } | null>(null);
  const [statsFailed, setStatsFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<{ group: ModelGroupRow | null } | null>(null);
  const [viewing, setViewing] = useState<ModelGroupRow | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef(0);

  // The groups and tiers don't depend on the month; the figures do. Both start together.
  useEffect(() => {
    let active = true;
    setCatalogFailed(false);
    Promise.all([fetchModelGroups(), fetchPricingTiers()])
      .then(([groups, tiers]) => { if (active) setCatalog({ groups, tiers }); })
      .catch(() => { if (active) setCatalogFailed(true); });
    return () => { active = false; };
  }, [reload]);

  useEffect(() => {
    let active = true;
    setStatsFailed(false);
    fetchModelGroupStats(month, access.canSeeRealRate)
      .then((rows) => { if (active) setStats({ month, rows }); })
      .catch(() => { if (active) setStatsFailed(true); });
    return () => { active = false; };
  }, [month, reload, access.canSeeRealRate]);

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const refresh = useCallback(() => setReload((value) => value + 1), []);
  const onSaved = useCallback((message: string | null) => {
    refresh();
    if (!message) return;
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, [refresh]);

  const setMonth = (next: string) => setParams((current) => {
    const updated = new URLSearchParams(current);
    if (next === thisMonth) updated.delete('month'); else updated.set('month', next);
    return updated;
  }, { replace: true });

  const setSort = (key: ModelSort, direction: 'asc' | 'desc') => setParams((current) => {
    const updated = new URLSearchParams(current);
    const value = writeSort(key, direction);
    if (value === null) updated.delete('sort'); else updated.set('sort', value);
    return updated;
  }, { replace: true });

  const statRows = useMemo(() => stats?.rows ?? new Map<number, ModelGroupStats>(), [stats]);
  const statsReady = stats?.month === month;
  const groups = useMemo(() => catalog?.groups ?? [], [catalog]);
  const counts = useMemo(() => filterCounts(groups, statRows), [groups, statRows]);
  const totalCars = useMemo(() => groups.reduce((sum, group) => sum + (statRows.get(group.id)?.cars_total ?? 0), 0), [groups, statRows]);
  const visible = useMemo(
    () => sortGroups(groups.filter((group) => matchesFilter(group, statRows.get(group.id), filter) && matchesSearch(group, query)), statRows, sort.key, sort.direction),
    [groups, statRows, filter, query, sort.key, sort.direction],
  );

  const loading = catalog === null && !catalogFailed;
  const count = (n: number | null) => (n === null ? null : n.toLocaleString('tr-TR'));

  return (
    <div className="hc-pi hc-mg">
      <header className="hc-pi-head">
        <div>
          <h1>{t('title')}</h1>
          <p>
            {catalog
              ? t('subtitle', { groups: t('groupCount', { count: groups.length }), cars: t('carCount', { count: totalCars }), month: monthLabel })
              : t('subtitleLoading', { month: monthLabel })}
          </p>
        </div>
        <div className="hc-months">
          <MonthSwitcher label={monthLabel} prevLabel={t('month.prev')} nextLabel={t('month.next')} onPrev={() => setMonth(shiftMonth(month, -1))} onNext={() => setMonth(shiftMonth(month, 1))} />
          {month !== thisMonth && <button type="button" className="hc-pi-all" onClick={() => setMonth(thisMonth)}>{t('month.thisMonth')}</button>}
          {access.canCreate && <Button className="hc-mg-new" onClick={() => setEditing({ group: null })}><PlusIcon /> {t('newGroup')}</Button>}
        </div>
      </header>

      {catalogFailed ? (
        <div className="hc-ce-state rounded-[16px] border border-[var(--border-subtle)] bg-white" role="alert">
          <p>{t('loadError')}</p>
          <Button variant="secondary" onClick={refresh}>{t('common:actions.tryAgain')}</Button>
        </div>
      ) : (
        <>
          <div className="hc-tiles hc-tiles-filter hc-bk-tiles hc-mg-tiles" role="group" aria-label={t('tiles.label')}>
            <StatTile tone="st-all" art={<StatusArt name="total" className="hc-tile-art" />} label={t('tiles.all')} sub={t('carCount', { count: totalCars })}
              value={loading ? null : count(groups.length)} pressed={filter === 'all'} onPress={() => setFilter('all')} />
            <StatTile tone="st-booked" art={<StatusArt name="working" className="hc-tile-art" />} label={t('tiles.rented')} sub={t('tiles.rentedSub')}
              value={loading || !statsReady ? null : count(counts.rented)} pressed={filter === 'rented'} onPress={() => setFilter('rented')} />
            <StatTile tone="st-pending" art={<StatusArt name="parking" className="hc-tile-art" />} label={t('tiles.low')} sub={t('tiles.lowSub', { pct: `⁦${LOW_UTILIZATION}%⁩`, month: monthName })}
              value={loading || !statsReady ? null : count(counts.low)} pressed={filter === 'low'} onPress={() => setFilter('low')} />
            <StatTile tone="st-parking" art={photoArt} label={t('tiles.noimage')} sub={t('tiles.noimageSub', { count: counts.noimage })}
              value={loading ? null : count(counts.noimage)} pressed={filter === 'noimage'} onPress={() => setFilter('noimage')} />
          </div>

          {statsFailed && (
            <div role="alert" className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#dc2626]/20 bg-[#fef2f2] px-4 py-3 text-[13.5px] text-[#b42318]">
              <span className="flex-1">{t('statsError', { month: monthLabel })}</span>
              <Button variant="secondary" onClick={refresh}>{t('common:actions.tryAgain')}</Button>
            </div>
          )}

          <div className="hc-mg-tools">
            <input type="search" className="hc-input !mt-0" placeholder={t('search')} aria-label={t('search')} value={query} onChange={(event) => setQuery(event.target.value)} />
            <div className="hc-mg-sort">
              <span className="text-[12.5px] text-black/45">{t('sort.label')}</span>
              <div role="group" aria-label={t('sort.aria')} className="hc-hgs-sort">
                {MODEL_SORTS.map((key) => (
                  <button key={key} type="button" aria-pressed={sort.key === key} onClick={() => setSort(key, sort.key === key ? sort.direction : firstSortDirection(key))}>{t(`sort.${key}`)}</button>
                ))}
              </div>
              <button type="button" className="hc-mg-dir" onClick={() => setSort(sort.key, sort.direction === 'asc' ? 'desc' : 'asc')} aria-label={t(`sort.${sort.direction}`)} title={t(`sort.${sort.direction}`)}>
                <ArrowIcon up={sort.direction === 'asc'} />
              </button>
            </div>
          </div>

          {loading ? (
            <div className="hc-mg-grid" role="status" aria-label={t('loading')}>
              {Array.from({ length: 6 }, (_, index) => <ModelGroupCardSkeleton key={index} />)}
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 rounded-[20px] border border-dashed border-black/[0.12] px-6 py-14 text-center">
              <StatusArt name="parking" className="h-auto w-[120px]" />
              <p className="text-[15px] font-medium text-foreground">{groups.length === 0 ? t('empty.none') : t('empty.noMatch')}</p>
              <p className="max-w-[340px] text-[13px] text-black/50">
                {groups.length === 0 ? (access.canCreate ? t('empty.noneBodyAdmin') : t('empty.noneBody')) : t('empty.noMatchBody')}
              </p>
              {groups.length === 0
                ? access.canCreate && <Button className="mt-2" onClick={() => setEditing({ group: null })}><PlusIcon /> {t('newGroup')}</Button>
                : <Button variant="secondary" className="mt-2" onClick={() => { setQuery(''); setFilter('all'); }}>{t('empty.showAll')}</Button>}
            </div>
          ) : (
            <div className="hc-mg-grid">
              {visible.map((group) => (
                <ModelGroupCard
                  key={group.id}
                  group={group}
                  stats={statRows.get(group.id)}
                  statsReady={statsReady}
                  tiers={catalog?.tiers ?? []}
                  usdRate={usdRate}
                  monthLabel={monthLabel}
                  showRealRate={access.canSeeRealRate}
                  onEdit={access.canEditSpecs ? () => setEditing({ group }) : null}
                  onViewCars={() => setViewing(group)}
                />
              ))}
            </div>
          )}
        </>
      )}

      {editing && catalog && (
        <ModelGroupSheet
          key={editing.group?.id ?? 'new'}
          group={editing.group}
          tiers={catalog.tiers}
          usdRate={usdRate}
          access={access}
          onClose={() => setEditing(null)}
          onSaved={onSaved}
        />
      )}
      {viewing && (
        <GroupCarsDrawer group={viewing} stats={statRows.get(viewing.id)} month={month} monthLabel={monthLabel} monthName={monthName} onClose={() => setViewing(null)} />
      )}
      {toast && ReactDOM.createPortal(
        <div role="status" className="hc-toast-in fixed inset-x-3 bottom-6 z-[9400] mx-auto max-w-sm rounded-2xl bg-[#0f1117] px-4 py-3 text-center text-sm font-semibold text-white shadow-lg">{toast}</div>,
        document.body,
      )}
    </div>
  );
};

export default ModelGroupsPage;
