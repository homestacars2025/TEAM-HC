import React from 'react';
import ReactDOM from 'react-dom';
import { Outlet } from 'react-router-dom';
import { Trans, useTranslation } from 'react-i18next';
import Sidebar from './Sidebar';
import TasksBell from './TasksBell';
import { InboxProvider } from '../lib/InboxContext';
import { useInactivityTimeout } from '../hooks/useInactivityTimeout';

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

        <button
          onClick={onStay}
          style={{
            width: '100%', height: 44, borderRadius: 11, border: 'none',
            background: '#4ba6ea', color: '#fff',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            fontFamily: 'inherit', transition: 'background 140ms ease',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLButtonElement).style.background = '#3b96da'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLButtonElement).style.background = '#4ba6ea'; }}
        >
          {t('inactivity.stay')}
        </button>
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

const Layout: React.FC = () => {
  const { showWarning, stayLoggedIn } = useInactivityTimeout();

  return (
    // Both badge counts are polled once here, for the bell and the sidebar alike.
    <InboxProvider>
    <div style={{ display: 'flex', height: '100vh', background: 'var(--surface-secondary)' }}>
      <Sidebar />

      {/*
        Content column. The top bar reserves its own strip of height rather than
        floating over the pages: several pages put an action button or a month
        switcher in their own top-right corner, and an overlaid bell would sit on
        top of them. `main` scrolls beneath it, so the bell stays put.
      */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/*
          One bell. kabis notifications now arrive through notifications_v2 like
          everything else, so the separate kabis bell has been removed — its
          unread rows are simply part of this badge now.
        */}
        <header className="app-topbar">
          <TasksBell />
        </header>
        <main style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
          <Outlet />
        </main>
      </div>

      {showWarning && <InactivityWarning onStay={stayLoggedIn} />}

      <style>{`
        .app-topbar {
          height: 52px;
          flex-shrink: 0;
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          padding: 0 16px;
          background: #fff;
          border-bottom: 1px solid #ebebeb;
          position: relative;
          z-index: 300;
        }
        /* Right padding tracks the page padding so the bell lines up with page content. */
        @media (min-width: 640px)  { .app-topbar { height: 56px; padding: 0 24px; } }
        @media (min-width: 1024px) { .app-topbar { padding: 0 40px; } }
      `}</style>
    </div>
    </InboxProvider>
  );
};

export default Layout;
