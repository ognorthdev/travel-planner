// Shared Google Places enrichment, backed by a cross-trip PlaceCache.
//
// Lookup strategy — the cheapest path that still gets live ratings + reviews:
//   1. PlaceCache hit fresher than 30 days        -> free
//   2. IDs-only Text Search (free SKU)            -> placeId (skipped when a
//      cached placeId exists: IDs may be stored indefinitely)
//   3. Place Details, Enterprise+Atmosphere tier  -> rating, review count,
//      actual reviews, hours, phone, website ($25/1k vs $40/1k for the same
//      fields on Text Search)
//   4. Photo media for up to PHOTO_CANDIDATES photos, classified once with
//      Gemini vision (exterior/interior/food/activity) so callers get them in
//      a deliberate order: exterior, interior, then food (meals) or activity
//      shots. Labels and URLs live in the cache, so this is a one-time cost
//      per place per 30 days.
const { prisma } = require('./lib/access');
const { safeParseJson } = require('./lib/json');
const { recordCost } = require('./costs');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

let genAI = null;
try {
  const { GoogleGenerativeAI } = require('@google/generative-ai');
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== 'your_gemini_api_key_here') {
    genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
  }
} catch (e) {
  console.warn('Google Generative AI SDK not available for photo classification');
}

// Google's ToS allows storing place IDs indefinitely but caps caching of all
// other Places content at 30 days.
const PLACE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PHOTO_CANDIDATES = 6; // resolved + classified once, cached
const MAX_PHOTOS = 4;       // what callers receive
const PHOTO_LABELS = ['exterior', 'interior', 'food', 'activity', 'other'];

const EMPTY_ENRICHMENT = {
  photos: [], rating: null, reviewCount: null, address: null,
  googleMapsUrl: null, phoneNumber: null, openingHours: null,
  operatingHours: null, city: null, websiteUri: null, reviews: [],
  placeId: null, lat: null, lng: null,
};

function keyConfigured() {
  return GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'your_google_maps_api_key_here';
}

function queryKeyFor(name, address) {
  return `${(name || '').trim().toLowerCase()}|${(address || '').trim().toLowerCase()}`;
}

