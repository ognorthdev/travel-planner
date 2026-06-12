import React, { lazy, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { AuthProvider } from './lib/auth.jsx';

// Route-level code splitting: each page loads on demand so the initial bundle
// doesn't carry every screen (and DayMapModal's Leaflet) up front.
const HomePage = lazy(() => import('./pages/HomePage.jsx'));
const TripPage = lazy(() => import('./pages/TripPage.jsx'));
const PlanningPage = lazy(() => import('./pages/PlanningPage.jsx'));
const LoginPage = lazy(() => import('./pages/LoginPage.jsx'));
const AdminPage = lazy(() => import('./pages/AdminPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const SharedTripPage = lazy(() => import('./pages/SharedTripPage.jsx'));
const PrintPage = lazy(() => import('./pages/PrintPage.jsx'));

function PageLoader() {
  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center">
      <Loader2 size={40} className="animate-spin text-ocean-400" />
    </div>
  );
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <Suspense fallback={<PageLoader />}>
          <Routes>
            <Route path="/login" element={<LoginPage />} />
            <Route path="/share/:token" element={<SharedTripPage />} />
            <Route path="/admin" element={<ProtectedRoute adminOnly><AdminPage /></ProtectedRoute>} />
            <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            <Route path="/trips/:tripId" element={<ProtectedRoute><TripPage /></ProtectedRoute>} />
            <Route path="/trips/:tripId/print" element={<ProtectedRoute><PrintPage /></ProtectedRoute>} />
            <Route
              path="/trips/:tripId/days/:dayId/slots/:slotId"
              element={<ProtectedRoute><PlanningPage /></ProtectedRoute>}
            />
          </Routes>
        </Suspense>
      </AuthProvider>
    </Router>
  );
}

export default App;
