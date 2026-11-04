import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { hideBootSplash, showBootSplash } from '../lib/bootSplash';
import { supabase } from '../lib/supabase';
import { getLastUserId, hadSessionAtBoot, signedOutOnPurpose } from '../lib/sessionKeeper';
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
const BootSignIn: React.FC = () => {
  useLayoutEffect(hideBootSplash, []);
  return <SessionLayer signedOut userId={getLastUserId()} />;
};

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);
  const lastUserId = useRef<string | null>(null);

  // Already up on a page load. After signing in it needs to come back.
  useLayoutEffect(showBootSplash, []);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (session) lastUserId.current = session.user.id;

  // The splash is on screen for this, so there is nothing to draw.
  if (session === undefined) return null;

  const wasSignedIn = lastUserId.current !== null;
  if (!session && signedOutOnPurpose()) return <Navigate to="/login" replace />;
  if (!session && !wasSignedIn) {
    if (!hadSessionAtBoot()) return <Navigate to="/login" replace />;
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
