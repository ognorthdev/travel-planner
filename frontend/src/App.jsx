import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import TripPage from './pages/TripPage.jsx';
import PlanningPage from './pages/PlanningPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import AdminPage from './pages/AdminPage.jsx';
import SettingsPage from './pages/SettingsPage.jsx';
import SharedTripPage from './pages/SharedTripPage.jsx';
import PrintPage from './pages/PrintPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { AuthProvider } from './lib/auth.jsx';

function App() {
  return (
    <Router>
      <AuthProvider>
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
      </AuthProvider>
    </Router>
  );
}

export default App;
