import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCurrency, CURRENCIES, CURRENCY_SYMBOLS, type Currency } from '../lib/CurrencyContext';
import { useLanguage, LANGUAGES, LANGUAGE_SHORT, LANGUAGE_NAMES, type Language } from '../lib/LanguageContext';
import { useSectionAccess } from '../lib/SectionAccessContext';
import { useInbox } from '../lib/InboxContext';
import { useTranslation } from 'react-i18next';

/**
 * `sectionKey` ties a nav item to a row in `restricted_sections`. Items without one are
 * public and always render.
 */
interface NavItem {
  /** Key into the `sidebar` namespace, resolved at render. */
  labelKey: string;
  path: string;
  icon: React.ReactNode;
  sectionKey?: string;
  /** Renders the open-task count from `InboxContext` beside the label. */
  showTaskCount?: boolean;
}

const mainItems: NavItem[] = [
  {
    labelKey: 'nav.tasks',
    path: '/dashboard/tasks',
    showTaskCount: true,
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M8.5 13l2.2 2.2 4.8-4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    labelKey: 'nav.bookings',
    path: '/dashboard/bookings',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    labelKey: 'nav.calendar',
    path: '/dashboard/calendar',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <rect x="7" y="14" width="4" height="4" rx="1" fill="currentColor" opacity="0.6"/>
        <rect x="13" y="14" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
    ),
  },
];

const fleetItems: NavItem[] = [
  {
    labelKey: 'nav.cars',
    path: '/dashboard/cars',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <rect x="9" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <circle cx="12" cy="16" r="1.2" fill="currentColor"/>
        <circle cx="20" cy="16" r="1.2" fill="currentColor"/>
      </svg>
    ),
  },
  {
    labelKey: 'nav.carIssues',
    path: '/dashboard/car-issues',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    labelKey: 'nav.modelGroups',
    path: '/dashboard/model-groups',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
      </svg>
    ),
  },
];

