import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import ReactDOM from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePageAccess } from '../contexts/PageAccessContext';
import {
  fold, getFleet, matchCars, searchBookings, searchCustomers,
  type BookingHit, type CarHit, type CustomerHit,
} from '../lib/queries/search';
import BannedBadge from './customers/BannedBadge';
import { fallbackIcon, pageIcons, usePageLabel } from './pageNav';

/**
 * ⌘K search across cars, bookings, customers and pages. Each kind only appears for
 * someone who can open the page it leads to; the lookups for a kind they cannot
 * open are never sent at all.
 */

type Group = 'pages' | 'cars' | 'bookings' | 'customers';

interface Item {
  id: string;
  group: Group;
  label: string;
  sub?: string | null;
  badge?: React.ReactNode;
  to: string;
  /** Plates and numbers read best in mono, left to right. */
  latin?: boolean;
  icon: React.ReactNode;
}

interface Hits {
  cars: CarHit[];
  bookings: BookingHit[];
  customers: CustomerHit[];
}

const NO_HITS: Hits = { cars: [], bookings: [], customers: [] };
const MIN_QUERY = 2;
const DEBOUNCE_MS = 200;

const GROUP_ORDER: Group[] = ['pages', 'cars', 'bookings', 'customers'];

const withSearch = (route: string, value: string, extra = '') =>
  `${route}?q=${encodeURIComponent(value)}${extra}`;

