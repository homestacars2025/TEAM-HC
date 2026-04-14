import React, { useEffect, useState } from 'react';
import { NavLink, useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useCurrency, CURRENCIES, CURRENCY_SYMBOLS, type Currency } from '../lib/CurrencyContext';

const mainItems = [
  {
    label: 'Bookings',
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
    label: 'Calendar',
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

const fleetItems = [
  {
    label: 'Cars',
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
    label: 'Model Groups',
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

const managementItems = [
  {
    label: 'Users',
    path: '/dashboard/users',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="7" r="4" stroke="currentColor" strokeWidth="1.8"/>
        <path d="M3 21v-2a4 4 0 014-4h4a4 4 0 014 4v2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M16 3.13a4 4 0 010 7.75M21 21v-2a4 4 0 00-3-3.87" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Investors',
    path: '/dashboard/investors',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <line x1="12" y1="1" x2="12" y2="23" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const financeItems = [
  {
    label: 'Accounting',
    path: '/dashboard/accounting',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <path d="M3 3v18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M18 9l-5 5-3-3-4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

const operationsItems = [
  {
    label: 'KGM Tolls',
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
    label: 'Fines',
    path: '/dashboard/fines',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M12 12v4M12 10h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    label: 'Pricing',
    path: '/dashboard/pricing',
    icon: (
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
        <path d="M12 1v22M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
];

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

  const renderNavItems = (items: typeof mainItems) =>
    items.map(item => (
      <NavLink
        key={item.path}
        to={item.path}
        title={collapsed ? item.label : undefined}
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
                left: 0,
                top: '50%',
                transform: 'translateY(-50%)',
                width: 3,
                height: 18,
                borderRadius: '0 3px 3px 0',
                background: '#4ba6ea',
              }} />
            )}
            <span style={{ color: isActive ? '#4ba6ea' : '#9ca3af', flexShrink: 0 }}>
              {item.icon}
            </span>
            {!collapsed && item.label}
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
      borderRight: '1px solid #ebebeb',
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
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
            <path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <rect x="9" y="11" width="14" height="10" rx="2" stroke="white" strokeWidth="2"/>
            <circle cx="12" cy="16" r="1" fill="white"/>
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
              Admin
            </div>
          </div>
        )}

        {/* Collapse button — visible only when expanded */}
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            title="Collapse sidebar"
            style={{
              position: 'absolute',
              right: 12,
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
              <path d="M15 18l-6-6 6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
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
            title="Expand sidebar"
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
              <path d="M9 18l6-6-6-6" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
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
            Main
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
            Fleet
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
                  position: 'absolute', left: 0, top: '50%', transform: 'translateY(-50%)',
                  width: 3, height: 14, borderRadius: '0 3px 3px 0', background: '#4ba6ea',
                }} />
              )}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0, color: isActive ? '#4ba6ea' : '#9ca3af' }}>
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              Car Tracking
            </NavLink>
          );
        })()}
        {renderNavItems(fleetItems.slice(1))}

        {/* Management section */}
        {!collapsed ? (
          <div style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: '#c0c4cc',
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            padding: '16px 10px 8px',
          }}>
            Management
          </div>
        ) : (
          <div style={{ height: 1, background: '#ebebeb', margin: '10px 4px' }} />
        )}
        {renderNavItems(managementItems)}

        {/* Finance section */}
        {!collapsed ? (
          <div style={{
            fontSize: 10.5,
            fontWeight: 700,
            color: '#c0c4cc',
            letterSpacing: '0.8px',
            textTransform: 'uppercase',
            padding: '16px 10px 8px',
          }}>
            Finance
          </div>
        ) : (
          <div style={{ height: 1, background: '#ebebeb', margin: '10px 4px' }} />
        )}
        {renderNavItems(financeItems)}

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
            Operations
          </div>
        ) : (
          <div style={{ height: 1, background: '#ebebeb', margin: '10px 4px' }} />
        )}
        {renderNavItems(operationsItems)}
      </nav>

      {/* Currency selector + Profile + Sign out */}
      <div style={{ padding: '12px', borderTop: '1px solid #ebebeb', flexShrink: 0 }}>

        {/* Currency selector */}
        <div style={{ marginBottom: 8 }}>
          {!collapsed && (
            <div style={{
              fontSize: 10, fontWeight: 700, color: '#c0c4cc',
              textTransform: 'uppercase', letterSpacing: '0.7px',
              marginBottom: 6, paddingLeft: 2,
            }}>
              Currency
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
                title={`Currency: ${currency} — click to switch`}
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
                {profile?.full_name || 'User'}
              </div>
            </div>
          )}
        </div>

        {/* Sign out */}
        <button
          onClick={handleSignOut}
          title={collapsed ? 'Sign out' : undefined}
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
            textAlign: 'left',
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
            <path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {!collapsed && 'Sign out'}
        </button>
      </div>
    </aside>
  );
};

export default Sidebar;
