import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import HomePage from './pages/HomePage.jsx';
import TripPage from './pages/TripPage.jsx';
import PlanningPage from './pages/PlanningPage.jsx';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/trips/:tripId" element={<TripPage />} />
        <Route path="/trips/:tripId/days/:dayId/slots/:slotId" element={<PlanningPage />} />
      </Routes>
    </Router>
  );
}

export default App;
