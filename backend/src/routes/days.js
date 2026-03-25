const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

// GET /api/trips/:tripId/days - Get all days for a trip
router.get('/trips/:tripId/days', async (req, res, next) => {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: req.params.tripId } });
    if (!trip) {
      return res.status(404).json({ error: 'Trip not found' });
    }

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
        data: typeof slot.data === 'string' ? JSON.parse(slot.data) : slot.data
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

// DELETE /api/days/:id - Delete a day
router.delete('/days/:id', async (req, res, next) => {
  try {
    const day = await prisma.day.findUnique({ where: { id: req.params.id } });
    if (!day) {
      return res.status(404).json({ error: 'Day not found' });
    }

    await prisma.day.delete({ where: { id: req.params.id } });
    res.json({ message: 'Day deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
