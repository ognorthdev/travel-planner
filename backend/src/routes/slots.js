const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const VALID_SLOT_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'ACTIVITY', 'HOTEL'];

// GET /api/days/:dayId/slots - Get all slots for a day
router.get('/days/:dayId/slots', async (req, res, next) => {
  try {
    const day = await prisma.day.findUnique({ where: { id: req.params.dayId } });
    if (!day) {
      return res.status(404).json({ error: 'Day not found' });
    }

    const slots = await prisma.slot.findMany({
      where: { dayId: req.params.dayId },
      orderBy: { sortOrder: 'asc' }
    });

    const parsedSlots = slots.map(slot => ({
      ...slot,
      data: typeof slot.data === 'string' ? JSON.parse(slot.data) : slot.data
    }));

    res.json(parsedSlots);
  } catch (err) {
    next(err);
  }
});

// POST /api/days/:dayId/slots - Create a new slot
router.post('/days/:dayId/slots', async (req, res, next) => {
  try {
    const day = await prisma.day.findUnique({ where: { id: req.params.dayId } });
    if (!day) {
      return res.status(404).json({ error: 'Day not found' });
    }

    const { type, sortOrder, data } = req.body;

    if (!type || !VALID_SLOT_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_SLOT_TYPES.join(', ')}` });
    }

    // Auto-compute sortOrder based on type if not provided
    const typeSortOrder = { HOTEL: 0, BREAKFAST: 1, LUNCH: 5, DINNER: 9 };
    let slotSortOrder = sortOrder;
    if (slotSortOrder === undefined) {
      if (type === 'ACTIVITY') {
        const existingSlots = await prisma.slot.findMany({
          where: { dayId: req.params.dayId },
          orderBy: { sortOrder: 'desc' },
          take: 1
        });
        slotSortOrder = existingSlots.length > 0 ? existingSlots[0].sortOrder + 1 : 3;
      } else {
        slotSortOrder = typeSortOrder[type] ?? 10;
      }
    }

    const slot = await prisma.slot.create({
      data: {
        dayId: req.params.dayId,
        type,
        sortOrder: slotSortOrder,
        data: data ? JSON.stringify(data) : '{}'
      }
    });

    res.status(201).json({
      ...slot,
      data: JSON.parse(slot.data)
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/slots/:id - Get a single slot
router.get('/slots/:id', async (req, res, next) => {
  try {
    const slot = await prisma.slot.findUnique({ where: { id: req.params.id } });
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    res.json({
      ...slot,
      data: typeof slot.data === 'string' ? JSON.parse(slot.data) : slot.data
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/slots/:id - Update a slot
router.put('/slots/:id', async (req, res, next) => {
  try {
    const slot = await prisma.slot.findUnique({ where: { id: req.params.id } });
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    const { type, sortOrder, data } = req.body;

    if (type && !VALID_SLOT_TYPES.includes(type)) {
      return res.status(400).json({ error: `type must be one of: ${VALID_SLOT_TYPES.join(', ')}` });
    }

    const updatedSlot = await prisma.slot.update({
      where: { id: req.params.id },
      data: {
        ...(type && { type }),
        ...(sortOrder !== undefined && { sortOrder }),
        ...(data !== undefined && { data: JSON.stringify(data) })
      }
    });

    res.json({
      ...updatedSlot,
      data: typeof updatedSlot.data === 'string' ? JSON.parse(updatedSlot.data) : updatedSlot.data
    });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/slots/:id - Delete a slot
router.delete('/slots/:id', async (req, res, next) => {
  try {
    const slot = await prisma.slot.findUnique({ where: { id: req.params.id } });
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }

    await prisma.slot.delete({ where: { id: req.params.id } });
    res.json({ message: 'Slot deleted successfully' });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
