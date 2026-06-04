import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import TripPage from './pages/TripPage.jsx';
import PlanningPage from './pages/PlanningPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ProtectedRoute from './components/ProtectedRoute.jsx';
import { AuthProvider } from './lib/auth.jsx';

function App() {
  return (
    <Router>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/" element={<ProtectedRoute><HomePage /></ProtectedRoute>} />
          <Route path="/trips/:tripId" element={<ProtectedRoute><TripPage /></ProtectedRoute>} />
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
