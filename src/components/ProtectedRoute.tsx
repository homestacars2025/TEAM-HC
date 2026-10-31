import React, { useEffect, useLayoutEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { showBootSplash } from '../lib/bootSplash';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';

interface ProtectedRouteProps {
  children: React.ReactNode;
}

const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children }) => {
  const [session, setSession] = useState<Session | null | undefined>(undefined);

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

  // The splash is on screen for this, so there is nothing to draw.
  if (session === undefined) return null;

  return session ? <>{children}</> : <Navigate to="/login" replace />;
};

export default ProtectedRoute;
