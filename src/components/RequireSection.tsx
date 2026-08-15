import React, { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useSectionAccess } from '../lib/SectionAccessContext';

const REDIRECT_DELAY_MS = 1600;

/**
 * Route guard for a restricted section. Hiding the nav item is not access control —
 * this stops someone reaching the page by typing the URL.
 *
 * Reads the cached allowed-set from SectionAccessProvider, which is the same source the
 * Sidebar uses, so the menu and the routes can never disagree.
 */
const RequireSection: React.FC<{ section: string; children: React.ReactNode }> = ({ section, children }) => {
  const { loading, canAccess } = useSectionAccess();
  const [redirect, setRedirect] = useState(false);

  const denied = !loading && !canAccess(section);

  // Show the reason briefly, then send them home.
  useEffect(() => {
    if (!denied) return;
    const timer = window.setTimeout(() => setRedirect(true), REDIRECT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [denied]);

  if (redirect) return <Navigate to="/dashboard" replace />;

  if (loading) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fafafa', color: '#9ca3af', fontSize: 14,
      }}>
        Checking access…
      </div>
    );
  }

  if (denied) {
    return (
      <div style={{
        height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: '#fafafa', padding: 24,
      }}>
        <div style={{
          background: '#fff', borderRadius: 18, border: '1px solid #ebebeb',
          boxShadow: '0 1px 3px rgba(0,0,0,0.05)', padding: '32px 30px',
          textAlign: 'center', maxWidth: 380,
        }}>
          <div style={{
            width: 48, height: 48, borderRadius: 13, background: '#fef2f2',
            display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px',
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="4" y="10" width="16" height="10" rx="2" stroke="#ef4444" strokeWidth="1.8" />
              <path d="M8 10V7a4 4 0 018 0v3" stroke="#ef4444" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </div>
          <div style={{ fontSize: 16, fontWeight: 800, color: '#0f1117', marginBottom: 7, letterSpacing: '-0.3px' }}>
            No access to this section
          </div>
          <div style={{ fontSize: 13.5, color: '#6b7280', lineHeight: 1.6 }}>
            You have not been granted access. Ask an administrator if you need it.
          </div>
          <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 14 }}>
            Returning to the dashboard…
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
};

export default RequireSection;
