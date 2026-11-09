import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Button, { buttonClass } from '../../components/Button';
import Icon3D from '../../components/Icon3D';
import { StatTile } from '../../components/WalletParts';
import { ApplicantDrawer } from '../../components/hr/ApplicantDrawer';
import { ConfirmationChip, PriorityChip, StageChip } from '../../components/hr/HrParts';
import { InterviewCalendar } from '../../components/hr/InterviewCalendar';
import { useCurrentUser } from '../../contexts/CurrentUserContext';
import { useDateLocale } from '../../hooks/useDateLocale';
import { useTileFilter } from '../../hooks/useTileFilter';
import {
  getInterviewSettings,
  getOpening,
  listApplicants,
  listInterviews,
  listSlots,
  moveStage,
  type Applicant,
  type HrSlot,
  type Interview,
  type InterviewSettings,
  type Opening,
} from '../../lib/recruitment/hr';
import { CLOSED_STAGES, RECRUITMENT_STAGES, STAGE_TONES, weightedScore, type RecruitmentStage } from '../../lib/recruitment/model';
import { BackArrow, HR_BASE, OpeningStatusChip, openingPath } from './HrOpeningsPage';

/**
 * One opening: its applicants as a board by stage or a table, filtered by the tiles,
 * a stage dropdown and search; the applicant drawer; and the interview calendar with
 * the scores. Everything here is HR-only, by row-level security as well as the route.
 */

const TOAST_MS = 3200;
const TILE_FILTERS = ['new', 'shortlisted', 'interviewed', 'hired'] as const;
type TileFilter = typeof TILE_FILTERS[number];

const matchesTile = (a: Applicant, filter: TileFilter | 'all') =>
  filter === 'all' || (filter === 'shortlisted' ? a.shortlisted : a.stage === filter);

const matchesSearch = (a: Applicant, query: string) => {
  const words = query.trim().toLocaleLowerCase('tr-TR').split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const hay = [a.fullName, a.nationality, a.residenceDistrict, a.residenceCity, a.phone, a.email].filter(Boolean).join(' ').toLocaleLowerCase('tr-TR');
  return words.every(w => hay.includes(w));
};

