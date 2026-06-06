const express = require('express');
const router = express.Router();
const { recordCost, calculatePlacesCost } = require('../costs');
const { assertTripAccess } = require('../lib/access');

// Conditionally load AI SDKs
let anthropic = null;
let genAI = null;

try {
  const Anthropic = require('@anthropic-ai/sdk');
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
    anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
} catch (e) {
  console.warn('Anthropic SDK not available');
}

try {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
} catch (e) {
  console.warn('Google Generative AI SDK not available');
}

async function askClaude(prompt, maxTokens = 1024) {
  if (!anthropic) throw new Error('Anthropic API key not configured');
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    messages: [{ role: 'user', content: prompt }]
  });
  return {
    text: message.content[0].text,
    inputTokens: message.usage?.input_tokens || 0,
    outputTokens: message.usage?.output_tokens || 0,
    model: 'claude-sonnet-4-6',
    service: 'claude-sonnet',
  };
}

async function askGemini(prompt) {
  if (!genAI) throw new Error('Gemini API key not configured');
  const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
  const result = await model.generateContent(prompt);
  const usage = result.response.usageMetadata;
  return {
    text: result.response.text(),
    inputTokens: usage?.promptTokenCount || 0,
    outputTokens: usage?.candidatesTokenCount || 0,
    model: 'gemini-3.5-flash',
    service: 'gemini-flash',
  };
}

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function resolvePhotoUrls(photoRefs, maxPhotos = 2) {
  const results = await Promise.all(
    photoRefs.slice(0, maxPhotos).map(async (p) => {
      try {
        const mediaUrl = `https://places.googleapis.com/v1/${p.name}/media?maxHeightPx=400&maxWidthPx=600&key=${GOOGLE_MAPS_API_KEY}&skipHttpRedirect=true`;
        const resp = await fetch(mediaUrl);
        if (!resp.ok) return null;
        const data = await resp.json();
        return data.photoUri ? { url: data.photoUri } : null;
      } catch {
        return null;
      }
    })
  );
  return results.filter(Boolean);
}

async function geocodeLocation(query) {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.location,places.formattedAddress',
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });
  if (!resp.ok) return null;
  const data = await resp.json();
  const place = data.places?.[0];
  if (!place?.location) return null;
  return {
    lat: place.location.latitude,
    lng: place.location.longitude,
    address: place.formattedAddress || query,
  };
}

async function searchPlaces(query, locationBias, isMeal) {
  const url = 'https://places.googleapis.com/v1/places:searchText';
  const fieldMask = [
    'places.id', 'places.displayName', 'places.formattedAddress',
    'places.location', 'places.rating', 'places.userRatingCount',
    'places.priceLevel', 'places.photos', 'places.primaryType',
    'places.googleMapsUri',
  ].join(',');

  const body = {
    textQuery: query,
    maxResultCount: 10,
    languageCode: 'en',
  };

  if (locationBias) {
    body.locationBias = {
      circle: {
        center: { latitude: locationBias.lat, longitude: locationBias.lng },
        radius: 5000.0,
      },
    };
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': fieldMask,
    },
    body: JSON.stringify(body),
  });

  if (!resp.ok) {
    const err = await resp.text();
    console.error('Places Text Search error:', resp.status, err);
    return [];
  }

  const data = await resp.json();
  return (data.places || []).filter(p => {
    if (!p.location) return false;
    if (isMeal && p.userRatingCount && p.userRatingCount < 50) return false;
    if (p.rating && p.rating < 3.5) return false;
    return true;
  });
}

function priceLevelToSymbol(priceLevel) {
  const map = {
    PRICE_LEVEL_FREE: 'Free',
    PRICE_LEVEL_INEXPENSIVE: '$',
    PRICE_LEVEL_MODERATE: '$$',
    PRICE_LEVEL_EXPENSIVE: '$$$',
    PRICE_LEVEL_VERY_EXPENSIVE: '$$$$',
  };
  return map[priceLevel] || '$$';
}

