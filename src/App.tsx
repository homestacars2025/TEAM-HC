import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CurrencyProvider } from './lib/CurrencyContext';
import { LanguageProvider } from './lib/LanguageContext';
import LoginPage from './pages/LoginPage';
import Layout from './components/Layout';
import CarsPage from './pages/CarsPage';
import ModelGroupsPage from './pages/ModelGroupsPage';
import KGMPage from './pages/KGMPage';
import BookingsPage from './pages/BookingsPage';
import CalendarPage from './pages/CalendarPage';
import FinesPage from './pages/FinesPage';
import CarTrackingPage from './pages/CarTrackingPage';
import CarIssuesPage from './pages/CarIssuesPage';
import KabisPage from './pages/KabisPage';
import PendingInvoicesPage from './pages/PendingInvoicesPage';
import HgsPage from './pages/HgsPage';
import OperationsPage from './pages/OperationsPage';
import AccountingPage from './pages/AccountingPage';
import { CustomerWalletsRoute, SupplierRedirect } from './components/accounting/FinanceRoutes';
import { SUPPLIERS_PATH } from './lib/suppliers';
import TasksPage from './pages/TasksPage';
import HomePage from './pages/HomePage';
import WalletPage from './pages/WalletPage';
import CustodyPage from './pages/CustodyPage';
import ProfilePage from './pages/ProfilePage';
import SettingsPage from './pages/SettingsPage';
import RequireMail from './components/RequireMail';
/*
 * Media has its own UI stack (Base UI, dnd-kit, motion,
 * date-fns, lucide). Loading it lazily keeps roughly 170 kB out of the initial
 * bundle for everyone who never opens it.
 */
const MediaLayout = lazy(() => import('./pages/media/media-layout'));
const MediaIdeasPage = lazy(() => import('./pages/media/ideas/page'));
const MediaCalendarPage = lazy(() => import('./pages/media/calendar/page'));
const MediaInfluencersPage = lazy(() => import('./pages/media/influencers/page'));
const InterviewsPage = lazy(() => import('./pages/hr/InterviewsPage'));
/** Mail carries DOMPurify and the editor; only people with a mailbox load it. */
const MailPage = lazy(() => import('./pages/MailPage'));
const HrOpeningsPage = lazy(() => import('./pages/hr/HrOpeningsPage'));
const HrOpeningPage = lazy(() => import('./pages/hr/HrOpeningPage'));
const OpeningBuilderPage = lazy(() => import('./pages/hr/OpeningBuilderPage'));

/** Shown only for the moment the Media chunk is in flight. */
const INTERVIEW_PAGES = ['interviews', 'hr'] as const;

const MediaChunkFallback: React.FC = () => (
  <div style={{
    minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#9ca3af', fontSize: 14,
  }}>
    Loading…
  </div>
);
import ProtectedRoute from './components/ProtectedRoute';
import RequirePage, { RedirectToFirstPage } from './components/RequirePage';
import { PageAccessProvider } from './contexts/PageAccessContext';

