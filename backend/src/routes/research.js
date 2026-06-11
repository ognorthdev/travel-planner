const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { recordCost, calculatePlacesCost } = require('../costs');
const { fetchEnrichment } = require('../enrichment');
const { assertTripAccess } = require('../lib/access');

const prisma = new PrismaClient();

// Anthropic client
let anthropic = null;
try {
  const Anthropic = require('@anthropic-ai/sdk');
  if (process.env.ANTHROPIC_API_KEY && process.env.ANTHROPIC_API_KEY !== 'your_anthropic_api_key_here') {
    anthropic = new Anthropic.default({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
} catch (e) {
  console.warn('Anthropic SDK not available for research');
}

// Gemini client (@google/generative-ai — generateContent)
let flashGenAI = null;
try {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    flashGenAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
} catch (e) {
  console.warn('Google Generative AI SDK not available');
}

function sendSSE(res, event, data) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

// Per-trip model assignments. Only the listed models are valid for each behaviour;
// Web Research is locked to Claude (needs web search) and enrichment to Google Places.
const DEFAULT_MODEL_CONFIG = {
  webResearch: 'claude-sonnet',
  mapsResearch: 'gemini-flash',
  questions: 'gemini-flash',
  extraction: 'gemini-flash',
  enrichment: 'google-places',
};

async function getModelConfig(tripId) {
  try {
    const trip = await prisma.trip.findUnique({ where: { id: tripId }, select: { modelConfig: true } });
    if (trip?.modelConfig) {
      const parsed = typeof trip.modelConfig === 'string' ? JSON.parse(trip.modelConfig) : trip.modelConfig;
      return { ...DEFAULT_MODEL_CONFIG, ...parsed };
    }
  } catch (e) {
    console.error('Failed to load model config:', e.message);
  }
  return { ...DEFAULT_MODEL_CONFIG };
}

function buildExtractionPrompt(text, destination) {
  return `You are analyzing a travel research report about ${destination}.
Extract EVERY specific restaurant, cafe, bar, and activity recommendation mentioned by name.
Be thorough — do not skip any named place. It is critical to extract as many as possible.

For each recommendation, classify it and output structured data.

Return ONLY valid JSON, no markdown:
{
  "suggestions": [
    {
      "type": "DINNER | LUNCH | BREAKFAST | ACTIVITY",
      "name": "specific place name",
      "description": "2-3 sentence description of what makes this place special",
      "data": {
        "address": "full street address in ${destination} — infer from context if not explicitly stated",
        "cuisine": "cuisine type (for restaurants/cafes, e.g. 'French Bistro', 'Japanese Ramen')",
        "category": "category (for activities, e.g. 'Museum', 'Walking Tour', 'Park')",
        "priceRange": "price range (e.g. '€15-30', '$$', 'Free'). Estimate from context if not explicit.",
        "duration": "estimated visit duration for activities (e.g. '2-3 hours')",
        "operatingHours": "hours or days if mentioned (e.g. 'Tue-Sun 9am-6pm', 'Closed Mondays')",
        "rating": null,
        "reviewCount": null,
        "description": "detailed description with practical tips",
        "mustTryDishes": ["dish 1", "dish 2"],
        "reviewSummary": ["positive highlight 1", "positive highlight 2"],
        "watchOutFor": ["caveat or warning"]
      }
    }
  ]
}

Rules:
- Extract EVERY named place — aim for completeness. If the text mentions 10 places, return 10.
- Only skip truly generic advice (e.g. "try the local markets") with no specific name.
- For cafes, bakeries, and brunch spots use "BREAKFAST". For restaurants without a clear meal type, use "DINNER".
- For bars, use "ACTIVITY" with category "Bar / Nightlife".
- If no specific places are mentioned, return {"suggestions": []}
- For mustTryDishes: extract any specific dishes, drinks, or items mentioned. Max 3.
- For reviewSummary: extract positive tips, highlights, or what visitors love. Max 3. If the text describes why a place is great, use that.
- For watchOutFor: extract caveats, warnings, or practical tips (e.g. "book ahead", "long queues", "cash only"). Max 2.
- Set rating/reviewCount to null unless explicitly stated with numbers.
- For address: use the full address if given. If only a neighborhood is mentioned, use "${destination}" as a suffix.
- For priceRange: if the text mentions any pricing info (per person, menu prices, etc.), include it. Estimate if context allows (e.g. "upscale" → "€€€€").

Research text:
"""
${text}
"""`;
}

// Parse the model's JSON response into a suggestions array, salvaging truncated JSON.
function parseSuggestions(responseText) {
  const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  if (firstBrace === -1 || lastBrace === -1) return [];
  let jsonStr = cleaned.slice(firstBrace, lastBrace + 1).replace(/,\s*([\]}])/g, '$1');
  try {
    return JSON.parse(jsonStr).suggestions || [];
  } catch {
    // If JSON is truncated, try to salvage by closing open arrays/objects
    const openBrackets = (jsonStr.match(/\[/g) || []).length - (jsonStr.match(/\]/g) || []).length;
    const openBraces = (jsonStr.match(/\{/g) || []).length - (jsonStr.match(/\}/g) || []).length;
    jsonStr = (jsonStr + ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces))).replace(/,\s*([\]}])/g, '$1');
    return JSON.parse(jsonStr).suggestions || [];
  }
}

