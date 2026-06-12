const express = require('express');
const router = express.Router();
const { recordCost, calculatePlacesCost } = require('../costs');
const { fetchEnrichment } = require('../enrichment');
const { prisma, assertTripAccess } = require('../lib/access');
const { safeParseJson } = require('../lib/json');
const { aiLimiter, enrichLimiter } = require('../middleware/rateLimit');

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
  ideaScraper: 'claude-sonnet',
  extraction: 'gemini-flash',
  enrichment: 'google-places',
};

// Logical Gemini engine keys (as shown in the model grid) → concrete model ids.
// `gemini-flash` = Gemini Flash 3.5, `gemini-flash-3` = the cheaper Gemini Flash 3.
const GEMINI_MODEL_IDS = {
  'gemini-flash': 'gemini-3.5-flash',
  'gemini-flash-3': 'gemini-3-flash-preview',
};
function isGeminiEngine(engine) {
  return engine === 'gemini-flash' || engine === 'gemini-flash-3';
}
function geminiModelId(engine) {
  return GEMINI_MODEL_IDS[engine] || 'gemini-3.5-flash';
}

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
        const modelId = geminiModelId(engine);
        const model = flashGenAI.getGenerativeModel({
          model: modelId,
          generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 20000 },
        });
        const result = await model.generateContent(prompt);
        const response = result.response;
        const usage = response.usageMetadata || {};
        recordCost({ tripId, service: 'gemini-flash', operation: 'research-extract', model: modelId, inputTokens: usage.promptTokenCount || 0, outputTokens: usage.candidatesTokenCount || 0 });
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
async function streamGeminiText(res, { systemPrompt, query, messages, isClosed, tripId, operation, modelId = 'gemini-3.5-flash' }) {
  const model = flashGenAI.getGenerativeModel({ model: modelId });
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
      // Bill from the API's own usage metadata; fall back to a length
      // estimate only if the response shape doesn't include it.
      const usage = (await result.response)?.usageMetadata || {};
      recordCost({
        tripId, service: 'gemini-flash', operation, model: modelId,
        inputTokens: usage.promptTokenCount ?? Math.ceil(query.length / 4),
        outputTokens: usage.candidatesTokenCount ?? Math.ceil(accumulatedText.length / 4),
      });
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
      data: safeParseJson(idea.data)
    })));
  } catch (err) {
    next(err);
  }
});

// POST /api/research/:tripId/ideas
router.post('/:tripId/ideas', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.tripId, req.user.id, { write: true });
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
      data: safeParseJson(idea.data)
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/research/ideas/:id/enrich — return the idea's stored enrichment, or fetch it
// once from Places and persist it onto the idea (so it's never billed again until deleted).
router.post('/ideas/:id/enrich', enrichLimiter, async (req, res, next) => {
  try {
    const idea = await prisma.idea.findUnique({ where: { id: req.params.id } });
    if (!idea) {
      return res.status(404).json({ error: 'Idea not found' });
    }
    // write: enrichment spends Places budget and persists onto the idea
    await assertTripAccess(idea.tripId, req.user.id, { write: true });
    const data = safeParseJson(idea.data);

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
    await assertTripAccess(idea.tripId, req.user.id, { write: true });
    await prisma.idea.delete({ where: { id: req.params.id } });
    res.json({ message: 'Idea deleted' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/research/:tripId/ideas/reorder
router.put('/:tripId/ideas/reorder', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.tripId, req.user.id, { write: true });
    const { ideaIds } = req.body;
    if (!Array.isArray(ideaIds)) {
      return res.status(400).json({ error: 'ideaIds array is required' });
    }
    // all reordered ideas must belong to this trip
    const ownedCount = await prisma.idea.count({ where: { id: { in: ideaIds }, tripId: req.params.tripId } });
    if (ownedCount !== ideaIds.length) {
      return res.status(400).json({ error: 'All ideaIds must belong to this trip' });
    }

    await prisma.$transaction(
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
      data: safeParseJson(idea.data)
    })));
  } catch (err) {
    next(err);
  }
});