const HrOpeningPage: React.FC = () => {
  const { t } = useTranslation(['hr', 'common']);
  const locale = useDateLocale();
  const { id = '' } = useParams<{ id: string }>();
  const { userId } = useCurrentUser();
  const [params, setParams] = useSearchParams();
  const tab = params.get('tab') === 'interviews' ? 'interviews' : 'pipeline';
  const view = params.get('view') === 'table' ? 'table' : 'board';
  const [filter, setFilter] = useTileFilter(TILE_FILTERS);
  const [stage, setStage] = useState<RecruitmentStage | 'all'>('all');
  const [search, setSearch] = useState('');

  const [opening, setOpening] = useState<Opening | null | undefined>(undefined);
  const [applicants, setApplicants] = useState<Applicant[] | null>(null);
  const [interviews, setInterviews] = useState<Interview[]>([]);
  const [slots, setSlots] = useState<HrSlot[]>([]);
  const [settings, setSettings] = useState<InterviewSettings | null>(null);
  const [failed, setFailed] = useState(false);
  const [reload, setReload] = useState(0);
  const [toast, setToast] = useState<{ text: string; bad?: boolean } | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const toastTimer = useRef(0);
  const openId = params.get('applicant');

  useEffect(() => {
    let active = true;
    setFailed(false);
    Promise.all([getOpening(id), listApplicants(id), listSlots(id), getInterviewSettings(id)])
      .then(async ([found, rows, slotRows, setting]) => {
        const scored = await listInterviews(rows.map(r => r.id));
        if (!active) return;
        setOpening(found);
        setApplicants(rows);
        setSlots(slotRows);
        setSettings(setting);
        setInterviews(scored);
      })
      .catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [id, reload]);
  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const say = useCallback((text: string, bad = false) => {
    window.clearTimeout(toastTimer.current);
    setToast({ text, bad });
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);
  const refresh = useCallback((message?: string) => { if (message) say(message); setReload(n => n + 1); }, [say]);
  const onError = useCallback((message: string) => { say(t('common.saveError', { reason: message }), true); setReload(n => n + 1); }, [say, t]);

  const setParam = (key: string, value: string | null) => setParams(current => {
    const next = new URLSearchParams(current);
    if (value) next.set(key, value); else next.delete(key);
    return next;
  }, { replace: true });

  const list = useMemo(() => applicants ?? [], [applicants]);
  const scoreOf = useMemo(() => {
    const map = new Map<string, number>();
    if (!opening) return map;
    for (const interview of interviews) {
      const s = weightedScore(opening.interviewCriteria, interview.scores);
      if (s && s.total > (map.get(interview.applicantId) ?? -1)) map.set(interview.applicantId, s.total);
    }
    return map;
  }, [interviews, opening]);
  const slotOf = useMemo(() => new Map(slots.filter(s => s.status === 'booked' && s.applicantId).map(s => [s.applicantId as string, s])), [slots]);
  const shown = useMemo(
    () => list.filter(a => matchesTile(a, filter) && (stage === 'all' || a.stage === stage) && matchesSearch(a, search)),
    [list, filter, stage, search],
  );
  const counts = useMemo(() => ({
    all: list.length,
    new: list.filter(a => a.stage === 'new').length,
    shortlisted: list.filter(a => a.shortlisted).length,
    interviewed: list.filter(a => a.stage === 'interviewed').length,
    hired: list.filter(a => a.stage === 'hired').length,
  }), [list]);

  const move = async (applicant: Applicant, target: RecruitmentStage) => {
    if (applicant.stage === target) return;
    setApplicants(current => current?.map(a => (a.id === applicant.id ? { ...a, stage: target } : a)) ?? current);
    try {
      await moveStage(applicant.id, target, userId);
      refresh(t('pipeline.moved', { name: applicant.fullName, stage: t(`stage.${target}`) }));
    } catch (reason) {
      onError(reason instanceof Error ? reason.message : String(reason));
    }
  };

  const loading = applicants === null && !failed;
  if (failed) {
    return (
      <div className="hc-pi">
        <div className="hc-ce-state rounded-[16px] border border-[var(--border-subtle)] bg-white" role="alert">
          <p>{t('common.loadError')}</p>
          <Button variant="secondary" onClick={() => setReload(n => n + 1)}>{t('common:actions.tryAgain')}</Button>
        </div>
      </div>
    );
  }
  if (opening === null) {
    return (
      <div className="hc-pi">
        <div className="hc-ce-state rounded-[16px] border border-[var(--border-subtle)] bg-white" role="alert">
          <p>{t('pipeline.notFound')}</p>
          <Link to={HR_BASE} className="hc-pi-all inline-flex items-center">{t('common.allOpenings')}</Link>
        </div>
      </div>
    );
  }

  const value = (n: number) => (loading ? null : n.toLocaleString('tr-TR'));
  const openApplicant = openId ? list.find(a => a.id === openId) ?? null : null;
  const facts = (a: Applicant) => [a.age !== null ? t('common.years', { age: a.age }) : null, a.nationality, a.residenceDistrict].filter((v): v is string => !!v);

  const card = (a: Applicant) => (
    <button
      key={a.id}
      type="button"
      draggable
      onDragStart={e => { e.dataTransfer.setData('text/plain', a.id); e.dataTransfer.effectAllowed = 'move'; setDragging(a.id); }}
      onDragEnd={() => setDragging(null)}
      onClick={() => setParam('applicant', a.id)}
      className={`hc-hr-card surface-depth ${CLOSED_STAGES.includes(a.stage) ? 'is-closed' : ''} ${dragging === a.id ? 'is-dragging' : ''}`}
    >
      <span className="flex items-start justify-between gap-2">
        <strong dir="auto" className="min-w-0 truncate">{a.fullName}</strong>
        {scoreOf.has(a.id) && <span className="hc-hr-score-badge hc-num">{scoreOf.get(a.id)}</span>}
      </span>
      {facts(a).length > 0 && <span className="hc-iv-facts">{facts(a).map(f => <span key={f} dir="auto">{f}</span>)}</span>}
      <span className="flex flex-wrap gap-1">
        {a.shortlisted && <ConfirmationChip status={a.confirmation} />}
        {a.priority !== 'medium' && <PriorityChip priority={a.priority} />}
        {a.knockoutFailed && <span className="hc-hr-chip" style={{ background: '#FFF1F2', color: '#BE123C' }} title={t('pipeline.knockout')}>!</span>}
      </span>
    </button>
  );

  return (
    <div className="hc-pi hc-hr hc-hr-opening-page">
      <header className="hc-pi-head">
        <div className="min-w-0">
          <Link to={HR_BASE} className="hc-hr-back"><BackArrow /> {t('common.allOpenings')}</Link>
          <h1 dir="auto" className="flex flex-wrap items-center gap-2">{opening?.title ?? '…'} {opening && <OpeningStatusChip status={opening.status} />}</h1>
          {opening?.department && <p dir="auto">{opening.department}</p>}
        </div>
        {opening && <Link to={`${openingPath(opening.id)}/edit`} className={buttonClass('secondary', 'hc-mg-new')}>{t('openings.edit')}</Link>}
      </header>

      <div role="tablist" aria-label={opening?.title ?? ''} className="hc-hr-tabs">
        {(['pipeline', 'interviews'] as const).map(key => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setParam('tab', key === 'pipeline' ? null : key)}>{t(`pipeline.tabs.${key}`)}</button>
        ))}
      </div>

      {tab === 'interviews' && opening ? (
        <InterviewCalendar opening={opening} settings={settings} slots={slots} applicants={list} interviews={interviews} profileId={userId}
          onChanged={refresh} onError={onError} onOpenApplicant={applicantId => setParam('applicant', applicantId)} />
      ) : (
        <>
          <div className="hc-tiles hc-tiles-filter hc-bk-tiles hc-hr-tiles" role="group" aria-label={t('pipeline.tiles.label')}>
            <StatTile tone="st-all" art={<Icon3D name="total" className="hc-tile-art" />} label={t('pipeline.tiles.all')} sub={t('pipeline.tiles.allSub')} value={value(counts.all)} pressed={filter === 'all'} onPress={() => setFilter('all')} />
            <StatTile tone="st-parking" art={<Icon3D name="pending" className="hc-tile-art" />} label={t('stage.new')} sub={t('openings.applicants', { count: counts.new })} value={value(counts.new)} pressed={filter === 'new'} onPress={() => setFilter('new')} />
            <StatTile tone="st-pending" art={<Icon3D name="confirmed" className="hc-tile-art" />} label={t('pipeline.tiles.shortlist')} sub={t('pipeline.tiles.shortlistSub')} value={value(counts.shortlisted)} pressed={filter === 'shortlisted'} onPress={() => setFilter('shortlisted')} />
            <StatTile tone="st-maintenance" art={<Icon3D name="completed" className="hc-tile-art" />} label={t('stage.interviewed')} sub={t('openings.applicants', { count: counts.interviewed })} value={value(counts.interviewed)} pressed={filter === 'interviewed'} onPress={() => setFilter('interviewed')} />
            <StatTile tone="st-booked" art={<Icon3D name="confirmed" className="hc-tile-art" />} label={t('stage.hired')} sub={t('openings.applicants', { count: counts.hired })} value={value(counts.hired)} pressed={filter === 'hired'} onPress={() => setFilter('hired')} />
          </div>

          <div className="hc-hr-tools">
            <input type="search" className="hc-input !mt-0" placeholder={t('common.search')} aria-label={t('common.search')} value={search} onChange={e => setSearch(e.target.value)} />
            <select className="hc-input !mt-0" aria-label={t('applicant.stage')} value={stage} onChange={e => setStage(e.target.value as RecruitmentStage | 'all')}>
              <option value="all">{t('applicant.stage')}: {t('pipeline.tiles.all')}</option>
              {RECRUITMENT_STAGES.map(s => <option key={s} value={s}>{t(`stage.${s}`)}</option>)}
            </select>
            <div role="group" aria-label={t('pipeline.view.label')} className="hc-hgs-sort">
              {(['board', 'table'] as const).map(key => <button key={key} type="button" aria-pressed={view === key} onClick={() => setParam('view', key === 'board' ? null : key)}>{t(`pipeline.view.${key}`)}</button>)}
            </div>
          </div>

          {loading ? (
            <div className="hc-hr-board-skeleton" aria-hidden="true" />
          ) : list.length === 0 ? (
            <div className="hc-ce-state rounded-[20px] border border-dashed border-black/[0.12] text-center">
              <Icon3D name="total" size={72} />
              <p className="text-[15px] font-medium text-foreground">{t('pipeline.empty')}</p>
              <p className="max-w-[340px] text-[13px] text-black/50">{t('pipeline.emptyBody')}</p>
            </div>
          ) : shown.length === 0 ? (
            <div className="hc-ce-state rounded-[20px] border border-dashed border-black/[0.12] text-center">
              <p className="text-[15px] font-medium text-foreground">{t('pipeline.noMatch')}</p>
            </div>
          ) : view === 'board' ? (
            <div className="hc-hr-kanban">
              {RECRUITMENT_STAGES.filter(s => stage === 'all' || s === stage).map(column => {
                const cards = shown.filter(a => a.stage === column);
                return (
                  <section key={column} className="hc-hr-column" aria-label={t(`stage.${column}`)}
                    onDragOver={e => { if (dragging) e.preventDefault(); }}
                    onDrop={e => { e.preventDefault(); const moved = list.find(a => a.id === e.dataTransfer.getData('text/plain')); setDragging(null); if (moved) move(moved, column); }}
                    style={{ '--rail': STAGE_TONES[column].rail } as React.CSSProperties}>
                    <header><StageChip stage={column} /><span className="hc-num text-[12px] text-black/40">{cards.length}</span></header>
                    <div className="hc-hr-column-cards">{cards.map(card)}</div>
                  </section>
                );
              })}
            </div>
          ) : (
            <div className="hc-hr-table-wrap surface-depth">
              <table className="hc-hr-table">
                <thead>
                  <tr>
                    {(['name', 'age', 'nationality', 'district', 'stage', 'score', 'applied'] as const).map(col => <th key={col} scope="col">{t(`pipeline.columns.${col}`)}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {shown.map(a => (
                    <tr key={a.id} onClick={() => setParam('applicant', a.id)} className={CLOSED_STAGES.includes(a.stage) ? 'is-closed' : undefined}>
                      <td><button type="button" className="hc-hr-link text-start" onClick={e => { e.stopPropagation(); setParam('applicant', a.id); }}><bdi dir="auto">{a.fullName}</bdi></button></td>
                      <td className="hc-num">{a.age ?? '—'}</td>
                      <td dir="auto">{a.nationality ?? '—'}</td>
                      <td dir="auto">{a.residenceDistrict ?? '—'}</td>
                      <td><StageChip stage={a.stage} /></td>
                      <td className="hc-num">{scoreOf.has(a.id) ? `${scoreOf.get(a.id)}/100` : '—'}</td>
                      <td className="hc-num">{new Date(a.createdAt).toLocaleDateString(locale, { day: 'numeric', month: 'short' })}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {openApplicant && opening && (
        <ApplicantDrawer
          applicant={openApplicant}
          opening={opening}
          interviews={interviews.filter(i => i.applicantId === openApplicant.id)}
          slot={slotOf.get(openApplicant.id) ?? null}
          location={settings?.location ?? null}
          profileId={userId}
          onClose={() => setParam('applicant', null)}
          onChanged={refresh}
          onError={onError}
        />
      )}
      {toast && ReactDOM.createPortal(
        <div role="status" className={`hc-toast-in fixed inset-x-3 bottom-6 z-[9400] mx-auto max-w-sm rounded-2xl px-4 py-3 text-center text-sm font-semibold text-white shadow-lg ${toast.bad ? 'bg-[#b42318]' : 'bg-[#0f1117]'}`}>{toast.text}</div>,
        document.body,
      )}
    </div>
  );
};

export default HrOpeningPage;
