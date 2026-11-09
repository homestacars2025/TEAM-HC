import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button, { buttonClass } from '../../components/Button';
import Icon3D from '../../components/Icon3D';
import { StatTile } from '../../components/WalletParts';
import { useDateLocale } from '../../hooks/useDateLocale';
import { useTileFilter } from '../../hooks/useTileFilter';
import { listOpenings, type Opening } from '../../lib/recruitment/hr';
import { OPENING_STATUSES, type OpeningStatus } from '../../lib/recruitment/model';

/** Recruitment (page `hr`): every opening with its applicants, filtered by status. */

export const HR_BASE = '/dashboard/hr';
export const openingPath = (id: string) => `${HR_BASE}/openings/${id}`;

const STATUS_TONES: Record<OpeningStatus, { bg: string; ink: string; dot: string }> = {
  draft: { bg: 'rgba(0,0,0,0.05)', ink: 'rgba(0,0,0,0.6)', dot: 'rgba(0,0,0,0.3)' },
  published: { bg: '#ECFDF5', ink: '#047857', dot: '#10B981' },
  closed: { bg: '#F5F5F4', ink: '#57534E', dot: '#A8A29E' },
};

export const OpeningStatusChip: React.FC<{ status: OpeningStatus }> = ({ status }) => {
  const { t } = useTranslation('hr');
  const tone = STATUS_TONES[status];
  return <span className="hc-hr-chip" style={{ background: tone.bg, color: tone.ink }}><i aria-hidden="true" style={{ background: tone.dot }} />{t(`openingStatus.${status}`)}</span>;
};

/** Points back: left in English, right in Arabic. */
export const BackArrow: React.FC = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="hc-hr-back-arrow"><path d="M19 12H5M11 6l-6 6 6 6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
);

const PlusIcon: React.FC = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
);

const HrOpeningsPage: React.FC = () => {
  const { t } = useTranslation(['hr', 'common']);
  const locale = useDateLocale();
  const [filter, setFilter] = useTileFilter(OPENING_STATUSES);
  const [openings, setOpenings] = useState<Opening[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setFailed(false);
    listOpenings().then(rows => { if (active) setOpenings(rows); }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [reload]);

  const list = useMemo(() => openings ?? [], [openings]);
  const count = (status: OpeningStatus) => list.filter(o => o.status === status).length;
  const applicants = list.reduce((sum, o) => sum + o.applicantCount, 0);
  const shown = filter === 'all' ? list : list.filter(o => o.status === filter);
  const loading = openings === null && !failed;
  const value = (n: number) => (loading ? null : n.toLocaleString('tr-TR'));

  return (
    <div className="hc-pi hc-hr">
      <header className="hc-pi-head">
        <div>
          <h1>{t('openings.title')}</h1>
          <p>{t('openings.subtitle')}</p>
        </div>
        <Link to={`${HR_BASE}/openings/new`} className={buttonClass('primary', 'hc-mg-new')}><PlusIcon /> {t('openings.new')}</Link>
      </header>

      {failed ? (
        <div className="hc-ce-state rounded-[16px] border border-[var(--border-subtle)] bg-white" role="alert">
          <p>{t('common.loadError')}</p>
          <Button variant="secondary" onClick={() => setReload(n => n + 1)}>{t('common:actions.tryAgain')}</Button>
        </div>
      ) : (
        <>
          <div className="hc-tiles hc-tiles-filter hc-bk-tiles hc-mg-tiles" role="group" aria-label={t('openings.tiles.label')}>
            <StatTile tone="st-all" art={<Icon3D name="total" className="hc-tile-art" />} label={t('openings.tiles.all')} sub={t('openings.tiles.allSub', { count: applicants })} value={value(list.length)} pressed={filter === 'all'} onPress={() => setFilter('all')} />
            <StatTile tone="st-booked" art={<Icon3D name="confirmed" className="hc-tile-art" />} label={t('openings.tiles.published')} sub={t('openings.tiles.publishedSub')} value={value(count('published'))} pressed={filter === 'published'} onPress={() => setFilter('published')} />
            <StatTile tone="st-pending" art={<Icon3D name="pending" className="hc-tile-art" />} label={t('openings.tiles.draft')} sub={t('openings.tiles.draftSub')} value={value(count('draft'))} pressed={filter === 'draft'} onPress={() => setFilter('draft')} />
            <StatTile tone="st-parking" art={<Icon3D name="completed" className="hc-tile-art" />} label={t('openings.tiles.closed')} sub={t('openings.tiles.closedSub')} value={value(count('closed'))} pressed={filter === 'closed'} onPress={() => setFilter('closed')} />
          </div>

          {loading ? (
            <div className="hc-hr-grid" aria-hidden="true">{Array.from({ length: 3 }, (_, i) => <div key={i} className="hc-hr-opening is-skeleton" />)}</div>
          ) : shown.length === 0 ? (
            <div className="hc-ce-state rounded-[20px] border border-dashed border-black/[0.12] text-center">
              <Icon3D name="total" size={72} />
              <p className="text-[15px] font-medium text-foreground">{list.length === 0 ? t('openings.empty') : t('openings.noMatch')}</p>
              {list.length === 0 && <p className="max-w-[340px] text-[13px] text-black/50">{t('openings.emptyBody')}</p>}
              {list.length === 0 && <Link to={`${HR_BASE}/openings/new`} className={buttonClass('primary', 'hc-mg-new')}><PlusIcon /> {t('openings.new')}</Link>}
            </div>
          ) : (
            <div className="hc-hr-grid">
              {shown.map(opening => (
                <article key={opening.id} className="hc-hr-opening surface-depth" aria-label={opening.title}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 dir="auto" className="truncate">{opening.title}</h2>
                      {opening.department && <p dir="auto" className="truncate text-[13px] text-black/50">{opening.department}</p>}
                    </div>
                    <OpeningStatusChip status={opening.status} />
                  </div>
                  <dl className="hc-hr-opening-facts">
                    <div><dt>{t('openings.applicants', { count: opening.applicantCount })}</dt></div>
                    <div><dt>{t('openings.shortlisted', { count: opening.shortlistedCount })}</dt></div>
                    {opening.positionsCount !== null && <div><dt>{t('openings.positions', { count: opening.positionsCount })}</dt></div>}
                  </dl>
                  <p className="text-[12px] text-black/40">{new Date(opening.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}</p>
                  <div className="hc-hr-opening-actions">
                    <Link to={`${openingPath(opening.id)}/edit`} className={buttonClass('secondary', 'hc-mg-action')}>{t('openings.edit')}</Link>
                    <Link to={openingPath(opening.id)} className={buttonClass('primary', 'hc-mg-action')}>{t('openings.open')}</Link>
                  </div>
                </article>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default HrOpeningsPage;
