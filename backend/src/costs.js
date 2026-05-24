const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const PRICING = {
  'claude-opus-4-7': { inputPerMTok: 1500, outputPerMTok: 7500 },
  'claude-sonnet-4-6': { inputPerMTok: 300, outputPerMTok: 1500 },
  'gemini-3.5-flash': { inputPerMTok: 150, outputPerMTok: 900 },
};

const PLACES_PRICING = {
  'text-search': 3.2,
  'geocode': 3.2,
  'autocomplete': 0.283,
  'place-details': 1.7,
  'photo-media': 0.7,
};

function calculateTokenCost(model, inputTokens, outputTokens) {
  const pricing = PRICING[model];
  if (!pricing) return 0;
  if (pricing.perRequest) return pricing.perRequest;
  const inputCost = (inputTokens / 1_000_000) * pricing.inputPerMTok;
  const outputCost = (outputTokens / 1_000_000) * pricing.outputPerMTok;
  return inputCost + outputCost;
}

function calculatePlacesCost(operations) {
  return operations.reduce((total, op) => {
    return total + (PLACES_PRICING[op.type] || 0) * (op.count || 1);
  }, 0);
}

async function recordCost({ tripId, service, operation, model, inputTokens, outputTokens, costCents }) {
  if (!tripId) return;
  try {
    const cost = costCents ?? calculateTokenCost(model, inputTokens || 0, outputTokens || 0);
    await prisma.apiCost.create({
      data: {
        tripId,
        service,
        operation,
        model: model || null,
        costCents: Math.round(cost * 10000) / 10000,
        inputTokens: inputTokens || null,
        outputTokens: outputTokens || null,
      }
    });
  } catch (e) {
    console.error('Failed to record API cost:', e.message);
  }
}

module.exports = { recordCost, calculateTokenCost, calculatePlacesCost, PLACES_PRICING, prisma };
