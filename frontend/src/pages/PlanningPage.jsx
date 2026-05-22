import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft, Save, Loader2, Wand2, Hotel, Coffee, Moon, Utensils,
  Sun, MapPin, Clock, DollarSign, FileText, Phone, Hash, Check,
  Star, Info, ChevronDown, ChevronUp, Search, Heart, Navigation,
  Bus, Footprints, Car, UtensilsCrossed, Lightbulb, ThumbsDown,
  ExternalLink, Copy
} from 'lucide-react';
import { GoogleMap, useJsApiLoader, MarkerF, InfoWindowF } from '@react-google-maps/api';
import { slotsApi, tripsApi, aiApi, locationsApi, placesApi } from '../api/index.js';
import CostBadge from '../components/CostBadge';

function buildGoogleMapsUrl(name, address) {
  return `https://www.google.com/maps/search/${encodeURIComponent(name + ', ' + address)}`;
}

function getPicksKey(slotId) {
  return `travel-planner-picks-${slotId}`;
}

function loadPicks(slotId) {
  try {
    const raw = localStorage.getItem(getPicksKey(slotId));
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}

function savePicks(slotId, picks) {
  localStorage.setItem(getPicksKey(slotId), JSON.stringify(picks));
}

function getPlanSelectionKey(slotId) {
  return `travel-planner-plan-selection-${slotId}`;
}

function loadPlanSelection(slotId) {
  try {
    const raw = localStorage.getItem(getPlanSelectionKey(slotId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function savePlanSelection(slotId, selection) {
  if (selection) {
    localStorage.setItem(getPlanSelectionKey(slotId), JSON.stringify(selection));
  } else {
    localStorage.removeItem(getPlanSelectionKey(slotId));
  }
}

function getDiscoveryCacheKey(slotId) {
  return `travel-planner-discovery-${slotId}`;
}

function loadDiscoveryCache(slotId) {
  try {
    const raw = sessionStorage.getItem(getDiscoveryCacheKey(slotId));
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveDiscoveryCache(slotId, data) {
  sessionStorage.setItem(getDiscoveryCacheKey(slotId), JSON.stringify(data));
}

function ResultCard({ result, index, isFavorite, onToggleFavorite, isChecked, onToggleCheck }) {
  return (
    <div className={`bg-slate-800 rounded-2xl border p-4 transition-colors ${isChecked ? 'border-emerald-500/50 ring-1 ring-emerald-500/20' : 'border-slate-700 hover:border-slate-600'}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-red-500 text-white text-xs font-bold flex items-center justify-center">{index + 1}</span>
            <h3 className="font-bold text-slate-100 text-base">{result.name}</h3>
            {(result.cuisine || result.category) && (
              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full border border-slate-600">
                {result.cuisine || result.category}
              </span>
            )}
            {result.priceRange && (
              <span className="text-xs text-emerald-400 font-semibold">{result.priceRange}</span>
            )}
          </div>

          <StarRating rating={result.rating} reviewCount={result.reviewCount} />

          <div className="flex items-center gap-1 mt-2 text-slate-400">
            <MapPin size={12} className="flex-shrink-0" />
            <span className="text-xs">{result.address}</span>
          </div>

          <a
            href={result.googleMapsUrl || buildGoogleMapsUrl(result.name, result.address)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="inline-flex items-center gap-1.5 mt-2 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-xs font-medium text-ocean-400 hover:text-ocean-300 transition-colors"
          >
            <ExternalLink size={12} />
            View on Google Maps
          </a>

          {result.photos && result.photos.length > 0 && (
            <div className="grid grid-cols-2 gap-2 mt-3">
              {result.photos.slice(0, 4).map((photo, pi) => {
                const labels = ['Exterior', 'Interior', 'Food', 'Food'];
                return (
                  <div key={pi} className="relative h-28 rounded-lg overflow-hidden bg-slate-700/50">
                    <img
                      src={photo.url}
                      alt={`${result.name} - ${labels[pi] || 'Photo'}`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute bottom-1 left-1 text-[10px] font-medium bg-black/60 text-white px-1.5 py-0.5 rounded">
                      {labels[pi]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {result.walkMinutes && (
              <div className="flex items-center gap-1 text-ocean-400">
                <Footprints size={12} />
                <span className="text-xs font-medium">{result.walkMinutes} min walk</span>
              </div>
            )}
            {result.transitMinutes && (
              <div className="flex items-center gap-1 text-teal-400">
                <Bus size={12} />
                <span className="text-xs font-medium">{result.transitMinutes} min transit</span>
              </div>
            )}
            {result.driveMinutes && (
              <div className="flex items-center gap-1 text-violet-400">
                <Car size={12} />
                <span className="text-xs font-medium">{result.driveMinutes} min drive</span>
              </div>
            )}
          </div>

          <p className="text-sm text-slate-300 mt-3 leading-relaxed">{result.reason}</p>

          {result.topDishes && result.topDishes.length > 0 && (
            <div className="mt-3 bg-amber-900/20 border border-amber-700/30 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <UtensilsCrossed size={13} className="text-amber-400" />
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Must-try dishes</p>
              </div>
              <div className="space-y-1.5">
                {result.topDishes.slice(0, 3).map((dish, j) => (
                  <div key={j} className="flex items-start gap-2">
                    <span className="text-sm mt-0.5">🍽️</span>
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-slate-200">{dish.name}</span>
                      {dish.description && (
                        <span className="text-xs text-slate-400 ml-1">— {dish.description}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {result.reviewTips && result.reviewTips.length > 0 && (
            <div className="mt-2 bg-teal-900/20 border border-teal-700/30 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb size={13} className="text-teal-400" />
                <p className="text-xs font-semibold text-teal-400 uppercase tracking-wide">Tips from reviews</p>
              </div>
              <ul className="space-y-1">
                {result.reviewTips.slice(0, 3).map((tip, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-teal-500 mt-1 flex-shrink-0">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.lowRatingReasons && result.lowRatingReasons.length > 0 && (
            <div className="mt-2 bg-red-900/15 border border-red-700/30 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ThumbsDown size={13} className="text-red-400" />
                <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">Watch out for</p>
              </div>
              <ul className="space-y-1">
                {result.lowRatingReasons.slice(0, 3).map((reason, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-slate-400">
                    <span className="text-red-500 mt-1 flex-shrink-0">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 flex-shrink-0">
          {onToggleCheck && (
            <button
              onClick={onToggleCheck}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                isChecked
                  ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400'
                  : 'bg-slate-700 border border-slate-600 text-slate-400 hover:text-emerald-400 hover:border-emerald-500/50'
              }`}
            >
              <Check size={18} className={isChecked ? 'stroke-[3]' : ''} />
            </button>
          )}
          <button
            onClick={onToggleFavorite}
            className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
              isFavorite
                ? 'bg-rose-500/20 border border-rose-500/50 text-rose-400'
                : 'bg-slate-700 border border-slate-600 text-slate-400 hover:text-rose-400 hover:border-rose-500/50'
            }`}
          >
            <Heart size={18} className={isFavorite ? 'fill-rose-400' : ''} />
          </button>
        </div>
      </div>
    </div>
  );
}

const GOOGLE_MAPS_API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

const PHASES = [
  { id: 'discovery', label: 'Discovery' },
  { id: 'pick', label: 'Pick' },
  { id: 'plan', label: 'The Plan' },
];

const SLOT_CONFIG = {
  HOTEL: { label: 'Hotel', icon: Hotel, color: 'text-purple-400', bg: 'bg-purple-900/30', grad: 'from-purple-600 to-indigo-700' },
  BREAKFAST: { label: 'Breakfast', icon: Coffee, color: 'text-amber-400', bg: 'bg-amber-900/30', grad: 'from-amber-500 to-orange-600' },
  LUNCH: { label: 'Lunch', icon: Utensils, color: 'text-green-400', bg: 'bg-green-900/30', grad: 'from-green-600 to-teal-700' },
  DINNER: { label: 'Dinner', icon: Moon, color: 'text-indigo-400', bg: 'bg-indigo-900/30', grad: 'from-indigo-600 to-purple-700' },
  ACTIVITY: { label: 'Activity', icon: Sun, color: 'text-teal-400', bg: 'bg-teal-900/30', grad: 'from-teal-600 to-cyan-700' }
};

const MAP_STYLE = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
];

function StarRating({ rating: rawRating, reviewCount }) {
  const rating = parseFloat(rawRating) || 0;
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={13}
            className={i < full ? 'text-amber-400 fill-amber-400' : (i === full && half ? 'text-amber-400 fill-amber-400/50' : 'text-slate-600')}
          />
        ))}
      </div>
      <span className="text-sm font-semibold text-amber-400">{rating.toFixed(1)}</span>
      <span className="text-xs text-slate-500">({reviewCount?.toLocaleString()} reviews)</span>
    </div>
  );
}

function DiscoveryPhase({ tripId, slotId, slotType, destination }) {
  const isMeal = ['BREAKFAST', 'LUNCH', 'DINNER'].includes(slotType);
  const { isLoaded: mapsLoaded } = useJsApiLoader({ googleMapsApiKey: GOOGLE_MAPS_API_KEY });

  const cached = loadDiscoveryCache(slotId);
  const [locationInput, setLocationInput] = useState(cached?.locationInput || '');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [planLocations, setPlanLocations] = useState([]);
  const [googlePredictions, setGooglePredictions] = useState([]);
  const [description, setDescription] = useState(cached?.description || '');
  const [discovering, setDiscovering] = useState(false);
  const [results, setResults] = useState(cached?.results || null);
  const [error, setError] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);

  const [pickVersion, setPickVersion] = useState(0);
  const pickedNames = new Set(loadPicks(slotId).map(p => p.name));
  const locationInputRef = useRef(null);
  const dropdownRef = useRef(null);
  const autocompleteTimer = useRef(null);

  // Load plan locations for dropdown
  useEffect(() => {
    locationsApi.getByTrip(tripId).then(setPlanLocations).catch(() => {});
  }, [tripId]);

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced Google Places autocomplete
  useEffect(() => {
    if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current);
    if (locationInput.trim().length < 3) {
      setGooglePredictions([]);
      return;
    }
    autocompleteTimer.current = setTimeout(async () => {
      try {
        const data = await placesApi.autocomplete(locationInput, null, tripId);
        setGooglePredictions(data.predictions || []);
      } catch {
        setGooglePredictions([]);
      }
    }, 300);
    return () => { if (autocompleteTimer.current) clearTimeout(autocompleteTimer.current); };
  }, [locationInput, tripId]);

  const filteredLocations = planLocations.filter(loc =>
    loc.label.toLowerCase().includes(locationInput.toLowerCase()) ||
    loc.address.toLowerCase().includes(locationInput.toLowerCase())
  );

  const handleDiscover = async () => {
    if (!locationInput.trim()) {
      setError('Please enter a starting location');
      return;
    }
    setDiscovering(true);
    setError('');
    setResults(null);
    setSelectedMarker(null);
    try {
      const data = await aiApi.discover({
        location: locationInput,
        slotType,
        description,
        destination,
        tripId
      });
      if (data && data.startLocation && Array.isArray(data.results)) {
        const startLat = parseFloat(data.startLocation.lat);
        const startLng = parseFloat(data.startLocation.lng);
        if (isNaN(startLat) || isNaN(startLng)) {
          setError('Received invalid location data. Please try again.');
        } else {
          data.startLocation.lat = startLat;
          data.startLocation.lng = startLng;
          data.results = data.results.filter(r => {
            const lat = parseFloat(r.lat);
            const lng = parseFloat(r.lng);
            if (isNaN(lat) || isNaN(lng)) return false;
            r.lat = lat;
            r.lng = lng;
            r.rating = parseFloat(r.rating) || 0;
            r.reviewCount = parseInt(r.reviewCount, 10) || 0;
            return true;
          });
          setResults(data);
        }
      } else {
        setError('Received unexpected data format. Please try again.');
      }
    } catch (err) {
      setError(err.message || 'Failed to get results. Please try again.');
    } finally {
      setDiscovering(false);
    }
  };

  const handleLoadMore = async () => {
    if (!results) return;
    setLoadingMore(true);
    setError('');
    try {
      const existingNames = results.results.map(r => r.name);
      const data = await aiApi.discover({
        location: locationInput,
        slotType,
        description,
        destination,
        excludeNames: existingNames,
        tripId
      });
      if (data && Array.isArray(data.results)) {
        const newResults = data.results.filter(r => {
          const lat = parseFloat(r.lat);
          const lng = parseFloat(r.lng);
          if (isNaN(lat) || isNaN(lng)) return false;
          r.lat = lat;
          r.lng = lng;
          r.rating = parseFloat(r.rating) || 0;
          r.reviewCount = parseInt(r.reviewCount, 10) || 0;
          return !existingNames.includes(r.name);
        });
        setResults(prev => ({
          ...prev,
          results: [...prev.results, ...newResults]
        }));
      }
    } catch (err) {
      setError(err.message || 'Failed to load more results.');
    } finally {
      setLoadingMore(false);
    }
  };

  const toggleFavorite = (result) => {
    const current = loadPicks(slotId);
    const exists = current.some(p => p.name === result.name);
    const updated = exists
      ? current.filter(p => p.name !== result.name)
      : [...current, result];
    savePicks(slotId, updated);
    setPickVersion(v => v + 1);
  };

  useEffect(() => {
    saveDiscoveryCache(slotId, { results, locationInput, description });
  }, [results, locationInput, description, slotId]);

  const [selectedMarker, setSelectedMarker] = useState(null);

  const onMapLoad = useRef(null);
  const fitMapBounds = (map) => {
    if (!results) return;
    const bounds = new window.google.maps.LatLngBounds();
    bounds.extend({ lat: results.startLocation.lat, lng: results.startLocation.lng });
    results.results.forEach(r => bounds.extend({ lat: r.lat, lng: r.lng }));
    map.fitBounds(bounds, 40);
  };
  onMapLoad.current = fitMapBounds;

  const showDropdown = dropdownOpen && (filteredLocations.length > 0 || googlePredictions.length > 0 || locationInput === '');

  return (
    <div className="space-y-5">
      {/* Location Input */}
      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5">
        <label className="block text-sm font-semibold text-slate-300 mb-2 flex items-center gap-2">
          <Navigation size={14} className="text-ocean-400" />
          Starting from
        </label>
        <div className="relative" ref={dropdownRef}>
          <div className="relative">
            <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              ref={locationInputRef}
              type="text"
              className="input pl-9 pr-4"
              placeholder="Enter an address or pick from your plan..."
              value={locationInput}
              onChange={e => { setLocationInput(e.target.value); setDropdownOpen(true); }}
              onFocus={() => setDropdownOpen(true)}
            />
          </div>

          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-700 border border-slate-600 rounded-xl shadow-2xl z-20 overflow-hidden max-h-72 overflow-y-auto">
              {/* Plan locations */}
              {filteredLocations.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">From your plan</p>
                  </div>
                  {filteredLocations.map((loc, i) => (
                    <button
                      key={`plan-${i}`}
                      onClick={() => { setLocationInput(loc.address); setDropdownOpen(false); setGooglePredictions([]); }}
                      className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-slate-600 transition-colors text-left"
                    >
                      <div className={`mt-0.5 w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 ${loc.type === 'hotel' ? 'bg-purple-900/50' : 'bg-teal-900/50'}`}>
                        {loc.type === 'hotel' ? <Hotel size={12} className="text-purple-400" /> : <Sun size={12} className="text-teal-400" />}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{loc.label}</p>
                        <p className="text-xs text-slate-400 truncate">{loc.address} · Day {loc.dayNumber}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {/* Google Places suggestions */}
              {googlePredictions.length > 0 && (
                <>
                  <div className="px-3 pt-2 pb-1">
                    <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Google suggestions</p>
                  </div>
                  {googlePredictions.map((pred, i) => (
                    <button
                      key={`google-${i}`}
                      onClick={() => { setLocationInput(pred.description); setDropdownOpen(false); setGooglePredictions([]); }}
                      className="w-full flex items-start gap-3 px-3 py-2.5 hover:bg-slate-600 transition-colors text-left"
                    >
                      <div className="mt-0.5 w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 bg-blue-900/50">
                        <MapPin size={12} className="text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-slate-200 truncate">{pred.mainText}</p>
                        <p className="text-xs text-slate-400 truncate">{pred.secondaryText}</p>
                      </div>
                    </button>
                  ))}
                </>
              )}

              {/* Empty state */}
              {filteredLocations.length === 0 && googlePredictions.length === 0 && (
                <div className="px-3 py-3 text-sm text-slate-400">
                  {locationInput.trim().length < 3
                    ? 'Type at least 3 characters to search for an address...'
                    : 'No hotel or activity locations in your plan yet. Type an address manually.'}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Description */}
        <div className="mt-4">
          <label className="block text-sm font-semibold text-slate-300 mb-2">
            {isMeal ? 'What kind of food are you in the mood for?' : 'What kind of experience are you looking for?'}
          </label>
          <div className="flex gap-3">
            <textarea
              className="input resize-none flex-1"
              rows={2}
              placeholder={isMeal
                ? 'e.g. Traditional local cuisine, vegetarian-friendly, outdoor seating...'
                : 'e.g. Cultural landmarks, relaxing, family-friendly, free activities...'}
              value={description}
              onChange={e => setDescription(e.target.value)}
            />
            <button
              onClick={handleDiscover}
              disabled={discovering || !locationInput.trim()}
              className="btn-primary self-end flex-shrink-0 px-5"
            >
              {discovering ? (
                <Loader2 size={16} className="animate-spin" />
              ) : (
                <Search size={16} />
              )}
              {results ? 'Update' : 'Search'}
            </button>
          </div>
        </div>

        {error && (
          <div className="mt-3 bg-red-900/30 border border-red-700 rounded-lg px-4 py-2.5 text-red-300 text-sm">
            {error}
          </div>
        )}
      </div>

      {/* Loading state */}
      {discovering && (
        <div className="flex flex-col items-center justify-center py-16 gap-4">
          <Loader2 size={36} className="animate-spin text-ocean-400" />
          <p className="text-slate-400 font-medium">
            {isMeal ? 'Finding nearby restaurants...' : 'Finding activities near you...'}
          </p>
          <p className="text-slate-500 text-sm">Powered by Google Places + Gemini AI</p>
        </div>
      )}

      {/* Map + Results */}
      {!discovering && results && (
        <>
          {/* Map */}
          <div className="rounded-2xl overflow-hidden border border-slate-700 shadow-lg" style={{ height: 320 }}>
            {mapsLoaded && <GoogleMap
                mapContainerStyle={{ height: '100%', width: '100%' }}
                center={{ lat: results.startLocation.lat, lng: results.startLocation.lng }}
                zoom={14}
                onLoad={map => fitMapBounds(map)}
                options={{
                  styles: MAP_STYLE,
                  disableDefaultUI: true,
                  zoomControl: true,
                  scrollwheel: false,
                }}
              >
                <MarkerF
                  position={{ lat: results.startLocation.lat, lng: results.startLocation.lng }}
                  icon={'https://maps.google.com/mapfiles/ms/icons/green-dot.png'}
                  zIndex={1000}
                  onClick={() => setSelectedMarker('start')}
                >
                  {selectedMarker === 'start' && (
                    <InfoWindowF onCloseClick={() => setSelectedMarker(null)}>
                      <div>
                        <div className="text-sm font-semibold">📍 Starting Point</div>
                        <div className="text-xs text-gray-600">{results.startLocation.address}</div>
                      </div>
                    </InfoWindowF>
                  )}
                </MarkerF>
                {results.results.map((r, i) => (
                  <MarkerF
                    key={i}
                    position={{ lat: r.lat, lng: r.lng }}
                    label={{ text: String(i + 1), color: 'white', fontWeight: 'bold', fontSize: '11px' }}
                    onClick={() => setSelectedMarker(i)}
                  >
                    {selectedMarker === i && (
                      <InfoWindowF onCloseClick={() => setSelectedMarker(null)}>
                        <div>
                          <div className="text-sm font-semibold">{r.name}</div>
                          <div className="text-xs text-gray-600">{r.address}</div>
                          <div className="text-xs mt-1">
                            {r.rating} stars
                            {r.walkMinutes && ` · ${r.walkMinutes} min walk`}
                            {r.transitMinutes && ` · ${r.transitMinutes} min transit`}
                            {r.driveMinutes && ` · ${r.driveMinutes} min drive`}
                          </div>
                          <a
                            href={r.googleMapsUrl || buildGoogleMapsUrl(r.name, r.address)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-blue-600 hover:underline mt-1 inline-block"
                          >
                            View on Google Maps
                          </a>
                        </div>
                      </InfoWindowF>
                    )}
                  </MarkerF>
                ))}
              </GoogleMap>}
              {!mapsLoaded && <div className="h-full flex items-center justify-center bg-slate-700"><Loader2 size={24} className="animate-spin text-slate-400" /></div>}
          </div>

          {/* Result count */}
          <p className="text-sm text-slate-400 font-medium px-1">
            {results.results.length} {isMeal ? 'restaurants' : 'activities'} found near <span className="text-slate-300">{results.startLocation.address}</span>
          </p>

          {/* Result Cards */}
          <div className="space-y-3">
            {results.results.map((result, i) => (
              <ResultCard
                key={result.placeId || i}
                result={result}
                index={i}
                isFavorite={pickedNames.has(result.name)}
                onToggleFavorite={() => toggleFavorite(result)}
              />
            ))}
          </div>

          {/* Search for more button */}
          <button
            onClick={handleLoadMore}
            disabled={loadingMore}
            className="w-full border-2 border-dashed border-slate-600 rounded-xl py-4 flex items-center justify-center gap-2 text-slate-400 hover:text-ocean-400 hover:border-ocean-500 transition-all duration-200 font-medium"
          >
            {loadingMore ? (
              <>
                <Loader2 size={16} className="animate-spin" />
                Finding more {isMeal ? 'restaurants' : 'activities'}...
              </>
            ) : (
              <>
                <Search size={16} />
                Search for more {isMeal ? 'restaurants' : 'activities'}
              </>
            )}
          </button>
        </>
      )}

      {/* Empty state */}
      {!discovering && !results && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="text-5xl mb-4">{isMeal ? '🍽️' : '🗺️'}</div>
          <h3 className="text-lg font-semibold text-slate-300 mb-2">
            {isMeal ? 'Find nearby restaurants' : 'Discover local activities'}
          </h3>
          <p className="text-slate-500 text-sm max-w-xs">
            Enter a starting location above — your hotel or any address — and we'll find great {isMeal ? 'places to eat' : 'things to do'} nearby.
          </p>
        </div>
      )}
    </div>
  );
}

function PickPhase({ slotId, slotType }) {
  const isMeal = ['BREAKFAST', 'LUNCH', 'DINNER'].includes(slotType);
  const [version, setVersion] = useState(0);
  const picks = loadPicks(slotId);
  const planSelection = loadPlanSelection(slotId);
  const checkedName = planSelection?.result?.name || null;

  const togglePick = (result) => {
    const updated = picks.filter(p => p.name !== result.name);
    savePicks(slotId, updated);
    if (checkedName === result.name) {
      savePlanSelection(slotId, null);
    }
    setVersion(v => v + 1);
  };

  const toggleCheck = (result) => {
    if (checkedName === result.name) {
      savePlanSelection(slotId, null);
    } else {
      savePlanSelection(slotId, { result, time: '', notes: '' });
    }
    setVersion(v => v + 1);
  };

  if (picks.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">🎯</div>
        <h3 className="text-lg font-semibold text-slate-300 mb-2">No picks yet</h3>
        <p className="text-slate-500 text-sm max-w-xs">
          Use the Discovery tab to find {isMeal ? 'restaurants' : 'activities'} and tap the heart to shortlist your favorites here.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <p className="text-sm text-slate-400 font-medium px-1">
        {picks.length} {isMeal ? 'restaurant' : 'activity'}{picks.length !== 1 ? 's' : ''} shortlisted
        {checkedName && <span className="text-emerald-400 ml-2">· 1 selected for plan</span>}
      </p>
      <div className="space-y-3">
        {picks.map((result, i) => (
          <ResultCard
            key={result.placeId || result.name}
            result={result}
            index={i}
            isFavorite={true}
            onToggleFavorite={() => togglePick(result)}
            isChecked={checkedName === result.name}
            onToggleCheck={() => toggleCheck(result)}
          />
        ))}
      </div>
    </div>
  );
}

function PlanPhaseContent({ slotId, slotType, config }) {
  const isMeal = ['BREAKFAST', 'LUNCH', 'DINNER'].includes(slotType);
  const [version, setVersion] = useState(0);
  const planSelection = loadPlanSelection(slotId);
  const picks = loadPicks(slotId);
  const pickedNames = new Set(picks.map(p => p.name));

  const handleTimeChange = (time) => {
    if (planSelection) {
      savePlanSelection(slotId, { ...planSelection, time });
      setVersion(v => v + 1);
    }
  };

  const handleNotesChange = (notes) => {
    if (planSelection) {
      savePlanSelection(slotId, { ...planSelection, notes });
      setVersion(v => v + 1);
    }
  };

  if (!planSelection?.result) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">📋</div>
        <h3 className="text-lg font-semibold text-slate-300 mb-2">No {isMeal ? 'restaurant' : 'activity'} selected</h3>
        <p className="text-slate-500 text-sm max-w-xs">
          Go to the Pick tab and tap the checkmark on your chosen {isMeal ? 'restaurant' : 'activity'} to add it to your plan.
        </p>
      </div>
    );
  }

  const { result } = planSelection;

  return (
    <div className="space-y-5">
      <div className={`bg-gradient-to-r ${config.grad} rounded-2xl px-5 py-4 text-white`}>
        <h2 className="font-bold text-lg">{result.name}</h2>
        <p className="text-white/70 text-sm">{result.address}</p>
      </div>

      <div className="bg-slate-800 rounded-2xl border border-slate-700 p-5 space-y-4">
        <div>
          <label className="label flex items-center gap-1.5">
            <Clock size={13} className="text-slate-400" />
            Time
          </label>
          <input
            type="time"
            className="input"
            value={planSelection.time || ''}
            onChange={e => handleTimeChange(e.target.value)}
          />
        </div>
        <div>
          <label className="label flex items-center gap-1.5">
            <FileText size={13} className="text-slate-400" />
            Notes
          </label>
          <textarea
            className="input resize-none"
            rows={3}
            placeholder="Reservation details, special requests, things to remember..."
            value={planSelection.notes || ''}
            onChange={e => handleNotesChange(e.target.value)}
          />
        </div>
      </div>

      <ResultCard
        result={result}
        index={0}
        isFavorite={pickedNames.has(result.name)}
        onToggleFavorite={() => {
          const current = loadPicks(slotId);
          const exists = current.some(p => p.name === result.name);
          const updated = exists ? current.filter(p => p.name !== result.name) : [...current, result];
          savePicks(slotId, updated);
          setVersion(v => v + 1);
        }}
      />
    </div>
  );
}

function InputField({ label, icon: Icon, type = 'text', value, onChange, placeholder, required }) {
  return (
    <div>
      <label className="label flex items-center gap-1.5">
        {Icon && <Icon size={13} className="text-slate-400" />}
        {label}
        {required && <span className="text-red-400">*</span>}
      </label>
      <input
        type={type}
        className="input"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

function TextAreaField({ label, icon: Icon, value, onChange, placeholder, rows = 3 }) {
  return (
    <div>
      <label className="label flex items-center gap-1.5">
        {Icon && <Icon size={13} className="text-slate-400" />}
        {label}
      </label>
      <textarea
        className="input resize-none"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        rows={rows}
      />
    </div>
  );
}

function SelectField({ label, icon: Icon, value, onChange, options }) {
  return (
    <div>
      <label className="label flex items-center gap-1.5">
        {Icon && <Icon size={13} className="text-slate-400" />}
        {label}
      </label>
      <select
        className="input"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
      >
        <option value="">Select...</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}

function AISuggestionCard({ suggestion, source, onApply, slotType }) {
  const [expanded, setExpanded] = useState(true);
  if (!suggestion) return null;
  const isAI = source !== 'placeholder';
  return (
    <div className="bg-violet-900/20 border border-violet-700/50 rounded-2xl overflow-hidden animate-slide-up">
      <div className="flex items-center justify-between p-4 border-b border-violet-700/30">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
            <Wand2 size={14} className="text-white" />
          </div>
          <div>
            <p className="font-semibold text-violet-300 text-sm">AI Suggestion</p>
            <p className="text-xs text-violet-500">{isAI ? `Powered by ${source === 'claude' ? 'Claude' : 'Gemini'}` : 'Example suggestion'}</p>
          </div>
        </div>
        <button onClick={() => setExpanded(!expanded)} className="p-1.5 rounded-lg hover:bg-violet-800/50 transition-colors text-violet-400">
          {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>
      </div>
      {expanded && (
        <div className="p-4">
          {slotType === 'HOTEL' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-slate-100">{suggestion.hotelName}</h4>
                {suggestion.starRating && (
                  <div className="flex items-center gap-1">
                    {Array.from({ length: suggestion.starRating }).map((_, i) => (
                      <Star key={i} size={12} className="text-amber-400 fill-amber-400" />
                    ))}
                  </div>
                )}
              </div>
              {suggestion.address && <p className="text-sm text-slate-400 flex items-center gap-1"><MapPin size={12} />{suggestion.address}</p>}
              {suggestion.priceRange && <p className="text-sm text-emerald-400 font-medium">{suggestion.priceRange}</p>}
              {suggestion.description && <p className="text-sm text-slate-300 mt-2">{suggestion.description}</p>}
              {suggestion.amenities && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {suggestion.amenities.split(',').map((a, i) => (
                    <span key={i} className="bg-slate-700 text-violet-300 text-xs px-2 py-0.5 rounded-full border border-violet-700/50">{a.trim()}</span>
                  ))}
                </div>
              )}
            </div>
          )}
          {(slotType === 'BREAKFAST' || slotType === 'LUNCH' || slotType === 'DINNER') && (
            <div className="space-y-2">
              <h4 className="font-bold text-slate-100">{suggestion.restaurantName}</h4>
              {suggestion.cuisine && <span className="inline-block bg-slate-700 text-violet-300 text-xs px-2 py-0.5 rounded-full border border-violet-700/50">{suggestion.cuisine}</span>}
              {suggestion.address && <p className="text-sm text-slate-400 flex items-center gap-1"><MapPin size={12} />{suggestion.address}</p>}
              {suggestion.priceRange && <p className="text-sm text-emerald-400 font-medium">{suggestion.priceRange}</p>}
              {suggestion.description && <p className="text-sm text-slate-300 mt-2">{suggestion.description}</p>}
              {suggestion.mustTry && <p className="text-sm text-amber-300 bg-amber-900/30 rounded-lg px-3 py-2 mt-2">Must try: <strong>{suggestion.mustTry}</strong></p>}
            </div>
          )}
          {slotType === 'ACTIVITY' && (
            <div className="space-y-2">
              <h4 className="font-bold text-slate-100">{suggestion.activityName}</h4>
              {suggestion.category && <span className="inline-block bg-slate-700 text-violet-300 text-xs px-2 py-0.5 rounded-full border border-violet-700/50">{suggestion.category}</span>}
              {suggestion.location && <p className="text-sm text-slate-400 flex items-center gap-1"><MapPin size={12} />{suggestion.location}</p>}
              {suggestion.duration && <p className="text-sm text-slate-400 flex items-center gap-1"><Clock size={12} />{suggestion.duration}</p>}
              {suggestion.description && <p className="text-sm text-slate-300 mt-2">{suggestion.description}</p>}
              {suggestion.bestTime && <p className="text-sm text-teal-300 bg-teal-900/30 rounded-lg px-3 py-2 mt-2">Best time: <strong>{suggestion.bestTime}</strong></p>}
            </div>
          )}
          {suggestion.tips && (
            <div className="flex items-start gap-2 mt-3 bg-slate-700/50 rounded-lg p-3 border border-violet-700/30">
              <Info size={14} className="text-violet-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-300">{suggestion.tips}</p>
            </div>
          )}
          <button
            onClick={() => onApply(suggestion)}
            className="w-full mt-4 bg-violet-600 hover:bg-violet-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
          >
            <Check size={16} />Apply This Suggestion
          </button>
        </div>
      )}
    </div>
  );
}

function MealForm({ data, onChange, destination, slotType, onAISuggest, aiLoading }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="col-span-2">
          <InputField label="Restaurant Name" icon={Utensils} value={data.restaurantName} onChange={v => onChange({ ...data, restaurantName: v })} placeholder="e.g. Le Petit Bistro" />
        </div>
        <InputField label="Time" icon={Clock} type="time" value={data.time} onChange={v => onChange({ ...data, time: v })} />
        <InputField label="Cuisine Type" value={data.cuisine} onChange={v => onChange({ ...data, cuisine: v })} placeholder="e.g. French, Italian" />
        <SelectField label="Price Range" icon={DollarSign} value={data.priceRange} onChange={v => onChange({ ...data, priceRange: v })} options={[
          { value: '$', label: '$ (Budget)' }, { value: '$$', label: '$$ (Moderate)' },
          { value: '$$$', label: '$$$ (Upscale)' }, { value: '$$$$', label: '$$$$ (Fine Dining)' }
        ]} />
      </div>
      <InputField label="Address" icon={MapPin} value={data.address} onChange={v => onChange({ ...data, address: v })} placeholder="e.g. 12 Rue de Rivoli, Paris" />
      <TextAreaField label="Notes" icon={FileText} value={data.notes} onChange={v => onChange({ ...data, notes: v })} placeholder="Reservation details, dietary requirements, what to order..." />
      <div className="pt-2">
        <button
          onClick={() => onAISuggest({ destination, mealType: slotType, cuisinePreferences: data.cuisine, budget: data.priceRange })}
          disabled={aiLoading}
          className="w-full border-2 border-violet-700/50 hover:border-violet-500 bg-violet-900/20 hover:bg-violet-900/40 text-violet-300 font-semibold py-2.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
        >
          {aiLoading ? <><Loader2 size={16} className="animate-spin" />Getting AI suggestion...</> : <><Wand2 size={16} />Get AI Suggestion</>}
        </button>
      </div>
    </div>
  );
}

function ActivityForm({ data, onChange, destination, onAISuggest, aiLoading }) {
  return (
    <div className="space-y-4">
      <InputField label="Activity Name" icon={Sun} value={data.activityName} onChange={v => onChange({ ...data, activityName: v })} placeholder="e.g. Eiffel Tower Visit" />
      <div className="grid grid-cols-2 gap-4">
        <InputField label="Time" icon={Clock} type="time" value={data.time} onChange={v => onChange({ ...data, time: v })} />
        <SelectField label="Category" value={data.category} onChange={v => onChange({ ...data, category: v })} options={[
          { value: 'Cultural', label: 'Cultural' }, { value: 'Adventure', label: 'Adventure' },
          { value: 'Nature', label: 'Nature' }, { value: 'Food & Drink', label: 'Food & Drink' },
          { value: 'Shopping', label: 'Shopping' }, { value: 'Relaxation', label: 'Relaxation' },
          { value: 'Entertainment', label: 'Entertainment' }, { value: 'Sports', label: 'Sports' }
        ]} />
        <InputField label="Duration" icon={Clock} value={data.duration} onChange={v => onChange({ ...data, duration: v })} placeholder="e.g. 2-3 hours" />
      </div>
      <InputField label="Location" icon={MapPin} value={data.location} onChange={v => onChange({ ...data, location: v })} placeholder="Specific address or area" />
      <TextAreaField label="Description" value={data.description} onChange={v => onChange({ ...data, description: v })} placeholder="What to expect, highlights..." />
      <TextAreaField label="Notes" icon={FileText} value={data.notes} onChange={v => onChange({ ...data, notes: v })} placeholder="Tickets, booking info, what to bring..." rows={2} />
      <div className="pt-2">
        <button
          onClick={() => onAISuggest({ destination, category: data.category, duration: data.duration })}
          disabled={aiLoading}
          className="w-full border-2 border-violet-700/50 hover:border-violet-500 bg-violet-900/20 hover:bg-violet-900/40 text-violet-300 font-semibold py-2.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
        >
          {aiLoading ? <><Loader2 size={16} className="animate-spin" />Getting AI suggestion...</> : <><Wand2 size={16} />Get AI Suggestion</>}
        </button>
      </div>
    </div>
  );
}

function HotelNameField({ value, onChange, onSelect, tripId }) {
  const [input, setInput] = useState(value || '');
  const [predictions, setPredictions] = useState([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef(null);
  const containerRef = useRef(null);

  useEffect(() => { setInput(value || ''); }, [value]);

  useEffect(() => {
    const handler = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) setShowDropdown(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (input.trim().length < 3) { setPredictions([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const data = await placesApi.autocomplete(input, null, tripId);
        setPredictions(data.predictions || []);
        setShowDropdown(true);
      } catch { setPredictions([]); }
      finally { setLoading(false); }
    }, 300);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [input, tripId]);

  const handleSelect = async (prediction) => {
    setInput(prediction.mainText || prediction.description);
    onChange(prediction.mainText || prediction.description);
    setShowDropdown(false);
    setPredictions([]);
    if (prediction.placeId) {
      try {
        const details = await placesApi.getDetails(prediction.placeId, tripId);
        onSelect(details);
      } catch { /* keep typed text, no autofill */ }
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <label className="label flex items-center gap-1.5">
        <Hotel size={13} className="text-slate-400" />
        Hotel Name
      </label>
      <div className="relative">
        <input
          type="text"
          className="input w-full"
          value={input}
          onChange={e => { setInput(e.target.value); onChange(e.target.value); }}
          placeholder="e.g. The Ritz Paris"
        />
        {loading && <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400" />}
      </div>
      {showDropdown && predictions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-slate-800 border border-slate-600 rounded-xl shadow-xl max-h-60 overflow-y-auto">
          {predictions.map((p, i) => (
            <button
              key={p.placeId || i}
              onClick={() => handleSelect(p)}
              className="w-full text-left px-3 py-2.5 hover:bg-slate-700 transition-colors flex items-start gap-2 border-b border-slate-700/50 last:border-b-0"
            >
              <MapPin size={14} className="text-slate-400 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="text-sm text-white truncate">{p.mainText || p.description}</div>
                {p.secondaryText && <div className="text-xs text-slate-400 truncate">{p.secondaryText}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HotelForm({ data, onChange, tripId }) {
  const handlePlaceSelect = (details) => {
    onChange({
      ...data,
      address: details.address || data.address,
      phoneNumber: details.phoneNumber || data.phoneNumber,
    });
  };

  return (
    <div className="space-y-4">
      <HotelNameField
        value={data.hotelName}
        onChange={v => onChange({ ...data, hotelName: v })}
        onSelect={handlePlaceSelect}
        tripId={tripId}
      />
      <InputField label="Address" icon={MapPin} value={data.address} onChange={v => onChange({ ...data, address: v })} placeholder="Hotel address" />
      <div className="grid grid-cols-2 gap-4">
        <InputField label="Check-in Date" icon={Clock} type="date" value={data.checkIn} onChange={v => onChange({ ...data, checkIn: v })} />
        <InputField label="Check-out Date" icon={Clock} type="date" value={data.checkOut} onChange={v => onChange({ ...data, checkOut: v })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <InputField label="Check-in Time" icon={Clock} type="time" value={data.time} onChange={v => onChange({ ...data, time: v })} />
        <InputField label="Check-out Time" icon={Clock} type="time" value={data.checkOutTime} onChange={v => onChange({ ...data, checkOutTime: v })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <InputField label="Confirmation #" icon={Hash} value={data.confirmationNumber} onChange={v => onChange({ ...data, confirmationNumber: v })} placeholder="e.g. HTLBK12345" />
        <InputField label="Room Type" value={data.roomType} onChange={v => onChange({ ...data, roomType: v })} placeholder="e.g. Deluxe King" />
      </div>
      <InputField label="Phone Number" icon={Phone} type="tel" value={data.phoneNumber} onChange={v => onChange({ ...data, phoneNumber: v })} placeholder="Hotel contact number" />
      <TextAreaField label="Notes" icon={FileText} value={data.notes} onChange={v => onChange({ ...data, notes: v })} placeholder="Special requests, amenities, nearby attractions..." />
    </div>
  );
}

export default function PlanningPage() {
  const { tripId, dayId, slotId } = useParams();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [slot, setSlot] = useState(null);
  const [trip, setTrip] = useState(null);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiSuggestion, setAiSuggestion] = useState(null);
  const [aiSource, setAiSource] = useState('');
  const [phase, setPhase] = useState(() => searchParams.get('phase') || 'discovery');
  const [copyingHotel, setCopyingHotel] = useState(false);
  const [copiedHotel, setCopiedHotel] = useState(false);

  const slotType = slot?.type;
  const isMeal = ['BREAKFAST', 'LUNCH', 'DINNER'].includes(slotType);
  const showPhases = isMeal || slotType === 'ACTIVITY';

  useEffect(() => { loadData(); }, [slotId, tripId]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [slotData, tripData] = await Promise.all([slotsApi.getById(slotId), tripsApi.getById(tripId)]);
      setSlot(slotData);
      setTrip(tripData);
      setFormData(slotData.data || {});
    } catch (err) {
      setError(err.message || 'Failed to load slot');
    } finally {
      setLoading(false);
    }
  };

  const autoSaveTimer = useRef(null);
  const initialLoad = useRef(true);

  useEffect(() => {
    if (initialLoad.current) {
      initialLoad.current = false;
      return;
    }
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      setSaving(true);
      try {
        await slotsApi.update(slotId, { data: formData });
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
      } catch (err) {
        setError(err.message || 'Failed to save');
      } finally {
        setSaving(false);
      }
    }, 1000);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [formData, slotId]);

  const handleAISuggest = async (params) => {
    setAiLoading(true);
    setAiSuggestion(null);
    try {
      let result;
      const paramsWithTrip = { ...params, tripId };
      if (isMeal) result = await aiApi.suggestMeal(paramsWithTrip);
      else if (slotType === 'ACTIVITY') result = await aiApi.suggestActivity(paramsWithTrip);
      else if (slotType === 'HOTEL') result = await aiApi.searchHotel(paramsWithTrip);
      if (result) { setAiSuggestion(result.suggestion); setAiSource(result.source); }
    } catch (err) {
      console.error('AI suggestion failed:', err);
    } finally {
      setAiLoading(false);
    }
  };

  const handleApplySuggestion = (suggestion) => {
    if (isMeal) {
      setFormData(prev => ({
        ...prev,
        restaurantName: suggestion.restaurantName || prev.restaurantName,
        cuisine: suggestion.cuisine || prev.cuisine,
        address: suggestion.address || prev.address,
        priceRange: suggestion.priceRange || prev.priceRange,
        notes: suggestion.description ? `${suggestion.description}${suggestion.mustTry ? `\n\nMust try: ${suggestion.mustTry}` : ''}${suggestion.tips ? `\n\nTip: ${suggestion.tips}` : ''}` : prev.notes
      }));
    } else if (slotType === 'ACTIVITY') {
      setFormData(prev => ({
        ...prev,
        activityName: suggestion.activityName || prev.activityName,
        category: suggestion.category || prev.category,
        location: suggestion.location || prev.location,
        duration: suggestion.duration || prev.duration,
        description: suggestion.description || prev.description,
        notes: suggestion.tips ? `${suggestion.tips}${suggestion.bestTime ? `\nBest time: ${suggestion.bestTime}` : ''}` : prev.notes
      }));
    } else if (slotType === 'HOTEL') {
      setFormData(prev => ({
        ...prev,
        hotelName: suggestion.hotelName || prev.hotelName,
        address: suggestion.address || prev.address,
        notes: suggestion.description ? `${suggestion.description}${suggestion.amenities ? `\n\nAmenities: ${suggestion.amenities}` : ''}${suggestion.tips ? `\n\nTip: ${suggestion.tips}` : ''}` : prev.notes
      }));
    }
    setAiSuggestion(null);
  };

  const handleCopyHotelToAllDays = async () => {
    if (!trip?.days) return;
    const otherHotelSlots = trip.days
      .flatMap(d => (d.slots || []))
      .filter(s => s.type === 'HOTEL' && s.id !== slotId);

    if (otherHotelSlots.length === 0) return;

    setCopyingHotel(true);
    try {
      await Promise.all(
        otherHotelSlots.map(s => slotsApi.update(s.id, { data: formData }))
      );
      setCopiedHotel(true);
      setTimeout(() => setCopiedHotel(false), 3000);
    } catch (err) {
      console.error('Failed to copy hotel to all days:', err);
    } finally {
      setCopyingHotel(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="animate-spin text-ocean-400" />
          <p className="text-slate-400 font-medium">Loading...</p>
        </div>
      </div>
    );
  }

  if (error && !slot) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center shadow-sm max-w-md w-full">
          <div className="text-4xl mb-3">⚠️</div>
          <h3 className="font-bold text-slate-100 text-lg mb-2">Error</h3>
          <p className="text-slate-400 mb-4">{error}</p>
          <button onClick={() => navigate(`/trips/${tripId}`)} className="btn-secondary mx-auto">
            <ArrowLeft size={16} />Back to Trip
          </button>
        </div>
      </div>
    );
  }

  const config = SLOT_CONFIG[slotType] || SLOT_CONFIG.ACTIVITY;
  const Icon = config.icon;
  const destination = trip?.destination || '';

  const currentDay = trip?.days?.find(d => d.id === dayId);
  const daySlots = currentDay?.slots || [];

  const handleSlotNav = (targetSlotId) => {
    if (targetSlotId === slotId) return;
    const targetSlot = daySlots.find(s => s.id === targetSlotId);
    const isMealOrActivity = targetSlot && ['BREAKFAST', 'LUNCH', 'DINNER', 'ACTIVITY'].includes(targetSlot.type);
    const targetPlan = isMealOrActivity ? loadPlanSelection(targetSlotId) : null;
    const targetPhase = targetPlan?.result ? 'plan' : '';
    navigate(`/trips/${tripId}/days/${dayId}/slots/${targetSlotId}${targetPhase ? `?phase=${targetPhase}` : ''}`);
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 shadow-sm sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-6">
          {daySlots.length > 0 && <div className="hidden lg:block w-56 flex-shrink-0" />}
          <div className="flex items-center gap-4 h-16 flex-1 min-w-0 max-w-2xl">
            <button onClick={() => navigate(`/trips/${tripId}`)} className="p-2 rounded-full hover:bg-slate-700 transition-colors text-slate-400">
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${config.grad} flex items-center justify-center`}>
                <Icon size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-bold text-slate-100">{config.label} Planning</h1>
                <p className="text-xs text-slate-400">{trip?.name} · {destination}{currentDay ? ` · Day ${currentDay.dayNumber}` : ''}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <CostBadge tripId={tripId} />
              {!showPhases && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  {saving && <><Loader2 size={14} className="animate-spin" /><span>Saving...</span></>}
                  {saved && !saving && <><Check size={14} className="text-green-400" /><span className="text-green-400">Saved</span></>}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* Phase Tabs - only for meals and activities */}
      {showPhases && (
        <div className="bg-slate-800 border-b border-slate-700 sticky top-16 z-10">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 flex gap-6">
            {daySlots.length > 0 && <div className="hidden lg:block w-56 flex-shrink-0" />}
            <div className="flex flex-1 min-w-0 max-w-2xl">
              {PHASES.map((p, i) => (
                <button
                  key={p.id}
                  onClick={() => setPhase(p.id)}
                  className={`flex-1 py-3.5 text-sm font-semibold transition-all duration-200 border-b-2 ${
                    phase === p.id
                      ? 'border-ocean-400 text-ocean-400'
                      : 'border-transparent text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <span className="mr-1.5 text-slate-600">{i + 1}.</span>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 flex gap-6">
        {/* Day sidebar */}
        {daySlots.length > 0 && (
          <aside className="hidden lg:block w-56 flex-shrink-0">
            <div className="sticky top-28">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3">
                Day {currentDay?.dayNumber}
              </p>
              <div className="space-y-1.5">
                {daySlots.map(s => {
                  const sc = SLOT_CONFIG[s.type] || SLOT_CONFIG.ACTIVITY;
                  const SIcon = sc.icon;
                  const isActive = s.id === slotId;
                  const isMealOrAct = ['BREAKFAST', 'LUNCH', 'DINNER', 'ACTIVITY'].includes(s.type);
                  const sPlan = isMealOrAct ? loadPlanSelection(s.id) : null;
                  const sName = sPlan?.result?.name || s.data?.[sc.previewField] || '';
                  const sTime = sPlan?.time || s.data?.time || '';
                  return (
                    <button
                      key={s.id}
                      onClick={() => handleSlotNav(s.id)}
                      className={`w-full text-left rounded-xl px-3 py-2.5 transition-all duration-150 border ${
                        isActive
                          ? `${sc.bg} ${sc.border} ring-1 ring-${sc.color.replace('text-', '')}/30`
                          : 'border-transparent hover:bg-slate-800 hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <SIcon size={13} className={isActive ? sc.color : 'text-slate-500'} />
                        <span className={`text-xs font-semibold uppercase tracking-wide ${isActive ? sc.color : 'text-slate-500'}`}>
                          {sc.label}
                        </span>
                        {sTime && (
                          <span className="text-[10px] text-slate-500 ml-auto">{sTime}</span>
                        )}
                      </div>
                      {sName && (
                        <p className={`text-xs mt-0.5 truncate ${isActive ? 'text-slate-300' : 'text-slate-500'}`}>
                          {sName}
                        </p>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          </aside>
        )}

        {/* Content */}
        <main className="flex-1 min-w-0 max-w-2xl space-y-6">
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">{error}</div>
        )}

        {/* Discovery Phase */}
        {showPhases && phase === 'discovery' && (
          <DiscoveryPhase
            tripId={tripId}
            slotId={slotId}
            slotType={slotType}
            destination={destination}
          />
        )}

        {/* Pick Phase */}
        {showPhases && phase === 'pick' && (
          <PickPhase slotId={slotId} slotType={slotType} />
        )}

        {/* The Plan Phase (or hotel always shows this) */}
        {(!showPhases || phase === 'plan') && (
          showPhases ? (
            <PlanPhaseContent slotId={slotId} slotType={slotType} config={config} />
          ) : (
            <>
              <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-sm overflow-hidden">
                <div className={`bg-gradient-to-r ${config.grad} px-6 py-4 text-white`}>
                  <div className="flex items-center gap-3">
                    <Icon size={22} />
                    <div>
                      <h2 className="font-bold text-lg">{config.label} Details</h2>
                      <p className="text-white/70 text-sm">Fill in your accommodation details</p>
                    </div>
                  </div>
                </div>
                <div className="p-6">
                  <HotelForm data={formData} onChange={setFormData} tripId={tripId} />
                </div>
              </div>

              {trip?.days?.length > 1 && (
                <button
                  onClick={handleCopyHotelToAllDays}
                  disabled={copyingHotel || !formData.hotelName}
                  className={`w-full border-2 rounded-xl py-3 px-4 font-semibold transition-all duration-200 flex items-center justify-center gap-2 ${
                    copiedHotel
                      ? 'border-emerald-500/50 bg-emerald-900/20 text-emerald-400'
                      : 'border-purple-700/50 hover:border-purple-500 bg-purple-900/20 hover:bg-purple-900/40 text-purple-300'
                  }`}
                >
                  {copyingHotel ? (
                    <><Loader2 size={16} className="animate-spin" />Copying to all days...</>
                  ) : copiedHotel ? (
                    <><Check size={16} />Copied to {trip.days.length - 1} other day{trip.days.length - 1 !== 1 ? 's' : ''}</>
                  ) : (
                    <><Copy size={16} />Copy hotel to all days</>
                  )}
                </button>
              )}

              {aiSuggestion && <AISuggestionCard suggestion={aiSuggestion} source={aiSource} slotType={slotType} onApply={handleApplySuggestion} />}

              <div className="pb-8" />
            </>
          )
        )}
      </main>
      </div>
    </div>
  );
}
