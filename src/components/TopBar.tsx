import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import AccountMenu from './AccountMenu';
import CommandPalette from './CommandPalette';
import TasksBell from './TasksBell';

const IS_MAC = /mac|iphone|ipad/i.test(typeof navigator === 'undefined' ? '' : navigator.platform);

const iconButton =
  'flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-xl text-gray-500 transition-colors hover:bg-black/[0.04] hover:text-gray-700 lg:size-10';

interface TopBarProps {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
  onOpenMenu: () => void;
  menuOpen: boolean;
}

/**
 * Sits in its own strip rather than floating over the pages: several pages put an
 * action button or a month switcher in their top corner, and an overlay would land
 * on top of them. `main` scrolls beneath it.
 */
const TopBar: React.FC<TopBarProps> = ({ sidebarCollapsed, onToggleSidebar, onOpenMenu, menuOpen }) => {
  const { t } = useTranslation('shell');
  const { t: ts } = useTranslation('sidebar');
  const [searchOpen, setSearchOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(open => !open);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const collapseLabel = sidebarCollapsed ? ts('expand') : ts('collapse');

  return (
    <header className="sticky top-0 z-[300] flex h-16 shrink-0 items-center gap-2 border-b border-[var(--border-subtle)] bg-[var(--surface)] px-3 sm:px-6 lg:px-10">
      {/* Below desktop the sidebar is a drawer; above it, a rail. */}
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label={ts('openMenu')}
        aria-expanded={menuOpen}
        className={`${iconButton} -ms-1 lg:hidden`}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
        </svg>
      </button>
      <button
        type="button"
        onClick={onToggleSidebar}
        title={collapseLabel}
        aria-label={collapseLabel}
        aria-expanded={!sidebarCollapsed}
        className={`${iconButton} -ms-2.5 hidden lg:flex`}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" className="rtl:-scale-x-100" aria-hidden="true">
          <rect x="3" y="4.5" width="18" height="15" rx="3" stroke="currentColor" strokeWidth="1.8" />
          <path d="M9.5 4.5v15" stroke="currentColor" strokeWidth="1.8" />
        </svg>
      </button>

      <div className="flex-1" />

      <button
        type="button"
        onClick={() => setSearchOpen(true)}
        aria-label={t('search.title')}
        aria-keyshortcuts={IS_MAC ? 'Meta+K' : 'Control+K'}
        className="flex size-11 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-xl border border-[var(--border-subtle)] text-gray-500 transition-colors hover:border-[var(--accent)] sm:h-11 sm:w-56 sm:justify-start sm:px-3 lg:h-10"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden="true">
          <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
          <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        </svg>
        <span className="hidden flex-1 truncate text-start text-[13px] sm:block">{t('search.button')}</span>
        <kbd dir="ltr" className="hc-num hidden rounded-md border border-[var(--border-subtle)] px-1.5 text-[11px] leading-5 text-gray-400 sm:block">
          {IS_MAC ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>

      <TasksBell />
      <AccountMenu />

      {searchOpen && <CommandPalette onClose={() => setSearchOpen(false)} />}
    </header>
  );
};

export default TopBar;
