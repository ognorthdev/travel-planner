require('dotenv').config();
const express = require('express');
const cors = require('cors');

const tripsRouter = require('./routes/trips');
const daysRouter = require('./routes/days');
const slotsRouter = require('./routes/slots');
const aiRouter = require('./routes/ai');
const placesRouter = require('./routes/places');
const researchRouter = require('./routes/research');
const costsRouter = require('./routes/costs');
const { requireAuth } = require('./middleware/requireAuth');

const app = express();
const PORT = process.env.PORT || 3001;

// Allowed frontend origins (comma-separated). Falls back to local dev.
const trustedOrigins = (process.env.TRUSTED_ORIGINS || 'http://localhost:5173,http://127.0.0.1:5173')
  .split(',')
  .map((o) => o.trim())
  .filter(Boolean);

app.use(cors({
  origin: trustedOrigins,
  credentials: true,
  allowedHeaders: ['Content-Type', 'Authorization'],
}));
app.use(express.json());

// Health check (public)
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes — all data routes require a valid Supabase session
app.use('/api/trips', requireAuth, tripsRouter);
app.use('/api', requireAuth, daysRouter);
app.use('/api', requireAuth, slotsRouter);
app.use('/api/ai', requireAuth, aiRouter);
app.use('/api/places', requireAuth, placesRouter);
app.use('/api/research', requireAuth, researchRouter);
app.use('/api/costs', requireAuth, costsRouter);

// Global error handler
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal server error',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

app.listen(PORT, () => {
  console.log(`Travel Planner backend running on http://localhost:${PORT}`);
});

module.exports = app;
