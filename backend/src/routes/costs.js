const express = require('express');
const router = express.Router();
const { prisma, assertTripAccess } = require('../lib/access');

const SERVICE_NORMALIZE = {
  'gemini': 'gemini-flash',
  'gemini-ai': 'gemini-flash',
};

const SERVICE_LABELS = {
  'claude-opus': 'Claude Opus',
  'claude-sonnet': 'Claude Sonnet',
  'gemini-flash': 'Gemini Flash',
  'google-places': 'Google Places',
};

// GET /api/trips/:tripId/costs
router.get('/:tripId/costs', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.tripId, req.user.id);
    const costs = await prisma.apiCost.findMany({
      where: { tripId: req.params.tripId },
    });

    const byService = {};
    let totalCents = 0;

    for (const cost of costs) {
      totalCents += cost.costCents;
      let service = SERVICE_NORMALIZE[cost.service] || cost.service;
      if (service === 'claude') {
        service = cost.model?.includes('opus') ? 'claude-opus' : 'claude-sonnet';
      }
      if (!byService[service]) {
        byService[service] = { service, label: SERVICE_LABELS[service] || service, costCents: 0, callCount: 0 };
      }
      byService[service].costCents += cost.costCents;
      byService[service].callCount += 1;
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
