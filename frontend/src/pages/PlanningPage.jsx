import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Hotel, Coffee, Moon, Utensils,
  Sun, MapPin, Clock, FileText, Phone, Hash, Check,
  Star, Heart, Ticket,
  Bus, Footprints, Car, Lightbulb, ThumbsDown,
  ExternalLink, Copy, RefreshCw, BookmarkCheck
} from 'lucide-react';
import { slotsApi, tripsApi, placesApi } from '../api/index.js';
import CostBadge from '../components/CostBadge';
import TimePicker from '../components/TimePicker';
import { formatTime12 } from '../utils/time.js';

function buildGoogleMapsUrl(name, address) {
  return `https://www.google.com/maps/search/${encodeURIComponent(name + ', ' + address)}`;
}

const SLOT_CONFIG = {
  HOTEL: { label: 'Hotel', icon: Hotel, color: 'text-purple-400', bg: 'bg-purple-900/30', grad: 'from-purple-600 to-indigo-700' },
  BREAKFAST: { label: 'Breakfast', icon: Coffee, color: 'text-amber-400', bg: 'bg-amber-900/30', grad: 'from-amber-500 to-orange-600' },
  LUNCH: { label: 'Lunch', icon: Utensils, color: 'text-green-400', bg: 'bg-green-900/30', grad: 'from-green-600 to-teal-700' },
  DINNER: { label: 'Dinner', icon: Moon, color: 'text-indigo-400', bg: 'bg-indigo-900/30', grad: 'from-indigo-600 to-purple-700' },
  ACTIVITY: { label: 'Activity', icon: Sun, color: 'text-teal-400', bg: 'bg-teal-900/30', grad: 'from-teal-600 to-cyan-700' }
};