const operationsItems: NavItem[] = [
  {
    labelKey: 'nav.operations',
    path: '/dashboard/operations',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    labelKey: 'nav.kgm',
    path: '/dashboard/kgm',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M2 10h20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M6 14h2M10 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    labelKey: 'nav.fines',
    path: '/dashboard/fines',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 12v4M12 10h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const customerWalletsItem: NavItem = {
  labelKey: 'nav.customerWallets',
  path: '/dashboard/customer-wallets',
  icon: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M3 7a2 2 0 012-2h12a2 2 0 012 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M16 12h5v4h-5a2 2 0 010-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    </svg>
  ),
};

const kabisItem: NavItem = {
  labelKey: 'nav.kabis',
  path: '/dashboard/kabis',
  sectionKey: 'kabis',
  icon: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <path d="M5 3h9l5 5v13a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
      <path d="M8.5 14.5l2 2 4.5-4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
};

/**
 * Every Media item is restricted, so the group header is rendered behind the same
 * `media` grant — otherwise an ungranted user would see an empty MEDIA heading.
 */
const mediaItems: NavItem[] = [
  {
    labelKey: 'nav.ideas',
    path: '/dashboard/media/ideas',
    sectionKey: 'media',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <path d="M15 14c.2-1 .7-1.7 1.5-2.5A5.7 5.7 0 0018 8 6 6 0 006 8c0 1 .2 2.2 1.5 3.5.8.8 1.3 1.5 1.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 18h6M10 22h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    labelKey: 'nav.mediaCalendar',
    path: '/dashboard/media/calendar',
    sectionKey: 'media',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M17 14h-6M13 18H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    labelKey: 'nav.influencers',
    path: '/dashboard/media/influencers',
    sectionKey: 'media',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <path d="M3 11l18-5v12L3 14v-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
        <path d="M11.6 16.8a3 3 0 11-5.8-1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
];

const accountingItem: NavItem = {
  labelKey: 'nav.accounting',
  path: '/dashboard/accounting',
  sectionKey: 'accounting',
  icon: (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
      <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.8"/>
      <path d="M8 7h8M8 11h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <path d="M8 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      <circle cx="16" cy="16" r="1.1" fill="currentColor"/>
    </svg>
  ),
};

interface UserProfile {
  full_name: string | null;
  avatar_url: string | null;
}

const EXPANDED_W = 256;
const COLLAPSED_W = 68;

const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { currency, setCurrency, symbol } = useCurrency();
  const { lang, setLang, canSwitch } = useLanguage();
  const { canAccess } = useSectionAccess();
  const { openTasksCount } = useInbox();
  const { t } = useTranslation('sidebar');

  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try { return localStorage.getItem('sidebar_collapsed') === 'true'; }
    catch { return false; }
  });

  const [profile, setProfile] = useState<UserProfile | null>(null);

  useEffect(() => {
    try { localStorage.setItem('sidebar_collapsed', String(collapsed)); }
    catch {}
  }, [collapsed]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || cancelled) return;
      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url')
        .eq('id', user.id)
        .single();
      if (!cancelled && data) setProfile(data as UserProfile);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  const initials = profile?.full_name
    ? profile.full_name.trim().split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';

  const W = collapsed ? COLLAPSED_W : EXPANDED_W;

  const renderNavItems = (items: NavItem[]) =>
    items
      .filter(item => !item.sectionKey || canAccess(item.sectionKey))
      .map(item => (
      <NavLink
        key={item.path}
        to={item.path}
        title={collapsed ? t(item.labelKey) : undefined}
        style={({ isActive }) => ({
          display: 'flex',
          alignItems: 'center',
          gap: collapsed ? 0 : 10,
          justifyContent: collapsed ? 'center' : 'flex-start',
          padding: collapsed ? '9px 0' : '9px 12px',
          borderRadius: 9,
          textDecoration: 'none',
          fontSize: 14,
          fontWeight: isActive ? 600 : 450,
          color: isActive ? '#4ba6ea' : '#4b5563',
          background: isActive
            ? 'linear-gradient(135deg, rgba(75,166,234,0.1) 0%, rgba(75,166,234,0.06) 100%)'
            : 'transparent',
          transition: 'all 140ms ease',
          position: 'relative',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
        })}
      >
        {({ isActive }) => (
          <>
            {isActive && (
              <div style={{
                position: 'absolute',
                insetInlineStart: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 3,
                height: 18,
                // Logical radii: the rail is square against the wall it sits on
                // and rounded on the exposed side, whichever side that becomes.
                borderStartStartRadius: 0,
                borderStartEndRadius: 3,
                borderEndEndRadius: 3,
                borderEndStartRadius: 0,
                background: '#4ba6ea',
              }} />
            )}
            <span style={{ color: isActive ? '#4ba6ea' : '#9ca3af', flexShrink: 0, position: 'relative' }}>
              {item.icon}
              {/* Collapsed: the count has nowhere to sit, so it shrinks to a dot
                  on the icon — still a signal, without reflowing the rail. */}
              {item.showTaskCount && collapsed && openTasksCount > 0 && (
                <span
                  aria-hidden
                  style={{
                    position: 'absolute', top: -3, insetInlineEnd: -3,
                    width: 8, height: 8, borderRadius: '50%',
                    background: '#ef4444', boxShadow: '0 0 0 2px #fafafa',
                  }}
                />
              )}
            </span>
            {!collapsed && t(item.labelKey)}
            {item.showTaskCount && !collapsed && openTasksCount > 0 && (
              <span
                aria-label={t('openTasks', { count: openTasksCount })}
                style={{
                  marginInlineStart: 'auto',
                  minWidth: 20, height: 20, padding: '0 6px',
                  borderRadius: 10, background: '#ef4444', color: '#fff',
                  fontSize: 11, fontWeight: 800, lineHeight: '20px',
                  textAlign: 'center', flexShrink: 0,
                }}
              >
                {openTasksCount > 99 ? '99+' : openTasksCount}
              </span>
            )}
          </>
        )}
      </NavLink>
    ));

  return (
    <aside style={{
      width: W,
      minWidth: W,
      height: '100vh',
      background: '#fafafa',
      borderInlineEnd: '1px solid #ebebeb',
      display: 'flex',
      flexDirection: 'column',
      position: 'sticky',
      top: 0,
      transition: 'width 220ms ease, min-width 220ms ease',
      overflow: 'hidden',
    }}>

      {/* Brand */}
      <div style={{
        height: 68,
        display: 'flex',
        alignItems: 'center',
        justifyContent: collapsed ? 'center' : 'flex-start',
        gap: collapsed ? 0 : 11,
        padding: collapsed ? '0' : '0 22px',
        borderBottom: '1px solid #ebebeb',
        flexShrink: 0,
        position: 'relative',
      }}>
        {/* Logo */}
        <div style={{
          width: 34,
          height: 34,
          background: 'linear-gradient(135deg, #4ba6ea 0%, #2e8fd4 100%)',
          borderRadius: 9,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 2px 8px rgba(75,166,234,0.35)',
        }}>
          <svg width="18" height="18" viewBox="0 0 120 120" fill="none" stroke="white" strokeWidth="14" strokeLinecap="round">
            <path d="M22 100 L 22 60 A 38 38 0 0 1 98 60 L 98 100"/>
          </svg>
        </div>

        {/* Brand text — expanded only */}
        {!collapsed && (
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontWeight: 700,
              fontSize: 14,
              letterSpacing: '-0.4px',
              color: '#0f1117',
              lineHeight: 1.25,
            }}>
              HomestaCars
            </div>
            <div style={{ fontSize: 11, color: '#9ca3af', letterSpacing: '0.1px', marginTop: 1 }}>
              {t('brandSubtitle')}
            </div>
          </div>
        )}

        {/* Collapse button — visible only when expanded */}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            title={t('collapse')}
            style={{
              position: 'absolute',
              insetInlineEnd: 12,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 26,
              height: 26,
              borderRadius: 6,
              border: '1px solid #e5e7eb',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
              flexShrink: 0,
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db';
              (e.currentTarget as HTMLButtonElement).style.color = '#6b7280';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
              (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af';
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path className="hc-flip-path" d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        )}
      </div>

      {/* Expand button — visible only when collapsed */}
      {collapsed && (
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          padding: '10px 0 6px',
          flexShrink: 0,
        }}>
          <button
            onClick={() => setCollapsed(false)}
            title={t('expand')}
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              border: '1px solid #e5e7eb',
              background: 'white',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#9ca3af',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#d1d5db';
              (e.currentTarget as HTMLButtonElement).style.color = '#6b7280';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = '#e5e7eb';
              (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af';
            }}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
              <path className="hc-flip-path" d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </button>
        </div>
      )}

      {/* Nav */}
      <nav style={{ flex: 1, padding: collapsed ? '12px 8px' : '16px 12px', overflowY: 'auto' }}>

        {/* Main section */}
        {!collapsed ? (
          <div style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: '#c0c4cc',
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            padding: '0 10px 8px',
          }}>
            {t('sections.main')}
          </div>
        ) : null}
        {renderNavItems(mainItems)}

        {/* Fleet section */}
        {!collapsed ? (
          <div style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: '#c0c4cc',
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            padding: '16px 10px 8px',
          }}>
            {t('sections.fleet')}
          </div>
        ) : (
          <div style={{ height: 1, background: '#ebebeb', margin: '10px 4px' }} />
        )}
        {renderNavItems([fleetItems[0]])}
        {!collapsed && (() => {
          const isActive = location.pathname === '/dashboard/cars/tracking';
          return (
            <NavLink
              to="/dashboard/cars/tracking"
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '7px 12px 7px 38px',
                borderRadius: 9, textDecoration: 'none',
                fontSize: 13, fontWeight: isActive ? 600 : 450,
                color: isActive ? '#4ba6ea' : '#6b7280',
                background: isActive
                  ? 'linear-gradient(135deg, rgba(75,166,234,0.1) 0%, rgba(75,166,234,0.06) 100%)'
                  : 'transparent',
                transition: 'all 140ms ease',
                position: 'relative',
                whiteSpace: 'nowrap', overflow: 'hidden',
              }}
            >
              {isActive && (
                <div style={{
                  position: 'absolute', insetInlineStart: 0, top: '50%', transform: 'translateY(-50%)',
                  width: 3, height: 14, background: '#4ba6ea',
                  borderStartStartRadius: 0, borderStartEndRadius: 3,
                  borderEndEndRadius: 3, borderEndStartRadius: 0,
                }} />
              )}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: isActive ? '#4ba6ea' : '#9ca3af' }}>
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              {t('nav.carTracking')}
            </NavLink>
          );
        })()}
        {renderNavItems(fleetItems.slice(1))}

        {/* Operations section */}
        {!collapsed ? (
          <div style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: '#c0c4cc',
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            padding: '16px 10px 8px',
          }}>
            {t('sections.operations')}
          </div>
        ) : (
          <div style={{ height: 1, background: '#ebebeb', margin: '10px 4px' }} />
        )}
        {renderNavItems([...operationsItems, customerWalletsItem, kabisItem, accountingItem])}

        {/* Media section — only for users granted the `media` section */}
        {canAccess('media') && (
          <>
            {!collapsed ? (
              <div style={{
                fontSize: 10.5,
                fontWeight: 700,
                color: '#c0c4cc',
                letterSpacing: '0.8px',
                textTransform: 'uppercase',
                padding: '16px 10px 8px',
              }}>
                {t('sections.media')}
              </div>
            ) : (
              <div style={{ height: 1, background: '#ebebeb', margin: '10px 4px' }} />
            )}
            {renderNavItems(mediaItems)}
          </>
        )}
      </nav>

      {/* Currency selector + Profile + Sign out */}
      <div style={{ padding: '12px', borderTop: '1px solid #ebebeb', flexShrink: 0 }}>

        {/* Currency selector */}
        <div style={{ marginBottom: 8 }}>
          {!collapsed && (
            <div style={{
              fontSize: 10, fontWeight: 700, color: '#c0c4cc',
              textTransform: 'uppercase', letterSpacing: '0.7px',
              marginBottom: 6, paddingInlineStart: 2,
            }}>
              {t('currency.label')}
            </div>
          )}
          {collapsed ? (
            /* Collapsed: cycle through currencies on click */
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <button
                onClick={() => {
                  const idx = CURRENCIES.indexOf(currency);
                  setCurrency(CURRENCIES[(idx + 1) % CURRENCIES.length]);
                }}
                title={t('currency.switchHint', { currency })}
                style={{
                  width: 32, height: 32, borderRadius: 8,
                  border: '1.5px solid #4ba6ea',
                  background: 'rgba(75,166,234,0.08)',
                  color: '#4ba6ea',
                  fontSize: currency === 'LYD' ? 8 : 10,
                  fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}
              >
                {symbol}
              </button>
            </div>
          ) : (
            /* Expanded: 4 chip buttons in a row */
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4 }}>
              {CURRENCIES.map((c: Currency) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  style={{
                    height: 28, borderRadius: 7,
                    border: currency === c ? '1.5px solid #4ba6ea' : '1.5px solid #e5e7eb',
                    background: currency === c ? 'rgba(75,166,234,0.08)' : '#fff',
                    color: currency === c ? '#4ba6ea' : '#6b7280',
                    fontSize: c === 'LYD' ? 9 : 11,
                    fontWeight: currency === c ? 700 : 500,
                    cursor: 'pointer', fontFamily: 'inherit',
                    transition: 'all 140ms ease',
                    letterSpacing: c === 'LYD' ? '-0.2px' : '0',
                  }}
                >
                  {CURRENCY_SYMBOLS[c]}
                </button>
              ))}
            </div>
          )}
        </div>

        {/*
          Language selector — same shape as the currency selector above it, so the
          two read as one settings block. Hidden entirely behind the flag rather
          than disabled: an option nobody can take is just noise, and while it is
          hidden nothing here renders, which is what keeps English untouched.

          Each language is labelled in its own script (EN / ع), never translated —
          someone looking for Arabic is looking for the Arabic word.
        */}
        {canSwitch && (
          <div style={{ marginBottom: 8 }}>
            {!collapsed && (
              <div style={{
                fontSize: 10, fontWeight: 700, color: '#c0c4cc',
                textTransform: 'uppercase', letterSpacing: '0.7px',
                marginBottom: 6, paddingInlineStart: 2,
              }}>
              {t('language.label')}
              </div>
            )}
            {collapsed ? (
              <div style={{ display: 'flex', justifyContent: 'center' }}>
                <button
                  onClick={() => setLang(lang === 'en' ? 'ar' : 'en')}
                  title={t('language.switchHint', { language: LANGUAGE_NAMES[lang] })}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    border: '1.5px solid #4ba6ea',
                    background: 'rgba(75,166,234,0.08)',
                    color: '#4ba6ea',
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    fontFamily: 'inherit',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                >
                  {LANGUAGE_SHORT[lang]}
                </button>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 4 }}>
                {LANGUAGES.map((l: Language) => (
                  <button
                    key={l}
                    onClick={() => setLang(l)}
                    lang={l}
                    aria-pressed={lang === l}
                    title={LANGUAGE_NAMES[l]}
                    style={{
                      height: 28, borderRadius: 7,
                      border: lang === l ? '1.5px solid #4ba6ea' : '1.5px solid #e5e7eb',
                      background: lang === l ? 'rgba(75,166,234,0.08)' : '#fff',
                      color: lang === l ? '#4ba6ea' : '#6b7280',
                      fontSize: 11,
                      fontWeight: lang === l ? 700 : 500,
                      cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'all 140ms ease',
                    }}
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
          title={collapsed && profile?.full_name ? profile.full_name : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: collapsed ? 0 : 10,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '8px 0' : '8px 12px',
            borderRadius: 9,
            marginBottom: 2,
          }}
        >
          {/* Avatar or initials */}
          {profile?.avatar_url ? (
            <img
              src={profile.avatar_url}
              alt=""
              style={{
                width: 32,
                height: 32,
                borderRadius: '50%',
                objectFit: 'cover',
                flexShrink: 0,
              }}
            />
          ) : (
            <div style={{
              width: 32,
              height: 32,
              borderRadius: '50%',
              background: 'linear-gradient(135deg, #4ba6ea 0%, #2e8fd4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: 11, fontWeight: 700, color: 'white', lineHeight: 1 }}>
                {initials}
              </span>
            </div>
          )}

          {/* Name — expanded only */}
          {!collapsed && (
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{
                fontSize: 13,
                fontWeight: 600,
                color: '#0f1117',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                lineHeight: 1.3,
              }}>
                {profile?.full_name || t('profileFallback')}
              </div>
            </div>
          )}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          title={collapsed ? t('signOut') : undefined}
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            gap: collapsed ? 0 : 10,
            justifyContent: collapsed ? 'center' : 'flex-start',
            padding: collapsed ? '9px 0' : '9px 12px',
            borderRadius: 9,
            border: 'none',
            background: 'none',
            fontSize: 14,
            fontWeight: 450,
            color: '#9ca3af',
            cursor: 'pointer',
            textAlign: 'start',
            fontFamily: 'inherit',
            transition: 'all 140ms ease',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
          }}
          onMouseEnter={e => {
            (e.currentTarget as HTMLButtonElement).style.background = '#f3f4f6';
            (e.currentTarget as HTMLButtonElement).style.color = '#ef4444';
          }}
          onMouseLeave={e => {
            (e.currentTarget as HTMLButtonElement).style.background = 'none';
            (e.currentTarget as HTMLButtonElement).style.color = '#9ca3af';
          }}
        >
          <svg width="17" height="17" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
            <path className="hc-flip-path" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {!collapsed && t('signOut')}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