function buildAugmentationPrompt(places, isMeal, destination, description, startLocation) {
  const placeList = places.map((p, i) =>
    `${i + 1}. ${p.name} — ${p.address} (rating: ${p.rating}, ${p.reviewCount} reviews)`
  ).join('\n');

  const travelerContext = description
    ? `\nThe traveler is searching for: "${description}". Tailor your responses to their interests — highlight dishes, tips, and details that are most relevant to what they're looking for.\n`
    : '';

  const travelTimeInstruction = `- "walkMinutes": estimated minutes to walk from the starting point (null if over 30 min)
- "transitMinutes": estimated minutes by public transit from the starting point
- "driveMinutes": estimated minutes to drive from the starting point`;

  if (isMeal) {
    return `You are a local food expert for ${destination}. I have a list of real restaurants from Google Maps. For each one, provide insider knowledge based on what you know about these specific restaurants.

The traveler's starting point is: ${startLocation.address}
${travelerContext}
Restaurants:
${placeList}

For each restaurant (use the EXACT name as listed), provide:
- "reason": 2-3 sentence description of why this restaurant is special and what to expect${description ? `, especially in relation to the traveler's interest in "${description}"` : ''}
- "shortDescription": a 3-4 word tagline capturing the essence of this restaurant (e.g. "Authentic wood-fired ramen", "Upscale sushi omakase", "Cozy Italian trattoria")
- "cuisine": the type of cuisine
- "topDishes": array of 3 objects with "name" and "description" (the most praised dishes from reviews${description ? ` — prioritize dishes relevant to "${description}"` : ''})
- "reviewTips": array of 3 practical tips visitors should know
- "lowRatingReasons": array of 3 common complaints from negative reviews (be honest)
${travelTimeInstruction}

Return ONLY valid JSON, no markdown, no code fences:
{
  "restaurants": [
    {
      "name": "exact restaurant name",
      "reason": "...",
      "shortDescription": "...",
      "cuisine": "...",
      "topDishes": [{"name": "...", "description": "..."}],
      "reviewTips": ["...", "...", "..."],
      "lowRatingReasons": ["...", "...", "..."],
      "walkMinutes": <number or null>,
      "transitMinutes": <number>,
      "driveMinutes": <number>
    }
  ]
}`;
  }

  return `You are a local travel expert for ${destination}. I have a list of real places/attractions from Google Maps. For each one, provide useful visitor information.

The traveler's starting point is: ${startLocation.address}
${travelerContext}
Places:
${placeList}

For each place (use the EXACT name as listed), provide:
- "reason": 2-3 sentence description of why this place is recommended and what to expect${description ? `, especially in relation to the traveler's interest in "${description}"` : ''}
- "shortDescription": a 3-4 word tagline capturing the essence of this place (e.g. "Stunning hilltop temple", "Vibrant local market", "Scenic river cruise")
- "category": activity category (Cultural, Adventure, Nature, Food, Shopping, etc.)
- "duration": suggested visit duration
${travelTimeInstruction}

Return ONLY valid JSON, no markdown, no code fences:
{
  "places": [
    {
      "name": "exact place name",
      "reason": "...",
      "shortDescription": "...",
      "category": "...",
      "duration": "...",
      "walkMinutes": <number or null>,
      "transitMinutes": <number>,
      "driveMinutes": <number>
    }
  ]
}`;
}

// POST /api/ai/discover - Discover restaurants or activities near a location
router.post('/discover', async (req, res, next) => {
  try {
    const { location, slotType, description, destination, excludeNames, tripId } = req.body;
    if (!location || !slotType || !destination) {
      return res.status(400).json({ error: 'location, slotType, and destination are required' });
    }
    if (tripId) await assertTripAccess(tripId, req.user.id);

    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'your_google_maps_api_key_here') {
      return res.status(501).json({ error: 'Google Maps API key not configured' });
    }

    const isMeal = ['BREAKFAST', 'LUNCH', 'DINNER'].includes(slotType);
    const mealLabel = slotType === 'BREAKFAST' ? 'breakfast' : slotType === 'LUNCH' ? 'lunch' : 'dinner';

    // Step 1: Geocode the starting location
    const startLocation = await geocodeLocation(location);
    if (!startLocation) {
      return res.status(400).json({ error: 'Could not find the starting location. Please try a more specific address.' });
    }

    // Step 2: Search for places using Google Places Text Search
    const searchQuery = isMeal
      ? `${mealLabel} restaurants ${description || ''} near ${location}`.trim()
      : `things to do ${description || ''} near ${location}`.trim();

    const places = await searchPlaces(searchQuery, startLocation, isMeal);
    if (places.length === 0) {
      return res.status(404).json({ error: 'No places found matching your criteria. Try broadening your search.' });
    }

    // Filter out excluded names (for "load more")
    const excludeSet = new Set((excludeNames || []).map(n => n.toLowerCase()));
    const filteredPlaces = places.filter(p => {
      const name = p.displayName?.text || '';
      return !excludeSet.has(name.toLowerCase());
    });

    // Step 3: Resolve photos for each place (in parallel)
    let photoApiCalls = 0;
    const placesWithPhotos = await Promise.all(
      filteredPlaces.map(async (place) => {
        const photoSlice = (place.photos || []).slice(0, 4);
        photoApiCalls += photoSlice.length;
        const photos = photoSlice.length > 0 ? await resolvePhotoUrls(place.photos, 4) : [];
        return {
          name: place.displayName?.text || '',
          address: place.formattedAddress || '',
          placeId: place.id || null,
          lat: place.location.latitude,
          lng: place.location.longitude,
          rating: place.rating || 0,
          reviewCount: place.userRatingCount || 0,
          priceRange: priceLevelToSymbol(place.priceLevel),
          googleMapsUrl: place.googleMapsUri || null,
          photos,
        };
      })
    );

    // Record Google Places costs (geocode + search + photos)
    const placesCost = calculatePlacesCost([
      { type: 'geocode', count: 1 },
      { type: 'text-search', count: 1 },
      { type: 'photo-media', count: photoApiCalls },
    ]);
    recordCost({ tripId, service: 'google-places', operation: 'discover', costCents: placesCost });

    // Step 4: AI augmentation — get rich descriptions, tips, dishes
    const cleanJson = (text) => {
      let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      }
      return cleaned;
    };

    const augmentPrompt = buildAugmentationPrompt(placesWithPhotos, isMeal, destination, description, startLocation);
    let augmentData = null;

    try {
      const result = await askGemini(augmentPrompt);
      augmentData = JSON.parse(cleanJson(result.text));
      recordCost({ tripId, service: result.service, operation: 'discover-augment', model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens });
    } catch (e) {
      console.error('Gemini augmentation failed:', e.message);
      try {
        const result = await askClaude(augmentPrompt, 8192);
        augmentData = JSON.parse(cleanJson(result.text));
        recordCost({ tripId, service: result.service, operation: 'discover-augment', model: result.model, inputTokens: result.inputTokens, outputTokens: result.outputTokens });
      } catch (e2) {
        console.error('Claude augmentation failed:', e2.message);
      }
    }

    // Step 5: Merge AI augmentation into place data
    const augmentList = isMeal ? augmentData?.restaurants : augmentData?.places;
    const augmentMap = new Map();
    if (Array.isArray(augmentList)) {
      for (const item of augmentList) {
        if (item.name) augmentMap.set(item.name.toLowerCase(), item);
      }
    }

    const results = placesWithPhotos.map(place => {
      const aug = augmentMap.get(place.name.toLowerCase()) || {};
      const travelTimes = {
        walkMinutes: aug.walkMinutes || null,
        transitMinutes: aug.transitMinutes || null,
        driveMinutes: aug.driveMinutes || null,
      };
      if (isMeal) {
        return {
          ...place,
          ...travelTimes,
          cuisine: aug.cuisine || '',
          reason: aug.reason || '',
          shortDescription: aug.shortDescription || '',
          topDishes: aug.topDishes || [],
          reviewTips: aug.reviewTips || [],
          lowRatingReasons: aug.lowRatingReasons || [],
        };
      }
      return {
        ...place,
        ...travelTimes,
        category: aug.category || '',
        duration: aug.duration || '',
        reason: aug.reason || '',
        shortDescription: aug.shortDescription || '',
      };
    });

    res.json({
      startLocation,
      results,
    });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
