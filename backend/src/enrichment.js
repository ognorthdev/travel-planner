// Shared Google Places enrichment used by both the standalone /places/enrich endpoint
// and per-card (idea) persistence. One Text Search captures as many fields as possible
// in a single billed request (photos, rating, reviews, address, maps link, phone, hours).
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const EMPTY_ENRICHMENT = {
  photos: [], rating: null, reviewCount: null, address: null,
  googleMapsUrl: null, phoneNumber: null, openingHours: null,
  lat: null, lng: null,
};

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

// Returns { value, ops, found }. `ops` lists the billable Places operations performed so
// the caller can record cost; `found` is false when no place matched (so callers can skip
// persisting an empty result).
async function fetchEnrichment(name, address) {
  const ops = [{ type: 'text-search', count: 1 }];
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'your_google_maps_api_key_here') {
    return { value: { ...EMPTY_ENRICHMENT }, ops: [], found: false };
  }

  const query = `${name} ${address || ''}`.trim();
  const searchRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.id,places.photos,places.rating,places.userRatingCount,places.formattedAddress,places.googleMapsUri,places.nationalPhoneNumber,places.regularOpeningHours,places.location',
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });
  if (!searchRes.ok) return { value: { ...EMPTY_ENRICHMENT }, ops, found: false };

  const place = (await searchRes.json()).places?.[0];
  if (!place) return { value: { ...EMPTY_ENRICHMENT }, ops, found: false };

  const photoRefs = (place.photos || []).slice(0, 4);
  if (photoRefs.length > 0) ops.push({ type: 'photo-media', count: photoRefs.length });
  const photos = photoRefs.length > 0 ? await resolvePhotoUrls(photoRefs) : [];

  return {
    value: {
      photos,
      rating: place.rating || null,
      reviewCount: place.userRatingCount || null,
      address: place.formattedAddress || null,
      googleMapsUrl: place.googleMapsUri || null,
      phoneNumber: place.nationalPhoneNumber || null,
      openingHours: place.regularOpeningHours?.weekdayDescriptions || null,
      lat: place.location?.latitude ?? null,
      lng: place.location?.longitude ?? null,
    },
    ops,
    found: true,
  };
}

// Fetch a single scenic hero photo for a destination (used as the trip cover
// when the user doesn't set one). Returns { url, ops } or null.
async function fetchDestinationCover(destination) {
  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === 'your_google_maps_api_key_here') return null;
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
  return data.photoUri ? { url: data.photoUri, ops } : null;
}

module.exports = { fetchEnrichment, resolvePhotoUrls, fetchDestinationCover, EMPTY_ENRICHMENT, GOOGLE_MAPS_API_KEY };