// GET /api/research/:tripId/messages — persisted chat history
router.get('/:tripId/messages', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.tripId, req.user.id);
    const messages = await prisma.chatMessage.findMany({
      where: { tripId: req.params.tripId },
      // cuid is a monotonic tie-break for messages created in the same ms
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: 500,
    });
    res.json(messages);
  } catch (err) {
    next(err);
  }
});

// POST /api/research/:tripId/messages — append messages (single or array)
router.post('/:tripId/messages', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.tripId, req.user.id, { write: true });
    const incoming = Array.isArray(req.body.messages) ? req.body.messages : [req.body];
    const valid = incoming.filter(m =>
      m && (m.role === 'user' || m.role === 'assistant') &&
      typeof m.content === 'string' && m.content.length > 0 && m.content.length <= 100000
    );
    if (valid.length === 0) {
      return res.status(400).json({ error: 'messages must have role (user|assistant) and non-empty content' });
    }
    // createMany doesn't return rows; create sequentially so createdAt ordering
    // matches the conversation order even within the same millisecond batch.
    const saved = [];
    for (const m of valid) {
      saved.push(await prisma.chatMessage.create({
        data: {
          tripId: req.params.tripId,
          role: m.role,
          content: m.content,
          mode: typeof m.mode === 'string' ? m.mode : null,
        },
      }));
    }
    res.status(201).json(saved);
  } catch (err) {
    next(err);
  }
});

