// Shared Google Places enrichment, backed by a cross-trip PlaceCache.
//
// Lookup strategy — the cheapest path that still gets live ratings + reviews:
//   1. PlaceCache hit fresher than 30 days        -> free
//   2. IDs-only Text Search (free SKU)            -> placeId (skipped when a
//      cached placeId exists: IDs may be stored indefinitely)
//   3. Place Details, Enterprise+Atmosphere tier  -> rating, review count,
//      actual reviews, hours, phone, website ($25/1k vs $40/1k for the same
//      fields on Text Search)
//   4. Photo media for the first EAGER_PHOTOS photos; remaining photo refs
//      stay in the cache so detail views can resolve them on demand.
const { prisma } = require('./lib/access');
const { safeParseJson } = require('./lib/json');

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

// Google's ToS allows storing place IDs indefinitely but caps caching of all
// other Places content at 30 days.
const PLACE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const EAGER_PHOTOS = 2;
const MAX_PHOTOS = 4;

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

// The cached payload keeps raw photo resource names so detail views can
// resolve more photos without a new Details call; strip them from what
// callers receive (and persist onto ideas/slots).
function publicValue(stored) {
  const { photoRefs, ...value } = stored || {};
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
// false when no place matched.
async function fetchEnrichment(name, address, { force = false } = {}) {
  if (!keyConfigured()) return { value: { ...EMPTY_ENRICHMENT }, ops: [], found: false };

  const queryKey = queryKeyFor(name, address);
  const cached = await readCache(queryKey);
  if (isFresh(cached) && !force) {
    const stored = safeParseJson(cached.data);
    if (stored?.placeId) return { value: publicValue(stored), ops: [], found: true, cached: true };
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

  const photoRefs = (place.photos || []).slice(0, MAX_PHOTOS).map(p => ({ name: p.name }));
  const eager = photoRefs.slice(0, EAGER_PHOTOS);
  if (eager.length > 0) ops.push({ type: 'photo-media', count: eager.length });
  const photos = eager.length > 0 ? await resolvePhotoUrls(eager) : [];

  const stored = { ...valueFromPlace(place, photos), photoRefs };
  await writeCache(queryKey, placeId, stored);

  return { value: publicValue(stored), ops, found: true };
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
