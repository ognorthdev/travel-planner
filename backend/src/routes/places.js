const express = require('express');
const router = express.Router();

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// POST /api/places/autocomplete
router.post('/autocomplete', async (req, res, next) => {
  try {
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

module.exports = router;
