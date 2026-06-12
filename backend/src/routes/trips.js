const express = require('express');
const router = express.Router();
const { prisma, assertTripAccess } = require('../lib/access');
const { safeParseJson } = require('../lib/json');

// GET /api/trips - Get all trips
router.get('/', async (req, res, next) => {
  try {
    const trips = await prisma.trip.findMany({
      where: { members: { some: { userId: req.user.id } } },
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { days: true } },
        apiCosts: { select: { costCents: true, service: true } },
        members: { where: { userId: req.user.id }, select: { role: true } },
      }
    });
    const tripsWithCosts = trips.map(trip => {
      const totalCostCents = trip.apiCosts.reduce((sum, c) => sum + c.costCents, 0);
      const costByService = {};
      for (const c of trip.apiCosts) {
        costByService[c.service] = (costByService[c.service] || 0) + c.costCents;
      }
      const { apiCosts, members, ...rest } = trip;
      // role of the current user on this trip (OWNER for trips they created)
      return { ...rest, totalCostCents, costByService, role: members[0]?.role || 'EDITOR' };
    });
    res.json(tripsWithCosts);
  } catch (err) {
    next(err);
  }
});

const DEFAULT_DAY_SLOTS = [
  { type: 'HOTEL', sortOrder: 0 },
];

// Hard cap on trip length: protects against a bogus endDate (e.g. year 2099)
// fanning out into thousands of Day inserts.
const MAX_TRIP_DAYS = 90;

// POST /api/trips - Create a new trip
router.post('/', async (req, res, next) => {
  try {
    const { name, destination, startDate, endDate, coverImageUrl } = req.body;

    if (!name || !destination || !startDate || !endDate) {
      return res.status(400).json({ error: 'name, destination, startDate, and endDate are required' });
    }

    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ error: 'startDate and endDate must be valid dates' });
    }
    if (end < start) {
      return res.status(400).json({ error: 'endDate must be on or after startDate' });
    }
    const totalDays = Math.round((end - start) / (1000 * 60 * 60 * 24)) + 1;
    if (totalDays > MAX_TRIP_DAYS) {
      return res.status(400).json({ error: `Trips are limited to ${MAX_TRIP_DAYS} days` });
    }

    // Create the trip with all its days and default slots atomically — a
    // failure partway through must not leave a half-built trip behind.
    const trip = await prisma.$transaction(async (tx) => {
      const created = await tx.trip.create({
        data: {
          name,
          destination,
          startDate: start,
          endDate: end,
          coverImageUrl: coverImageUrl || null,
          userId: req.user.id,
          // creator becomes the OWNER member
          members: { create: { email: req.user.email, userId: req.user.id, role: 'OWNER' } },
        },
      });

      for (let i = 0; i < totalDays; i++) {
        const dayDate = new Date(start);
        dayDate.setDate(dayDate.getDate() + i);
        await tx.day.create({
          data: {
            tripId: created.id,
            date: dayDate,
            dayNumber: i + 1,
            slots: {
              create: DEFAULT_DAY_SLOTS.map(slot => ({
                type: slot.type,
                sortOrder: slot.sortOrder,
                data: '{}',
              })),
            },
          },
        });
      }
      return created;
    });

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
    const trip = await prisma.trip.findFirst({
      where: { id: req.params.id, members: { some: { userId: req.user.id } } },
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
          data: safeParseJson(slot.data)
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
    const { name, destination, startDate, endDate, coverImageUrl, mealPreferences, activityPreferences, researchContext, modelConfig } = req.body;

    // any collaborator may edit trip details
    await assertTripAccess(req.params.id, req.user.id);

    if ((startDate && Number.isNaN(new Date(startDate).getTime())) ||
        (endDate && Number.isNaN(new Date(endDate).getTime()))) {
      return res.status(400).json({ error: 'startDate and endDate must be valid dates' });
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
        ...(researchContext !== undefined && { researchContext }),
        ...(modelConfig !== undefined && { modelConfig: typeof modelConfig === 'string' ? modelConfig : JSON.stringify(modelConfig) }),
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
    // only the owner may delete the whole trip
    await assertTripAccess(req.params.id, req.user.id, { requireOwner: true });

    await prisma.trip.delete({ where: { id: req.params.id } });
    res.json({ message: 'Trip deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// GET /api/trips/:id/locations - Get all filled hotel/activity locations for address dropdown
router.get('/:id/locations', async (req, res, next) => {
  try {
    const trip = await prisma.trip.findFirst({
      where: { id: req.params.id, members: { some: { userId: req.user.id } } },
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
        const data = safeParseJson(slot.data);
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

// GET /api/trips/:id/members - list collaborators (any member)
router.get('/:id/members', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.id, req.user.id);
    const members = await prisma.tripMember.findMany({
      where: { tripId: req.params.id },
      orderBy: { createdAt: 'asc' },
    });
    res.json(members.map((m) => ({
      id: m.id,
      email: m.email,
      role: m.role,
      joined: !!m.userId, // false = invited but hasn't signed up yet
      isYou: m.userId === req.user.id,
    })));
  } catch (err) {
    next(err);
  }
});

// POST /api/trips/:id/members - invite a collaborator by email (owner only)
router.post('/:id/members', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.id, req.user.id, { requireOwner: true });

    const { email, role } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'email is required' });
    }
    const lower = email.trim().toLowerCase();
    if (lower === req.user.email) {
      return res.status(400).json({ error: "You're already on this trip" });
    }
    const normalizedRole = role === 'VIEWER' ? 'VIEWER' : 'EDITOR';

    // If that email already has an account, link it now; otherwise the invite
    // is claimed automatically when they first sign in.
    const existing = await prisma.appUser.findFirst({ where: { email: lower } });

    const member = await prisma.tripMember.upsert({
      where: { tripId_email: { tripId: req.params.id, email: lower } },
      update: { role: normalizedRole, ...(existing ? { userId: existing.userId } : {}) },
      create: { tripId: req.params.id, email: lower, userId: existing?.userId || null, role: normalizedRole },
    });

    res.status(201).json({ id: member.id, email: member.email, role: member.role, joined: !!member.userId });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/trips/:id/members/:memberId - remove a collaborator (owner only)
router.delete('/:id/members/:memberId', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.id, req.user.id, { requireOwner: true });

    const target = await prisma.tripMember.findUnique({ where: { id: req.params.memberId } });
    if (!target || target.tripId !== req.params.id) {
      return res.status(404).json({ error: 'Member not found' });
    }
    if (target.role === 'OWNER') {
      return res.status(400).json({ error: 'The owner cannot be removed' });
    }

    await prisma.tripMember.delete({ where: { id: req.params.memberId } });
    res.json({ message: 'Collaborator removed' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
