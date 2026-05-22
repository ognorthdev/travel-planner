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

const app = express();
const PORT = process.env.PORT || 3001;

app.use(cors({
  origin: ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: true
}));
app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/trips', tripsRouter);
app.use('/api', daysRouter);
app.use('/api', slotsRouter);
app.use('/api/ai', aiRouter);
app.use('/api/places', placesRouter);
app.use('/api/research', researchRouter);
app.use('/api/costs', costsRouter);

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
