import React, { useEffect, useMemo, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import clsx from 'clsx';
import { supabase } from '../lib/supabase';
import { useCurrency, CURRENCIES, CURRENCY_SYMBOLS, type Currency } from '../lib/CurrencyContext';
import { useLanguage, LANGUAGES, LANGUAGE_SHORT, LANGUAGE_NAMES, type Language } from '../lib/LanguageContext';
import { useInbox } from '../lib/InboxContext';
import { usePageAccess, type AppPage } from '../contexts/PageAccessContext';
import StaffAvatar from './StaffAvatar';
import type { StaffAvatarProfile } from '../lib/staffAvatar';

/**
 * The navigation is built from `app_pages`, filtered by `canAccessPage`: nothing
 * about which pages exist or who sees them is hardcoded here. This file only adds
 * what a database row cannot carry — the icon, and a translation key when one exists.
 */

const icon = (children: React.ReactNode) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">{children}</svg>
);

const pageIcons: Record<string, React.ReactNode> = {
  tasks: icon(<>
    <rect x="3" y="4" width="18" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M8.5 13l2.2 2.2 4.8-4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </>),
  bookings: icon(<>
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </>),
  calendar: icon(<>
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <rect x="7" y="14" width="4" height="4" rx="1" fill="currentColor" opacity="0.6"/>
    <rect x="13" y="14" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5"/>
  </>),
  cars: icon(<>
    <path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="9" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <circle cx="12" cy="16" r="1.2" fill="currentColor"/>
    <circle cx="20" cy="16" r="1.2" fill="currentColor"/>
  </>),
  car_tracking: icon(<>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </>),
  car_issues: icon(<>
    <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
  </>),
  model_groups: icon(<>
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
  </>),
  operations: icon(
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  ),
  kgm: icon(<>
    <rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M2 10h20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M6 14h2M10 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </>),
  fines: icon(<>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 12v4M12 10h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </>),
  customer_wallets: icon(<>
    <path d="M3 7a2 2 0 012-2h12a2 2 0 012 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M16 12h5v4h-5a2 2 0 010-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
  </>),
  kabis: icon(<>
    <path d="M5 3h9l5 5v13a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M8.5 14.5l2 2 4.5-4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
  </>),
  accounting: icon(<>
    <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M8 7h8M8 11h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M8 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="16" cy="16" r="1.1" fill="currentColor"/>
  </>),
  media_ideas: icon(<>
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5A5.7 5.7 0 0018 8 6 6 0 006 8c0 1 .2 2.2 1.5 3.5.8.8 1.3 1.5 1.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M9 18h6M10 22h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </>),
  media_calendar: icon(<>
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M17 14h-6M13 18H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </>),
  media_influencers: icon(<>
    <path d="M3 11l18-5v12L3 14v-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M11.6 16.8a3 3 0 11-5.8-1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </>),
};

/** For a page added to `app_pages` before this map catches up. */
const fallbackIcon = icon(<rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.8"/>);

/** Page key → `sidebar` translation key. Anything absent uses the database label. */
const NAV_LABEL_KEYS: Record<string, string> = {
  tasks: 'nav.tasks',
  bookings: 'nav.bookings',
  calendar: 'nav.calendar',
  cars: 'nav.cars',
  car_tracking: 'nav.carTracking',
  car_issues: 'nav.carIssues',
  model_groups: 'nav.modelGroups',
  operations: 'nav.operations',
  kgm: 'nav.kgm',
  fines: 'nav.fines',
  kabis: 'nav.kabis',
  accounting: 'nav.accounting',
  customer_wallets: 'nav.customerWallets',
  media_ideas: 'nav.ideas',
  media_calendar: 'nav.mediaCalendar',
  media_influencers: 'nav.influencers',
};

const GROUP_ORDER = ['main', 'fleet', 'operations', 'finance', 'media'];

const COLLAPSED_STORAGE_KEY = 'sidebar_collapsed';
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

interface UserProfile extends StaffAvatarProfile {
  full_name: string | null;
}

interface SidebarProps {
  /** Whether the drawer is open. Has no effect at desktop width. */
  mobileOpen?: boolean;
  onMobileClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({ mobileOpen = false, onMobileClose }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currency, setCurrency, symbol } = useCurrency();
  const { lang, dir, setLang, canSwitch } = useLanguage();
  const { pages, canAccessPage, department, isDepartmentHead, loading } = usePageAccess();
  const { openTasksCount } = useInbox();
  const { t, i18n } = useTranslation('sidebar');
  const isDesktop = useIsDesktop();

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem(COLLAPSED_STORAGE_KEY) === 'true'; }
    catch { return false; }
  });
  const [closedGroups, setClosedGroups] = useState<Set<string>>(readClosedGroups);
  const [profile, setProfile] = useState<UserProfile | null>(null);

  const rail = collapsed && isDesktop;

  useEffect(() => {
    try { localStorage.setItem(COLLAPSED_STORAGE_KEY, String(collapsed)); }
    catch {}
  }, [collapsed]);

  useEffect(() => {
    try { localStorage.setItem(CLOSED_GROUPS_STORAGE_KEY, JSON.stringify(Array.from(closedGroups))); }
    catch {}
  }, [closedGroups]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, gender')
        .eq('id', user.id)
        .single();
      if (!cancelled && data) setProfile(data as UserProfile);
    })();
    return () => { cancelled = true; };
  }, []);

  const groups = useMemo(() => {
    const visible = pages.filter(p => canAccessPage(p.key));
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

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const pageLabel = (page: AppPage): string => {
    const key = NAV_LABEL_KEYS[page.key];
    if (key && i18n.exists(`sidebar:${key}`)) return t(key);
    return lang === 'ar' ? page.label_ar : page.label_en;
  };

  const departmentChip = department
    ? [department.label, isDepartmentHead ? t('departmentHead') : null].filter(Boolean).join(' · ')
    : null;

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
          'relative flex min-h-11 items-center rounded-lg text-sm no-underline transition-colors duration-150 lg:min-h-9',
          rail ? 'justify-center' : 'gap-2 px-3',
          isActive
            ? 'bg-[#4ba6ea]/10 font-semibold text-[#2e8fd4]'
            : 'font-medium text-gray-600 hover:bg-black/[0.04] hover:text-gray-900',
        )}
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <span className="absolute start-0 top-1/2 h-[18px] w-[3px] -translate-y-1/2 rounded-e-[3px] bg-[#4ba6ea]" />
            )}
            <span className={clsx('relative shrink-0', isActive ? 'text-[#4ba6ea]' : 'text-gray-400')}>
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
        'hc-sidebar fixed inset-y-0 start-0 z-[500] flex h-dvh w-72 max-w-[85vw] flex-col overflow-hidden',
        'border-e border-[var(--border-subtle)] bg-[var(--surface)]',
        'lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:max-w-none lg:shrink-0 lg:transition-[width] lg:duration-200 lg:ease-out',
        rail ? 'lg:w-[68px]' : 'lg:w-64',
      )}
    >
      {/* Brand */}
      <div className={clsx(
        'relative flex h-[68px] shrink-0 items-center border-b border-[var(--border-subtle)]',
        rail ? 'justify-center' : 'gap-3 px-4',
      )}>
        <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#4ba6ea] to-[#2e8fd4] shadow-sm">
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

        {/* Desktop: collapse to the rail. */}
        {!rail && (
          <button
            type="button"
            onClick={() => setCollapsed(true)}
            title={t('collapse')}
            aria-label={t('collapse')}
            className="hidden size-7 shrink-0 cursor-pointer items-center justify-center rounded-md border border-gray-200 bg-white text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-600 lg:flex"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path className="hc-flip-path" d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
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

      {/* Rail: expand back out. */}
      {rail && (
        <div className="flex shrink-0 justify-center pb-1 pt-2">
          <button
            type="button"
            onClick={() => setCollapsed(false)}
            title={t('expand')}
            aria-label={t('expand')}
            className="flex size-8 cursor-pointer items-center justify-center rounded-lg border border-gray-200 bg-white text-gray-400 transition-colors hover:border-gray-300 hover:text-gray-600"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path className="hc-flip-path" d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden p-2">
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

      {/* Currency selector + Profile + Sign out */}
      <div className="shrink-0 border-t border-[var(--border-subtle)] p-2">
        {/* Currency selector */}
        <div className="mb-2">
          {!rail && (
            <div className="mb-1 ps-1 text-[10px] font-bold uppercase text-gray-400">{t('currency.label')}</div>
          )}
          {rail ? (
            /* Rail: cycle through currencies on click */
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => {
                  const idx = CURRENCIES.indexOf(currency);
                  setCurrency(CURRENCIES[(idx + 1) % CURRENCIES.length]);
                }}
                title={t('currency.switchHint', { currency })}
                className={clsx(
                  'flex size-8 cursor-pointer items-center justify-center rounded-lg border-[1.5px] border-[#4ba6ea] bg-[#4ba6ea]/10 font-bold text-[#4ba6ea]',
                  currency === 'LYD' ? 'text-[8px]' : 'text-[10px]',
                )}
              >
                {symbol}
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-4 gap-1">
              {CURRENCIES.map((c: Currency) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setCurrency(c)}
                  className={clsx(
                    'h-9 cursor-pointer rounded-lg border-[1.5px] transition-colors lg:h-7',
                    c === 'LYD' ? 'text-[9px]' : 'text-[11px]',
                    currency === c
                      ? 'border-[#4ba6ea] bg-[#4ba6ea]/10 font-bold text-[#4ba6ea]'
                      : 'border-gray-200 bg-white font-medium text-gray-500 hover:border-gray-300',
                  )}
                >
                  {CURRENCY_SYMBOLS[c]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/*
          Language selector — same shape as the currency selector above it. Each
          language is labelled in its own script (EN / ع), never translated —
          someone looking for Arabic is looking for the Arabic word.
        */}
        {canSwitch && (
          <div className="mb-2">
            {!rail && (
              <div className="mb-1 ps-1 text-[10px] font-bold uppercase text-gray-400">{t('language.label')}</div>
            )}
            {rail ? (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
                  title={t('language.switchHint', { language: LANGUAGE_NAMES[lang] })}
                  className="flex size-8 cursor-pointer items-center justify-center rounded-lg border-[1.5px] border-[#4ba6ea] bg-[#4ba6ea]/10 text-[11px] font-bold text-[#4ba6ea]"
                >
                  {LANGUAGE_SHORT[lang]}
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-1">
                {LANGUAGES.map((l: Language) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLang(l)}
                    lang={l}
                    aria-pressed={lang === l}
                    title={LANGUAGE_NAMES[l]}
                    className={clsx(
                      'h-9 cursor-pointer rounded-lg border-[1.5px] text-[11px] transition-colors lg:h-7',
                      lang === l
                        ? 'border-[#4ba6ea] bg-[#4ba6ea]/10 font-bold text-[#4ba6ea]'
                        : 'border-gray-200 bg-white font-medium text-gray-500 hover:border-gray-300',
                    )}
                  >
                    {LANGUAGE_NAMES[l]}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Profile row */}
        <div
          title={rail ? [profile?.full_name, departmentChip].filter(Boolean).join(' — ') || undefined : undefined}
          className={clsx('mb-0.5 flex items-center rounded-lg py-2', rail ? 'justify-center' : 'gap-2 px-3')}
        >
          {profile ? (
            <StaffAvatar profile={profile} size={32} />
          ) : (
            <div className="size-8 shrink-0 rounded-full bg-[var(--border-subtle)]" />
          )}

          {!rail && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13px] font-semibold leading-snug text-[#0f1117]">
                {profile?.full_name || t('profileFallback')}
              </div>
              {departmentChip && (
                <span className="mt-0.5 inline-block max-w-full truncate rounded-full bg-black/[0.05] px-2 text-[11px] font-medium leading-[18px] text-gray-500">
                  {departmentChip}
                </span>
              )}
            </div>
          )}
        </div>

        {/* Sign out */}
        <button
          type="button"
          onClick={handleSignOut}
          title={rail ? t('signOut') : undefined}
          className={clsx(
            'flex min-h-11 w-full cursor-pointer items-center rounded-lg text-sm font-medium text-gray-400 transition-colors hover:bg-black/[0.04] hover:text-red-500 lg:min-h-9',
            rail ? 'justify-center' : 'gap-2 px-3',
          )}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="shrink-0" aria-hidden="true">
            <path className="hc-flip-path" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {!rail && t('signOut')}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
