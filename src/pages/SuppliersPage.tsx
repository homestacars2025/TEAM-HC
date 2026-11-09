import React, { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router-dom';
import Button from '../components/Button';
import { CategoryChip, ContactLinks } from '../components/suppliers/parts';
import SupplierForm from '../components/suppliers/SupplierForm';
import { StatTile } from '../components/WalletParts';
import { useCurrentUser } from '../contexts/CurrentUserContext';
import { useTileFilter } from '../hooks/useTileFilter';
import { getSupplierBalances, getSuppliers } from '../lib/queries/suppliers';
import { inSupplierFilter, matchesSupplier, owedByCurrency, SUPPLIER_CATEGORIES, supplierPath, SUPPLIER_FILTERS, type Supplier, type SupplierBalance, type SupplierCurrency } from '../lib/suppliers';
import { useMoney } from '../hooks/useMoney';
import { RateNote } from '../components/Money';

/** Lives inside the Suppliers tab of Accounting, which has the page's title and padding. */
const SuppliersPage: React.FC<{ embedded?: boolean }> = ({ embedded = false }) => {
  const { t } = useTranslation('finance');
  const { t: tc } = useTranslation('common');
  const money = useMoney();
  /** Lira follows the top bar's currency; a bill in dollars or euros stays in its own. */
  const formatMoney = (amount: number, currency: SupplierCurrency) => money.formatIn(amount, currency, { sign: 'negative' });
  const { userId } = useCurrentUser();
  const navigate = useNavigate();
  const [filter, setFilter] = useTileFilter(SUPPLIER_FILTERS);
  const [suppliers, setSuppliers] = useState<Supplier[] | null>(null);
  const [balances, setBalances] = useState<SupplierBalance[]>([]);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setFailed(false);
    Promise.all([getSuppliers(), getSupplierBalances()])
      .then(([rows, money]) => {
        if (cancelled) return;
        setSuppliers(rows);
        setBalances(money);
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [attempt]);

  const bySupplier = useMemo(() => {
    const map = new Map<number, SupplierBalance[]>();
    balances.forEach(row => map.set(row.supplier_id, [...(map.get(row.supplier_id) ?? []), row]));
    return map;
  }, [balances]);

  const of = (supplier: Supplier) => bySupplier.get(supplier.id) ?? [];
  const list = suppliers ?? [];
  const count = (key: 'all' | typeof SUPPLIER_FILTERS[number]) => list.filter(supplier => inSupplierFilter(supplier, of(supplier), key)).length;
  const owed = owedByCurrency(balances);
  const owedText = owed.map(row => formatMoney(row.total, row.currency)).join(' · ') || t('suppliers.nothingOwed');

  const shown = list.filter(supplier => (filter === 'inactive' || supplier.is_active)
    && inSupplierFilter(supplier, of(supplier), filter)
    && (category === 'all' || supplier.category === category)
    && matchesSupplier(supplier, search));

  const loading = suppliers === null && !failed;
  const value = (n: number) => (loading ? null : String(n));

  return (
    <div className={embedded ? undefined : 'hc-records-page'}>
      <header className="hc-records-head">
        {!embedded && (
          <div className="min-w-0">
            <p className="hc-eyebrow">{t('suppliers.eyebrow')}</p>
            <h1>{t('suppliers.title')}</h1>
            <p>{t('suppliers.subtitle')}</p>
          </div>
        )}
        <Button onClick={() => setAdding(true)}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" /></svg>
          {t('suppliers.add')}
        </Button>
      </header>

      {failed && (
        <div role="alert" className="hc-form-error mb-4 flex flex-wrap items-center justify-between gap-2">
          {t('suppliers.loadFailed')}
          <Button variant="secondary" onClick={() => setAttempt(n => n + 1)}>{tc('actions.tryAgain')}</Button>
        </div>
      )}

      <div className="hc-tiles hc-tiles-filter">
        <StatTile tone="total" label={t('suppliers.tiles.all')} value={value(count('all'))} sub={t('suppliers.tiles.allSub')} pressed={filter === 'all'} onPress={() => setFilter('all')} />
        <StatTile tone="negative" label={t('suppliers.tiles.owed')} value={value(count('owed'))} sub={owedText} pressed={filter === 'owed'} onPress={() => setFilter('owed')} />
        <StatTile tone="received" label={t('suppliers.tiles.settled')} value={value(count('settled'))} sub={t('suppliers.tiles.settledSub')} pressed={filter === 'settled'} onPress={() => setFilter('settled')} />
        <StatTile tone="paid" label={t('suppliers.tiles.inactive')} value={value(count('inactive'))} sub={t('suppliers.tiles.inactiveSub')} pressed={filter === 'inactive'} onPress={() => setFilter('inactive')} />
      </div>
      <RateNote className="!mt-0" />

      <div className="hc-records-tools">
        <div className="hc-records-row">
          <input className="hc-input hc-records-search" type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={t('suppliers.search')} aria-label={t('suppliers.search')} />
          <select className="hc-input hc-records-type" value={category} aria-label={t('form.category')} onChange={e => setCategory(e.target.value)}>
            <option value="all">{t('suppliers.allCategories')}</option>
            {SUPPLIER_CATEGORIES.map(option => <option key={option} value={option}>{t(`suppliers.categories.${option}`)}</option>)}
          </select>
        </div>
      </div>

      {loading ? (
        <div role="status" aria-label={t('review.loading')} className="hc-sup-grid">
          {[0, 1, 2].map(row => <div key={row} className="hc-fine-skeleton" />)}
        </div>
      ) : failed ? null : shown.length === 0 ? (
        <p className="hc-records-empty">{list.length === 0 ? t('suppliers.empty') : t('suppliers.noMatch')}</p>
      ) : (
        <div className="hc-sup-grid">
          {shown.map(supplier => {
            const money = of(supplier).filter(row => row.balance !== 0);
            return (
              <article key={supplier.id} className={`hc-sup-card surface-depth ${supplier.is_active ? '' : 'is-off'}`}>
                <Link to={supplierPath(supplier.id)} className="hc-sup-card-open" aria-label={t('suppliers.open', { name: supplier.name })} />
                <div className="hc-sup-card-head">
                  <h2 dir="auto">{supplier.name}</h2>
                  <CategoryChip category={supplier.category} />
                </div>
                <ContactLinks supplier={supplier} />
                <div className="hc-sup-balances">
                  {money.length === 0
                    ? <span className="hc-sup-settled">{t('suppliers.settled')}</span>
                    : money.map(row => (
                      <span key={row.currency} className={row.balance > 0 ? 'is-owed' : 'is-credit'}>
                        <small>{t(row.balance > 0 ? 'suppliers.weOwe' : 'suppliers.credit')}</small>
                        <bdi dir="ltr" className="hc-money-mono">{formatMoney(Math.abs(row.balance), row.currency)}</bdi>
                      </span>
                    ))}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {adding && (
        <SupplierForm supplier={null} userId={userId} onClose={() => setAdding(false)} onSaved={saved => navigate(supplierPath(saved.id))} />
      )}
    </div>
  );
};

export default SuppliersPage;
