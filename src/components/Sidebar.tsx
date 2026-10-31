import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { LANGUAGE_CODES, LANGUAGE_NAMES, useLanguage, type Language } from '../lib/LanguageContext';
import { useInbox } from '../lib/InboxContext';
import { usePageAccess, type AppPage } from '../contexts/PageAccessContext';
import { fallbackIcon, pageIcons, usePageLabel } from './pageNav';

/**
 * The navigation is built from `app_pages`, filtered by `canAccessPage`: nothing
 * about which pages exist or who sees them is hardcoded here. Everything personal
 * lives in the top bar, so this is the logo and the nav and nothing else.
 */

const GROUP_ORDER = ['main', 'fleet', 'operations', 'finance', 'media'];

/** Reached from the account menu in the top bar, never from the nav. */
const HIDDEN_GROUPS = ['account'];

const CLOSED_GROUPS_STORAGE_KEY = 'sidebar_closed_groups';

const DESKTOP_QUERY = '(min-width: 1024px)';

/** The rail only exists on desktop; a drawer always shows its labels. */
function useIsDesktop(): boolean {
  const [isDesktop, setIsDesktop] = useState(() => window.matchMedia?.(DESKTOP_QUERY).matches ?? true);

  useEffect(() => {
    const query = window.matchMedia?.(DESKTOP_QUERY);
    if (!query) return;
    const onChange = (e: MediaQueryListEvent) => setIsDesktop(e.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, []);

  return isDesktop;
}

function readClosedGroups(): Set<string> {
  try {
    const stored = JSON.parse(localStorage.getItem(CLOSED_GROUPS_STORAGE_KEY) ?? '[]');
    return new Set(Array.isArray(stored) ? stored.filter((g): g is string => typeof g === 'string') : []);
  } catch {
    return new Set();
  }
}

const PILL_ORDER: Language[] = ['ar', 'en'];

/**
 * Pinned under the nav, so it stays put however long the list gets. Always left to
 * right: the two options must not trade places the moment one is chosen.
 */
const LanguagePill: React.FC<{ compact: boolean }> = ({ compact }) => {
  const { lang } = useLanguage();
  const { updateSettings } = useCurrentUser();
  const { t } = useTranslation('sidebar');

  return (
    <div
      role="group"
      aria-label={t('language')}
      dir="ltr"
      className={clsx('flex gap-0.5 rounded-full bg-black/[0.05] p-0.5', compact ? 'mx-auto w-[52px]' : 'w-full')}
    >
      {PILL_ORDER.map(option => (
        <button
          key={option}
          type="button"
          lang={option}
          title={LANGUAGE_NAMES[option]}
          aria-label={LANGUAGE_NAMES[option]}
          aria-pressed={lang === option}
          onClick={() => updateSettings({ lang: option })}
          className={clsx(
            'min-h-11 flex-1 cursor-pointer rounded-full font-semibold transition-colors lg:min-h-8',
            compact ? 'text-[10px]' : 'text-xs',
            lang === option ? 'bg-[var(--surface)] text-[var(--accent-strong)] shadow-sm' : 'text-gray-500 hover:text-gray-800',
          )}
        >
          {LANGUAGE_CODES[option]}
        </button>
      ))}
    </div>
  );
};

interface SidebarProps {
  /** Collapse to the icon rail. Has no effect below desktop width. */
  collapsed?: boolean;
  /** Whether the drawer is open. Has no effect at desktop width. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ collapsed = false, mobileOpen = false, onMobileClose }) => {
  const location = useLocation();
  const { dir, canSwitch } = useLanguage();
  const { pages, canAccessPage, loading } = usePageAccess();
  const { openTasksCount } = useInbox();
  const { t } = useTranslation('sidebar');
  const pageLabel = usePageLabel();
  const isDesktop = useIsDesktop();

  const [closedGroups, setClosedGroups] = useState<Set<string>>(readClosedGroups);

  const rail = collapsed && isDesktop;

  useEffect(() => {
    try { localStorage.setItem(CLOSED_GROUPS_STORAGE_KEY, JSON.stringify(Array.from(closedGroups))); }
    catch {}
  }, [closedGroups]);

  const groups = useMemo(() => {
    const visible = pages.filter(p => canAccessPage(p.key) && !HIDDEN_GROUPS.includes(p.group_key));
    const extraKeys = Array.from(new Set(visible.map(p => p.group_key))).filter(g => !GROUP_ORDER.includes(g));
    return [...GROUP_ORDER, ...extraKeys]
      .map(key => ({ key, items: visible.filter(p => p.group_key === key) }))
      .filter(group => group.items.length > 0);
  }, [pages, canAccessPage]);

  // The page you land on is never tucked inside a closed group. Only a change of
  // route does this, so the group can still be closed by hand afterwards.
  useEffect(() => {
    const current = pages.find(p => p.route === location.pathname);
    if (!current) return;
    setClosedGroups(prev => {
      if (!prev.has(current.group_key)) return prev;
      const next = new Set(prev);
      next.delete(current.group_key);
      return next;
    });
  }, [location.pathname, pages]);

  const toggleGroup = (key: string) => {
    setClosedGroups(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const renderItem = (page: AppPage) => {
    const label = pageLabel(page);
    const hasTaskCount = page.key === 'tasks' && openTasksCount > 0;
    return (
      <NavLink
        key={page.key}
        to={page.route}
        // Without `end`, Cars would also read as active on Car Tracking.
        end
        title={rail ? label : undefined}
        onClick={onMobileClose}
        className={({ isActive }) => clsx(
          'relative flex min-h-11 items-center rounded-xl text-sm no-underline transition-colors duration-150 lg:min-h-9',
          rail ? 'justify-center' : 'gap-2 px-3',
          isActive
            ? 'bg-[var(--accent-soft)] font-semibold text-[var(--accent-strong)]'
            : 'font-medium text-gray-600 hover:bg-black/[0.04] hover:text-gray-900',
        )}
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute start-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-e-[3px] bg-[var(--accent)]" />
            )}
            <span className={clsx('relative shrink-0', isActive ? 'text-[var(--accent-strong)]' : 'text-gray-400')}>
              {pageIcons[page.key] ?? fallbackIcon}
              {/* In the rail the count has nowhere to sit, so it shrinks to a dot. */}
              {hasTaskCount && rail && (
                <span aria-hidden className="absolute -end-[3px] -top-[3px] size-2 rounded-full bg-red-500 ring-2 ring-[var(--surface)]" />
              )}
            </span>
            {!rail && <span className="min-w-0 truncate">{label}</span>}
            {hasTaskCount && !rail && (
              <span
                aria-label={t('openTasks', { count: openTasksCount })}
                className="ms-auto min-w-5 shrink-0 rounded-full bg-red-500 px-1.5 text-center text-[11px] font-extrabold leading-5 text-white"
              >
                {openTasksCount > 99 ? '99+' : openTasksCount}
              </span>
            )}
          </>
        )}
      </NavLink>
    );
  };

  return (
    <aside
      data-open={mobileOpen}
      className={clsx(
        'hc-sidebar fixed inset-y-0 start-0 z-[500] flex w-72 max-w-[85vw] flex-col overflow-hidden',
        'border-e border-[var(--border-subtle)] bg-[var(--surface)]',
        'lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:max-w-none lg:shrink-0 lg:transition-[width] lg:duration-200 lg:ease-out',
        rail ? 'lg:w-[68px]' : 'lg:w-64',
      )}
    >
      {/* Brand. The same height as the top bar, so the two hairlines meet. */}
      <div className={clsx(
        'relative flex h-16 shrink-0 items-center border-b border-[var(--border-subtle)]',
        rail ? 'justify-center' : 'gap-3 px-4',
      )}>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-[var(--accent)] to-[var(--accent-strong)]">
          <svg width="18" height="18" viewBox="0 0 120 120" fill="none" stroke="white" strokeWidth="14" strokeLinecap="round" aria-hidden="true">
            <path d="M22 100 L 22 60 A 38 38 0 0 1 98 60 L 98 100"/>
          </svg>
        </div>

        {!rail && (
          <div className="min-w-0 flex-1">
            <div className="text-sm font-bold leading-tight tracking-tight text-[#0f1117]">HomestaCars</div>
            <div className="mt-px text-[11px] text-gray-400">{t('brandSubtitle')}</div>
          </div>
        )}

        {/* Drawer: close. */}
        <button
          type="button"
          onClick={onMobileClose}
          aria-label={t('closeMenu')}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-400 transition-colors hover:bg-black/[0.04] hover:text-gray-600 lg:hidden"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
          </svg>
        </button>
      </div>

      {/* Nav */}
      <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-contain p-2">
        {loading && (
          <div aria-hidden className="flex flex-col gap-2 p-1">
            {[0, 1, 2, 3, 4, 5].map(i => <div key={i} className="h-8 animate-pulse rounded-lg bg-black/[0.04]" />)}
          </div>
        )}

        {groups.map((group, index) => {
          const open = rail || !closedGroups.has(group.key);
          return (
            <div key={group.key} className={index > 0 ? 'mt-2' : undefined}>
              {rail ? (
                index > 0 && <div className="mx-1 mb-2 h-px bg-[var(--border-subtle)]" />
              ) : (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.key)}
                  aria-expanded={open}
                  className="flex min-h-11 w-full cursor-pointer items-center justify-between rounded-lg px-3 text-[11px] font-bold uppercase text-gray-400 transition-colors hover:text-gray-600 lg:min-h-8"
                >
                  <span>{t(`sections.${group.key}`, { defaultValue: group.key })}</span>
                  <svg
                    width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true"
                    className="transition-transform duration-200"
                    style={{ transform: open ? 'none' : `rotate(${dir === 'rtl' ? 90 : -90}deg)` }}
                  >
                    <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
              )}
              <div
                className="grid transition-[grid-template-rows] duration-200 ease-out"
                style={{ gridTemplateRows: open ? '1fr' : '0fr' }}
                inert={!open}
              >
                <div className="flex min-h-0 flex-col gap-0.5 overflow-hidden">
                  {group.items.map(renderItem)}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {canSwitch && (
        <div className="hc-sidebar-foot shrink-0 border-t border-[var(--border-subtle)] px-2 pt-2">
          <LanguagePill compact={rail} />
        </div>
      )}
    </aside>
  );
};

export default Sidebar;
