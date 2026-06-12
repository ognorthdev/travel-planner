// Travel-time computation between consecutive slots, backed by the Google
// Routes API (drive/walk on the Essentials SKU, transit on Advanced).
// Requires the Routes API to be enabled on the same GOOGLE_MAPS_API_KEY.
const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

const ROUTES_URL = 'https://routes.googleapis.com/directions/v2:computeRoutes';

// Geocode a place to lat/lng with a minimal-fieldmask Text Search.
// Returns { lat, lng } or null.
async function geocodePlace(name, address) {
  const query = `${name || ''} ${address || ''}`.trim();
  if (!query) return null;
  const resp = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'places.location',
    },
    body: JSON.stringify({ textQuery: query, maxResultCount: 1 }),
  });
  if (!resp.ok) return null;
  const place = (await resp.json()).places?.[0];
  if (!place?.location) return null;
  return { lat: place.location.latitude, lng: place.location.longitude };
}

// One Routes API call for a single origin/destination/mode.
// Returns duration in minutes (rounded) or null when no route exists.
async function computeRouteMinutes(origin, destination, travelMode) {
  const body = {
    origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
    destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
    travelMode,
  };
  // TRAFFIC_AWARE only applies to DRIVE; TRANSIT/WALK reject routingPreference.
  if (travelMode === 'DRIVE') body.routingPreference = 'TRAFFIC_UNAWARE';

  const resp = await fetch(ROUTES_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': GOOGLE_MAPS_API_KEY,
      'X-Goog-FieldMask': 'routes.duration,routes.distanceMeters',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const text = await resp.text();
    // 404-with-empty body = no route (e.g. walk across an ocean); anything
    // else is worth logging once for diagnosis (API not enabled, bad key).
    if (resp.status !== 404) console.error('Routes API error:', resp.status, text.slice(0, 300));
    return null;
  }
  const data = await resp.json();
  const route = data.routes?.[0];
  if (!route?.duration) return null;
  const seconds = parseInt(route.duration, 10); // "1234s"
  if (Number.isNaN(seconds)) return null;
  return { minutes: Math.round(seconds / 60), distanceMeters: route.distanceMeters ?? null };
}

// Compute walk/transit/drive minutes between two coordinates.
// Returns { walkMinutes, transitMinutes, driveMinutes, distanceMeters, ops }
// where ops is the billing breakdown for recordCost.
async function computeTravelModes(origin, destination) {
  const [drive, transit, walk] = await Promise.all([
    computeRouteMinutes(origin, destination, 'DRIVE'),
    computeRouteMinutes(origin, destination, 'TRANSIT'),
    computeRouteMinutes(origin, destination, 'WALK'),
  ]);
  return {
    driveMinutes: drive?.minutes ?? null,
    transitMinutes: transit?.minutes ?? null,
    // Hide absurd walks: past ~2.5h nobody is walking, show nothing instead.
    walkMinutes: walk && walk.minutes <= 150 ? walk.minutes : null,
    distanceMeters: drive?.distanceMeters ?? walk?.distanceMeters ?? null,
    ops: [
      { type: 'route-essentials', count: 2 }, // drive + walk
      { type: 'route-advanced', count: 1 },   // transit
    ],
  };
}

function routesConfigured() {
  return !!GOOGLE_MAPS_API_KEY && GOOGLE_MAPS_API_KEY !== 'your_google_maps_api_key_here';
}

module.exports = { geocodePlace, computeTravelModes, routesConfigured };
