import React, { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '../lib/LanguageContext';
import type { AppPage } from '../contexts/PageAccessContext';

/**
 * What a database row in `app_pages` cannot carry: the icon, and a translation key
 * when one exists. Shared by the sidebar and the command palette, so a page reads
 * the same in both.
 */

const icon = (children: React.ReactNode) => (
  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">{children}</svg>
);

export const pageIcons: Record<string, React.ReactNode> = {
  home: icon(<>
    <path d="M3 10.5L12 3l9 7.5V20a1.5 1.5 0 01-1.5 1.5h-15A1.5 1.5 0 013 20v-9.5z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M9.5 21.5V14h5v7.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
  </>),
  wallet: icon(<>
    <path d="M3 7.5A2.5 2.5 0 015.5 5H17a2 2 0 012 2v1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <rect x="3" y="8" width="18" height="12.5" rx="2.5" stroke="currentColor" strokeWidth="1.8"/>
    <circle cx="16.5" cy="14.25" r="1.2" fill="currentColor"/>
  </>),
  custody: icon(<>
    <path d="M12 2.8l7.5 2.9v5.6c0 4.6-3.1 8.4-7.5 9.9-4.4-1.5-7.5-5.3-7.5-9.9V5.7L12 2.8z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M12 7.5v8M14.3 9.4c-.5-.7-1.3-1.1-2.3-1.1-1.3 0-2.3.7-2.3 1.7 0 2.3 4.6 1.2 4.6 3.5 0 1-1 1.7-2.3 1.7-1 0-1.8-.4-2.3-1.1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </>),
  profile: icon(<>
    <circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M4.5 20.5c1.2-3.6 4-5.5 7.5-5.5s6.3 1.9 7.5 5.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </>),
  settings: icon(<>
    <path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="16" cy="7" r="2.2" stroke="currentColor" strokeWidth="1.8"/>
    <circle cx="8" cy="17" r="2.2" stroke="currentColor" strokeWidth="1.8"/>
  </>),
  tasks: icon(<>
    <rect x="3" y="4" width="18" height="17" rx="2.5" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M8 2v4M16 2v4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M8.5 13l2.2 2.2 4.8-4.8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </>),
  bookings: icon(<>
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
  </>),
  calendar: icon(<>
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <rect x="7" y="14" width="4" height="4" rx="1" fill="currentColor" opacity="0.6"/>
    <rect x="13" y="14" width="4" height="4" rx="1" stroke="currentColor" strokeWidth="1.5"/>
  </>),
  cars: icon(<>
    <path d="M5 17H3a2 2 0 01-2-2V7a2 2 0 012-2h11a2 2 0 012 2v3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <rect x="9" y="11" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <circle cx="12" cy="16" r="1.2" fill="currentColor"/>
    <circle cx="20" cy="16" r="1.2" fill="currentColor"/>
  </>),
  car_tracking: icon(<>
    <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.93 4.93l2.12 2.12M16.95 16.95l2.12 2.12M4.93 19.07l2.12-2.12M16.95 7.05l2.12-2.12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
  </>),
  car_issues: icon(<>
    <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M12 9v4M12 17h.01" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round"/>
  </>),
  model_groups: icon(<>
    <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
    <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
  </>),
  operations: icon(
    <path d="M14.7 6.3a1 1 0 000 1.4l1.6 1.6a1 1 0 001.4 0l3.77-3.77a6 6 0 01-7.94 7.94l-6.91 6.91a2.12 2.12 0 01-3-3l6.91-6.91a6 6 0 017.94-7.94l-3.76 3.76z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
  ),
  kgm: icon(<>
    <rect x="2" y="6" width="20" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M2 10h20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M6 14h2M10 14h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </>),
  fines: icon(<>
    <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 12v4M12 10h.01" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </>),
  customer_wallets: icon(<>
    <path d="M3 7a2 2 0 012-2h12a2 2 0 012 2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <rect x="3" y="7" width="18" height="13" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M16 12h5v4h-5a2 2 0 010-4z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
  </>),
  kabis: icon(<>
    <path d="M5 3h9l5 5v13a1 1 0 01-1 1H5a1 1 0 01-1-1V4a1 1 0 011-1z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M14 3v5h5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M8.5 14.5l2 2 4.5-4.5" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"/>
  </>),
  accounting: icon(<>
    <rect x="4" y="2" width="16" height="20" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M8 7h8M8 11h8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M8 15h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="16" cy="16" r="1.1" fill="currentColor"/>
  </>),
  suppliers: icon(<>
    <path d="M3 17V6a1 1 0 011-1h10a1 1 0 011 1v11M15 9h3.5L21 12.5V17h-2" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3 17h2M9 17h6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <circle cx="7" cy="17.5" r="2" stroke="currentColor" strokeWidth="1.8"/>
    <circle cx="17" cy="17.5" r="2" stroke="currentColor" strokeWidth="1.8"/>
  </>),
  media_ideas: icon(<>
    <path d="M15 14c.2-1 .7-1.7 1.5-2.5A5.7 5.7 0 0018 8 6 6 0 006 8c0 1 .2 2.2 1.5 3.5.8.8 1.3 1.5 1.5 2.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M9 18h6M10 22h4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </>),
  media_calendar: icon(<>
    <rect x="3" y="4" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.8"/>
    <path d="M16 2v4M8 2v4M3 10h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    <path d="M17 14h-6M13 18H7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </>),
  media_influencers: icon(<>
    <path d="M3 11l18-5v12L3 14v-3z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
    <path d="M11.6 16.8a3 3 0 11-5.8-1.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
  </>),
};

/** For a page added to `app_pages` before this map catches up. */
export const fallbackIcon = icon(<rect x="4" y="4" width="16" height="16" rx="3" stroke="currentColor" strokeWidth="1.8"/>);

/** Page key → `sidebar` translation key. Anything absent uses the database label. */
const NAV_LABEL_KEYS: Record<string, string> = {
  home: 'nav.home',
  wallet: 'nav.wallet',
  custody: 'nav.custody',
  profile: 'nav.profile',
  settings: 'nav.settings',
  tasks: 'nav.tasks',
  bookings: 'nav.bookings',
  calendar: 'nav.calendar',
  cars: 'nav.cars',
  car_tracking: 'nav.carTracking',
  car_issues: 'nav.carIssues',
  model_groups: 'nav.modelGroups',
  operations: 'nav.operations',
  kgm: 'nav.kgm',
  fines: 'nav.fines',
  kabis: 'nav.kabis',
  accounting: 'nav.accounting',
  customer_wallets: 'nav.customerWallets',
  suppliers: 'nav.suppliers',
  media_ideas: 'nav.ideas',
  media_calendar: 'nav.mediaCalendar',
  media_influencers: 'nav.influencers',
};

export function usePageLabel(): (page: AppPage) => string {
  const { t, i18n } = useTranslation('sidebar');
  const { lang } = useLanguage();

  return useCallback((page: AppPage) => {
    const key = NAV_LABEL_KEYS[page.key];
    if (key && i18n.exists(`sidebar:${key}`)) return t(key);
    return lang === 'ar' ? page.label_ar : page.label_en;
  }, [t, i18n, lang]);
}
