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
        _count: { select: { days: true } }
      }
    });
    res.json(trips);
  } catch (err) {
    next(err);
  }
});

// POST /api/trips - Create a new trip
router.post('/', async (req, res, next) => {
  try {
    const { name, destination, startDate, endDate, coverImageUrl } = req.body;

    if (!name || !destination || !startDate || !endDate) {
      return res.status(400).json({ error: 'name, destination, startDate, and endDate are required' });
    }

    const trip = await prisma.trip.create({
      data: {
        name,
        destination,
        startDate: new Date(startDate),
        endDate: new Date(endDate),
        coverImageUrl: coverImageUrl || null
      }
    });

    res.status(201).json(trip);
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
    const { name, destination, startDate, endDate, coverImageUrl } = req.body;

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
        ...(coverImageUrl !== undefined && { coverImageUrl })
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
