import React, { useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useBlockedPage } from '../../hooks/useBlockedPage';
import type { CarCompliance, ComplianceIssue, ComplianceSummary, IssueKind } from '../../lib/carCompliance';
import Button from '../Button';
import PlateChip from '../booking/PlateChip';

const ART_DIR = '/illustrations/alerts';

/** Red once anything has expired. Decorative everywhere: the words beside it say the same. */
export const ComplianceTriangle: React.FC<{ severity: IssueKind; size: number; className?: string }> = ({ severity, size, className }) => {
  const name = severity === 'expired' ? 'triangle-red' : 'triangle-amber';
  return (
    <img
      src={`${ART_DIR}/${name}.webp`}
      srcSet={`${ART_DIR}/${name}.webp 1x, ${ART_DIR}/${name}@2x.webp 2x`}
      alt=""
      width={size}
      height={size}
      decoding="async"
      className={className}
      style={{ width: size, height: size, objectFit: 'contain', flex: 'none' }}
    />
  );
};

/** What is wrong with a car, in a sentence. */
export function useIssueText() {
  const { t } = useTranslation('cars');
  return (issue: ComplianceIssue): string => (issue.kind === 'missing'
    ? t(`compliance.issue.${issue.field}Missing`)
    : t(`compliance.issue.${issue.field}Expired`, { since: t('compliance.since', { count: issue.daysAgo }) }));
}

const issueClass = (kind: IssueKind) => `hc-issue ${kind === 'expired' ? 'is-expired' : 'is-missing'}`;

function useCounts(summary: ComplianceSummary): string {
  const { t } = useTranslation('cars');
  return [
    ...(summary.expired.length > 0 ? [t('compliance.countExpired', { count: summary.expired.length })] : []),
    ...(summary.missing.length > 0 ? [t('compliance.countMissing', { count: summary.missing.length })] : []),
  ].join(' · ');
}

const toneClass = (summary: ComplianceSummary) => (summary.severity === 'expired' ? 'is-red' : 'is-amber');

/** Stays under the page title until nothing is left to fix. */
export const ComplianceBanner: React.FC<{ summary: ComplianceSummary; onView: () => void }> = ({ summary, onView }) => {
  const { t } = useTranslation('cars');
  const counts = useCounts(summary);
  if (!summary.severity) return null;
  return (
    <div role="alert" className={`hc-compliance-banner surface-depth ${toneClass(summary)}`}>
      <ComplianceTriangle severity={summary.severity} size={44} />
      <div className="min-w-0 flex-1">
        <p className="hc-compliance-banner-title">{t('compliance.bannerTitle')}</p>
        <p className="hc-compliance-banner-counts">{counts}</p>
      </div>
      <Button variant="secondary" onClick={onView}>{t('compliance.view')}</Button>
    </div>
  );
};

/** No answer is not an all-clear, so it says it couldn't check. */
export const ComplianceFailed: React.FC<{ onRetry: () => void }> = ({ onRetry }) => {
  const { t } = useTranslation('cars');
  const { t: tc } = useTranslation('common');
  return (
    <div role="alert" className="hc-compliance-banner surface-depth is-amber">
      <ComplianceTriangle severity="missing" size={44} />
      <p className="hc-compliance-banner-title min-w-0 flex-1">{t('compliance.checkFailed')}</p>
      <Button variant="secondary" onClick={onRetry}>{tc('actions.tryAgain')}</Button>
    </div>
  );
};

/** The same warning for Home, where the only thing to do with it is go to Cars. */
export const ComplianceHomeCard: React.FC<{ summary: ComplianceSummary }> = ({ summary }) => {
  const { t } = useTranslation('cars');
  const counts = useCounts(summary);
  if (!summary.severity) return null;
  return (
    <Link to="/dashboard/cars" className={`hc-compliance-banner hc-compliance-link surface-depth ${toneClass(summary)}`}>
      <ComplianceTriangle severity={summary.severity} size={52} />
      <span className="min-w-0 flex-1">
        <span className="hc-compliance-banner-title block">{t('compliance.bannerTitle')}</span>
        <span className="hc-compliance-banner-counts block">{counts}</span>
      </span>
      <span aria-hidden="true" className="hc-compliance-count">{summary.count}</span>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="hc-flip flex-none">
        <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </Link>
  );
};