const CommandPalette: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useTranslation('shell');
  const navigate = useNavigate();
  const { pages, canAccessPage } = usePageAccess();
  const pageLabel = usePageLabel();
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<Hits>(NO_HITS);
  const [searching, setSearching] = useState(false);
  const [failed, setFailed] = useState(false);
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const fleet = useRef<Promise<CarHit[]> | null>(null);

  const term = query.trim();
  const routeOf = (key: string) => pages.find(p => p.key === key)?.route;
  const carsRoute = canAccessPage('cars') ? routeOf('cars') : undefined;
  const bookingsRoute = canAccessPage('bookings') ? routeOf('bookings') : undefined;
  const walletsRoute = canAccessPage('customer_wallets') ? routeOf('customer_wallets') : undefined;
  // A customer has no page of their own, so these two are where one can be found.
  const customersRoute = walletsRoute ?? bookingsRoute;

  // Puts focus back on whatever opened the palette.
  useEffect(() => {
    const opener = document.activeElement as HTMLElement | null;
    return () => opener?.focus?.();
  }, []);

  useEffect(() => {
    if (term.length < MIN_QUERY) {
      setHits(NO_HITS);
      setSearching(false);
      setFailed(false);
      return;
    }

    let cancelled = false;
    setSearching(true);
    const timer = window.setTimeout(async () => {
      try {
        const [cars, customers] = await Promise.all([
          carsRoute ? (fleet.current ??= getFleet()).then(all => matchCars(all, term)) : [],
          customersRoute ? searchCustomers(term) : [],
        ]);
        const bookings = bookingsRoute ? await searchBookings(term, customers.map(c => c.id)) : [];
        if (cancelled) return;
        setHits({ cars, bookings, customers });
        setFailed(false);
      } catch {
        // A rejected fleet load must not be cached, or the retry can never succeed.
        fleet.current = null;
        if (!cancelled) setFailed(true);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [term, carsRoute, bookingsRoute, customersRoute]);

  const items = useMemo<Item[]>(() => {
    const wanted = fold(term);
    const pageItems: Item[] = pages
      .filter(page => canAccessPage(page.key))
      .filter(page => !wanted || fold(pageLabel(page)).includes(wanted))
      .map(page => ({
        id: `page:${page.key}`,
        group: 'pages',
        label: pageLabel(page),
        to: page.route,
        icon: pageIcons[page.key] ?? fallbackIcon,
      }));

    const carItems: Item[] = carsRoute ? hits.cars.map(car => ({
      id: `car:${car.id}`,
      group: 'cars',
      label: car.plate,
      sub: car.model,
      to: withSearch(carsRoute, car.plate),
      latin: true,
      icon: pageIcons.cars,
    })) : [];

    const bookingItems: Item[] = bookingsRoute ? hits.bookings.map(booking => ({
      id: `booking:${booking.id}`,
      group: 'bookings',
      label: booking.number,
      sub: [booking.customer, booking.plate].filter(Boolean).join(' · ') || null,
      // The bookings table shows one month, so the link has to name it.
      to: withSearch(bookingsRoute, booking.number, `&month=${booking.startDate.slice(0, 7)}`),
      latin: true,
      icon: pageIcons.bookings,
    })) : [];

    const customerItems: Item[] = customersRoute ? hits.customers.map(customer => ({
      id: `customer:${customer.id}`,
      group: 'customers',
      label: customer.name || customer.phone || '—',
      sub: customer.phone,
      badge: customer.banned ? <BannedBadge reason={customer.banReason} /> : undefined,
      to: withSearch(customersRoute, customer.name),
      icon: pageIcons.profile,
    })) : [];

    return [...pageItems, ...carItems, ...bookingItems, ...customerItems];
  }, [term, pages, canAccessPage, pageLabel, hits, carsRoute, bookingsRoute, customersRoute]);

  useEffect(() => { setActive(0); }, [items]);

  useLayoutEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const open = (item: Item) => {
    onClose();
    navigate(item.to);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    } else if (e.key === 'ArrowDown' && items.length > 0) {
      e.preventDefault();
      setActive(i => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length > 0) {
      e.preventDefault();
      setActive(i => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Enter' && items[active]) {
      e.preventDefault();
      open(items[active]);
    }
  };

  const showEmpty = term.length >= MIN_QUERY && !searching && !failed && items.length === 0;

  return ReactDOM.createPortal(
    <div
      className="fixed inset-0 z-[9000] flex items-start justify-center bg-[rgba(15,17,23,0.4)] p-3 sm:pt-[12vh]"
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t('search.title')}
        className="surface-depth surface-float flex max-h-[calc(100dvh-24px)] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl border border-[var(--border-subtle)] bg-[var(--surface)] shadow-[0_24px_80px_rgba(0,0,0,0.22)] sm:max-h-[66vh]"
      >
        <div className="flex h-14 shrink-0 items-center gap-3 border-b border-[var(--border-subtle)] px-4">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 text-gray-400" aria-hidden="true">
            <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
            <path d="M20 20l-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={t('search.placeholder')}
            role="combobox"
            aria-expanded
            aria-controls="hc-palette-list"
            aria-activedescendant={items[active] ? `hc-palette-${active}` : undefined}
            className="min-w-0 flex-1 bg-transparent text-base text-[#0f1117] outline-none placeholder:text-gray-400 sm:text-[15px]"
          />
          <button
            type="button"
            onClick={onClose}
            aria-label={t('search.close')}
            className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-lg text-gray-400 hover:bg-black/[0.04] hover:text-gray-600 sm:hidden"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </button>
        </div>

        <div ref={listRef} id="hc-palette-list" role="listbox" className="min-h-0 flex-1 overflow-y-auto p-2">
          {GROUP_ORDER.map(group => {
            const groupItems = items.filter(item => item.group === group);
            if (groupItems.length === 0) return null;
            return (
              <div key={group} className="mb-1">
                <div className="px-3 pb-1 pt-2 text-[11px] font-bold uppercase text-gray-400">{t(`search.groups.${group}`)}</div>
                {groupItems.map(item => {
                  const index = items.indexOf(item);
                  const selected = index === active;
                  return (
                    <button
                      key={item.id}
                      id={`hc-palette-${index}`}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => open(item)}
                      onMouseMove={() => { if (!selected) setActive(index); }}
                      className={`flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl px-3 text-start transition-colors ${selected ? 'bg-[var(--accent-soft)]' : ''}`}
                    >
                      <span className={`shrink-0 ${selected ? 'text-[var(--accent-strong)]' : 'text-gray-400'}`}>{item.icon}</span>
                      <span className={`truncate text-sm font-medium text-[#0f1117] ${item.latin ? 'hc-num' : ''}`}>{item.label}</span>
                      {item.sub && <span className="min-w-0 truncate text-[13px] text-gray-500">{item.sub}</span>}
                      {item.badge}
                    </button>
                  );
                })}
              </div>
            );
          })}

          {searching && <div className="px-3 py-3 text-[13px] text-gray-400">{t('search.searching')}</div>}
          {failed && <div role="alert" className="px-3 py-3 text-[13px] text-red-600">{t('search.failed')}</div>}
          {showEmpty && <div className="px-3 py-8 text-center text-[13px] text-gray-500">{t('search.empty', { query: term })}</div>}
        </div>

        <div className="hidden h-10 shrink-0 items-center gap-4 border-t border-[var(--border-subtle)] px-4 text-[11.5px] text-gray-400 sm:flex">
          <span><kbd className="hc-num">↑↓</kbd> {t('search.navigate')}</span>
          <span><kbd className="hc-num">↵</kbd> {t('search.open')}</span>
          <span><kbd className="hc-num">esc</kbd> {t('search.close')}</span>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default CommandPalette;
