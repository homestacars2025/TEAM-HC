import React, { Suspense, lazy } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { CurrencyProvider } from './lib/CurrencyContext';
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
import OperationsPage from './pages/OperationsPage';
import AccountingPage from './pages/AccountingPage';
import CustomerWalletsPage from './pages/CustomerWalletsPage';
import TasksPage from './pages/TasksPage';
/*
 * Media is a restricted section with its own UI stack (Base UI, dnd-kit, motion,
 * date-fns, lucide). Loading it lazily keeps roughly 170 kB out of the initial
 * bundle for everyone who never opens it.
 */
const MediaLayout = lazy(() => import('./pages/media/media-layout'));
const MediaIdeasPage = lazy(() => import('./pages/media/ideas/page'));
const MediaCalendarPage = lazy(() => import('./pages/media/calendar/page'));
const MediaInfluencersPage = lazy(() => import('./pages/media/influencers/page'));

/** Shown only for the moment the Media chunk is in flight. */
const MediaChunkFallback: React.FC = () => (
  <div style={{
    minHeight: '60vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
    color: '#9ca3af', fontSize: 14,
  }}>
    Loading…
  </div>
);
import ProtectedRoute from './components/ProtectedRoute';
import RequireSection from './components/RequireSection';
import { SectionAccessProvider } from './lib/SectionAccessContext';

const App: React.FC = () => {
  return (
    <CurrencyProvider>
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route
          path="/dashboard"
          element={
            <ProtectedRoute>
              <SectionAccessProvider>
                <Layout />
              </SectionAccessProvider>
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="cars" replace />} />
          <Route path="cars" element={<CarsPage />} />
          <Route path="cars/tracking" element={<CarTrackingPage />} />
          <Route path="car-issues" element={<CarIssuesPage />} />
          <Route path="model-groups" element={<ModelGroupsPage />} />
          <Route path="kgm" element={<KGMPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="fines" element={<FinesPage />} />
          <Route path="operations" element={<OperationsPage />} />
          <Route path="customer-wallets" element={<CustomerWalletsPage />} />
          {/* Unrestricted: tasks are scoped to the caller's role by the RPC itself. */}
          <Route path="tasks" element={<TasksPage />} />
          <Route
            path="accounting"
            element={<RequireSection section="accounting"><AccountingPage /></RequireSection>}
          />
          <Route
            path="kabis"
            element={<RequireSection section="kabis"><KabisPage /></RequireSection>}
          />
          {/* One guard on the parent covers the whole Media subtree, including
              any page added to it later. */}
          <Route
            path="media"
            element={
              <RequireSection section="media">
                <Suspense fallback={<MediaChunkFallback />}>
                  <MediaLayout />
                </Suspense>
              </RequireSection>
            }
          >
            <Route index element={<Navigate to="ideas" replace />} />
            <Route path="ideas" element={<MediaIdeasPage />} />
            <Route path="calendar" element={<MediaCalendarPage />} />
            <Route path="influencers" element={<MediaInfluencersPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
    </CurrencyProvider>
  );
};

export default App;
