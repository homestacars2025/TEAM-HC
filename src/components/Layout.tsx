import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { Outlet, useLocation } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import clsx from 'clsx';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import NotificationToasts from './NotificationToasts';
import { hideBootSplash, loadBootFonts } from '../lib/bootSplash';
import { InboxProvider } from '../lib/InboxContext';
import { readBootCollapsed } from '../lib/userSettings';
import { CurrentUserProvider, useCurrentUser } from '../contexts/CurrentUserContext';
import { usePageAccess } from '../contexts/PageAccessContext';
import { useInactivityTimeout } from '../hooks/useInactivityTimeout';
import Button from './Button';

// ─── Inactivity Warning Modal ─────────────────────────────────────────────────

const InactivityWarning: React.FC<{ onStay: () => void }> = ({ onStay }) => {
  const { t } = useTranslation('common');
  return ReactDOM.createPortal(
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(15,17,23,0.5)', backdropFilter: 'blur(4px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 20, animation: 'iaFadeIn 200ms ease',
    }}>
      <div style={{
        background: '#fff', borderRadius: 18, width: '100%', maxWidth: 380,
        padding: '28px 28px 24px', textAlign: 'center',
        boxShadow: '0 24px 80px rgba(0,0,0,0.20)',
        animation: 'iaSlideUp 200ms ease',
      }}>
        {/* Icon */}
        <div style={{
          width: 52, height: 52, borderRadius: 14,
          background: 'rgba(251,191,36,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 16px',
        }}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <circle cx="12" cy="12" r="9" stroke="#f59e0b" strokeWidth="1.8"/>
            <path d="M12 8v4.5" stroke="#f59e0b" strokeWidth="2" strokeLinecap="round"/>
            <circle cx="12" cy="15.5" r="0.75" fill="#f59e0b"/>
          </svg>
        </div>

        <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1117', marginBottom: 8, letterSpacing: '-0.3px' }}>
          {t('inactivity.title')}
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
          <Trans
            t={t}
            i18nKey="inactivity.message"
            values={{ seconds: 30 }}
            components={{ b: <strong style={{ color: '#0f1117' }} /> }}
          />
        </div>

        <Button
          onClick={onStay}
          style={{ width: '100%' }}
>
          {t('inactivity.stay')}
        </Button>
      </div>

      <style>{`
        @keyframes iaFadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes iaSlideUp  { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
    </div>,
    document.body,
  );
};

// ─── Layout ───────────────────────────────────────────────────────────────────

const Shell: React.FC = () => {
  const { showWarning, stayLoggedIn } = useInactivityTimeout();
  const { t: tc } = useTranslation('common');
  const { refreshFailed, refresh } = usePageAccess();
  const { settings } = useCurrentUser();
  const { pathname } = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(readBootCollapsed);

  useEffect(() => { setMenuOpen(false); }, [pathname]);

  // Only this setting: changing the currency must not undo a manual collapse.
  const startCollapsed = settings?.startCollapsed;
  useEffect(() => {
    if (startCollapsed !== undefined) setCollapsed(startCollapsed);
  }, [startCollapsed]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen]);

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--surface)' }}>
      <Sidebar collapsed={collapsed} mobileOpen={menuOpen} onMobileClose={() => setMenuOpen(false)} />

      {/* Drawer backdrop. Below 1024px only; the sidebar is in the flow above that. */}
      <div
        aria-hidden="true"
        onClick={() => setMenuOpen(false)}
        className={clsx(
          'fixed inset-0 z-[490] bg-[rgba(15,17,23,0.4)] transition-opacity duration-200 lg:hidden',
          menuOpen ? 'opacity-100' : 'pointer-events-none opacity-0',
        )}
      />

      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        <TopBar
          sidebarCollapsed={collapsed}
          onToggleSidebar={() => setCollapsed(c => !c)}
          onOpenMenu={() => setMenuOpen(true)}
          menuOpen={menuOpen}
        />
        {refreshFailed && (
          <div
            role="status"
            className="flex shrink-0 flex-wrap items-center justify-center gap-x-2 border-b border-amber-200 bg-amber-50 px-4 py-1 text-[13px] text-amber-800"
          >
            <span>{tc('pageAccess.refreshFailed')}</span>
            <button
              type="button"
              onClick={() => { refresh(); }}
              className="min-h-11 cursor-pointer font-semibold underline underline-offset-2 lg:min-h-0"
            >
              {tc('pageAccess.retry')}
            </button>
          </div>
        )}
        <main style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>

      <NotificationToasts />
      {showWarning && <InactivityWarning onStay={stayLoggedIn} />}
    </div>
  );
};

/** Past this the shell opens anyway, with each page's own loading state in it. */
const MAX_BOOT_MS = 8000;

/**
 * Nothing of the dashboard exists until everyone's answers are in, so the first thing
 * drawn is the finished screen. A failed answer still counts: the shell has an error
 * state for it, and a splash that never ends would be worse.
 */
const BootGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading } = usePageAccess();
  const { ready } = useCurrentUser();
  const [fontsReady, setFontsReady] = useState(false);
  const [timedOut, setTimedOut] = useState(false);
  const opened = useRef(false);

  useEffect(() => {
    let cancelled = false;
    loadBootFonts().then(() => { if (!cancelled) setFontsReady(true); });
    const timer = window.setTimeout(() => setTimedOut(true), MAX_BOOT_MS);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, []);

  // Once open it stays open, so a retry after an error never brings the splash back.
  if ((!loading && ready && fontsReady) || timedOut) opened.current = true;

  useLayoutEffect(() => {
    if (opened.current) hideBootSplash();
  });

  return opened.current ? <>{children}</> : null;
};

const Layout: React.FC = () => (
  // The inbox reads the sound setting, so the signed-in user comes first.
  <CurrentUserProvider>
    <BootGate>
      <InboxProvider>
        <Shell />
      </InboxProvider>
    </BootGate>
  </CurrentUserProvider>
);

export default Layout;
