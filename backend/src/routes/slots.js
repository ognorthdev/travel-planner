const express = require('express');
const router = express.Router();
const { recordCost, calculatePlacesCost } = require('../costs');
const { prisma, assertTripAccess, tripIdForSlot } = require('../lib/access');
const { safeParseJson } = require('../lib/json');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

let genAI = null;
try {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
} catch (e) {
  console.warn('Google Generative AI SDK not available for slot enrichment');
}

const VALID_SLOT_TYPES = ['BREAKFAST', 'LUNCH', 'DINNER', 'ACTIVITY', 'HOTEL'];

async function resolvePhotoUrls(photoRefs) {
  const results = await Promise.all(
    photoRefs.map(async (p) => {
      try {
        const mediaUrl = `https://places.googleapis.com/v1/${p.name}/media?maxHeightPx=400&maxWidthPx=600&key=${GOOGLE_MAPS_API_KEY}&skipHttpRedirect=true`;
        const resp = await fetch(mediaUrl);
        if (!resp.ok) return null;
        const data = await resp.json();
        return data.photoUri ? { url: data.photoUri } : null;
      } catch { return null; }
    })
  );
  return results.filter(Boolean);
}

// GET /api/days/:dayId/slots - Get all slots for a day
router.get('/days/:dayId/slots', async (req, res, next) => {
  try {
    const day = await prisma.day.findUnique({ where: { id: req.params.dayId } });
    if (!day) {
      return res.status(404).json({ error: 'Day not found' });
    }
    await assertTripAccess(day.tripId, req.user.id);

    const slots = await prisma.slot.findMany({
      where: { dayId: req.params.dayId },
      orderBy: { sortOrder: 'asc' }
    });

    const parsedSlots = slots.map(slot => ({
      ...slot,
      data: safeParseJson(slot.data)
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
    await assertTripAccess(day.tripId, req.user.id);

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
      data: safeParseJson(slot.data)
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
    await assertTripAccess(await tripIdForSlot(req.params.id), req.user.id);

    res.json({
      ...slot,
      data: safeParseJson(slot.data)
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
    await assertTripAccess(await tripIdForSlot(req.params.id), req.user.id);

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
      data: safeParseJson(updatedSlot.data)
    });
  } catch (err) {
    next(err);
  }
});

// PUT /api/days/:dayId/slots/reorder - Reorder slots within a day
router.put('/days/:dayId/slots/reorder', async (req, res, next) => {
  try {
    const day = await prisma.day.findUnique({ where: { id: req.params.dayId } });
    if (!day) {
      return res.status(404).json({ error: 'Day not found' });
    }
    await assertTripAccess(day.tripId, req.user.id);

    const { slotIds } = req.body;
    if (!Array.isArray(slotIds)) {
      return res.status(400).json({ error: 'slotIds must be an array' });
    }
    // all reordered slots must belong to this day (no cross-day/trip writes)
    const ownedCount = await prisma.slot.count({ where: { id: { in: slotIds }, dayId: req.params.dayId } });
    if (ownedCount !== slotIds.length) {
      return res.status(400).json({ error: 'All slotIds must belong to this day' });
    }

    await prisma.$transaction(
      slotIds.map((id, index) =>
        prisma.slot.update({
          where: { id },
          data: { sortOrder: index }
        })
      )
    );

    const slots = await prisma.slot.findMany({
      where: { dayId: req.params.dayId },
      orderBy: { sortOrder: 'asc' }
    });

    const parsedSlots = slots.map(slot => ({
      ...slot,
      data: safeParseJson(slot.data)
    }));

    res.json(parsedSlots);
  } catch (err) {
    next(err);
  }
});

// PUT /api/slots/:id/move - Move a slot to a different day
router.put('/slots/:id/move', async (req, res, next) => {
  try {
    const slot = await prisma.slot.findUnique({ where: { id: req.params.id } });
    if (!slot) {
      return res.status(404).json({ error: 'Slot not found' });
    }
    const sourceTripId = await tripIdForSlot(req.params.id);
    await assertTripAccess(sourceTripId, req.user.id);

    const { targetDayId, position } = req.body;
    if (!targetDayId) {
      return res.status(400).json({ error: 'targetDayId is required' });
    }

    const targetDay = await prisma.day.findUnique({ where: { id: targetDayId } });
    if (!targetDay) {
      return res.status(404).json({ error: 'Target day not found' });
    }
    await assertTripAccess(targetDay.tripId, req.user.id);
    if (targetDay.tripId !== sourceTripId) {
      return res.status(400).json({ error: 'Cannot move a slot to a different trip' });
    }

    // Exclude the moved slot itself: when the move is within the same day it
    // would otherwise get a second, conflicting sortOrder update that wins.
    const targetSlots = (await prisma.slot.findMany({
      where: { dayId: targetDayId },
      orderBy: { sortOrder: 'asc' }
    })).filter(s => s.id !== req.params.id);

    const requestedPos = Number(position);
    const insertAt = Number.isInteger(requestedPos)
      ? Math.max(0, Math.min(requestedPos, targetSlots.length))
      : targetSlots.length;

    const updates = [];
    updates.push(
      prisma.slot.update({
        where: { id: req.params.id },
        data: { dayId: targetDayId, sortOrder: insertAt }
      })
    );
    targetSlots.forEach((s, i) => {
      const newOrder = i >= insertAt ? i + 1 : i;
      if (newOrder !== s.sortOrder) {
        updates.push(prisma.slot.update({ where: { id: s.id }, data: { sortOrder: newOrder } }));
      }
    });

    await prisma.$transaction(updates);

    const [sourceDaySlots, targetDaySlots] = await Promise.all([
      prisma.slot.findMany({ where: { dayId: slot.dayId }, orderBy: { sortOrder: 'asc' } }),
      prisma.slot.findMany({ where: { dayId: targetDayId }, orderBy: { sortOrder: 'asc' } }),
    ]);

    const parse = (s) => ({ ...s, data: safeParseJson(s.data) });

    res.json({
      sourceDayId: slot.dayId,
      targetDayId,
      sourceDaySlots: sourceDaySlots.map(parse),
      targetDaySlots: targetDaySlots.map(parse),
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
    await assertTripAccess(await tripIdForSlot(req.params.id), req.user.id);

    await prisma.slot.delete({ where: { id: req.params.id } });
    res.json({ message: 'Slot deleted successfully' });
  } catch (err) {
    next(err);
  }
});

// POST /api/slots/:id/enrich — Fetch rich detail data for a slot
router.post('/slots/:id/enrich', async (req, res, next) => {
  try {
    const slot = await prisma.slot.findUnique({
      where: { id: req.params.id },
      include: { day: { include: { slots: true, trip: true } } }
    });
    if (!slot) return res.status(404).json({ error: 'Slot not found' });
    await assertTripAccess(slot.day.tripId, req.user.id);

    const slotData = safeParseJson(slot.data);

    if (slotData.enrichment && !req.body.force) {
      return res.json(slotData.enrichment);
    }

    const tripId = slot.day.trip.id;
    const destination = slot.day.trip.destination;
    const isMeal = ['BREAKFAST', 'LUNCH', 'DINNER'].includes(slot.type);
    const name = slotData.activityName || slotData.restaurantName || slotData.name || '';
    const existingAddress = slotData.address || slotData.location || '';

    if (!name) {
      return res.json({ empty: true });
    }

    // Find hotel address from the same day for travel time context
    const hotelSlot = slot.day.slots.find(s => s.type === 'HOTEL' && s.id !== slot.id);
    const hotelData = hotelSlot ? safeParseJson(hotelSlot.data) : {};
    const hotelAddress = hotelData.address || '';

    // 1. Google Places: photos, rating, reviewCount, address, googleMapsUrl, operatingHours
    let placesResult = { photos: [], rating: null, reviewCount: null, address: existingAddress, googleMapsUrl: null, operatingHours: null, city: null };
    if (GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'your_google_maps_api_key_here') {
      try {
        const query = `${name} ${existingAddress || destination}`.trim();
        const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask': 'places.id,places.photos,places.rating,places.userRatingCount,places.formattedAddress,places.googleMapsUri,places.currentOpeningHours,places.addressComponents',
          },
          body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
        });

        const ops = [{ type: 'text-search', count: 1 }];

        if (searchRes.ok) {
          const searchData = await searchRes.json();
          const place = searchData.places?.[0];
          if (place) {
            const photoRefs = (place.photos || []).slice(0, 4);
            if (photoRefs.length > 0) {
              ops.push({ type: 'photo-media', count: photoRefs.length });
              placesResult.photos = await resolvePhotoUrls(photoRefs);
            }
            placesResult.rating = place.rating || null;
            placesResult.reviewCount = place.userRatingCount || null;
            placesResult.address = place.formattedAddress || existingAddress;
            placesResult.googleMapsUrl = place.googleMapsUri || null;
            const components = place.addressComponents || [];
            const locality = components.find(c => c.types?.includes('locality'));
            const adminArea = components.find(c => c.types?.includes('administrative_area_level_1'));
            placesResult.city = locality?.longText || adminArea?.longText || null;
            const hours = place.currentOpeningHours?.weekdayDescriptions;
            if (hours && hours.length > 0) {
              placesResult.operatingHours = hours.join('; ');
            }
          }
        }
        recordCost({ tripId, service: 'google-places', operation: 'slot-enrich', costCents: calculatePlacesCost(ops) });
      } catch (e) {
        console.error('Places enrichment failed:', e.message);
      }
    }

    // 2. AI enrichment: cost/tickets, travel times, review highlights, tips
    let aiResult = { costInfo: null, travelFromHotel: null, reviewHighlights: [], tips: [] };
    if (genAI) {
      try {
        const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
        const typeLabel = isMeal ? `restaurant (${slot.type.toLowerCase()})` : 'activity/attraction';
        const hotelContext = hotelAddress ? `The traveler's hotel is at: ${hotelAddress}.` : '';

        const prompt = `You are a travel research assistant. Provide detailed information about this ${typeLabel} in ${destination}.

Name: ${name}
Address: ${placesResult.address || 'unknown'}
${hotelContext}

Return a JSON object with these fields:
{
  "costInfo": {
    "description": "Brief cost overview (e.g. 'Free admission' or 'Mid-range restaurant')",
    "tickets": [
      { "type": "ticket/menu type", "price": "price with currency" }
    ]
  },
  ${hotelAddress ? `"travelFromHotel": {
    "carMinutes": estimated_car_drive_minutes_as_number,
    "transitMinutes": estimated_public_transit_minutes_as_number,
    "walkMinutes": estimated_walking_minutes_as_number_or_null_if_too_far
  },` : ''}
  "reviewHighlights": [
    "2-3 specific highlights or must-do things at this place based on common visitor feedback"
  ],
  "tips": [
    "2-3 practical tips or things to watch out for"
  ]
}

${isMeal ? 'For the costInfo tickets, list typical price ranges for different meal types (e.g. lunch set, dinner course, drinks). For reviewHighlights, focus on must-try dishes and atmosphere.' : 'For the costInfo tickets, list admission/ticket types and their prices. For reviewHighlights, focus on must-see exhibits, best experiences, and unique features.'}

Return ONLY valid JSON, no markdown or explanation.`;

        const result = await model.generateContent(prompt);
        const text = result.response.text();
        const cleaned = text.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
        const parsed = JSON.parse(cleaned);

        aiResult.costInfo = parsed.costInfo || null;
        aiResult.travelFromHotel = parsed.travelFromHotel || null;
        aiResult.reviewHighlights = parsed.reviewHighlights || [];
        aiResult.tips = parsed.tips || [];

        const usage = result.response.usageMetadata;
        if (usage) {
          recordCost({
            tripId,
            service: 'gemini-flash',
            operation: 'slot-enrich',
            model: 'gemini-3.5-flash',
            inputTokens: usage.promptTokenCount || 0,
            outputTokens: usage.candidatesTokenCount || 0,
          });
        }
      } catch (e) {
        console.error('AI enrichment failed:', e.message);
      }
    }

    const enrichment = {
      ...placesResult,
      ...aiResult,
      name,
      fetchedAt: new Date().toISOString(),
    };

    // Cache enrichment in slot data. Re-read the row first: enrichment takes
    // seconds (Places + Gemini), and writing back the blob we loaded at the
    // start would clobber any edit the user made in the meantime.
    const freshSlot = await prisma.slot.findUnique({ where: { id: slot.id } });
    if (freshSlot) {
      const freshData = safeParseJson(freshSlot.data);
      freshData.enrichment = enrichment;
      await prisma.slot.update({
        where: { id: slot.id },
        data: { data: JSON.stringify(freshData) }
      });
    }

    res.json(enrichment);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
