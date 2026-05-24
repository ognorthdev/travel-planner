const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// GET /api/trips - Get all trips
router.get('/', async (req, res, next) => {
  try {
    const trips = await prisma.trip.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { days: true } },
        apiCosts: { select: { costCents: true, service: true } },
      }
    });
    const tripsWithCosts = trips.map(trip => {
      const totalCostCents = trip.apiCosts.reduce((sum, c) => sum + c.costCents, 0);
      const costByService = {};
      for (const c of trip.apiCosts) {
        costByService[c.service] = (costByService[c.service] || 0) + c.costCents;
      }
      const { apiCosts, ...rest } = trip;
      return { ...rest, totalCostCents, costByService };
    });
    res.json(tripsWithCosts);
  } catch (err) {
    next(err);
  }
});

const DEFAULT_DAY_SLOTS = [
  { type: 'HOTEL', sortOrder: 0 },
];

// POST /api/trips - Create a new trip
router.post('/', async (req, res, next) => {
  try {
    const { name, destination, startDate, endDate, coverImageUrl } = req.body;

    if (!name || !destination || !startDate || !endDate) {
      return res.status(400).json({ error: 'name, destination, startDate, and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;

    const trip = await prisma.trip.create({
      data: {
        name,
        destination,
        startDate: start,
        endDate: end,
        coverImageUrl: coverImageUrl || null,
      },
    });

    for (let i = 0; i < totalDays; i++) {
      const dayDate = new Date(start);
      dayDate.setDate(dayDate.getDate() + i);

      const day = await prisma.day.create({
        data: {
          tripId: trip.id,
          date: dayDate,
          dayNumber: i + 1,
        },
      });

      await Promise.all(
        DEFAULT_DAY_SLOTS.map(slot =>
          prisma.slot.create({
            data: {
              dayId: day.id,
              type: slot.type,
              sortOrder: slot.sortOrder,
              data: '{}',
            },
          })
        )
      );
    }

    const fullTrip = await prisma.trip.findUnique({
      where: { id: trip.id },
      include: {
        days: {
          orderBy: { dayNumber: 'asc' },
          include: { slots: { orderBy: { sortOrder: 'asc' } } },
        },
      },
    });

    res.status(201).json(fullTrip);
  } catch (err) {
    next(err);
  }
});

// GET /api/trips/:id - Get a single trip
router.get('/:id', async (req, res, next) => {
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: req.params.id },
      include: {
        days: {
          orderBy: { dayNumber: 'asc' },
          include: {
            slots: {
              orderBy: { sortOrder: 'asc' }
            }
          }
        }
      }
    });

    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    // Parse slot data JSON
    const tripWithParsedSlots = {
      ...trip,
      days: trip.days.map(day => ({
        ...day,
        slots: day.slots.map(slot => ({
          ...slot,
          data: typeof slot.data === 'string' ? JSON.parse(slot.data) : slot.data
        }))
      }))
    };

    res.json(tripWithParsedSlots);
  } catch (err) {
    next(err);
  }
});

// PUT /api/trips/:id - Update a trip
router.put('/:id', async (req, res, next) => {
  try {
    const { name, destination, startDate, endDate, coverImageUrl, mealPreferences, activityPreferences } = req.body;

    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    const updatedTrip = await prisma.trip.update({
      where: { id: req.params.id },
      data: {
        ...(name && { name }),
        ...(destination && { destination }),
        ...(startDate && { startDate: new Date(startDate) }),
        ...(endDate && { endDate: new Date(endDate) }),
        ...(coverImageUrl !== undefined && { coverImageUrl }),
        ...(mealPreferences !== undefined && { mealPreferences }),
        ...(activityPreferences !== undefined && { activityPreferences }),
      }
    });

    res.json(updatedTrip);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/trips/:id - Delete a trip
router.delete('/:id', async (req, res, next) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.id } });
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

    await prisma.trip.delete({ where: { id: req.params.id } });
    res.json({ message: 'Trip deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/trips/:id/locations - Get all filled hotel/activity locations for address dropdown
router.get('/:id/locations', async (req, res, next) => {
  try {
    const trip = await prisma.trip.findUnique({
      where: { id: req.params.id },
      include: {
        days: {
          orderBy: { dayNumber: 'asc' },
          include: { slots: { where: { type: { in: ['HOTEL', 'ACTIVITY'] } } } }
        }
      }
    });
    if (!trip) return res.status(404).json({ error: 'Trip not found' });

    const locations = [];
    for (const day of trip.days) {
      for (const slot of day.slots) {
        const data = typeof slot.data === 'string' ? JSON.parse(slot.data) : (slot.data || {});
        if (slot.type === 'HOTEL' && data.hotelName && data.address) {
          locations.push({ label: data.hotelName, address: data.address, type: 'hotel', dayNumber: day.dayNumber });
        } else if (slot.type === 'ACTIVITY' && data.activityName && data.location) {
          locations.push({ label: data.activityName, address: data.location, type: 'activity', dayNumber: day.dayNumber });
        }
      }
    }
    res.json(locations);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
