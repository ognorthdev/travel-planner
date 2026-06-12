const express = require('express');
const router = express.Router();
const { rateLimit, ipKeyGenerator } = require('express-rate-limit');
const { prisma } = require('../lib/access');
const { safeParseJson } = require('../lib/json');

// Unauthenticated route — IP-keyed limiter to deter token scanning. Tokens
// are 192-bit random values, so brute force is hopeless anyway; this just
// keeps the noise down.
const publicLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req) => ipKeyGenerator(req.ip),
  message: { error: 'Too many requests — please slow down.', code: 'RATE_LIMITED' },
});

// Strip fields a public viewer has no business seeing. Slot data is trip
// content (names, addresses, photos) except private booking references.
function publicSlotData(data) {
  const { confirmationNumber, travelFromPrev, ...rest } = data;
  // travel times are fine to show; just re-attach without internal cache keys
  if (travelFromPrev) {
    const { key, ...times } = travelFromPrev;
    rest.travelFromPrev = times;
  }
  return rest;
}

// GET /api/public/trips/:token - read-only trip view for share links
router.get('/trips/:token', publicLimiter, async (req, res, next) => {
  try {
    const { token } = req.params;
    if (!token || token.length < 16) {
      return res.status(404).json({ error: 'Trip not found' });
    }
    const trip = await prisma.trip.findUnique({
      where: { shareToken: token },
      include: {
        days: {
          orderBy: { dayNumber: 'asc' },
          include: { slots: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    res.json({
      name: trip.name,
      destination: trip.destination,
      startDate: trip.startDate,
      endDate: trip.endDate,
      coverImageUrl: trip.coverImageUrl,
      days: trip.days.map((day) => ({
        id: day.id,
        date: day.date,
        dayNumber: day.dayNumber,
        slots: day.slots.map((slot) => ({
          id: slot.id,
          type: slot.type,
          sortOrder: slot.sortOrder,
          data: publicSlotData(safeParseJson(slot.data)),
        })),
      })),
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
