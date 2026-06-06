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
const adminRouter = require('./routes/admin');
const { requireAuth, requireApproved, requireAdmin } = require('./middleware/requireAuth');

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

// Current user's account status (reachable while pending, so the UI can show
// the awaiting-approval screen). Must be registered before the broad mounts.
app.get('/api/me', requireAuth, (req, res) => {
  res.json({ email: req.user.email, status: req.user.status, isAdmin: req.user.isAdmin });
});

// Admin (manage user approvals).
app.use('/api/admin', requireAuth, requireAdmin, adminRouter);

// Data routes — require a valid session AND an approved account.
app.use('/api/trips', requireAuth, requireApproved, tripsRouter);
app.use('/api', requireAuth, requireApproved, daysRouter);
app.use('/api', requireAuth, requireApproved, slotsRouter);
app.use('/api/ai', requireAuth, requireApproved, aiRouter);
app.use('/api/places', requireAuth, requireApproved, placesRouter);
app.use('/api/research', requireAuth, requireApproved, researchRouter);
app.use('/api/costs', requireAuth, requireApproved, costsRouter);

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
