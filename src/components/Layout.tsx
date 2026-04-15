import React from 'react';
import ReactDOM from 'react-dom';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useInactivityTimeout } from '../hooks/useInactivityTimeout';

// ─── Inactivity Warning Modal ─────────────────────────────────────────────────

const InactivityWarning: React.FC<{ onStay: () => void }> = ({ onStay }) =>
  ReactDOM.createPortal(
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
          Still there?
        </div>
        <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.6, marginBottom: 24 }}>
          You will be logged out in <strong style={{ color: '#0f1117' }}>30 seconds</strong> due to inactivity.
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
          Stay logged in
        </button>
      </div>

      <style>{`
        @keyframes iaFadeIn   { from{opacity:0} to{opacity:1} }
        @keyframes iaSlideUp  { from{transform:translateY(12px);opacity:0} to{transform:translateY(0);opacity:1} }
      `}</style>
    </div>,
    document.body,
  );

// ─── Layout ───────────────────────────────────────────────────────────────────

const Layout: React.FC = () => {
  const { showWarning, stayLoggedIn } = useInactivityTimeout();

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--surface-secondary)' }}>
      <Sidebar />
      <main style={{ flex: 1, overflowY: 'auto' }}>
        <Outlet />
      </main>
      {showWarning && <InactivityWarning onStay={stayLoggedIn} />}
    </div>
  );
};

export default Layout;
