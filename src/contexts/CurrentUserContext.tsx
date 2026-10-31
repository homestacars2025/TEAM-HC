import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase';
import { useCurrency } from '../lib/CurrencyContext';
import { useLanguage } from '../lib/LanguageContext';
import type { StaffAvatarProfile } from '../lib/staffAvatar';
import { readBootCollapsed, readUserSettings, writeUserSettings, type UserSettings } from '../lib/userSettings';

/**
 * The signed-in person, for the shell and their own pages. Loaded once per sign-in
 * and updated in place after a save, so the top bar changes the moment the profile
 * page does.
 */

export interface CurrentProfile extends StaffAvatarProfile {
  full_name: string | null;
  phone: string | null;
  role: string | null;
}

interface CurrentUserValue {
  userId: string | null;
  email: string | null;
  profile: CurrentProfile | null;
  /** `null` until the session has been read. */
  settings: UserSettings | null;
  updateSettings: (patch: Partial<UserSettings>) => void;
  /** Mirrors a write that has already succeeded. */
  patchProfile: (patch: Partial<CurrentProfile>) => void;
}

const CurrentUserContext = createContext<CurrentUserValue>({
  userId: null,
  email: null,
  profile: null,
  settings: null,
  updateSettings: () => {},
  patchProfile: () => {},
});

export const CurrentUserProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { lang, setLang } = useLanguage();
  const { currency, setCurrency } = useCurrency();
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [profile, setProfile] = useState<CurrentProfile | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);

  // What was on screen before this person was known. Their first visit on this
  // device starts from it, so nobody loses a language they had already chosen.
  const boot = useRef({ lang, currency, setLang, setCurrency });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user || cancelled) return;

      setUserId(user.id);
      setEmail(user.email ?? null);

      const current = boot.current;
      const stored = readUserSettings(user.id, {
        lang: current.lang,
        currency: current.currency,
        notificationSound: false,
        startCollapsed: readBootCollapsed(),
      });
      writeUserSettings(user.id, stored);
      setSettings(stored);
      if (stored.lang !== current.lang) current.setLang(stored.lang);
      if (stored.currency !== current.currency) current.setCurrency(stored.currency);

      const { data } = await supabase
        .from('profiles')
        .select('full_name, avatar_url, gender, phone, role')
        .eq('id', user.id)
        .single();
      if (!cancelled && data) setProfile(data as CurrentProfile);
    })();
    return () => { cancelled = true; };
  }, []);

  const updateSettings = useCallback((patch: Partial<UserSettings>) => {
    if (!userId || !settings) return;
    const next = { ...settings, ...patch };
    writeUserSettings(userId, next);
    setSettings(next);
    if (patch.lang) setLang(patch.lang);
    if (patch.currency) setCurrency(patch.currency);
  }, [userId, settings, setLang, setCurrency]);

  const patchProfile = useCallback((patch: Partial<CurrentProfile>) => {
    setProfile(prev => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const value = useMemo(
    () => ({ userId, email, profile, settings, updateSettings, patchProfile }),
    [userId, email, profile, settings, updateSettings, patchProfile],
  );

  return <CurrentUserContext.Provider value={value}>{children}</CurrentUserContext.Provider>;
};

export const useCurrentUser = () => useContext(CurrentUserContext);
