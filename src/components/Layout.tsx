import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import NotificationToasts from './NotificationToasts';
import { hideBootSplash, loadBootFonts } from '../lib/bootSplash';
import { InboxProvider } from '../lib/InboxContext';
import { MailAccessProvider } from '../lib/mail/MailAccessContext';
import { KabisLiveProvider } from '../lib/KabisLiveContext';
import { readBootCollapsed } from '../lib/userSettings';
import { CurrentUserProvider, useCurrentUser } from '../contexts/CurrentUserContext';
import { usePageAccess } from '../contexts/PageAccessContext';

// ─── Layout ───────────────────────────────────────────────────────────────────

const Shell: React.FC = () => {
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
    <div className="hc-shell">
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
        <main className="hc-main">
          <Outlet />
        </main>
      </div>

      <NotificationToasts />
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
        <KabisLiveProvider>
          <MailAccessProvider>
            <Shell />
          </MailAccessProvider>
        </KabisLiveProvider>
      </InboxProvider>
    </BootGate>
  </CurrentUserProvider>
);

export default Layout;