const App: React.FC = () => {
  return (
    <CurrencyProvider>
    <BrowserRouter>
    {/* Owns <html lang> and <html dir>. Inside the router because pre-auth
        routes stay English regardless of the stored choice. */}
    <LanguageProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <PageAccessProvider>
                <Layout />
              </PageAccessProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<RedirectToFirstPage />} />
          <Route path="home" element={<RequirePage page="home"><HomePage /></RequirePage>} />
          <Route path="wallet" element={<RequirePage page="wallet"><WalletPage /></RequirePage>} />
          <Route path="custody" element={<RequirePage page="custody"><CustodyPage /></RequirePage>} />
          <Route path="profile" element={<RequirePage page="profile"><ProfilePage /></RequirePage>} />
          <Route path="settings" element={<RequirePage page="settings"><SettingsPage /></RequirePage>} />
          <Route path="cars" element={<RequirePage page="cars"><CarsPage /></RequirePage>} />
          <Route path="cars/tracking" element={<RequirePage page="car_tracking"><CarTrackingPage /></RequirePage>} />
          <Route path="car-issues" element={<RequirePage page="car_issues"><CarIssuesPage /></RequirePage>} />
          <Route path="model-groups" element={<RequirePage page="model_groups"><ModelGroupsPage /></RequirePage>} />
          <Route path="kgm" element={<RequirePage page="kgm"><KGMPage /></RequirePage>} />
          <Route path="bookings" element={<RequirePage page="bookings"><BookingsPage /></RequirePage>} />
          <Route path="calendar" element={<RequirePage page="calendar"><CalendarPage /></RequirePage>} />
          <Route path="fines" element={<RequirePage page="fines"><FinesPage /></RequirePage>} />
          <Route path="operations" element={<RequirePage page="operations"><OperationsPage /></RequirePage>} />
          <Route path="customer-wallets" element={<RequirePage page="customer_wallets"><CustomerWalletsRoute /></RequirePage>} />
          <Route path="tasks" element={<RequirePage page="tasks"><TasksPage /></RequirePage>} />
          {/* Opened by mailbox grants (email_account_access), not by app_pages. */}
          <Route path="mail" element={<RequireMail><Suspense fallback={<MediaChunkFallback />}><MailPage /></Suspense></RequireMail>} />
          <Route path="accounting" element={<RequirePage page="accounting"><AccountingPage /></RequirePage>} />
          <Route path="suppliers" element={<RequirePage page="accounting"><Navigate to={SUPPLIERS_PATH} replace /></RequirePage>} />
          <Route path="suppliers/:id" element={<RequirePage page="accounting"><SupplierRedirect /></RequirePage>} />
          <Route path="kabis" element={<RequirePage page="kabis"><KabisPage /></RequirePage>} />
          <Route path="pending-invoices" element={<RequirePage page="pending_invoices"><PendingInvoicesPage /></RequirePage>} />
          <Route path="hgs" element={<RequirePage page="hgs" redirect><HgsPage /></RequirePage>} />
          {/* Each Media page has its own key, so the guard sits on the children. */}
          <Route
            path="media"
            element={
              <Suspense fallback={<MediaChunkFallback />}>
                <MediaLayout />
              </Suspense>
            }
          >
            <Route index element={<RedirectToFirstPage within="/dashboard/media/" />} />
            <Route path="ideas" element={<RequirePage page="media_ideas"><MediaIdeasPage /></RequirePage>} />
            <Route path="calendar" element={<RequirePage page="media_calendar"><MediaCalendarPage /></RequirePage>} />
            <Route path="influencers" element={<RequirePage page="media_influencers"><MediaInfluencersPage /></RequirePage>} />
          </Route>
          {/*
            HR. The interviews screen opens for either key, as the database lets both
            schedule; everything else needs the HR page. Without the key: home.
          */}
          <Route path="hr/interviews" element={<RequirePage page={INTERVIEW_PAGES} redirect><Suspense fallback={<MediaChunkFallback />}><InterviewsPage /></Suspense></RequirePage>} />
          <Route path="hr" element={<RequirePage page="hr" redirect><Suspense fallback={<MediaChunkFallback />}><HrOpeningsPage /></Suspense></RequirePage>} />
          <Route path="hr/openings/new" element={<RequirePage page="hr" redirect><Suspense fallback={<MediaChunkFallback />}><OpeningBuilderPage /></Suspense></RequirePage>} />
          <Route path="hr/openings/:id" element={<RequirePage page="hr" redirect><Suspense fallback={<MediaChunkFallback />}><HrOpeningPage /></Suspense></RequirePage>} />
          <Route path="hr/openings/:id/edit" element={<RequirePage page="hr" redirect><Suspense fallback={<MediaChunkFallback />}><OpeningBuilderPage /></Suspense></RequirePage>} />
          <Route path="hr/*" element={<Navigate to="/dashboard/hr" replace />} />
          <Route path="*" element={<RedirectToFirstPage />} />
        </Route>
        {/* ProtectedRoute sends a signed-out visitor on to /login. */}
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </LanguageProvider>
    </BrowserRouter>
    </CurrencyProvider>
  );
};

export default App;
