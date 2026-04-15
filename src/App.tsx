import React from 'react';
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
import PricingPage from './pages/PricingPage';
import CarTrackingPage from './pages/CarTrackingPage';
import OperationsPage from './pages/OperationsPage';
import ProtectedRoute from './components/ProtectedRoute';

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
              <Layout />
            </ProtectedRoute>
          }
        >
          <Route index element={<Navigate to="cars" replace />} />
          <Route path="cars" element={<CarsPage />} />
          <Route path="cars/tracking" element={<CarTrackingPage />} />
          <Route path="model-groups" element={<ModelGroupsPage />} />
          <Route path="kgm" element={<KGMPage />} />
          <Route path="bookings" element={<BookingsPage />} />
          <Route path="calendar" element={<CalendarPage />} />
          <Route path="fines" element={<FinesPage />} />
          <Route path="pricing" element={<PricingPage />} />
          <Route path="operations" element={<OperationsPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
    </CurrencyProvider>
  );
};

export default App;