async function extractSuggestions(text, destination, tripId, engine = 'gemini-flash') {
  const prompt = buildExtractionPrompt(text.slice(0, 30000), destination);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let responseText;
      if (engine === 'claude-sonnet') {
        if (!anthropic) return [];
        const message = await anthropic.messages.create({
          model: 'claude-sonnet-4-6',
          max_tokens: 20000,
          messages: [{ role: 'user', content: prompt }],
        });
        recordCost({ tripId, service: 'claude-sonnet', operation: 'research-extract', model: 'claude-sonnet-4-6', inputTokens: message.usage?.input_tokens || 0, outputTokens: message.usage?.output_tokens || 0 });
        responseText = message.content[0].text;
      } else {
        if (!flashGenAI) return [];
        const model = flashGenAI.getGenerativeModel({
          model: 'gemini-3.5-flash',
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 20000 },
        });
        const result = await model.generateContent(prompt);
        const response = result.response;
        const usage = response.usageMetadata || {};
        recordCost({ tripId, service: 'gemini-flash', operation: 'research-extract', model: 'gemini-3.5-flash', inputTokens: usage.promptTokenCount || 0, outputTokens: usage.candidatesTokenCount || 0 });
        responseText = response.text();
      }
      return parseSuggestions(responseText);
    } catch (e) {
      console.error('Suggestion extraction failed (attempt ' + (attempt + 1) + '):', e.message);
      if (attempt < 2) await sleep(3000 * (attempt + 1));
    }
  }
  return [];
}

// Stream a chat response from Claude Sonnet, returning the accumulated text.
async function streamClaudeText(res, { systemPrompt, query, messages, isClosed, tripId, operation, maxTokens = 4096 }) {
  const chatMessages = (messages || []).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
  chatMessages.push({ role: 'user', content: query });

  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: maxTokens,
    system: systemPrompt,
    messages: chatMessages,
  });

  let accumulatedText = '';
  stream.on('text', (text) => {
    if (isClosed()) return;
    accumulatedText += text;
    sendSSE(res, 'text', { content: text });
  });

  const finalMessage = await stream.finalMessage();
  if (isClosed()) return accumulatedText;

  recordCost({ tripId, service: 'claude-sonnet', operation, model: 'claude-sonnet-4-6', inputTokens: finalMessage.usage?.input_tokens || 0, outputTokens: finalMessage.usage?.output_tokens || 0 });
  return accumulatedText;
}