// Shared by every route that turns Places photo references into URLs. The API
// key travels in a header rather than the query string so it can't end up in
// request logs or proxies.
async function resolvePhotoUrls(photoRefs) {
  const results = await Promise.all(
    photoRefs.map(async (p) => {
      try {
        const mediaUrl = `https://places.googleapis.com/v1/${p.name}/media?maxHeightPx=400&maxWidthPx=600&skipHttpRedirect=true`;
        const resp = await fetch(mediaUrl, {
          headers: { 'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY },
        });
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

// IDs-only field mask keeps this Text Search on the no-charge SKU.
async function searchPlaceId(query) {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.id',
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });
  if (!res.ok) return null;
  return (await res.json()).places?.[0]?.id || null;
}

// `reviews` puts this request on the Enterprise+Atmosphere tier; everything
// else in the mask is included at that tier anyway.
const DETAILS_FIELD_MASK = [
  'id', 'photos', 'rating', 'userRatingCount', 'formattedAddress',
  'googleMapsUri', 'nationalPhoneNumber', 'regularOpeningHours',
  'currentOpeningHours', 'addressComponents', 'location', 'websiteUri',
  'reviews',
].join(',');

async function fetchPlaceDetails(placeId) {
  const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
    headers: { 'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY, 'X-Goog-FieldMask': DETAILS_FIELD_MASK },
  });
  if (!res.ok) return null;
  return res.json();
}

function valueFromPlace(place, photos) {
  const components = place.addressComponents || [];
  const locality = components.find(c => c.types?.includes('locality'));
  const adminArea = components.find(c => c.types?.includes('administrative_area_level_1'));
  const hours = place.currentOpeningHours?.weekdayDescriptions
    || place.regularOpeningHours?.weekdayDescriptions || null;
  return {
    photos,
    rating: place.rating || null,
    reviewCount: place.userRatingCount || null,
    address: place.formattedAddress || null,
    googleMapsUrl: place.googleMapsUri || null,
    phoneNumber: place.nationalPhoneNumber || null,
    openingHours: hours,
    operatingHours: hours ? hours.join('; ') : null,
    city: locality?.longText || adminArea?.longText || null,
    websiteUri: place.websiteUri || null,
    reviews: (place.reviews || []).slice(0, 5).map(r => ({
      rating: r.rating ?? null,
      text: r.text?.text || r.originalText?.text || '',
      author: r.authorAttribution?.displayName || null,
      relativeTime: r.relativePublishTimeDescription || null,
    })).filter(r => r.text),
    placeId: place.id || null,
    lat: place.location?.latitude ?? null,
    lng: place.location?.longitude ?? null,
  };
}

// Classify resolved photo URLs with one Gemini vision call so they can be
// ordered deliberately. Returns lowercase labels aligned to the input order,
// or null when classification isn't possible (no key, fetch/parse failure).
async function classifyPhotos(name, photos, tripId) {
  if (!genAI || photos.length === 0) return null;
  try {
    const parts = [{
      text: `These are ${photos.length} photos of "${name}". Classify each photo, in order, as exactly one of: ${PHOTO_LABELS.map(l => `"${l}"`).join(', ')}. ` +
        `"exterior" = the building/place from outside; "interior" = inside the venue; "food" = dishes or drinks; "activity" = people doing the activity or the main attraction itself. ` +
        `Reply with ONLY a JSON array of ${photos.length} strings.`,
    }];
    for (const p of photos) {
      const resp = await fetch(p.url);
      if (!resp.ok) return null;
      const buf = Buffer.from(await resp.arrayBuffer());
      parts.push({ inlineData: { mimeType: resp.headers.get('content-type') || 'image/jpeg', data: buf.toString('base64') } });
    }
    const model = genAI.getGenerativeModel({ model: 'gemini-3.5-flash' });
    const result = await model.generateContent(parts);
    const usage = result.response.usageMetadata;
    if (usage && tripId) {
      recordCost({
        tripId, service: 'gemini-flash', operation: 'photo-classify', model: 'gemini-3.5-flash',
        inputTokens: usage.promptTokenCount || 0, outputTokens: usage.candidatesTokenCount || 0,
      });
    }
    const cleaned = result.response.text().replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    const labels = JSON.parse(cleaned);
    if (!Array.isArray(labels) || labels.length !== photos.length) return null;
    return labels.map(l => PHOTO_LABELS.includes(String(l).toLowerCase()) ? String(l).toLowerCase() : 'other');
  } catch (e) {
    console.error('Photo classification failed:', e.message);
    return null;
  }
}

// Order labeled photos for a consumer: exterior, interior, then two of the
// kind-preferred label (food for meals, activity otherwise), padded with
// whatever's left in original order.
function orderPhotos(labeled, kind) {
  const preferred = kind === 'meal' ? 'food' : 'activity';
  const used = new Set();
  const picked = [];
  const takeFirst = (label) => {
    const i = labeled.findIndex((p, idx) => !used.has(idx) && p.label === label);
    if (i >= 0) { used.add(i); picked.push(labeled[i]); }
  };
  takeFirst('exterior');
  takeFirst('interior');
  takeFirst(preferred);
  takeFirst(preferred);
  for (let i = 0; i < labeled.length && picked.length < MAX_PHOTOS; i++) {
    if (!used.has(i)) { used.add(i); picked.push(labeled[i]); }
  }
  return picked.slice(0, MAX_PHOTOS);
}

// Shape the cached payload for callers (and for persistence onto ideas/slots):
// photos come out ordered for the consumer's kind; internal fields stay in the
// cache. Handles both the classified shape (photosLabeled) and rows written
// before classification existed (photos + photoRefs).
function publicValue(stored, kind) {
  const { photoRefs, photosLabeled, ...value } = stored || {};
  if (photosLabeled) {
    const photos = orderPhotos(photosLabeled, kind);
    return { ...value, photos, photosAvailable: photos.length };
  }
  return { ...value, photosAvailable: (photoRefs || []).length };
}

function isFresh(row) {
  return row && (Date.now() - new Date(row.fetchedAt).getTime()) < PLACE_CACHE_TTL_MS;
}

async function readCache(queryKey) {
  try { return await prisma.placeCache.findUnique({ where: { queryKey } }); }
  catch { return null; }
}

async function writeCache(queryKey, placeId, stored) {
  try {
    await prisma.placeCache.upsert({
      where: { queryKey },
      update: { placeId, data: JSON.stringify(stored), fetchedAt: new Date() },
      create: { queryKey, placeId, data: JSON.stringify(stored) },
    });
  } catch (e) {
    console.error('PlaceCache write failed:', e.message);
  }
}

// Returns { value, ops, found }. `ops` lists the billable Places operations
// performed (empty on cache hits) so the caller can record cost; `found` is
// false when no place matched. `kind` ('meal' | 'activity') orders photos for
// the consumer; `tripId` attributes the photo-classification Gemini cost.
async function fetchEnrichment(name, address, { force = false, kind = null, tripId = null } = {}) {
  if (!keyConfigured()) return { value: { ...EMPTY_ENRICHMENT }, ops: [], found: false };

  const queryKey = queryKeyFor(name, address);
  const cached = await readCache(queryKey);
  if (isFresh(cached) && !force) {
    const stored = safeParseJson(cached.data);
    if (stored?.placeId) return { value: publicValue(stored, kind), ops: [], found: true, cached: true };
  }

  const ops = [];
  // A stale row still has a usable placeId — IDs never expire, so skip the search.
  let placeId = cached?.placeId || null;
  if (!placeId) {
    ops.push({ type: 'text-search-ids', count: 1 });
    placeId = await searchPlaceId(`${name} ${address || ''}`.trim());
  }
  if (!placeId) return { value: { ...EMPTY_ENRICHMENT }, ops, found: false };

  ops.push({ type: 'place-details-atmosphere', count: 1 });
  const place = await fetchPlaceDetails(placeId);
  if (!place) return { value: { ...EMPTY_ENRICHMENT }, ops, found: false };

  // Resolve candidate photos and classify them once; labels live in the cache
  // so every later consumer (any kind, any trip) orders them for free.
  const candidateRefs = (place.photos || []).slice(0, PHOTO_CANDIDATES);
  if (candidateRefs.length > 0) ops.push({ type: 'photo-media', count: candidateRefs.length });
  const resolved = candidateRefs.length > 0 ? await resolvePhotoUrls(candidateRefs) : [];
  const labels = await classifyPhotos(name, resolved, tripId);
  const photosLabeled = resolved.map((p, i) => ({ url: p.url, label: labels ? labels[i] : 'other' }));

  const stored = { ...valueFromPlace(place, []), photosLabeled };
  await writeCache(queryKey, placeId, stored);

  return { value: publicValue(stored, kind), ops, found: true };
}

// Resolve the not-yet-resolved cached photo refs for a place (detail views).
// Returns { photos, ops } with the full photo list, or null when the place
// isn't cached. Appending photos doesn't bump fetchedAt — it isn't a refresh.
async function resolveMorePhotos(placeId) {
  if (!keyConfigured() || !placeId) return null;
  let row = null;
  try { row = await prisma.placeCache.findFirst({ where: { placeId } }); } catch {}
  if (!row) return null;

  const stored = safeParseJson(row.data) || {};
  // Classified rows already hold every resolved photo — nothing left to bill.
  if (stored.photosLabeled) {
    return { photos: stored.photosLabeled.map(p => ({ url: p.url, label: p.label })), ops: [] };
  }
  const photos = stored.photos || [];
  const refs = (stored.photoRefs || []).slice(photos.length);
  if (refs.length === 0) return { photos, ops: [] };

  const more = await resolvePhotoUrls(refs);
  stored.photos = [...photos, ...more];
  try {
    await prisma.placeCache.update({ where: { id: row.id }, data: { data: JSON.stringify(stored) } });
  } catch (e) {
    console.error('PlaceCache photo update failed:', e.message);
  }
  return { photos: stored.photos, ops: [{ type: 'photo-media', count: refs.length }] };
}

// Fetch a single scenic hero photo for a destination (used as the trip cover
// when the user doesn't set one), cached like any other place lookup so two
// trips to the same destination bill once. Returns { url, ops } or null.
async function fetchDestinationCover(destination) {
  if (!keyConfigured()) return null;

  const queryKey = `__cover__|${(destination || '').trim().toLowerCase()}`;
  const cached = await readCache(queryKey);
  if (isFresh(cached)) {
    const stored = safeParseJson(cached.data);
    if (stored?.url) return { url: stored.url, ops: [] };
  }

  const ops = [{ type: 'text-search', count: 1 }];
  const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.photos',
    },
    body: JSON.stringify({ textQuery: destination, maxResultCount: 1 }),
  });
  if (!searchRes.ok) return null;
  const photo = (await searchRes.json()).places?.[0]?.photos?.[0];
  if (!photo) return null;

  ops.push({ type: 'photo-media', count: 1 });
  // Hero-sized: wide enough for full-bleed headers without being wasteful.
  const mediaUrl = `https://places.googleapis.com/v1/${photo.name}/media?maxWidthPx=1600&maxHeightPx=1000&skipHttpRedirect=true`;
  const resp = await fetch(mediaUrl, { headers: { 'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY } });
  if (!resp.ok) return null;
  const data = await resp.json();
  if (!data.photoUri) return null;

  await writeCache(queryKey, null, { url: data.photoUri });
  return { url: data.photoUri, ops };
}

module.exports = {
  fetchEnrichment, resolvePhotoUrls, resolveMorePhotos, fetchDestinationCover,
  EMPTY_ENRICHMENT, GOOGLE_MAPS_API_KEY,
};
