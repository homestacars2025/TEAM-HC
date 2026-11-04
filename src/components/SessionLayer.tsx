import React, { useId, useState, useSyncExternalStore } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { isAuthApiError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import { getLastEmail, getSessionStatus, sessionRestored, signOutOnPurpose, subscribeSessionStatus } from '../lib/sessionKeeper';
import Button from './Button';

/**
 * Drawn over the signed-in app (and over the boot splash, at 10000), which stays mounted underneath so nothing typed is
 * lost: a "Reconnecting…" banner while a refresh waits on the network, and the
 * sign-in dialog when Supabase has refused the session.
 */

const SignInDialog: React.FC<{ userId: string | null }> = ({ userId }) => {
  const { t } = useTranslation('common');
  const navigate = useNavigate();
  const titleId = useId();
  const known = getLastEmail();
  const [email, setEmail] = useState(known ?? '');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<'wrongPassword' | 'failed' | 'noAccess' | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy || !email || !password) return;
    setBusy(true);
    setError(null);
    const { data, error: authError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (authError || !data.user) {
      setError(isAuthApiError(authError) && authError.status === 400 ? 'wrongPassword' : 'failed');
      setBusy(false);
      return;
    }
    if (userId && data.user.id !== userId) {
      // Someone else: the page belongs to the last person, so it starts over for this one.
      const { data: profile } = await supabase.from('profiles').select('role').eq('id', data.user.id).single();
      if (profile?.role !== 'admin' && profile?.role !== 'staff') {
        await signOutOnPurpose();
        setError('noAccess');
        setBusy(false);
        return;
      }
      window.location.reload();
      return;
    }
    setPassword('');
    setBusy(false);
    sessionRestored();
  };

  const otherAccount = async () => {
    await signOutOnPurpose();
    navigate('/login', { replace: true });
  };

  return ReactDOM.createPortal(
    <div className="fixed inset-0 z-[10001] flex items-center justify-center bg-[rgba(15,17,23,0.45)] p-4 backdrop-blur-[2px]">
      <form role="dialog" aria-modal="true" aria-labelledby={titleId} noValidate onSubmit={submit} className="hc-cash-dialog hc-session-dialog surface-depth surface-float">
        <h2 id={titleId}>{t('session.title')}</h2>
        <p className="hc-session-body">{t('session.body')}</p>
        <label className="hc-cash-field">
          <span className="text-[13px] font-semibold text-gray-700">{t('session.email')}</span>
          <input type="email" dir="ltr" autoComplete="username" value={email} readOnly={!!known} disabled={busy} onChange={e => { setEmail(e.target.value); setError(null); }} className="hc-input !mt-0" />
        </label>
        <label className="hc-cash-field">
          <span className="text-[13px] font-semibold text-gray-700">{t('session.password')}</span>
          {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
          <input type="password" dir="ltr" autoFocus autoComplete="current-password" value={password} disabled={busy} aria-invalid={error === 'wrongPassword'} onChange={e => { setPassword(e.target.value); setError(null); }} className="hc-input !mt-0" />
        </label>
        {error && <p role="alert" className="hc-cash-miss">{t(`session.${error}`)}</p>}
        <div className="hc-session-actions">
          <button type="button" className="hc-hgs-link" onClick={otherAccount} disabled={busy}>{t('session.otherAccount')}</button>
          <Button type="submit" disabled={busy || !email || !password} aria-busy={busy}>{busy ? t('session.signingIn') : t('session.signIn')}</Button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

const SessionLayer: React.FC<{ signedOut: boolean; userId: string | null }> = ({ signedOut, userId }) => {
  const { t } = useTranslation('common');
  const status = useSyncExternalStore(subscribeSessionStatus, getSessionStatus);
  return (
    <>
      {status === 'reconnecting' && !signedOut && ReactDOM.createPortal(
        <div role="status" className="hc-session-banner"><span className="hc-session-spinner" aria-hidden="true" />{t('session.reconnecting')}</div>,
        document.body,
      )}
      {(status === 'expired' || signedOut) && <SignInDialog userId={userId} />}
    </>
  );
};

export default SessionLayer;