// Stream a chat response from Gemini Flash, returning the accumulated text. Retries on 503.
async function streamGeminiText(res, { systemPrompt, query, messages, isClosed, tripId, operation }) {
  const model = flashGenAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
  const chatHistory = (messages || []).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));
  const chat = model.startChat({
    history: chatHistory,
    systemInstruction: { parts: [{ text: systemPrompt }] },
  });

  const maxRetries = 2;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await chat.sendMessageStream(query);
      let accumulatedText = '';
      for await (const chunk of result.stream) {
        if (isClosed()) break;
        const text = chunk.text();
        if (text) {
          accumulatedText += text;
          sendSSE(res, 'text', { content: text });
        }
      }
      if (isClosed()) return accumulatedText;
      recordCost({ tripId, service: 'gemini-flash', operation, model: 'gemini-3.5-flash', inputTokens: Math.ceil(query.length / 4), outputTokens: Math.ceil(accumulatedText.length / 4) });
      return accumulatedText;
    } catch (err) {
      const is503 = err.status === 503 || err.message?.includes('503');
      if (is503 && attempt < maxRetries) {
        sendSSE(res, 'status', { phase: 'retrying' });
        await sleep(3000 * (attempt + 1));
        continue;
      }
      throw err;
    }
  }
}

// Run extraction on response text and stream the resulting cards to the client.
async function streamExtraction(res, text, destination, isClosed, tripId, engine) {
  if (!text || text.trim().length === 0) return;
  sendSSE(res, 'status', { phase: 'extracting' });
  const suggestions = await extractSuggestions(text, destination, tripId, engine);
  for (const suggestion of suggestions) {
    if (isClosed()) break;
    sendSSE(res, 'suggestion', suggestion);
    await sleep(200);
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// GET /api/research/:tripId/ideas
router.get('/:tripId/ideas', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.tripId, req.user.id);
    const ideas = await prisma.idea.findMany({
      where: { tripId: req.params.tripId },
      orderBy: { sortOrder: 'asc' }
    });
    res.json(ideas.map(idea => ({
      ...idea,
      data: typeof idea.data === 'string' ? JSON.parse(idea.data) : idea.data
    })));
  } catch (err) {
    next(err);
  }
});

