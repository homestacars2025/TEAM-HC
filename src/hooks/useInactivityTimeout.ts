import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';

const TIMEOUT_MS  = 5 * 60 * 1000;       // 5 minutes
const WARNING_MS  = 4.5 * 60 * 1000;     // 4 min 30 sec — show warning
const EVENTS      = ['mousemove', 'mousedown', 'keypress', 'scroll', 'touchstart'] as const;

export function useInactivityTimeout() {
  const navigate     = useNavigate();
  const logoutTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showWarning, setShowWarning] = useState(false);

  const clearTimers = () => {
    if (logoutTimer.current)  clearTimeout(logoutTimer.current);
    if (warningTimer.current) clearTimeout(warningTimer.current);
  };

  const logout = useCallback(async () => {
    clearTimers();
    setShowWarning(false);
    await supabase.auth.signOut();
    navigate('/login', { replace: true });
  }, [navigate]);

  const resetTimer = useCallback(() => {
    clearTimers();
    setShowWarning(false);

    warningTimer.current = setTimeout(() => {
      setShowWarning(true);
    }, WARNING_MS);

    logoutTimer.current = setTimeout(() => {
      logout();
    }, TIMEOUT_MS);
  }, [logout]);

  // Start timers only when a session exists
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active || !session) return;

      // Attach activity listeners
      EVENTS.forEach(ev => window.addEventListener(ev, resetTimer, { passive: true }));
      resetTimer(); // start the clock
    });

    return () => {
      active = false;
      clearTimers();
      EVENTS.forEach(ev => window.removeEventListener(ev, resetTimer));
    };
  }, [resetTimer]);

  const stayLoggedIn = useCallback(() => {
    resetTimer();
  }, [resetTimer]);

  return { showWarning, stayLoggedIn };
}
