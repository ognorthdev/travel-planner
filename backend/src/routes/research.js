const express = require('express');
const router = express.Router();
const { PrismaClient } = require('@prisma/client');
const { recordCost } = require('../costs');

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

async function extractSuggestions(text, destination, tripId) {
  if (!flashGenAI) return [];
  const model = flashGenAI.getGenerativeModel({
    model: 'gemini-3.5-flash',
    generationConfig: { responseMimeType: 'application/json', maxOutputTokens: 20000 },
  });
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const result = await model.generateContent(buildExtractionPrompt(text.slice(0, 30000), destination));
      const response = result.response;
      const usage = response.usageMetadata || {};
      recordCost({ tripId, service: 'gemini-flash', operation: 'research-extract', model: 'gemini-3.5-flash', inputTokens: usage.promptTokenCount || 0, outputTokens: usage.candidatesTokenCount || 0 });
      const responseText = response.text();
      const cleaned = responseText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
      const firstBrace = cleaned.indexOf('{');
      const lastBrace = cleaned.lastIndexOf('}');
      if (firstBrace === -1 || lastBrace === -1) return [];
      let jsonStr = cleaned.slice(firstBrace, lastBrace + 1);
      jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // If JSON is truncated, try to salvage by closing open arrays/objects
        const openBrackets = (jsonStr.match(/\[/g) || []).length - (jsonStr.match(/\]/g) || []).length;
        const openBraces = (jsonStr.match(/\{/g) || []).length - (jsonStr.match(/\}/g) || []).length;
        jsonStr = jsonStr + ']'.repeat(Math.max(0, openBrackets)) + '}'.repeat(Math.max(0, openBraces));
        jsonStr = jsonStr.replace(/,\s*([\]}])/g, '$1');
        parsed = JSON.parse(jsonStr);
      }
      return parsed.suggestions || [];
    } catch (e) {
      console.error('Suggestion extraction failed (attempt ' + (attempt + 1) + '):', e.message);
      if (attempt < 2) await sleep(3000 * (attempt + 1));
    }
  }
  return [];
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// GET /api/research/:tripId/ideas
router.get('/:tripId/ideas', async (req, res, next) => {
  try {
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

// DELETE /api/research/ideas/:id
router.delete('/ideas/:id', async (req, res, next) => {
  try {
    const idea = await prisma.idea.findUnique({ where: { id: req.params.id } });
    if (!idea) {
      return res.status(404).json({ error: 'Idea not found' });
    }
    await prisma.idea.delete({ where: { id: req.params.id } });
    res.json({ message: 'Idea deleted' });
  } catch (err) {
    next(err);
  }
});

// PUT /api/research/:tripId/ideas/reorder
router.put('/:tripId/ideas/reorder', async (req, res, next) => {
  try {
    const { ideaIds } = req.body;
    if (!Array.isArray(ideaIds)) {
      return res.status(400).json({ error: 'ideaIds array is required' });
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
    const { text, destination } = req.body;
    if (!text || !destination) {
      return res.status(400).json({ error: 'text and destination are required' });
    }
    const suggestions = await extractSuggestions(text, destination, req.params.tripId);
    res.json({ suggestions });
  } catch (err) {
    next(err);
  }
});

// POST /api/research/:tripId/stream — SSE streaming endpoint
router.post('/:tripId/stream', async (req, res) => {
  const { query, mode, messages, destination, mealPreferences, activityPreferences } = req.body;
  if (!query || !destination) {
    return res.status(400).json({ error: 'query and destination are required' });
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
    if (mode === 'web') {
      await handleWebResearch(res, query, messages, destination, () => closed, tripId, { mealPreferences, activityPreferences });
    } else if (mode === 'maps') {
      await handleMapsResearch(res, query, messages, destination, () => closed, tripId);
    } else {
      await handleQuestions(res, query, messages, destination, () => closed, tripId);
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

// Mode 1: Web Research — Claude Opus 4.7 with web search
async function handleWebResearch(res, query, messages, destination, isClosed, tripId, preferences = {}) {
  if (!anthropic) {
    sendSSE(res, 'error', { message: 'Anthropic API not configured. Check your ANTHROPIC_API_KEY.' });
    return;
  }

  sendSSE(res, 'status', { phase: 'researching' });

  const contextPrefix = messages && messages.length > 0
    ? `Context from our conversation so far:\n${messages.slice(-6).map(m => `${m.role}: ${m.content}`).join('\n')}\n\n`
    : '';

  const preferencesSection = [];
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
    if (isClosed()) return;

    const inputTokens = finalMessage.usage?.input_tokens || 0;
    const outputTokens = finalMessage.usage?.output_tokens || 0;
    recordCost({ tripId, service: 'claude-sonnet', operation: 'web-research', model: 'claude-sonnet-4-6', inputTokens, outputTokens });

    // Extract full text from all text content blocks (stream.on('text') may miss text after tool results)
    const fullText = finalMessage.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('\n\n');
    const textForExtraction = fullText.length > accumulatedText.length ? fullText : accumulatedText;

    // If streaming missed some text, send the remainder to the client
    if (fullText.length > accumulatedText.length && !isClosed()) {
      const missed = fullText.slice(accumulatedText.length);
      if (missed.trim()) {
        sendSSE(res, 'text', { content: missed });
      }
    }

    if (textForExtraction.trim().length > 0) {
      sendSSE(res, 'status', { phase: 'extracting' });
      const suggestions = await extractSuggestions(textForExtraction, destination, tripId);
      for (const suggestion of suggestions) {
        if (isClosed()) break;
        sendSSE(res, 'suggestion', suggestion);
        await sleep(200);
      }
    }

    sendSSE(res, 'status', { phase: 'done' });
  } catch (err) {
    console.error('Web Research error:', err);
    const userMessage = err.status === 529 || err.status === 503
      ? 'Claude is experiencing high demand. Please try again in a moment.'
      : `Web Research encountered an error: ${err.message || 'Please try again.'}`;
    sendSSE(res, 'error', { message: userMessage });
  }
}

// Mode 2: Maps Research — Gemini 2.5 Flash with streaming
async function handleMapsResearch(res, query, messages, destination, isClosed, tripId) {
  if (!flashGenAI) {
    sendSSE(res, 'error', { message: 'Gemini API not configured. Check your GEMINI_API_KEY.' });
    return;
  }

  sendSSE(res, 'status', { phase: 'researching' });

  const model = flashGenAI.getGenerativeModel({ model: 'gemini-3.5-flash' });

  const chatHistory = (messages || []).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: m.content }],
  }));

  const chat = model.startChat({
    history: chatHistory,
    systemInstruction: {
      parts: [{ text: `You are a local travel expert and maps researcher for ${destination}. You specialize in finding specific places, routes, neighborhoods, and geographic recommendations. For every recommendation you make, include: the full place name, full street address, neighborhood/area, price range, cuisine type or category, operating hours if known, 2-3 must-try dishes or highlights, walking/transit directions from popular areas, and any practical tips or caveats. Aim for at least 5 specific named places per response. Include geographic context like nearby landmarks and how to get there.` }],
    },
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

      if (isClosed()) return;

      const estimatedInputTokens = Math.ceil(query.length / 4);
      const estimatedOutputTokens = Math.ceil(accumulatedText.length / 4);
      recordCost({ tripId, service: 'gemini-flash', operation: 'maps-research', model: 'gemini-3.5-flash', inputTokens: estimatedInputTokens, outputTokens: estimatedOutputTokens });

      if (accumulatedText.trim().length > 0) {
        sendSSE(res, 'status', { phase: 'extracting' });
        const suggestions = await extractSuggestions(accumulatedText, destination, tripId);
        for (const suggestion of suggestions) {
          if (isClosed()) break;
          sendSSE(res, 'suggestion', suggestion);
          await sleep(200);
        }
      }

      sendSSE(res, 'status', { phase: 'done' });
      return;
    } catch (err) {
      console.error('Maps Research error:', err);
      const is503 = err.status === 503 || err.message?.includes('503');
      if (is503 && attempt < maxRetries) {
        sendSSE(res, 'status', { phase: 'retrying' });
        await sleep(3000 * (attempt + 1));
        continue;
      }
      const userMessage = is503
        ? 'Gemini is experiencing high demand. Please try again in a moment.'
        : `Maps Research encountered an error: ${err.message || 'Please try again.'}`;
      sendSSE(res, 'error', { message: userMessage });
    }
  }
}

// Mode 3: Questions — Claude Sonnet 4.6 streaming
async function handleQuestions(res, query, messages, destination, isClosed, tripId) {
  if (!anthropic) {
    sendSSE(res, 'error', { message: 'Anthropic API not configured. Check your ANTHROPIC_API_KEY.' });
    return;
  }

  sendSSE(res, 'status', { phase: 'researching' });

  const systemPrompt = `You are a travel research assistant helping plan a trip to ${destination}. For every recommendation you make, include: the full place name, full street address, price range, cuisine type or category, operating hours if known, 2-3 must-try dishes or highlights, and any practical tips or caveats. Aim for at least 5 specific named places per response. Be conversational and helpful.`;

  const chatMessages = (messages || []).map(m => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: m.content,
  }));
  chatMessages.push({ role: 'user', content: query });

  try {
    const stream = anthropic.messages.stream({
      model: 'claude-sonnet-4-6',
      max_tokens: 4096,
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
    if (isClosed()) return;

    const inputTokens = finalMessage.usage?.input_tokens || 0;
    const outputTokens = finalMessage.usage?.output_tokens || 0;
    recordCost({ tripId, service: 'claude-sonnet', operation: 'questions-chat', model: 'claude-sonnet-4-6', inputTokens, outputTokens });

    if (accumulatedText.trim().length > 0) {
      sendSSE(res, 'status', { phase: 'extracting' });
      const suggestions = await extractSuggestions(accumulatedText, destination, tripId);
      for (const suggestion of suggestions) {
        if (isClosed()) break;
        sendSSE(res, 'suggestion', suggestion);
        await sleep(200);
      }
    }

    sendSSE(res, 'status', { phase: 'done' });
  } catch (err) {
    console.error('Questions mode error:', err);
    const userMessage = err.status === 529 || err.status === 503
      ? 'Claude is experiencing high demand. Please try again in a moment.'
      : `Something went wrong: ${err.message || 'Please try again.'}`;
    sendSSE(res, 'error', { message: userMessage });
  }
}

module.exports = router;
