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
const { prisma } = require('./lib/access');

const app = express();
const PORT = process.env.PORT || 3001;

// Render terminates TLS at its proxy; trust the first hop so req.ip and
// req.protocol reflect the real client.
app.set('trust proxy', 1);

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
  res.json({
    email: req.user.email,
    status: req.user.status,
    isAdmin: req.user.isAdmin,
    researchContext: req.user.researchContext || '',
  });
});

// Update the current user's account-level preferences (research context).
app.put('/api/me', requireAuth, async (req, res, next) => {
  try {
    const { researchContext } = req.body;
    if (researchContext !== undefined) {
      if (typeof researchContext !== 'string' || researchContext.length > 5000) {
        return res.status(400).json({ error: 'researchContext must be a string of at most 5000 characters' });
      }
    }
    const updated = await prisma.appUser.update({
      where: { userId: req.user.id },
      data: { ...(researchContext !== undefined && { researchContext }) },
    });
    res.json({
      email: updated.email,
      status: updated.status,
      isAdmin: updated.isAdmin,
      researchContext: updated.researchContext || '',
    });
  } catch (err) {
    next(err);
  }
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

// Global error handler. Errors we threw on purpose (HttpError) carry a status
// and a user-safe message; anything else is an unexpected 500 whose message
// (Prisma/upstream-API details) must not reach the client in production.
app.use((err, req, res, next) => {
  console.error('Error:', err);
  const status = err.status || 500;
  const isProd = process.env.NODE_ENV === 'production';
  const message = (status >= 500 && isProd) ? 'Internal server error' : (err.message || 'Internal server error');
  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
});

const server = app.listen(PORT, () => {
  console.log(`Travel Planner backend running on http://localhost:${PORT}`);
});

// Graceful shutdown: Render sends SIGTERM on every deploy. Stop accepting new
// connections, let in-flight requests finish, then release DB connections.
function shutdown(signal) {
  console.log(`${signal} received, shutting down`);
  server.close(() => {
    prisma.$disconnect().finally(() => process.exit(0));
  });
  // Failsafe: don't hang forever on a stuck stream.
  setTimeout(() => process.exit(1), 10000).unref();
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = app;