// DELETE /api/research/:tripId/messages — clear the chat history
router.delete('/:tripId/messages', async (req, res, next) => {
  try {
    await assertTripAccess(req.params.tripId, req.user.id, { write: true });
    await prisma.chatMessage.deleteMany({ where: { tripId: req.params.tripId } });
    res.json({ message: 'Chat history cleared' });
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
    await assertTripAccess(req.params.tripId, req.user.id, { write: true });
    const { summary } = req.body;
    // Empty string is allowed: it clears the summary.
    if (typeof summary !== 'string') {
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
router.post('/:tripId/extract', aiLimiter, async (req, res, next) => {
  try {
    // write: extraction runs a paid model call
    await assertTripAccess(req.params.tripId, req.user.id, { write: true });
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
router.post('/:tripId/stream', aiLimiter, async (req, res) => {
  const { query, mode, messages, destination, mealPreferences, activityPreferences, tripContext, injectContext } = req.body;
  if (!query || !destination) {
    return res.status(400).json({ error: 'query and destination are required' });
  }

  // Verify access before switching to the SSE response. write: research
  // streams run paid model calls.
  try {
    await assertTripAccess(req.params.tripId, req.user.id, { write: true });
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

  // Heartbeat: long research calls can go quiet for minutes while the model
  // searches; without traffic, Render's proxy drops the idle connection. SSE
  // comment lines (leading colon) are ignored by the client parser.
  const heartbeat = setInterval(() => {
    if (!closed) res.write(': ping\n\n');
  }, 20000);
  res.on('close', () => clearInterval(heartbeat));

  const tripId = req.params.tripId;
  try {
    const config = await getModelConfig(tripId);
    if (mode === 'web') {
      await handleWebResearch(res, query, messages, destination, () => closed, tripId, { mealPreferences, activityPreferences, tripContext, userContext: req.user.researchContext, injectContext }, config.extraction, config.webResearch);
    } else if (mode === 'maps') {
      await handleMapsResearch(res, query, messages, destination, () => closed, tripId, config.mapsResearch, config.extraction);
    } else {
      // Idea Scraper — `query` carries the URL to scrape.
      await handleIdeaScraper(res, query, destination, () => closed, tripId, config.ideaScraper, config.extraction);
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
async function claudeWebResearch(res, userPrompt, isClosed, tripId, systemPrompt) {
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 20000,
    thinking: { type: 'adaptive' },
    output_config: { effort: 'high' },
    ...(systemPrompt && { system: systemPrompt }),
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
async function geminiWebResearch(res, userPrompt, isClosed, tripId, modelId, systemPrompt) {
  const model = flashGenAI.getGenerativeModel({
    model: modelId,
    tools: [{ googleSearch: {} }],
    ...(systemPrompt && { systemInstruction: systemPrompt }),
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
  recordCost({ tripId, service: 'gemini-flash', operation: 'web-research', model: modelId, inputTokens: usage.promptTokenCount || 0, outputTokens: usage.candidatesTokenCount || 0 });
  return accumulatedText;
}

// Mode 1: Web Research — text engine configurable (Claude Sonnet default, or Gemini Flash). Both have live web access.
async function handleWebResearch(res, query, messages, destination, isClosed, tripId, preferences = {}, extractionEngine = 'gemini-flash', engine = 'claude-sonnet') {
  if (isGeminiEngine(engine) ? !flashGenAI : !anthropic) {
    sendSSE(res, 'error', { message: `${isGeminiEngine(engine) ? 'Gemini' : 'Anthropic'} API not configured.` });
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
  // Inject the traveller's standing preferences only once per session — on the
  // first web-research question (injectContext) — so the model is primed before
  // it suggests anything, without re-paying for the context tokens on every
  // later question. Subsequent questions send no system prompt.
  const systemPrompt = (preferences.injectContext && preferencesSection.length > 0)
    ? `You are a travel research assistant helping plan a trip to ${destination}.\n\nThis traveller has shared the following preferences and context. Treat them as standing context for the entire session: weigh every recommendation against them, lead with options that fit, and steer away from anything that conflicts.\n${preferencesSection.join('\n')}`
    : undefined;

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
- Use web search to find current, accurate information`;

  try {
    const textForExtraction = isGeminiEngine(engine)
      ? await geminiWebResearch(res, userPrompt, isClosed, tripId, geminiModelId(engine), systemPrompt)
      : await claudeWebResearch(res, userPrompt, isClosed, tripId, systemPrompt);
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
    const params = { systemPrompt, query, messages, isClosed, tripId, operation: 'maps-research', modelId: geminiModelId(engine) };
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

// Inspect a Claude message's content blocks for a failed web_fetch. The API
// returns a 200 with a web_fetch_tool_error block (error_code e.g.
// `url_not_accessible`, `unsupported_content_type`) when a URL can't be read.
function findWebFetchError(content) {
  for (const block of content || []) {
    if (block.type === 'web_fetch_tool_result') {
      const inner = block.content;
      if (inner && inner.type === 'web_fetch_tool_error') return inner.error_code || 'unknown';
    }
  }
  return null;
}

function ideaScraperSystemPrompt(destination) {
  return `You are a travel research assistant. The user gives you a single web page URL. Fetch that page and pull out concrete, specific travel ideas relevant to a trip to ${destination} — restaurants, cafes, bars, activities, experiences, neighbourhoods, and hotels. For each idea capture the full name plus, when the page provides them, the address, price range, opening hours, cuisine/category, 2-3 highlights or must-tries, and any tips or caveats. Use only information found on the fetched page; do not invent places. Reply with a clear, well-organised list.`;
}

// Scrape a URL with Claude Sonnet + the web_fetch server tool.
// Returns { text, failed } — failed=true when the page could not be fetched.
async function scrapeWithClaude(url, destination, tripId) {
  const stream = anthropic.messages.stream({
    model: 'claude-sonnet-4-6',
    max_tokens: 8000,
    system: ideaScraperSystemPrompt(destination),
    tools: [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 3 }],
    messages: [{ role: 'user', content: `Fetch this page and list the travel ideas it contains for ${destination}:\n${url}` }],
  });
  const finalMessage = await stream.finalMessage();
  recordCost({ tripId, service: 'claude-sonnet', operation: 'idea-scraper', model: 'claude-sonnet-4-6', inputTokens: finalMessage.usage?.input_tokens || 0, outputTokens: finalMessage.usage?.output_tokens || 0 });
  const text = finalMessage.content.filter(b => b.type === 'text').map(b => b.text).join('\n\n');
  return { text, failed: !!findWebFetchError(finalMessage.content) };
}

// True only when every URL the model tried to retrieve failed. No metadata
// (older response shapes) → null, so the caller falls back to an empty-text check.
function geminiUrlRetrievalFailed(response) {
  const meta = response?.candidates?.[0]?.urlContextMetadata || response?.candidates?.[0]?.url_context_metadata;
  const list = meta?.urlMetadata || meta?.url_metadata;
  if (!Array.isArray(list) || list.length === 0) return null;
  return list.every(m => {
    const status = m.urlRetrievalStatus || m.url_retrieval_status;
    return status && status !== 'URL_RETRIEVAL_STATUS_SUCCESS';
  });
}

// Scrape a URL with Gemini Flash + the url_context tool. Returns { text, failed }.
async function scrapeWithGemini(url, destination, tripId, modelId = 'gemini-3.5-flash') {
  const model = flashGenAI.getGenerativeModel({
    model: modelId,
    tools: [{ urlContext: {} }],
    systemInstruction: ideaScraperSystemPrompt(destination),
  });
  const result = await model.generateContent(`Fetch this page and list the travel ideas it contains for ${destination}:\n${url}`);
  const response = result.response;
  const usage = response.usageMetadata || {};
  recordCost({ tripId, service: 'gemini-flash', operation: 'idea-scraper', model: modelId, inputTokens: usage.promptTokenCount || 0, outputTokens: usage.candidatesTokenCount || 0 });
  const text = (response.text() || '').trim();
  // Treat as failed when retrieval metadata says every URL failed.
  return { text, failed: geminiUrlRetrievalFailed(response) === true };
}

// Mode 3: Idea Scraper — fetch a user-supplied URL and extract trip ideas from
// the page. Engine is configurable (Claude Sonnet default, or Gemini Flash);
// both fetch live URL content via their respective server tools. `url` arrives
// as the query.
async function handleIdeaScraper(res, url, destination, isClosed, tripId, engine = 'claude-sonnet', extractionEngine = 'gemini-flash') {
  const useGemini = isGeminiEngine(engine);
  if (useGemini ? !flashGenAI : !anthropic) {
    sendSSE(res, 'error', { message: `${useGemini ? 'Gemini' : 'Anthropic'} API not configured.` });
    return;
  }

  const trimmed = (url || '').trim();
  if (!/^https?:\/\/\S+$/i.test(trimmed)) {
    sendSSE(res, 'error', { message: 'Please paste a valid URL starting with http:// or https://' });
    return;
  }

  sendSSE(res, 'status', { phase: 'researching' });

  let result;
  try {
    result = useGemini
      ? await scrapeWithGemini(trimmed, destination, tripId, geminiModelId(engine))
      : await scrapeWithClaude(trimmed, destination, tripId);
    if (isClosed()) return;
  } catch (err) {
    console.error('Idea Scraper error:', err);
    const isOverloaded = err.status === 529 || err.status === 503 || err.message?.includes('503');
    sendSSE(res, 'error', { message: isOverloaded
      ? 'The model is experiencing high demand. Please try again in a moment.'
      : `Idea Scraper encountered an error: ${err.message || 'Please try again.'}` });
    return;
  }

  // If the page couldn't be fetched, tell the user the content can't be processed.
  if (result.failed || !result.text.trim()) {
    sendSSE(res, 'error', { message: "That URL's content cannot be processed. The page may be unreachable, require a login, or be rendered with JavaScript. Try a different link." });
    return;
  }

  // Show what was found, then turn it into idea cards.
  sendSSE(res, 'text', { content: result.text });
  await streamExtraction(res, result.text, destination, isClosed, tripId, extractionEngine);
  sendSSE(res, 'status', { phase: 'done' });
}

module.exports = router;