function buildTikTokSearchUrl(name, city) {
  const query = `${name} ${city}`.trim();
  return `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
}

function SlotDetailCard({ slotId, slotType, config, formData, onFormDataChange, destination, tripId }) {
  const isMeal = ['BREAKFAST', 'LUNCH', 'DINNER'].includes(slotType);
  const Icon = config.icon;
  const name = formData.activityName || formData.restaurantName || formData.name || '';

  const [enrichment, setEnrichment] = useState(formData.enrichment || null);
  const [enriching, setEnriching] = useState(false);
  const [saved, setSaved] = useState(formData.saved || false);
  const [notes, setNotes] = useState(formData.notes || '');
  const [time, setTime] = useState(formData.time || '');
  const [bookingStatus, setBookingStatus] = useState(formData.bookingStatus || 'none');
  const [confirmationNumber, setConfirmationNumber] = useState(formData.confirmationNumber || '');
  const notesTimer = useRef(null);
  const confTimer = useRef(null);

  const fetchEnrichment = (force = false) => {
    if (!name) return;
    setEnriching(true);
    slotsApi.enrich(slotId, force)
      .then(data => {
        if (!data.empty) setEnrichment(data);
      })
      .catch(() => {})
      .finally(() => setEnriching(false));
  };

  useEffect(() => {
    if (!name || enrichment) return;
    fetchEnrichment();
  }, [slotId, name]);

  // Enrichment eagerly resolves only 2 photos; this detail view pulls the
  // remaining cached refs on demand.
  useEffect(() => {
    if (!enrichment?.placeId) return;
    const have = enrichment.photos?.length || 0;
    if ((enrichment.photosAvailable || 0) <= have) return;
    let cancelled = false;
    placesApi.morePhotos(enrichment.placeId, tripId)
      .then(result => {
        if (!cancelled && result.photos?.length > have) {
          setEnrichment(prev => ({ ...prev, photos: result.photos }));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [enrichment?.placeId, enrichment?.photosAvailable, tripId]);

  const handleToggleSave = () => {
    const next = !saved;
    setSaved(next);
    onFormDataChange({ ...formData, saved: next, enrichment: enrichment || formData.enrichment });
  };

  const handleNotesChange = (value) => {
    setNotes(value);
    if (notesTimer.current) clearTimeout(notesTimer.current);
    notesTimer.current = setTimeout(() => {
      onFormDataChange({ ...formData, notes: value, time });
    }, 800);
  };

  const handleTimeChange = (value) => {
    setTime(value);
    // Include the latest local notes so an unsaved note isn't clobbered.
    onFormDataChange({ ...formData, time: value, notes });
  };

  const handleBookingStatusChange = (status) => {
    setBookingStatus(status);
    onFormDataChange({ ...formData, bookingStatus: status, confirmationNumber, notes, time });
  };

  const handleConfirmationChange = (value) => {
    setConfirmationNumber(value);
    if (confTimer.current) clearTimeout(confTimer.current);
    confTimer.current = setTimeout(() => {
      onFormDataChange({ ...formData, confirmationNumber: value, bookingStatus, notes, time });
    }, 800);
  };

  if (!name) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="text-5xl mb-4">{isMeal ? '🍽️' : '🗺️'}</div>
        <h3 className="text-lg font-semibold text-slate-300 mb-2">No {isMeal ? 'restaurant' : 'activity'} selected</h3>
        <p className="text-slate-500 text-sm max-w-xs">
          Use the research panel to find ideas, then drag them into your day plan.
        </p>
      </div>
    );
  }

  const e = enrichment || {};
  const photos = e.photos || [];
  const rating = parseFloat(e.rating) || 0;
  const reviewCount = e.reviewCount;
  const address = e.address || formData.address || formData.location || '';
  const googleMapsUrl = e.googleMapsUrl;
  const operatingHours = e.operatingHours || formData.operatingHours || '';
  const travel = e.travelFromHotel;
  const costInfo = e.costInfo;
  const city = e.city || destination.split(',')[0].trim();
  const reviewHighlights = e.reviewHighlights || formData.reviewSummary || [];
  const tips = e.tips || formData.watchOutFor || [];
  const googleReviews = e.reviews || [];
  const menuHighlights = e.menuHighlights || [];
  // Real classification labels when enrichment provides them; positional
  // guesses for older cached data that predates classification.
  const fallbackLabels = isMeal ? ['Exterior', 'Interior', 'Food', 'Food'] : ['Exterior', 'Interior', 'Highlight', 'Highlight'];
  const labelFor = (photo, pi) => {
    if (photo.label && photo.label !== 'other') return photo.label.charAt(0).toUpperCase() + photo.label.slice(1);
    return fallbackLabels[pi];
  };

  return (
    <div className="space-y-4">
      {/* Header with name and heart */}
      <div className={`bg-gradient-to-r ${config.grad} rounded-2xl px-5 py-4 text-white relative`}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              <Icon size={20} />
            </div>
            <div className="min-w-0">
              <h2 className="font-bold text-lg">{name}</h2>
              {address && <p className="text-white/70 text-sm truncate">{address}</p>}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => fetchEnrichment(true)}
              disabled={enriching}
              className="w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 bg-white/20 border border-white/30 text-white/70 hover:text-white hover:border-white/50"
              title="Refresh details"
            >
              <RefreshCw size={16} className={enriching ? 'animate-spin' : ''} />
            </button>
            <button
              onClick={handleToggleSave}
              className={`w-10 h-10 rounded-xl flex items-center justify-center transition-all duration-200 ${
                saved
                  ? 'bg-rose-500/30 border border-rose-400/50 text-rose-300'
                  : 'bg-white/20 border border-white/30 text-white/70 hover:text-rose-300 hover:border-rose-400/50'
              }`}
            >
              <Heart size={18} className={saved ? 'fill-rose-300' : ''} />
            </button>
          </div>
        </div>
      </div>

      {enriching && (
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 size={28} className="animate-spin text-ocean-400" />
          <p className="text-slate-400 text-sm">Loading details...</p>
        </div>
      )}

      {!enriching && (
        <div className="space-y-4">
          {/* Rating */}
          {rating > 0 && (
            <div className="flex items-center gap-1.5">
              <div className="flex items-center gap-0.5">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} size={14} className={i < Math.floor(rating) ? 'text-amber-400 fill-amber-400' : (i === Math.floor(rating) && rating % 1 >= 0.5 ? 'text-amber-400 fill-amber-400/50' : 'text-slate-600')} />
                ))}
              </div>
              <span className="text-sm font-semibold text-amber-400">{rating.toFixed(1)}</span>
              {reviewCount && <span className="text-xs text-slate-500">({reviewCount.toLocaleString()} reviews)</span>}
            </div>
          )}

          {/* Address */}
          {address && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <MapPin size={14} className="text-slate-500 flex-shrink-0" />
              <span>{address}</span>
            </div>
          )}

          {/* Operating hours */}
          {operatingHours && (
            <div className="flex items-start gap-2 text-sm text-slate-400">
              <Clock size={14} className="text-slate-500 flex-shrink-0 mt-0.5" />
              <span className="text-xs">{operatingHours}</span>
            </div>
          )}

          {/* Cost / Ticket info */}
          {costInfo && (
            <div className="flex items-start gap-2 text-sm text-slate-400">
              <Ticket size={14} className="text-emerald-500 flex-shrink-0 mt-0.5" />
              <span className="text-xs">
                {costInfo.tickets && costInfo.tickets.length > 0
                  ? costInfo.tickets.map(t => `${t.type}: ${t.price}`).join(' · ')
                  : costInfo.description}
              </span>
            </div>
          )}

          {/* Travel times from hotel */}
          {travel && (
            <div className="flex items-center gap-3 flex-wrap">
              {travel.carMinutes && (
                <div className="flex items-center gap-1 text-violet-400">
                  <Car size={13} />
                  <span className="text-xs font-medium">{travel.carMinutes} min drive</span>
                </div>
              )}
              {travel.transitMinutes && (
                <div className="flex items-center gap-1 text-teal-400">
                  <Bus size={13} />
                  <span className="text-xs font-medium">{travel.transitMinutes} min transit</span>
                </div>
              )}
              {travel.walkMinutes && (
                <div className="flex items-center gap-1 text-ocean-400">
                  <Footprints size={13} />
                  <span className="text-xs font-medium">{travel.walkMinutes} min walk</span>
                </div>
              )}
            </div>
          )}

          {/* Photos */}
          {photos.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {photos.slice(0, 4).map((photo, pi) => (
                <div key={pi} className="relative h-32 rounded-xl overflow-hidden bg-slate-700/50">
                  <img src={photo.url} alt={`${name} - ${labelFor(photo, pi)}`} loading="lazy" decoding="async" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  <span className="absolute bottom-1 left-1 text-[10px] font-medium bg-black/60 text-white px-1.5 py-0.5 rounded">{labelFor(photo, pi)}</span>
                </div>
              ))}
            </div>
          )}

          {/* External links */}
          <div className="flex items-center gap-2 flex-wrap">
            {address && (
              <a
                href={googleMapsUrl || buildGoogleMapsUrl(name, address)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-xs font-medium text-ocean-400 hover:text-ocean-300 transition-colors"
              >
                <ExternalLink size={12} />
                View on Google Maps
              </a>
            )}
            {city && (
              <a
                href={buildTikTokSearchUrl(name, city)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-xs font-medium text-pink-400 hover:text-pink-300 transition-colors"
              >
                <ExternalLink size={12} />
                Search on TikTok
              </a>
            )}
          </div>

          {/* Menu highlights scraped from the restaurant's website */}
          {isMeal && menuHighlights.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Utensils size={13} className="text-amber-400" />
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">From the Menu</p>
              </div>
              <ul className="space-y-1">
                {menuHighlights.map((item, j) => (
                  <li key={j} className="flex items-baseline justify-between gap-3 text-sm text-slate-300">
                    <span>{item.name}</span>
                    {item.price && <span className="text-xs text-amber-300/90 whitespace-nowrap">{item.price}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Actual Google Maps reviews */}
          {googleReviews.length > 0 && (
            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">Recent reviews · Google Maps</p>
              <div className="space-y-3">
                {googleReviews.slice(0, 3).map((review, ri) => (
                  <div key={ri}>
                    <div className="flex items-center gap-1.5">
                      <div className="flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, si) => (
                          <Star key={si} size={11} className={si < Math.round(review.rating || 0) ? 'text-amber-400 fill-amber-400' : 'text-slate-600'} />
                        ))}
                      </div>
                      <span className="text-xs text-slate-500">
                        {review.author}{review.relativeTime ? ` · ${review.relativeTime}` : ''}
                      </span>
                    </div>
                    <p className="text-sm text-slate-300 mt-1 leading-relaxed line-clamp-4">{review.text}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review highlights */}
          {reviewHighlights.length > 0 && (
            <div className="bg-teal-900/20 border border-teal-700/30 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb size={13} className="text-teal-400" />
                <p className="text-xs font-semibold text-teal-400 uppercase tracking-wide">{isMeal ? 'Highlights & Must-Try' : 'Highlights from Reviews'}</p>
              </div>
              <ul className="space-y-1">
                {reviewHighlights.slice(0, 4).map((tip, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-teal-500 mt-1 flex-shrink-0">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Tips / Watch out for */}
          {tips.length > 0 && (
            <div className="bg-red-900/15 border border-red-700/30 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ThumbsDown size={13} className="text-red-400" />
                <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">Watch Out For</p>
              </div>
              <ul className="space-y-1">
                {tips.slice(0, 3).map((reason, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-slate-400">
                    <span className="text-red-500 mt-1 flex-shrink-0">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Time */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <label className="label flex items-center gap-1.5 mb-2">
              <Clock size={13} className="text-slate-400" />
              Time
            </label>
            <TimePicker value={time} onChange={handleTimeChange} />
            {!time && (
              <p className="text-xs text-slate-500 mt-1.5">Set a time to show it on this card and in your day plan.</p>
            )}
          </div>

          {/* Booking */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4 space-y-3">
            <BookingStatusField value={bookingStatus} onChange={handleBookingStatusChange} />
            {bookingStatus === 'booked' && (
              <div>
                <label className="label flex items-center gap-1.5">
                  <Hash size={13} className="text-slate-400" />
                  Confirmation #
                </label>
                <input
                  type="text"
                  className="input"
                  value={confirmationNumber}
                  onChange={e => handleConfirmationChange(e.target.value)}
                  placeholder="e.g. RES-48213"
                />
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="bg-slate-800 rounded-xl border border-slate-700 p-4">
            <label className="label flex items-center gap-1.5 mb-2">
              <FileText size={13} className="text-slate-400" />
              Notes
            </label>
            <textarea
              className="input resize-none"
              rows={3}
              placeholder="Reservation details, special requests, things to remember..."
              value={notes}
              onChange={e => handleNotesChange(e.target.value)}
            />
          </div>
        </div>
      )}
    </div>
  );
}

const BOOKING_OPTIONS = [
  { value: 'none', label: 'No booking', activeClass: 'bg-slate-600 text-slate-200' },
  { value: 'needs-booking', label: 'To book', activeClass: 'bg-amber-500/90 text-slate-900' },
  { value: 'booked', label: 'Booked', activeClass: 'bg-emerald-500/90 text-slate-900' },
];

function BookingStatusField({ value, onChange }) {
  const current = value || 'none';
  return (
    <div>
      <label className="label flex items-center gap-1.5 mb-2">
        <BookmarkCheck size={13} className="text-slate-400" />
        Booking
      </label>
      <div className="flex rounded-lg bg-slate-900 border border-slate-700 p-0.5">
        {BOOKING_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`flex-1 px-2 py-1.5 rounded-md text-xs font-medium transition-colors ${
              current === opt.value ? opt.activeClass : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
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
        <div>
          <label className="label flex items-center gap-1.5">
            <Clock size={13} className="text-slate-400" />
            Check-in Time
          </label>
          <TimePicker value={data.time} onChange={v => onChange({ ...data, time: v })} />
        </div>
        <div>
          <label className="label flex items-center gap-1.5">
            <Clock size={13} className="text-slate-400" />
            Check-out Time
          </label>
          <TimePicker value={data.checkOutTime} onChange={v => onChange({ ...data, checkOutTime: v })} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <InputField label="Confirmation #" icon={Hash} value={data.confirmationNumber} onChange={v => onChange({ ...data, confirmationNumber: v })} placeholder="e.g. HTLBK12345" />
        <InputField label="Room Type" value={data.roomType} onChange={v => onChange({ ...data, roomType: v })} placeholder="e.g. Deluxe King" />
      </div>
      <BookingStatusField value={data.bookingStatus} onChange={v => onChange({ ...data, bookingStatus: v })} />
      <InputField label="Phone Number" icon={Phone} type="tel" value={data.phoneNumber} onChange={v => onChange({ ...data, phoneNumber: v })} placeholder="Hotel contact number" />
      <TextAreaField label="Notes" icon={FileText} value={data.notes} onChange={v => onChange({ ...data, notes: v })} placeholder="Special requests, amenities, nearby attractions..." />
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
  const [copyingHotel, setCopyingHotel] = useState(false);
  const [copiedHotel, setCopiedHotel] = useState(false);
  const [copiedHotelCount, setCopiedHotelCount] = useState(0);
  const [clearedHotelCount, setClearedHotelCount] = useState(0);

  const slotType = slot?.type;
  const isHotel = slotType === 'HOTEL';
  const isMealOrActivity = ['BREAKFAST', 'LUNCH', 'DINNER', 'ACTIVITY'].includes(slotType);

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

  // Sync this hotel onto the days of the stay: check-in (inclusive) up to
  // check-out (exclusive) — no hotel night on the check-out day itself. Days
  // outside that range holding a copy of this same stay (same hotel + same
  // dates, e.g. left over from an earlier copy or changed dates) are cleared,
  // so re-running the sync always repairs the trip.
  const hotelCheckIn = (formData.checkIn || '').slice(0, 10);
  const hotelCheckOut = (formData.checkOut || '').slice(0, 10);
  const hasStayDates = Boolean(hotelCheckIn && hotelCheckOut);

  const handleSyncHotelToStayDates = async () => {
    if (!trip?.days || !hasStayDates) return;

    const isSameStay = (data) =>
      data?.hotelName === formData.hotelName &&
      (data?.checkIn || '').slice(0, 10) === hotelCheckIn &&
      (data?.checkOut || '').slice(0, 10) === hotelCheckOut;

    const copyTargets = [];
    const clearTargets = [];
    let sourceOutOfStay = false;
    for (const d of trip.days) {
      const date = (d.date || '').slice(0, 10);
      const withinStay = date >= hotelCheckIn && date < hotelCheckOut;
      for (const s of (d.slots || [])) {
        if (s.type !== 'HOTEL') continue;
        if (s.id === slotId) {
          // The slot being edited moves off this day when the day isn't part
          // of the stay (its data lives on the stay days after the sync).
          if (!withinStay) sourceOutOfStay = true;
          continue;
        }
        if (withinStay) copyTargets.push(s);
        else if (isSameStay(s.data)) clearTargets.push(s);
      }
    }

    if (copyTargets.length === 0 && clearTargets.length === 0 && !sourceOutOfStay) return;

    setCopyingHotel(true);
    try {
      await Promise.all([
        ...copyTargets.map(s => slotsApi.update(s.id, { data: formData })),
        ...clearTargets.map(s => slotsApi.update(s.id, { data: {} })),
        ...(sourceOutOfStay ? [slotsApi.update(slotId, { data: {} })] : []),
      ]);
      // The edited slot's own day counts as a stay day when it's in range.
      setCopiedHotelCount(copyTargets.length + (sourceOutOfStay ? 0 : 1));
      setClearedHotelCount(clearTargets.length + (sourceOutOfStay ? 1 : 0));
      setCopiedHotel(true);
      setTimeout(() => setCopiedHotel(false), 5000);
      if (sourceOutOfStay) setFormData({});
    } catch (err) {
      console.error('Failed to sync hotel to stay dates:', err);
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
    navigate(`/trips/${tripId}/days/${dayId}/slots/${targetSlotId}`);
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
              {isHotel && (
                <div className="flex items-center gap-2 text-sm text-slate-400">
                  {saving && <><Loader2 size={14} className="animate-spin" /><span>Saving...</span></>}
                  {saved && !saving && <><Check size={14} className="text-green-400" /><span className="text-green-400">Saved</span></>}
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

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
                  const sName = s.data?.enrichment?.name || s.data?.[sc.previewField] || '';
                  // Reflect the active slot's unsaved time edit immediately.
                  const sTime = (s.id === slotId ? (formData.time ?? s.data?.time) : s.data?.time) || '';
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
                          <span className="text-[10px] text-slate-500 ml-auto">{formatTime12(sTime)}</span>
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

        {/* Meal/Activity detail */}
        {isMealOrActivity && (
          <SlotDetailCard
            slotId={slotId}
            slotType={slotType}
            config={config}
            formData={formData}
            onFormDataChange={setFormData}
            destination={destination}
            tripId={tripId}
          />
        )}

        {/* Hotel form */}
        {isHotel && (
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
                <div>
                  <button
                    onClick={handleSyncHotelToStayDates}
                    disabled={copyingHotel || (!copiedHotel && (!formData.hotelName || !hasStayDates))}
                    className={`w-full border-2 rounded-xl py-3 px-4 font-semibold transition-all duration-200 flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
                      copiedHotel
                        ? 'border-emerald-500/50 bg-emerald-900/20 text-emerald-400'
                        : 'border-purple-700/50 hover:border-purple-500 bg-purple-900/20 hover:bg-purple-900/40 text-purple-300'
                    }`}
                  >
                    {copyingHotel ? (
                      <><Loader2 size={16} className="animate-spin" />Syncing to stay dates...</>
                    ) : copiedHotel ? (
                      <><Check size={16} />
                        Set on {copiedHotelCount} stay day{copiedHotelCount !== 1 ? 's' : ''}
                        {clearedHotelCount > 0 ? ` · cleared ${clearedHotelCount} day${clearedHotelCount !== 1 ? 's' : ''} outside the stay` : ''}
                      </>
                    ) : (
                      <><Copy size={16} />Sync hotel to stay dates</>
                    )}
                  </button>
                  {formData.hotelName && !hasStayDates && (
                    <p className="text-xs text-slate-500 mt-1.5 text-center">
                      Set check-in and check-out dates to sync this hotel onto the nights of the stay.
                    </p>
                  )}
                </div>
              )}

              <div className="pb-8" />
            </>
        )}
      </main>
      </div>
    </div>
  );
}
