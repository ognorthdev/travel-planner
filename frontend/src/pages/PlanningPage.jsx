import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Save, Loader2, Wand2, Hotel, Coffee, Moon, Utensils,
  Sun, MapPin, Clock, DollarSign, FileText, Phone, Hash, Check,
  Star, Info, ChevronDown, ChevronUp, Search, Heart, Navigation,
  Bus, Footprints
} from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { slotsApi, tripsApi, aiApi, locationsApi } from '../api/index.js';

// Fix Leaflet default icon issue with bundlers
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Custom icons
const startIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-blue.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});
const resultIcon = new L.Icon({
  iconUrl: 'https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-2x-red.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
  iconSize: [25, 41], iconAnchor: [12, 41], popupAnchor: [1, -34], shadowSize: [41, 41]
});

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

// Map bounds fitter component
function MapFitter({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [40, 40] });
    }
  }, [bounds, map]);
  return null;
}

function StarRating({ rating, reviewCount }) {
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

function DiscoveryPhase({ tripId, slotType, destination, trip }) {
  const isMeal = ['BREAKFAST', 'LUNCH', 'DINNER'].includes(slotType);

  const [locationInput, setLocationInput] = useState('');
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [planLocations, setPlanLocations] = useState([]);
  const [description, setDescription] = useState('');
  const [discovering, setDiscovering] = useState(false);
  const [results, setResults] = useState(null); // { startLocation, results[] }
  const [favorites, setFavorites] = useState(new Set());
  const [error, setError] = useState('');
  const locationInputRef = useRef(null);
  const dropdownRef = useRef(null);

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
    try {
      const data = await aiApi.discover({
        location: locationInput,
        slotType,
        description,
        destination
      });
      setResults(data);
    } catch (err) {
      setError(err.message || 'Failed to get results. Please try again.');
    } finally {
      setDiscovering(false);
    }
  };

  const toggleFavorite = (idx) => {
    setFavorites(prev => {
      const next = new Set(prev);
      next.has(idx) ? next.delete(idx) : next.add(idx);
      return next;
    });
  };

  // Build map bounds from results + start
  const mapBounds = results
    ? [
        [results.startLocation.lat, results.startLocation.lng],
        ...results.results.map(r => [r.lat, r.lng])
      ]
    : null;

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

          {dropdownOpen && (filteredLocations.length > 0 || locationInput === '') && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-slate-700 border border-slate-600 rounded-xl shadow-2xl z-20 overflow-hidden">
              {planLocations.length > 0 && (
                <div className="px-3 pt-2 pb-1">
                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">From your plan</p>
                </div>
              )}
              {filteredLocations.map((loc, i) => (
                <button
                  key={i}
                  onClick={() => { setLocationInput(loc.address); setDropdownOpen(false); }}
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
              {planLocations.length === 0 && (
                <div className="px-3 py-3 text-sm text-slate-400">
                  No hotel or activity locations in your plan yet. Type an address manually.
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
          <p className="text-slate-500 text-sm">Powered by Gemini AI</p>
        </div>
      )}

      {/* Map + Results */}
      {!discovering && results && (
        <>
          {/* Map */}
          <div className="rounded-2xl overflow-hidden border border-slate-700 shadow-lg" style={{ height: 320 }}>
            <MapContainer
              center={[results.startLocation.lat, results.startLocation.lng]}
              zoom={14}
              style={{ height: '100%', width: '100%' }}
              scrollWheelZoom={false}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
              />
              <MapFitter bounds={mapBounds} />
              <Marker position={[results.startLocation.lat, results.startLocation.lng]} icon={startIcon}>
                <Popup>
                  <div className="text-sm font-semibold">📍 Starting Point</div>
                  <div className="text-xs text-gray-600">{results.startLocation.address}</div>
                </Popup>
              </Marker>
              {results.results.map((r, i) => (
                <Marker key={i} position={[r.lat, r.lng]} icon={resultIcon}>
                  <Popup>
                    <div className="text-sm font-semibold">{r.name}</div>
                    <div className="text-xs text-gray-600">{r.address}</div>
                    <div className="text-xs mt-1">⭐ {r.rating} · {isMeal ? `${r.walkMinutes} min walk` : `${r.transitMinutes} min transit`}</div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          </div>

          {/* Result count */}
          <p className="text-sm text-slate-400 font-medium px-1">
            {results.results.length} {isMeal ? 'restaurants' : 'activities'} found near <span className="text-slate-300">{results.startLocation.address}</span>
          </p>

          {/* Result Cards */}
          <div className="space-y-3">
            {results.results.map((result, i) => (
              <div key={i} className="bg-slate-800 rounded-2xl border border-slate-700 p-4 hover:border-slate-600 transition-colors">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    {/* Name + Category */}
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
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

                    {/* Star Rating */}
                    <StarRating rating={result.rating} reviewCount={result.reviewCount} />

                    {/* Address */}
                    <div className="flex items-center gap-1 mt-2 text-slate-400">
                      <MapPin size={12} className="flex-shrink-0" />
                      <span className="text-xs">{result.address}</span>
                    </div>

                    {/* Travel time */}
                    <div className="flex items-center gap-3 mt-2">
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
                      {result.duration && (
                        <div className="flex items-center gap-1 text-slate-400">
                          <Clock size={12} />
                          <span className="text-xs">{result.duration}</span>
                        </div>
                      )}
                    </div>

                    {/* Reason */}
                    <p className="text-sm text-slate-300 mt-3 leading-relaxed">{result.reason}</p>

                    {/* Highlight */}
                    {result.highlights && (
                      <div className="mt-2 flex items-start gap-1.5">
                        <Star size={12} className="text-amber-400 flex-shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-300">{result.highlights}</p>
                      </div>
                    )}
                  </div>

                  {/* Favorite button */}
                  <button
                    onClick={() => toggleFavorite(i)}
                    className={`flex-shrink-0 w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                      favorites.has(i)
                        ? 'bg-rose-500/20 border border-rose-500/50 text-rose-400'
                        : 'bg-slate-700 border border-slate-600 text-slate-400 hover:text-rose-400 hover:border-rose-500/50'
                    }`}
                  >
                    <Heart size={18} className={favorites.has(i) ? 'fill-rose-400' : ''} />
                  </button>
                </div>
              </div>
            ))}
          </div>
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

function HotelForm({ data, onChange, destination, onAISuggest, aiLoading }) {
  return (
    <div className="space-y-4">
      <InputField label="Hotel Name" icon={Hotel} value={data.hotelName} onChange={v => onChange({ ...data, hotelName: v })} placeholder="e.g. The Ritz Paris" />
      <InputField label="Address" icon={MapPin} value={data.address} onChange={v => onChange({ ...data, address: v })} placeholder="Hotel address" />
      <div className="grid grid-cols-2 gap-4">
        <InputField label="Check-in Date" icon={Clock} type="date" value={data.checkIn} onChange={v => onChange({ ...data, checkIn: v })} />
        <InputField label="Check-out Date" icon={Clock} type="date" value={data.checkOut} onChange={v => onChange({ ...data, checkOut: v })} />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <InputField label="Confirmation #" icon={Hash} value={data.confirmationNumber} onChange={v => onChange({ ...data, confirmationNumber: v })} placeholder="e.g. HTLBK12345" />
        <InputField label="Room Type" value={data.roomType} onChange={v => onChange({ ...data, roomType: v })} placeholder="e.g. Deluxe King" />
      </div>
      <InputField label="Phone Number" icon={Phone} type="tel" value={data.phoneNumber} onChange={v => onChange({ ...data, phoneNumber: v })} placeholder="Hotel contact number" />
      <TextAreaField label="Notes" icon={FileText} value={data.notes} onChange={v => onChange({ ...data, notes: v })} placeholder="Special requests, amenities, nearby attractions..." />
      <div className="pt-2">
        <button
          onClick={() => onAISuggest({ destination, budget: data.priceRange })}
          disabled={aiLoading}
          className="w-full border-2 border-violet-700/50 hover:border-violet-500 bg-violet-900/20 hover:bg-violet-900/40 text-violet-300 font-semibold py-2.5 px-4 rounded-xl transition-all duration-200 flex items-center justify-center gap-2"
        >
          {aiLoading ? <><Loader2 size={16} className="animate-spin" />Getting AI suggestion...</> : <><Wand2 size={16} />Get AI Hotel Suggestion</>}
        </button>
      </div>
    </div>
  );
}

export default function PlanningPage() {
  const { tripId, dayId, slotId } = useParams();
  const navigate = useNavigate();

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
  const [phase, setPhase] = useState('discovery');

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

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      await slotsApi.update(slotId, { data: formData });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      setError(err.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  const handleAISuggest = async (params) => {
    setAiLoading(true);
    setAiSuggestion(null);
    try {
      let result;
      if (isMeal) result = await aiApi.suggestMeal(params);
      else if (slotType === 'ACTIVITY') result = await aiApi.suggestActivity(params);
      else if (slotType === 'HOTEL') result = await aiApi.searchHotel(params);
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

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 shadow-sm sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 sm:px-6">
          <div className="flex items-center gap-4 h-16">
            <button onClick={() => navigate(`/trips/${tripId}`)} className="p-2 rounded-full hover:bg-slate-700 transition-colors text-slate-400">
              <ArrowLeft size={20} />
            </button>
            <div className="flex items-center gap-3 flex-1">
              <div className={`w-9 h-9 rounded-xl bg-gradient-to-br ${config.grad} flex items-center justify-center`}>
                <Icon size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-bold text-slate-100">{config.label} Planning</h1>
                <p className="text-xs text-slate-400">{trip?.name} · {destination}</p>
              </div>
            </div>
            {phase === 'plan' && (
              <button
                onClick={handleSave}
                disabled={saving}
                className={`flex items-center gap-2 font-semibold py-2 px-4 rounded-lg transition-all duration-200 ${saved ? 'bg-green-500 text-white' : 'bg-ocean-500 hover:bg-ocean-600 text-white'}`}
              >
                {saving ? <><Loader2 size={16} className="animate-spin" />Saving...</> : saved ? <><Check size={16} />Saved!</> : <><Save size={16} />Save</>}
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Phase Tabs - only for meals and activities */}
      {showPhases && (
        <div className="bg-slate-800 border-b border-slate-700 sticky top-16 z-10">
          <div className="max-w-2xl mx-auto px-4 sm:px-6">
            <div className="flex">
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

      {/* Content */}
      <main className="max-w-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {error && (
          <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-sm">{error}</div>
        )}

        {/* Discovery Phase */}
        {showPhases && phase === 'discovery' && (
          <DiscoveryPhase
            tripId={tripId}
            slotType={slotType}
            destination={destination}
            trip={trip}
          />
        )}

        {/* Pick Phase - placeholder for now */}
        {showPhases && phase === 'pick' && (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <div className="text-5xl mb-4">🎯</div>
            <h3 className="text-lg font-semibold text-slate-300 mb-2">Pick coming soon</h3>
            <p className="text-slate-500 text-sm max-w-xs">
              Use Discovery to find and favorite options, then come back here to compare and make your final pick.
            </p>
          </div>
        )}

        {/* The Plan Phase (or hotel always shows this) */}
        {(!showPhases || phase === 'plan') && (
          <>
            <div className="bg-slate-800 rounded-2xl border border-slate-700 shadow-sm overflow-hidden">
              <div className={`bg-gradient-to-r ${config.grad} px-6 py-4 text-white`}>
                <div className="flex items-center gap-3">
                  <Icon size={22} />
                  <div>
                    <h2 className="font-bold text-lg">{config.label} Details</h2>
                    <p className="text-white/70 text-sm">
                      {slotType === 'HOTEL' && 'Fill in your accommodation details'}
                      {isMeal && 'Fill in the restaurant details'}
                      {slotType === 'ACTIVITY' && 'Fill in the activity details'}
                    </p>
                  </div>
                </div>
              </div>
              <div className="p-6">
                {isMeal && <MealForm data={formData} onChange={setFormData} destination={destination} slotType={slotType} onAISuggest={handleAISuggest} aiLoading={aiLoading} />}
                {slotType === 'ACTIVITY' && <ActivityForm data={formData} onChange={setFormData} destination={destination} onAISuggest={handleAISuggest} aiLoading={aiLoading} />}
                {slotType === 'HOTEL' && <HotelForm data={formData} onChange={setFormData} destination={destination} onAISuggest={handleAISuggest} aiLoading={aiLoading} />}
              </div>
            </div>

            {aiSuggestion && <AISuggestionCard suggestion={aiSuggestion} source={aiSource} slotType={slotType} onApply={handleApplySuggestion} />}

            <div className="pb-8">
              <button
                onClick={handleSave}
                disabled={saving}
                className={`w-full flex items-center justify-center gap-2 font-semibold py-3 px-6 rounded-xl transition-all duration-200 text-white ${saved ? 'bg-green-500' : 'bg-ocean-500 hover:bg-ocean-600'}`}
              >
                {saving ? <><Loader2 size={18} className="animate-spin" />Saving changes...</> : saved ? <><Check size={18} />Changes saved!</> : <><Save size={18} />Save Changes</>}
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