/** First in the alerts row. */
export const ComplianceCard: React.FC<{ summary: ComplianceSummary; onView: () => void }> = ({ summary, onView }) => {
  const { t } = useTranslation('cars');
  if (!summary.severity) return null;
  return (
    <button type="button" onClick={onView} className={`hc-compliance-card surface-depth ${toneClass(summary)}`}>
      <span className="flex items-center gap-3">
        <ComplianceTriangle severity={summary.severity} size={40} />
        <span className="min-w-0 flex-1 text-[13.5px] font-semibold text-[#0f1117]">{t('compliance.cardTitle')}</span>
        <span className="hc-compliance-count">{summary.count}</span>
      </span>
      <span className="hc-compliance-plates">
        {[...summary.expired, ...summary.missing].map(car => (
          <span key={car.id} className={car.severity === 'expired' ? 'is-expired' : 'is-missing'} dir="ltr">{car.plate}</span>
        ))}
      </span>
    </button>
  );
};

const CarRow: React.FC<{ car: CarCompliance; onFix: (car: CarCompliance) => void }> = ({ car, onFix }) => {
  const { t } = useTranslation('cars');
  const issueText = useIssueText();
  return (
    <li className="hc-compliance-row">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <PlateChip plate={car.plate} />
          <span dir="auto" className="min-w-0 text-sm text-gray-600">{car.model}</span>
        </div>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {car.issues.map(issue => <li key={issue.field} className={issueClass(issue.kind)}>{issueText(issue)}</li>)}
        </ul>
      </div>
      <Button variant="secondary" className="hc-compliance-fix" onClick={() => onFix(car)}>{t('compliance.addDate')}</Button>
    </li>
  );
};

const FOCUSABLE = 'a[href], button:not(:disabled)';

interface ComplianceModalProps {
  summary: ComplianceSummary;
  onFix: (car: CarCompliance) => void;
  onClose: () => void;
  /** The date editor opens over this, and then the keyboard belongs to it. */
  covered: boolean;
}

/** Has no "don't show again" on purpose: it returns on every visit until the issues are gone. */
export const ComplianceModal: React.FC<ComplianceModalProps> = ({ summary, onFix, onClose, covered }) => {
  const { t } = useTranslation('cars');
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useBlockedPage();

  useEffect(() => { if (!covered) closeRef.current?.focus(); }, [covered]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Escape') { e.stopPropagation(); onClose(); return; }
    if (e.key !== 'Tab' || !dialogRef.current) return;
    const stops = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(FOCUSABLE));
    const first = stops[0];
    const last = stops[stops.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
  };

  if (!summary.severity) return null;

  const group = (kind: IssueKind, cars: CarCompliance[]) => cars.length > 0 && (
    <section>
      <h3 className={`hc-compliance-group ${kind === 'expired' ? 'is-expired' : 'is-missing'}`}>
        <span aria-hidden="true" />
        {t(`compliance.groups.${kind}`)}
        <small>{cars.length}</small>
      </h3>
      <ul className="hc-compliance-rows">
        {cars.map(car => <CarRow key={car.id} car={car} onFix={onFix} />)}
      </ul>
    </section>
  );

  return ReactDOM.createPortal(
    <div className="hc-compliance-backdrop">
      <div
        ref={dialogRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="hc-compliance-title"
        aria-describedby="hc-compliance-explain"
        onKeyDown={onKeyDown}
        className="hc-compliance surface-depth surface-float"
      >
        <header className={`hc-compliance-head ${toneClass(summary)}`}>
          <ComplianceTriangle severity={summary.severity} size={104} className="hc-compliance-art" />
          <h2 id="hc-compliance-title">{t('compliance.title')}</h2>
          <p id="hc-compliance-explain">{t('compliance.explain')}</p>
        </header>
        <div className="hc-compliance-body">
          {group('expired', summary.expired)}
          {group('missing', summary.missing)}
        </div>
        <footer className="hc-compliance-foot">
          <Button ref={closeRef} onClick={onClose}>{t('compliance.understood')}</Button>
        </footer>
      </div>
    </div>,
    document.body,
  );
};
