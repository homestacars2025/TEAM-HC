import React from 'react';
import { Navigate } from 'react-router-dom';
import { useMailAccess } from '../lib/mail/MailAccessContext';

/**
 * Route guard for the Inbox. Mail access comes from `email_account_access`, not
 * `app_pages`, so it has a guard of its own: an admin, or anyone given at least
 * one mailbox. Anyone else typing the URL goes back to their first page.
 */
const RequireMail: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { loading, isAdmin, accounts, error } = useMailAccess();
  if (loading) return <div aria-busy className="m-6 h-64 animate-pulse rounded-2xl bg-black/[0.04]" />;
  // A failed lookup isn't a "no": the page shows the error and a retry.
  if (error || isAdmin || accounts.length > 0) return <>{children}</>;
  return <Navigate to="/dashboard" replace />;
};

export default RequireMail;
