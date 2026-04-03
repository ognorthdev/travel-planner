const express = require('express');
const router = express.Router();

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
  return message.content[0].text;
}

async function askGemini(prompt) {
  if (!genAI) throw new Error('Gemini API key not configured');
  const model = genAI.getGenerativeModel({ model: 'gemini-3-flash-preview' });
  const result = await model.generateContent(prompt);
  return result.response.text();
}

// POST /api/ai/suggest-meal
router.post('/suggest-meal', async (req, res, next) => {
  try {
    const { destination, mealType, cuisinePreferences, budget, notes } = req.body;

    if (!destination || !mealType) {
      return res.status(400).json({ error: 'destination and mealType are required' });
    }

    const prompt = `You are a travel food expert. Suggest a ${mealType.toLowerCase()} restaurant for a traveler visiting ${destination}.
${cuisinePreferences ? `Cuisine preferences: ${cuisinePreferences}` : ''}
${budget ? `Budget: ${budget}` : ''}
${notes ? `Additional notes: ${notes}` : ''}

Respond with a JSON object (no markdown, pure JSON) with these fields:
{
  "restaurantName": "name of restaurant",
  "cuisine": "type of cuisine",
  "address": "approximate address or area",
  "priceRange": "$ | $$ | $$$ | $$$$",
  "description": "brief description of why this is a great choice",
  "mustTry": "signature dish or item to try",
  "tips": "practical tip for visiting"
}`;

    let suggestion;
    let source = 'placeholder';

    try {
      const text = await askClaude(prompt);
      suggestion = JSON.parse(text);
      source = 'claude';
    } catch (e) {
      try {
        const text = await askGemini(prompt);
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        suggestion = JSON.parse(cleaned);
        source = 'gemini';
      } catch (e2) {
        // Return placeholder data
        suggestion = {
          restaurantName: `A Great ${mealType} Spot in ${destination}`,
          cuisine: cuisinePreferences || 'Local',
          address: `Central ${destination}`,
          priceRange: budget || '$$',
          description: `A highly recommended ${mealType.toLowerCase()} restaurant in ${destination} known for its authentic flavors and warm atmosphere.`,
          mustTry: 'Chef\'s special of the day',
          tips: 'Make a reservation in advance, especially on weekends.'
        };
        source = 'placeholder';
      }
    }

    res.json({ suggestion, source });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/suggest-activity
router.post('/suggest-activity', async (req, res, next) => {
  try {
    const { destination, category, duration, notes } = req.body;

    if (!destination) {
      return res.status(400).json({ error: 'destination is required' });
    }

    const prompt = `You are a travel expert. Suggest an activity for a traveler visiting ${destination}.
${category ? `Category preference: ${category}` : ''}
${duration ? `Available time: ${duration}` : ''}
${notes ? `Additional notes: ${notes}` : ''}

Respond with a JSON object (no markdown, pure JSON) with these fields:
{
  "activityName": "name of activity",
  "category": "type of activity (Cultural, Adventure, Nature, Food, Shopping, etc.)",
  "location": "specific location or area",
  "duration": "recommended time needed",
  "description": "why this activity is a must-do",
  "highlights": "top 2-3 highlights in a single string",
  "tips": "practical tip for this activity",
  "bestTime": "best time of day to visit"
}`;

    let suggestion;
    let source = 'placeholder';

    try {
      const text = await askClaude(prompt);
      suggestion = JSON.parse(text);
      source = 'claude';
    } catch (e) {
      try {
        const text = await askGemini(prompt);
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        suggestion = JSON.parse(cleaned);
        source = 'gemini';
      } catch (e2) {
        suggestion = {
          activityName: `Explore ${destination}`,
          category: category || 'Cultural',
          location: `Downtown ${destination}`,
          duration: duration || '2-3 hours',
          description: `An iconic experience that captures the essence of ${destination}. A must-do for any visitor.`,
          highlights: 'Stunning views, local culture, unique experiences',
          tips: 'Go early to avoid crowds and get the best experience.',
          bestTime: 'Morning or late afternoon'
        };
        source = 'placeholder';
      }
    }

    res.json({ suggestion, source });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/search-hotel
router.post('/search-hotel', async (req, res, next) => {
  try {
    const { destination, checkIn, checkOut, budget, preferences, notes } = req.body;

    if (!destination) {
      return res.status(400).json({ error: 'destination is required' });
    }

    const prompt = `You are a travel accommodation expert. Suggest a hotel for a traveler visiting ${destination}.
${checkIn ? `Check-in: ${checkIn}` : ''}
${checkOut ? `Check-out: ${checkOut}` : ''}
${budget ? `Budget per night: ${budget}` : ''}
${preferences ? `Preferences: ${preferences}` : ''}
${notes ? `Additional notes: ${notes}` : ''}

Respond with a JSON object (no markdown, pure JSON) with these fields:
{
  "hotelName": "name of hotel",
  "address": "hotel address or area",
  "starRating": 4,
  "priceRange": "approximate price per night in USD",
  "description": "why this hotel is a great choice",
  "amenities": "top 3-4 amenities as a comma-separated string",
  "neighborhood": "description of the neighborhood",
  "tips": "practical tip for staying here"
}`;

    let suggestion;
    let source = 'placeholder';

    try {
      const text = await askClaude(prompt);
      suggestion = JSON.parse(text);
      source = 'claude';
    } catch (e) {
      try {
        const text = await askGemini(prompt);
        const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
        suggestion = JSON.parse(cleaned);
        source = 'gemini';
      } catch (e2) {
        suggestion = {
          hotelName: `Premier Hotel ${destination}`,
          address: `Central ${destination}`,
          starRating: 4,
          priceRange: budget || '$150-250/night',
          description: `A highly-rated hotel in the heart of ${destination}, offering excellent comfort and convenient access to major attractions.`,
          amenities: 'Free WiFi, Breakfast included, Fitness center, Concierge service',
          neighborhood: `Located in the vibrant city center of ${destination}, walking distance to major attractions.`,
          tips: 'Book directly with the hotel for best rates and flexible cancellation.'
        };
        source = 'placeholder';
      }
    }

    res.json({ suggestion, source });
  } catch (err) {
    next(err);
  }
});

// POST /api/ai/discover - Discover restaurants or activities near a location
router.post('/discover', async (req, res, next) => {
  try {
    const { location, slotType, description, destination } = req.body;
    if (!location || !slotType || !destination) {
      return res.status(400).json({ error: 'location, slotType, and destination are required' });
    }

    const isMeal = ['BREAKFAST', 'LUNCH', 'DINNER'].includes(slotType);
    const mealLabel = slotType === 'BREAKFAST' ? 'Breakfast' : slotType === 'LUNCH' ? 'Lunch' : 'Dinner';

    const prompt = isMeal
      ? `You are a local food expert with deep knowledge of Google Maps restaurant data for ${destination}. A traveler is at or near: "${location}".
They want ${mealLabel} options.${description ? ` Their preferences: ${description}` : ''}

Find 6-8 real restaurants that are reachable within a 10 minute walk, 10 minute transit ride, or 5 minute drive from the starting location. Include a mix of transport options. Only include restaurants you are confident actually exist, with at least 3.5 star rating on Google Maps.

For each restaurant, provide:
- The real business name and full street address
- Accurate Google Maps star rating and approximate review count
- How long it takes to get there by walking, transit, and driving (include all three)
- A short description of why this restaurant is recommended for this traveler

Return ONLY a valid JSON object with no markdown formatting, no code fences, no extra text:
{
  "startLocation": { "lat": <number>, "lng": <number>, "address": "${location}" },
  "results": [
    {
      "name": "restaurant name",
      "address": "full street address",
      "lat": <number>,
      "lng": <number>,
      "rating": <number 3.5-5.0>,
      "reviewCount": <number>,
      "walkMinutes": <number or null if not walkable>,
      "transitMinutes": <number>,
      "driveMinutes": <number>,
      "cuisine": "cuisine type",
      "priceRange": "$ or $$ or $$$ or $$$$",
      "reason": "2-3 sentence description of why this restaurant is recommended, what makes it special, and what to expect"
    }
  ]
}`
      : `You are a local travel expert with deep knowledge of Google Maps data for ${destination}. A traveler is at or near: "${location}".
They want activity suggestions.${description ? ` Their preferences: ${description}` : ''}

Find 6-8 real activities/attractions reachable within a 10 minute walk, 10 minute transit ride, or 5 minute drive from the starting location. Include a mix of transport options. Only include places you are confident actually exist, with at least 3.5 star rating on Google Maps.

For each place, provide:
- The real business/attraction name and full street address
- Accurate Google Maps star rating and approximate review count
- How long it takes to get there by walking, transit, and driving (include all three)
- A short description of why this place is recommended

Return ONLY a valid JSON object with no markdown formatting, no code fences, no extra text:
{
  "startLocation": { "lat": <number>, "lng": <number>, "address": "${location}" },
  "results": [
    {
      "name": "place or activity name",
      "address": "full street address",
      "lat": <number>,
      "lng": <number>,
      "rating": <number 3.5-5.0>,
      "reviewCount": <number>,
      "walkMinutes": <number or null if not walkable>,
      "transitMinutes": <number>,
      "driveMinutes": <number>,
      "category": "activity category",
      "duration": "suggested visit duration",
      "reason": "2-3 sentence description of why this place is recommended and what to expect"
    }
  ]
}`;

    const cleanJson = (text) => {
      let cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      // Find the first { and last } to extract JSON even if surrounded by text
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
        cleaned = cleaned.slice(firstBrace, lastBrace + 1);
      }
      return cleaned;
    };

    let data;
    try {
      const text = await askGemini(prompt);
      data = JSON.parse(cleanJson(text));
    } catch (e) {
      console.error('Gemini discover failed:', e.message);
      try {
        const text = await askClaude(prompt, 4096);
        data = JSON.parse(cleanJson(text));
      } catch (e2) {
        console.error('Claude discover failed:', e2.message);
        return res.status(500).json({ error: 'Failed to get discovery results. Please try again.' });
      }
    }

    // Validate the response structure
    if (!data || !data.startLocation || !Array.isArray(data.results)) {
      return res.status(500).json({ error: 'Received invalid data from AI. Please try again.' });
    }

    res.json(data);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
