const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

const SERVICE_LABELS = {
  'claude': 'Claude AI',
  'gemini': 'Gemini AI',
  'google-places': 'Google Places',
};

// GET /api/trips/:tripId/costs
router.get('/:tripId/costs', async (req, res, next) => {
  try {
    const costs = await prisma.apiCost.findMany({
      where: { tripId: req.params.tripId },
    });

    const byService = {};
    let totalCents = 0;

    for (const cost of costs) {
      totalCents += cost.costCents;
      if (!byService[cost.service]) {
        byService[cost.service] = { service: cost.service, label: SERVICE_LABELS[cost.service] || cost.service, costCents: 0, callCount: 0 };
      }
      byService[cost.service].costCents += cost.costCents;
      byService[cost.service].callCount += 1;
    }

    const breakdown = Object.values(byService).sort((a, b) => b.costCents - a.costCents);

    res.json({
      totalCents: Math.round(totalCents * 10000) / 10000,
      breakdown,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
