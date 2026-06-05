const express = require('express');
const router = express.Router();
const { recordCost, calculatePlacesCost } = require('../costs');
const { fetchEnrichment } = require('../enrichment');
const { assertTripAccess } = require('../lib/access');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

async function resolvePhotoUrls(photoRefs) {
  const results = await Promise.all(
    photoRefs.map(async (p) => {
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

// POST /api/places/autocomplete
router.post('/autocomplete', async (req, res, next) => {
  try {
    if (req.body.tripId) await assertTripAccess(req.body.tripId, req.user.id);
    const { input, locationBias } = req.body;
    if (!input || input.trim().length < 2) {
      return res.json({ predictions: [] });
    }

    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'your_google_maps_api_key_here') {
      return res.status(501).json({ error: 'Google Maps API key not configured' });
    }

    const url = 'https://places.googleapis.com/v1/places:autocomplete';
    const body = {
      input: input.trim(),
      languageCode: 'en',
    };

    if (locationBias) {
      body.locationBias = {
        circle: {
          center: { latitude: locationBias.lat, longitude: locationBias.lng },
          radius: 50000.0
        }
      };
    }

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('Places Autocomplete error:', response.status, err);
      return res.status(response.status).json({ error: 'Places API error', predictions: [] });
    }

    const data = await response.json();

    const tripId = req.body.tripId;
    recordCost({ tripId, service: 'google-places', operation: 'autocomplete', costCents: calculatePlacesCost([{ type: 'autocomplete', count: 1 }]) });

    const predictions = (data.suggestions || [])
      .filter(s => s.placePrediction)
      .map(s => ({
        description: s.placePrediction.text?.text || '',
        placeId: s.placePrediction.placeId,
        mainText: s.placePrediction.structuredFormat?.mainText?.text || '',
        secondaryText: s.placePrediction.structuredFormat?.secondaryText?.text || '',
      }));

    res.json({ predictions });
  } catch (err) {
    next(err);
  }
});

// GET /api/places/photos?name=...&address=...&placeId=...
router.get('/photos', async (req, res, next) => {
  try {
    if (req.query.tripId) await assertTripAccess(req.query.tripId, req.user.id);
    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'your_google_maps_api_key_here') {
      return res.json({ photos: [] });
    }

    const { name, address, placeId, tripId } = req.query;
    let resolvedPlaceId = placeId;
    let photos = [];
    const ops = [];

    // Try Place Details first if we have a placeId
    if (resolvedPlaceId && resolvedPlaceId !== 'null') {
      ops.push({ type: 'place-details', count: 1 });
      try {
        const detailUrl = `https://places.googleapis.com/v1/places/${resolvedPlaceId}`;
        const detailRes = await fetch(detailUrl, {
          method: 'GET',
          headers: {
            'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
            'X-Goog-FieldMask': 'photos',
          },
        });

        if (detailRes.ok) {
          const detailData = await detailRes.json();
          const photoRefs = (detailData.photos || []).slice(0, 2);
          if (photoRefs.length > 0) {
            ops.push({ type: 'photo-media', count: photoRefs.length });
            photos = await resolvePhotoUrls(photoRefs);
          }
        }
      } catch (e) {
        // Fall through to text search
      }
    }

    // Fall back to Text Search if Place Details yielded no photos
    if (photos.length === 0 && name) {
      ops.push({ type: 'text-search', count: 1 });
      const query = `${name} ${address || ''}`.trim();
      const searchUrl = `https://places.googleapis.com/v1/places:searchText`;
      const searchRes = await fetch(searchUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
          'X-Goog-FieldMask': 'places.id,places.photos',
        },
        body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
      });

      if (searchRes.ok) {
        const searchData = await searchRes.json();
        const place = searchData.places?.[0];
        if (place) {
          resolvedPlaceId = place.id;
          const photoRefs = (place.photos || []).slice(0, 2);
          if (photoRefs.length > 0) {
            ops.push({ type: 'photo-media', count: photoRefs.length });
            photos = await resolvePhotoUrls(photoRefs);
          }
        }
      }
    }

    if (ops.length > 0) {
      recordCost({ tripId, service: 'google-places', operation: 'photos', costCents: calculatePlacesCost(ops) });
    }

    res.json({ photos, placeId: resolvedPlaceId });
  } catch (err) {
    next(err);
  }
});

// GET /api/places/details/:placeId
router.get('/details/:placeId', async (req, res, next) => {
  try {
    if (req.query.tripId) await assertTripAccess(req.query.tripId, req.user.id);
    if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'your_google_maps_api_key_here') {
      return res.status(501).json({ error: 'Google Maps API key not configured' });
    }

    const { placeId } = req.params;
    const tripId = req.query.tripId;
    const url = `https://places.googleapis.com/v1/places/${placeId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
        'X-Goog-FieldMask': 'formattedAddress,nationalPhoneNumber,internationalPhoneNumber',
      },
    });

    recordCost({ tripId, service: 'google-places', operation: 'place-details', costCents: calculatePlacesCost([{ type: 'place-details', count: 1 }]) });

    if (!response.ok) {
      const err = await response.text();
      console.error('Place Details error:', response.status, err);
      return res.status(response.status).json({ error: 'Place Details API error' });
    }

    const data = await response.json();
    res.json({
      address: data.formattedAddress || '',
      phoneNumber: data.nationalPhoneNumber || data.internationalPhoneNumber || '',
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/places/enrich — look up a place by name+address (used for transient research
// suggestions that aren't saved cards yet). Saved cards persist their enrichment instead.
router.post('/enrich', async (req, res, next) => {
  try {
    const { name, address, tripId } = req.body;
    if (tripId) await assertTripAccess(tripId, req.user.id);
    if (!name) return res.json({ photos: [], rating: null, reviewCount: null });

    const { value, ops } = await fetchEnrichment(name, address);
    if (ops.length > 0) {
      recordCost({ tripId, service: 'google-places', operation: 'enrich', costCents: calculatePlacesCost(ops) });
    }
    res.json(value);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