// POST /api/research/:tripId/ideas
router.post('/:tripId/ideas', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.tripId, req.user.id);
    const { type, name, description, data } = req.body;
    if (!type || !name) {
      return res.status(400).json({ error: 'type and name are required' });
    }

    const maxOrder = await prisma.idea.aggregate({
      where: { tripId: req.params.tripId },
      _max: { sortOrder: true }
    });

    const idea = await prisma.idea.create({
      data: {
        tripId: req.params.tripId,
        type,
        name,
        description: description || '',
        data: typeof data === 'string' ? data : JSON.stringify(data || {}),
        sortOrder: (maxOrder._max.sortOrder ?? -1) + 1
      }
    });

    res.status(201).json({
      ...idea,
      data: typeof idea.data === 'string' ? JSON.parse(idea.data) : idea.data
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/research/ideas/:id/enrich — return the idea's stored enrichment, or fetch it
// once from Places and persist it onto the idea (so it's never billed again until deleted).
router.post('/ideas/:id/enrich', async (req, res, next) => {
  try {
    const idea = await prisma.idea.findUnique({ where: { id: req.params.id } });
    if (!idea) {
      return res.status(404).json({ error: 'Idea not found' });
    }
    await assertTripAccess(idea.tripId, req.user.id);
    const data = typeof idea.data === 'string' ? JSON.parse(idea.data || '{}') : (idea.data || {});

    if (data.enrichment && !req.body.force) {
      return res.json(data.enrichment); // already persisted on the card — no Places call
    }

    const { value, ops, found } = await fetchEnrichment(idea.name, data.address || '');
    if (ops.length > 0) {
      recordCost({ tripId: idea.tripId, service: 'google-places', operation: 'enrich', costCents: calculatePlacesCost(ops) });
    }
    if (found) {
      data.enrichment = value;
      await prisma.idea.update({ where: { id: idea.id }, data: { data: JSON.stringify(data) } });
    }
    res.json(value);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/research/ideas/:id
router.delete('/ideas/:id', async (req, res, next) => {
  try {
    const idea = await prisma.idea.findUnique({ where: { id: req.params.id } });
    if (!idea) {
      return res.status(404).json({ error: 'Idea not found' });
    }
    await assertTripAccess(idea.tripId, req.user.id);
    await prisma.idea.delete({ where: { id: req.params.id } });
    res.json({ message: 'Idea deleted' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/research/:tripId/ideas/reorder
router.put('/:tripId/ideas/reorder', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.tripId, req.user.id);
    const { ideaIds } = req.body;
    if (!Array.isArray(ideaIds)) {
      return res.status(400).json({ error: 'ideaIds array is required' });
    }
    // all reordered ideas must belong to this trip
    const ownedCount = await prisma.idea.count({ where: { id: { in: ideaIds }, tripId: req.params.tripId } });
    if (ownedCount !== ideaIds.length) {
      return res.status(400).json({ error: 'All ideaIds must belong to this trip' });
    }

    await Promise.all(
      ideaIds.map((id, index) =>
        prisma.idea.update({
          where: { id },
          data: { sortOrder: index }
        })
      )
    );

    const ideas = await prisma.idea.findMany({
      where: { tripId: req.params.tripId },
      orderBy: { sortOrder: 'asc' }
    });
    res.json(ideas.map(idea => ({
      ...idea,
      data: typeof idea.data === 'string' ? JSON.parse(idea.data) : idea.data
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/research/:tripId/summary
router.get('/:tripId/summary', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.tripId, req.user.id);
    const summary = await prisma.chatSummary.findUnique({
      where: { tripId: req.params.tripId }
    });
    if (!summary) {
      return res.status(404).json({ error: 'No chat summary found' });
    }
    res.json(summary);
  } catch (err) {
    next(err);
  }
});

// PUT /api/research/:tripId/summary
router.put('/:tripId/summary', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.tripId, req.user.id);
    const { summary } = req.body;
    if (!summary) {
      return res.status(400).json({ error: 'summary is required' });
    }

    const result = await prisma.chatSummary.upsert({
      where: { tripId: req.params.tripId },
      update: { summary },
      create: { tripId: req.params.tripId, summary }
    });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

// POST /api/research/:tripId/extract — re-extract idea cards from a single message's text
router.post('/:tripId/extract', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.tripId, req.user.id);
    const { text, destination } = req.body;
    if (!text || !destination) {
      return res.status(400).json({ error: 'text and destination are required' });
    }
    const config = await getModelConfig(req.params.tripId);
    const suggestions = await extractSuggestions(text, destination, req.params.tripId, config.extraction);
    res.json({ suggestions });
  } catch (err) {
    next(err);
  }
});

// POST /api/research/:tripId/stream — SSE streaming endpoint
router.post('/:tripId/stream', async (req, res) => {
  const { query, mode, messages, destination, mealPreferences, activityPreferences, tripContext } = req.body;
  if (!query || !destination) {
    return res.status(400).json({ error: 'query and destination are required' });
  }

  // Verify access before switching to the SSE response.
  try {
    await assertTripAccess(req.params.tripId, req.user.id);
  } catch (err) {
    return res.status(err.status || 403).json({ error: err.message || 'Forbidden' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let closed = false;
  res.on('close', () => { closed = true; });

  const tripId = req.params.tripId;
  try {
    const config = await getModelConfig(tripId);
    if (mode === 'web') {
      await handleWebResearch(res, query, messages, destination, () => closed, tripId, { mealPreferences, activityPreferences, tripContext, userContext: req.user.researchContext }, config.extraction, config.webResearch);
    } else if (mode === 'maps') {
      await handleMapsResearch(res, query, messages, destination, () => closed, tripId, config.mapsResearch, config.extraction);
    } else {
      await handleQuestions(res, query, messages, destination, () => closed, tripId, config.questions, config.extraction);
    }
  } catch (err) {
    console.error('Stream error:', err);
    if (!closed) {
      sendSSE(res, 'error', { message: err.message || 'An error occurred' });
    }
  }

  if (!closed) {
    sendSSE(res, 'done', {});
    res.end();
  }
});

// Web Research with Claude Sonnet + Anthropic web_search tool. Returns text for extraction.
async function claudeWebResearch(res, userPrompt, isClosed, tripId) {
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 20000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 10 }],
    messages: [{ role: 'user', content: userPrompt }],
  });

  let accumulatedText = '';
  stream.on('text', (text) => {
    if (isClosed()) return;
    accumulatedText += text;
    sendSSE(res, 'text', { content: text });
  });

  const finalMessage = await stream.finalMessage();
  if (isClosed()) return accumulatedText;

  recordCost({ tripId, service: 'claude-sonnet', operation: 'web-research', model: 'claude-sonnet-4-6', inputTokens: finalMessage.usage?.input_tokens || 0, outputTokens: finalMessage.usage?.output_tokens || 0 });

  // Extract full text from all text content blocks (stream.on('text') may miss text after tool results)
  const fullText = finalMessage.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n');
  if (fullText.length > accumulatedText.length && !isClosed()) {
    const missed = fullText.slice(accumulatedText.length);
    if (missed.trim()) sendSSE(res, 'text', { content: missed });
  }
  return fullText.length > accumulatedText.length ? fullText : accumulatedText;
}

// Web Research with Gemini Flash + Google Search grounding. Returns text for extraction.
async function geminiWebResearch(res, userPrompt, isClosed, tripId) {
  const model = flashGenAI.getGenerativeModel({
    model: 'gemini-3.5-flash',
    tools: [{ googleSearch: {} }],
  });
  const result = await model.generateContentStream(userPrompt);

  let accumulatedText = '';
  for await (const chunk of result.stream) {
    if (isClosed()) break;
    const text = chunk.text();
    if (text) {
      accumulatedText += text;
      sendSSE(res, 'text', { content: text });
    }
  }
  if (isClosed()) return accumulatedText;

  const usage = (await result.response).usageMetadata || {};
  recordCost({ tripId, service: 'gemini-flash', operation: 'web-research', model: 'gemini-3.5-flash', inputTokens: usage.promptTokenCount || 0, outputTokens: usage.candidatesTokenCount || 0 });
  return accumulatedText;
}

// Mode 1: Web Research — text engine configurable (Claude Sonnet default, or Gemini Flash). Both have live web access.
async function handleWebResearch(res, query, messages, destination, isClosed, tripId, preferences = {}, extractionEngine = 'gemini-flash', engine = 'claude-sonnet') {
  if (engine === 'gemini-flash' ? !flashGenAI : !anthropic) {
    sendSSE(res, 'error', { message: `${engine === 'gemini-flash' ? 'Gemini' : 'Anthropic'} API not configured.` });
    return;
  }

  sendSSE(res, 'status', { phase: 'researching' });

  const contextPrefix = messages && messages.length > 0
    ? `Context from our conversation so far:\n${messages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n')}\n\n`
    : '';

  const preferencesSection = [];
  if (preferences.userContext) {
    preferencesSection.push(`Traveler context (applies to all their trips): ${preferences.userContext}`);
  }
  if (preferences.tripContext) {
    preferencesSection.push(`Trip context: ${preferences.tripContext}`);
  }
  if (preferences.mealPreferences) {
    preferencesSection.push(`Meal preferences: ${preferences.mealPreferences}`);
  }
  if (preferences.activityPreferences) {
    preferencesSection.push(`Activity preferences: ${preferences.activityPreferences}`);
  }
  const preferencesText = preferencesSection.length > 0
    ? `\n\nUser preferences (apply these when making recommendations):\n${preferencesSection.join('\n')}`
    : '';

  const userPrompt = `${contextPrefix}Research the following about ${destination}: ${query}

Requirements:
- Provide at least 8-10 specific, named recommendations (restaurants, cafes, activities, experiences)
- For EACH recommendation include ALL of the following details:
  * Full name of the place
  * Full street address
  * Price range (e.g. €15-30 per person, or $$)
  * Operating hours or days open/closed
  * Cuisine type (for restaurants) or category (for activities)
  * 2-3 must-try dishes or highlights
  * 2-3 positive review highlights or tips from visitors
  * Any common complaints or caveats (e.g. long waits, closed certain days)
  * Estimated duration of visit (for activities)
- Prioritize breadth: cover different neighborhoods, price points, and styles
- Include both well-known spots and hidden gems
- Use web search to find current, accurate information${preferencesText}`;

  try {
    const textForExtraction = engine === 'gemini-flash'
      ? await geminiWebResearch(res, userPrompt, isClosed, tripId)
      : await claudeWebResearch(res, userPrompt, isClosed, tripId);
    if (isClosed()) return;

    await streamExtraction(res, textForExtraction, destination, isClosed, tripId, extractionEngine);
    sendSSE(res, 'status', { phase: 'done' });
  } catch (err) {
    console.error('Web Research error:', err);
    const isOverloaded = err.status === 529 || err.status === 503 || err.message?.includes('503');
    sendSSE(res, 'error', { message: isOverloaded
      ? 'The model is experiencing high demand. Please try again in a moment.'
      : `Web Research encountered an error: ${err.message || 'Please try again.'}` });
  }
}

// Mode 2: Maps Research — text engine configurable (Gemini Flash default, or Claude Sonnet)
async function handleMapsResearch(res, query, messages, destination, isClosed, tripId, engine = 'gemini-flash', extractionEngine = 'gemini-flash') {
  if (engine === 'claude-sonnet' ? !anthropic : !flashGenAI) {
    sendSSE(res, 'error', { message: `${engine === 'claude-sonnet' ? 'Anthropic' : 'Gemini'} API not configured.` });
    return;
  }

  sendSSE(res, 'status', { phase: 'researching' });

  const systemPrompt = `You are a local travel expert and maps researcher for ${destination}. You specialize in finding specific places, routes, neighborhoods, and geographic recommendations. For every recommendation you make, include: the full place name, full street address, neighborhood/area, price range, cuisine type or category, operating hours if known, 2-3 must-try dishes or highlights, walking/transit directions from popular areas, and any practical tips or caveats. Aim for at least 5 specific named places per response. Include geographic context like nearby landmarks and how to get there.`;

  try {
    const params = { systemPrompt, query, messages, isClosed, tripId, operation: 'maps-research' };
    const text = engine === 'claude-sonnet'
      ? await streamClaudeText(res, params)
      : await streamGeminiText(res, params);
    if (isClosed()) return;

    await streamExtraction(res, text, destination, isClosed, tripId, extractionEngine);
    sendSSE(res, 'status', { phase: 'done' });
  } catch (err) {
    console.error('Maps Research error:', err);
    const isOverloaded = err.status === 529 || err.status === 503 || err.message?.includes('503');
    sendSSE(res, 'error', { message: isOverloaded
      ? 'The model is experiencing high demand. Please try again in a moment.'
      : `Maps Research encountered an error: ${err.message || 'Please try again.'}` });
  }
}

// Mode 3: Questions — text engine configurable (Claude Sonnet default, or Gemini Flash)
async function handleQuestions(res, query, messages, destination, isClosed, tripId, engine = 'gemini-flash', extractionEngine = 'gemini-flash') {
  if (engine === 'claude-sonnet' ? !anthropic : !flashGenAI) {
    sendSSE(res, 'error', { message: `${engine === 'claude-sonnet' ? 'Anthropic' : 'Gemini'} API not configured.` });
    return;
  }

  sendSSE(res, 'status', { phase: 'researching' });

  const systemPrompt = `You are a travel research assistant helping plan a trip to ${destination}. For every recommendation you make, include: the full place name, full street address, price range, cuisine type or category, operating hours if known, 2-3 must-try dishes or highlights, and any practical tips or caveats. Aim for at least 5 specific named places per response. Be conversational and helpful.`;

  try {
    const params = { systemPrompt, query, messages, isClosed, tripId, operation: 'questions-chat' };
    const text = engine === 'claude-sonnet'
      ? await streamClaudeText(res, params)
      : await streamGeminiText(res, params);
    if (isClosed()) return;

    await streamExtraction(res, text, destination, isClosed, tripId, extractionEngine);
    sendSSE(res, 'status', { phase: 'done' });
  } catch (err) {
    console.error('Questions mode error:', err);
    const isOverloaded = err.status === 529 || err.status === 503 || err.message?.includes('503');
    sendSSE(res, 'error', { message: isOverloaded
      ? 'The model is experiencing high demand. Please try again in a moment.'
      : `Something went wrong: ${err.message || 'Please try again.'}` });
  }
}

module.exports = router;
