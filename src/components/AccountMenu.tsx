import React, { useEffect, useRef, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { supabase } from '../lib/supabase';
import { formatTRY } from '../lib/CurrencyContext';
import { holdingSummary } from '../lib/envelopes';
import { useMyEnvelopes } from '../hooks/useMyEnvelopes';
import { getMyCustodyBalance } from '../lib/queries/custody';
import { getMyWalletBalance } from '../lib/queries/staffWallet';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { usePageAccess } from '../contexts/PageAccessContext';
import StaffAvatar from './StaffAvatar';
import { pageIcons } from './pageNav';

const itemClass =
  'flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-3 text-sm font-medium text-gray-700 no-underline transition-colors hover:bg-black/[0.04] lg:min-h-10';

const Balance: React.FC<{ value: number | null }> = ({ value }) => (
  value === null ? null : (
    <bdi dir="ltr" className={`hc-num text-[13px] font-semibold ${value < 0 ? 'text-red-600' : 'text-gray-600'}`}>
      {value < 0 ? '−' : ''}{formatTRY(value)}
    </bdi>
  )
);

const AccountMenu: React.FC = () => {
  const { t } = useTranslation('shell');
  const { t: ts } = useTranslation('sidebar');
  const { t: tf } = useTranslation('finance');
  const navigate = useNavigate();
  const { userId, email, profile } = useCurrentUser();
  const { canAccessPage, department, isDepartmentHead } = usePageAccess();
  const [open, setOpen] = useState(false);
  const [walletBalance, setWalletBalance] = useState<number | null>(null);
  const [custodyBalance, setCustodyBalance] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const canOpenWallet = canAccessPage('wallet');
  const canOpenCustody = canAccessPage('custody');

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Read on each open: a new entry from accounting should show without a reload.
  useEffect(() => {
    if (!open || !userId) return;
    let cancelled = false;
    const read = (enabled: boolean, load: (id: string) => Promise<number>, set: (value: number | null) => void) => {
      if (!enabled) return;
      load(userId)
        .then(value => { if (!cancelled) set(value); })
        .catch(() => { if (!cancelled) set(null); });
    };
    read(canOpenWallet, getMyWalletBalance, setWalletBalance);
    read(canOpenCustody, getMyCustodyBalance, setCustodyBalance);
    return () => { cancelled = true; };
  }, [open, userId, canOpenWallet, canOpenCustody]);

  const { envelopes } = useMyEnvelopes(userId, open);
  const holding = useMemo(() => holdingSummary(envelopes ?? [], Date.now()), [envelopes]);

  const close = () => setOpen(false);

  const handleSignOut = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={t('menu.open')}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex size-11 cursor-pointer items-center justify-center rounded-full transition-opacity hover:opacity-85 lg:size-10"
      >
        {profile ? (
          <StaffAvatar profile={profile} size={36} />
        ) : (
          <span className="size-9 rounded-full bg-[var(--border-subtle)]" />
        )}
      </button>

      {open && (
        <div role="menu" className="surface-depth surface-float absolute end-0 top-[52px] z-[400] w-[288px] max-w-[calc(100vw-24px)] overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-[0_12px_40px_rgba(0,0,0,0.14)]">
          <div className="flex items-center gap-3 border-b border-[var(--border-subtle)] p-4">
            <StaffAvatar profile={profile} size={48} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-[#0f1117]">{profile?.full_name || ts('profileFallback')}</div>
              {department && (
                <div className="mt-1 flex flex-wrap items-center gap-1">
                  <span className="max-w-full truncate rounded-full bg-black/[0.05] px-2 text-[11px] font-medium leading-[18px] text-gray-600">
                    {department.label}
                  </span>
                  {isDepartmentHead && (
                    <span className="rounded-full bg-[var(--accent-soft)] px-2 text-[11px] font-semibold leading-[18px] text-[var(--accent-strong)]">
                      {ts('departmentHead')}
                    </span>
                  )}
                </div>
              )}
              {email && <div dir="ltr" className="mt-1 truncate text-start text-xs text-gray-500">{email}</div>}
            </div>
          </div>

          <div className="p-2">
            <Link to="/dashboard/profile" role="menuitem" onClick={close} className={itemClass}>
              <span className="text-gray-400">{pageIcons.profile}</span>
              {t('menu.profile')}
            </Link>
            {canOpenWallet && (
              <Link to="/dashboard/wallet" role="menuitem" onClick={close} className={itemClass}>
                <span className="text-gray-400">{pageIcons.wallet}</span>
                <span className="min-w-0 flex-1 truncate">{t('menu.wallet')}</span>
                <Balance value={walletBalance} />
              </Link>
            )}
            {canOpenCustody && (
              <Link to="/dashboard/custody" role="menuitem" onClick={close} className={itemClass}>
                <span className="text-gray-400">{pageIcons.custody}</span>
                <span className="min-w-0 flex-1 truncate">{t('menu.custody')}</span>
                <Balance value={custodyBalance} />
              </Link>
            )}
            {canOpenCustody && envelopes && holding.count > 0 && (
              <Link to="/dashboard/custody#envelopes" role="menuitem" onClick={close} className={itemClass}>
                <span className="text-gray-400">{pageIcons.custody}</span>
                <span className="min-w-0 flex-1 truncate">{tf('envelopes.title')}</span>
                <span className={`hc-num rounded-full px-2 text-[12px] font-semibold leading-5 ${holding.overdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-800'}`}>{holding.count}</span>
              </Link>
            )}
            <Link to="/dashboard/settings" role="menuitem" onClick={close} className={itemClass}>
              <span className="text-gray-400">{pageIcons.settings}</span>
              {t('menu.settings')}
            </Link>
          </div>

          <div className="border-t border-[var(--border-subtle)] p-2">
            <button
              type="button"
              role="menuitem"
              onClick={handleSignOut}
              className={`${itemClass} hover:text-red-600`}
            >
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" className="shrink-0 text-gray-400" aria-hidden="true">
                <path className="hc-flip-path" d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              {t('menu.signOut')}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountMenu;
