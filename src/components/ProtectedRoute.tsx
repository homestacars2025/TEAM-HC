import React, { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Navigate } from 'react-router-dom';
import { hideBootSplash, showBootSplash } from '../lib/bootSplash';
import { supabase } from '../lib/supabase';
import ReactDOM from 'react-dom';
import { useTranslation } from 'react-i18next';
import { getLastUserId, getSessionStatus, hadSessionAtBoot, isRefreshTokenDead, signedOutOnPurpose, subscribeSessionStatus } from '../lib/sessionKeeper';
import SessionLayer from './SessionLayer';
import type { Session } from '@supabase/supabase-js';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

/**
 * Lets a signed-in person through. Only someone who was never signed in, or who
 * pressed Sign out, goes to the login page. A session that ends any other way keeps
 * the page where it is and asks for the password over it.
 */
/** Opened offline with an expired token: the splash stays, and the page comes once the token does. */
const BootReconnecting: React.FC = () => {
  const { t } = useTranslation('common');
  return ReactDOM.createPortal(
    <div role="status" className="hc-session-banner"><span className="hc-session-spinner" aria-hidden="true" />{t('session.reconnecting')}</div>,
    document.body,
  );
};

const BootSignIn: React.FC = () => {
  useLayoutEffect(hideBootSplash, []);
  return <SessionLayer signedOut userId={getLastUserId()} />;
};

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const lastUserId = useRef<string | null>(null);
  const [bootOffline, setBootOffline] = useState(false);
  const status = useSyncExternalStore(subscribeSessionStatus, getSessionStatus);

  // Already up on a page load. After signing in it needs to come back.
  useLayoutEffect(showBootSplash, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data, error }) => {
      setBootOffline(!data.session && !!error && !isRefreshTokenDead(error));
      setSession(data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (session) lastUserId.current = session.user.id;

  // The splash is on screen for this, so there is nothing to draw, unless the network
  // is holding it up: Supabase retries for up to 30 seconds before it answers.
  if (session === undefined) return status === 'reconnecting' ? <BootReconnecting /> : null;

  const wasSignedIn = lastUserId.current !== null;
  if (!session && signedOutOnPurpose()) return <Navigate to="/login" replace />;
  if (!session && !wasSignedIn) {
    if (!hadSessionAtBoot()) return <Navigate to="/login" replace />;
    // No network to refresh with yet: wait for it rather than ask for the password.
    if (bootOffline && status !== 'expired') return <BootReconnecting />;
    // Came back to a session Supabase no longer accepts: sign in here, on this page.
    return <BootSignIn />;
  }

  return (
    <>
      {children}
      <SessionLayer signedOut={!session} userId={lastUserId.current ?? getLastUserId()} />
    </>
  );
};

export default ProtectedRoute;
