import React from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { usePageAccess } from '../../contexts/PageAccessContext';
import { supplierPath } from '../../lib/suppliers';
import CustomerWalletsPage from '../../pages/CustomerWalletsPage';

/**
 * Customer Wallets is a tab of Accounting for finance, and its own page for anyone
 * else with access, such as customer service. The search survives the redirect, so
 * the command palette still lands on the customer it picked.
 */
export const CustomerWalletsRoute: React.FC = () => {
  const { canAccessPage } = usePageAccess();
  const { search } = useLocation();
  if (!canAccessPage('accounting')) return <CustomerWalletsPage />;
  return <Navigate to={`/dashboard/accounting?tab=customers${search.replace('?', '&')}`} replace />;
};

export const SupplierRedirect: React.FC = () => {
  const { id } = useParams();
  return <Navigate to={supplierPath(Number(id))} replace />;
};
