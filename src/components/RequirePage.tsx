import React, { useRef, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { usePageAccess } from '../contexts/PageAccessContext';
import { buttonClass } from './Button';

/**
 * Route guard for a dashboard page. Hiding the sidebar item is not access control —
 * this stops someone reaching the page by typing the URL. It reads the same context
 * as the sidebar, so the menu and the routes can never disagree.
 */

const bone = 'animate-pulse rounded-md bg-black/[0.05]';

const PageSkeleton: React.FC = () => (
  <div aria-busy className="flex flex-col gap-4 p-4 sm:p-6 lg:p-8">
    <div className={`${bone} h-8 w-48`} />
    <div className={`${bone} h-4 w-72 max-w-full`} />
    <div className="mt-2 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      <div className={`${bone} h-28`} />
      <div className={`${bone} h-28`} />
      <div className={`${bone} h-28`} />
    </div>
    <div className={`${bone} h-64`} />
  </div>
);

const Notice: React.FC<{
  tone: 'neutral' | 'error';
  title: string;
  body?: string;
  children: React.ReactNode;
}> = ({ tone, title, body, children }) => (
  <div className="flex min-h-[60vh] items-center justify-center p-4 sm:p-6">
    <div className="w-full max-w-sm rounded-2xl border border-[#ebebeb] bg-white p-6 text-center shadow-sm sm:p-8">
      <div className={`mx-auto mb-4 flex size-12 items-center justify-center rounded-xl ${tone === 'error' ? 'bg-red-50 text-red-500' : 'bg-[#4ba6ea]/10 text-[#3A74C2]'}`}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <rect x="4" y="10" width="16" height="10" rx="2" stroke="currentColor" strokeWidth="1.8" />
          <path d="M8 10V7a4 4 0 018 0v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
      </div>
      <h1 className="mb-2 text-base font-medium text-[#0f1117]">{title}</h1>
      {body && <p className="mb-5 text-sm leading-relaxed text-gray-500">{body}</p>}
      {children}
    </div>
  </div>
);


const AccessError: React.FC = () => {
  const { t } = useTranslation('common');
  const { refresh } = usePageAccess();
  return (
    <Notice tone="error" title={t('pageAccess.errorTitle')} body={t('pageAccess.errorBody')}>
      <button type="button" onClick={() => { refresh(); }} className={buttonClass()}>
        {t('actions.tryAgain')}
      </button>
    </Notice>
  );
};

const NoPagesAssigned: React.FC = () => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  };

  return (
    <Notice tone="neutral" title={t('pageAccess.noPages')}>
      <button type="button" onClick={handleSignOut} disabled={signingOut} className={buttonClass()}>
        {t('pageAccess.signOut')}
      </button>
    </Notice>
  );
};

const NoAccess: React.FC = () => {
  const { t } = useTranslation('common');
  const { firstAllowedRoute } = usePageAccess();
  return (
    <Notice tone="neutral" title={t('pageAccess.noAccessTitle')} body={t('pageAccess.noAccessBody')}>
      {firstAllowedRoute && (
        <Link to={firstAllowedRoute} className={buttonClass()}>{t('pageAccess.goToMyPage')}</Link>
      )}
    </Notice>
  );
};

/** The states every guard shares, or `null` once access is known and non-empty. */
function useAccessState(): React.ReactNode {
  const { loading, error, allowedPages } = usePageAccess();
  if (loading) return <PageSkeleton />;
  if (error) return <AccessError />;
  if (allowedPages.size === 0) return <NoPagesAssigned />;
  return null;
}

const RequirePage: React.FC<{ page: string; children: React.ReactNode }> = ({ page, children }) => {
  const { canAccessPage, firstAllowedRoute } = usePageAccess();
  const state = useAccessState();
  const openedPage = useRef<string | null>(null);

  if (state) return <>{state}</>;

  if (canAccessPage(page)) {
    openedPage.current = page;
    return <>{children}</>;
  }

  // Taken away while it was open, by a refresh that succeeded: move on quietly.
  // A page that was never open is someone typing a URL, and they get told why.
  if (openedPage.current === page && firstAllowedRoute) return <Navigate to={firstAllowedRoute} replace />;
  return <NoAccess />;
};

/**
 * The `/dashboard` index and the `*` fallback. `within` narrows the target to one
 * part of the app, for an index route such as `/dashboard/media`.
 */
export const RedirectToFirstPage: React.FC<{ within?: string }> = ({ within }) => {
  const { pathname } = useLocation();
  const { pages, canAccessPage, firstAllowedRoute } = usePageAccess();
  const state = useAccessState();

  if (state) return <>{state}</>;

  const scoped = within
    ? pages.find(p => canAccessPage(p.key) && p.route.startsWith(within))?.route
    : undefined;
  const target = scoped ?? firstAllowedRoute;

  // A page registered in `app_pages` with no route in App.tsx lands back here.
  if (!target || target === pathname) return <NoAccess />;
  return <Navigate to={target} replace />;
};

export default RequirePage;
