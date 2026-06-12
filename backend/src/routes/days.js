const express = require('express');
const router = express.Router();
const { prisma, assertTripAccess } = require('../lib/access');
const { safeParseJson } = require('../lib/json');
const { recordCost, calculatePlacesCost } = require('../costs');
const { geocodePlace, computeTravelModes, routesConfigured } = require('../travel');
const { enrichLimiter } = require('../middleware/rateLimit');

// GET /api/trips/:tripId/days - Get all days for a trip
router.get('/trips/:tripId/days', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.tripId, req.user.id);

    const days = await prisma.day.findMany({
      where: { tripId: req.params.tripId },
      orderBy: { dayNumber: 'asc' },
      include: {
        slots: {
          orderBy: { sortOrder: 'asc' }
        }
      }
    });

    const daysWithParsedSlots = days.map(day => ({
      ...day,
      slots: day.slots.map(slot => ({
        ...slot,
        data: safeParseJson(slot.data)
      }))
    }));

    res.json(daysWithParsedSlots);
  } catch (err) {
    next(err);
  }
});

// POST /api/trips/:tripId/days - Create a new day for a trip
router.post('/trips/:tripId/days', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.tripId, req.user.id, { write: true });
    const trip = await prisma.trip.findUnique({ where: { id: req.params.tripId } });
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const { date, dayNumber } = req.body;

    // Auto-compute dayNumber if not provided
    let nextDayNumber = dayNumber;
    if (!nextDayNumber) {
      const lastDay = await prisma.day.findFirst({
        where: { tripId: req.params.tripId },
        orderBy: { dayNumber: 'desc' }
      });
      nextDayNumber = lastDay ? lastDay.dayNumber + 1 : 1;
    }

    // Auto-compute date if not provided
    let dayDate = date;
    if (!dayDate) {
      const tripStart = new Date(trip.startDate);
      tripStart.setDate(tripStart.getDate() + nextDayNumber - 1);
      dayDate = tripStart.toISOString();
    }

    const day = await prisma.day.create({
      data: {
        tripId: req.params.tripId,
        date: new Date(dayDate),
        dayNumber: nextDayNumber
      },
      include: {
        slots: true
      }
    });

    res.status(201).json(day);
  } catch (err) {
    next(err);
  }
});

// Pull a display name + address + coordinates out of a slot's data blob.
function slotLocation(slot) {
  const data = safeParseJson(slot.data);
  const name = data.activityName || data.restaurantName || data.hotelName || data.name || '';
  const address = data.address || data.location || data.enrichment?.address || '';
  const lat = data.lat ?? data.enrichment?.lat ?? null;
  const lng = data.lng ?? data.enrichment?.lng ?? null;
  return { data, name, address, lat, lng };
}

// POST /api/days/:dayId/travel-times - Compute walk/transit/drive times
// between consecutive located slots. Results are cached on each slot
// (data.travelFromPrev) keyed by the from/to pair, so repeat calls only hit
// the Routes API for pairs that changed. Pass { force: true } to recompute.
router.post('/days/:dayId/travel-times', enrichLimiter, async (req, res, next) => {
  try {
    const day = await prisma.day.findUnique({ where: { id: req.params.dayId } });
    if (!day) {
      return res.status(404).json({ error: 'Day not found' });
    }
    await assertTripAccess(day.tripId, req.user.id, { write: true });

    if (!routesConfigured()) {
      return res.status(501).json({ error: 'Google Maps API key not configured' });
    }

    const slots = await prisma.slot.findMany({
      where: { dayId: req.params.dayId },
      orderBy: { sortOrder: 'asc' },
    });

    const located = [];
    let geocodes = 0;
    for (const slot of slots) {
      const loc = slotLocation(slot);
      // Geocode slots that have a name/address but no stored coordinates yet
      // (also what feeds the day map), and persist the result.
      if ((loc.lat == null || loc.lng == null) && (loc.name || loc.address)) {
        const coords = await geocodePlace(loc.name, loc.address);
        geocodes += 1;
        if (coords) {
          loc.lat = coords.lat;
          loc.lng = coords.lng;
          loc.data.lat = coords.lat;
          loc.data.lng = coords.lng;
          await prisma.slot.update({
            where: { id: slot.id },
            data: { data: JSON.stringify(loc.data) },
          });
        }
      }
      if (loc.lat != null && loc.lng != null) {
        located.push({ slot, loc });
      }
    }
    if (geocodes > 0) {
      recordCost({ tripId: day.tripId, service: 'google-places', operation: 'travel-geocode', costCents: calculatePlacesCost([{ type: 'geocode', count: geocodes }]) });
    }

    let computed = 0;
    for (let i = 1; i < located.length; i++) {
      const from = located[i - 1];
      const to = located[i];
      const key = `${from.slot.id}:${from.loc.lat},${from.loc.lng}->${to.loc.lat},${to.loc.lng}`;
      const existing = to.loc.data.travelFromPrev;
      if (existing?.key === key && !req.body.force) continue;

      const modes = await computeTravelModes(from.loc, to.loc);
      recordCost({ tripId: day.tripId, service: 'google-places', operation: 'travel-times', costCents: calculatePlacesCost(modes.ops) });
      computed += 1;

      to.loc.data.travelFromPrev = {
        key,
        fromSlotId: from.slot.id,
        fromName: from.loc.name,
        walkMinutes: modes.walkMinutes,
        transitMinutes: modes.transitMinutes,
        driveMinutes: modes.driveMinutes,
        distanceMeters: modes.distanceMeters,
        computedAt: new Date().toISOString(),
      };
      await prisma.slot.update({
        where: { id: to.slot.id },
        data: { data: JSON.stringify(to.loc.data) },
      });
    }

    const fresh = await prisma.slot.findMany({
      where: { dayId: req.params.dayId },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({
      computedPairs: computed,
      locatedSlots: located.length,
      slots: fresh.map(s => ({ ...s, data: safeParseJson(s.data) })),
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/days/:id - Delete a day
router.delete('/days/:id', async (req, res, next) => {
  try {
    const day = await prisma.day.findUnique({ where: { id: req.params.id } });
    if (!day) {
      return res.status(404).json({ error: 'Day not found' });
    }
    await assertTripAccess(day.tripId, req.user.id, { write: true });

    await prisma.day.delete({ where: { id: req.params.id } });
    res.json({ message: 'Day deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
