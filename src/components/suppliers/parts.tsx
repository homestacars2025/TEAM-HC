import React from 'react';
import { useTranslation } from 'react-i18next';
import { whatsappLink, type Supplier, type SupplierCategory } from '../../lib/suppliers';

const PATHS: Record<SupplierCategory, React.ReactNode> = {
  workshop: <path d="M3 21V9l9-6 9 6v12M8 21v-7h8v7" />,
  mechanic: <path d="M14.7 6.3a4 4 0 00-5.4 5l-6 6a2 2 0 002.8 2.8l6-6a4 4 0 005-5.4l-2.5 2.5-2.4-.5-.5-2.4z" />,
  body_paint: <path d="M4 15l9-9 5 5-9 9H4v-5zM15 4l5 5M19 16s2 2.2 2 3.5a2 2 0 01-4 0c0-1.300 2-3.500 2-3.500z" />,
  tires: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="3.5" /></>,
  car_wash: <path d="M12 3s6 6.500 6 11a6 6 0 01-12 0c0-4.500 6-11 6-11z" />,
  parts: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  glass: <path d="M4 4h16v16H4zM8 15l6-6M12 16l4-4" />,
  electric: <path d="M13 2L5 14h6l-1 8 8-12h-6l1-8z" />,
  towing: <path d="M3 17h13V8l-4-4H3v13zM16 11h3l2 3v3h-5M7 19.500a2 2 0 100-4 2 2 0 000 4zM17 19.500a2 2 0 100-4 2 2 0 000 4z" />,
  insurance: <path d="M12 3l8 3v6c0 5-3.500 8-8 9-4.500-1-8-4-8-9V6l8-3z" />,
  notary: <path d="M14 3H6a2 2 0 00-2 2v14a2 2 0 002 2h12a2 2 0 002-2V9l-6-6zM14 3v6h6M8 14h8M8 18h5" />,
  fuel: <path d="M4 21V5a2 2 0 012-2h6a2 2 0 012 2v16M3 21h12M4 10h10M14 13h2a2 2 0 012 2v2a1.500 1.500 0 003 0V9l-3-3" />,
  other: <><circle cx="6" cy="12" r="1.500" /><circle cx="12" cy="12" r="1.500" /><circle cx="18" cy="12" r="1.500" /></>,
};

export const CategoryIcon: React.FC<{ category: string }> = ({ category }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.900" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {PATHS[category as SupplierCategory] ?? PATHS.other}
  </svg>
);

export const CategoryChip: React.FC<{ category: string }> = ({ category }) => {
  const { t } = useTranslation('finance');
  return <span className="hc-sup-chip"><CategoryIcon category={category} />{t(`suppliers.categories.${category}`)}</span>;
};

/** Sits above a card's whole-card link, so these two open their own thing. */
export const ContactLinks: React.FC<{ supplier: Pick<Supplier, 'phone' | 'whatsapp'> }> = ({ supplier }) => {
  const { t } = useTranslation('finance');
  const whatsapp = whatsappLink(supplier.whatsapp ?? supplier.phone ?? '');
  if (!supplier.phone && !whatsapp) return null;
  return (
    <span className="hc-sup-contacts">
      {supplier.phone && (
        <a href={`tel:${supplier.phone.replace(/[^\d+]/g, '')}`} dir="ltr">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M22 16.900v3a2 2 0 01-2.200 2 19.800 19.800 0 01-8.600-3 19.500 19.500 0 01-6-6 19.800 19.800 0 01-3-8.700A2 2 0 014.200 2h3a2 2 0 012 1.700c.1 1 .4 1.900.7 2.800a2 2 0 01-.5 2.100L8.100 9.900a16 16 0 006 6l1.300-1.300a2 2 0 012.100-.4c.9.300 1.800.5 2.800.7a2 2 0 011.700 2z" /></svg>
          {supplier.phone}
        </a>
      )}
      {whatsapp && <a href={whatsapp} target="_blank" rel="noreferrer" className="is-whatsapp">{t('suppliers.whatsapp')}</a>}
    </span>
  );
};
