import React, { useState, useEffect } from 'react';
import { X, MapPin, Clock, Coffee, Utensils, Moon, Sun, Star, UtensilsCrossed, Lightbulb, ThumbsDown, Footprints, Bus, Car, ExternalLink, ChevronLeft, ChevronRight } from 'lucide-react';
import { placesApi } from '../../api/index.js';

const TYPE_CONFIG = {
  BREAKFAST: { label: 'Breakfast', icon: Coffee, color: 'text-amber-400', bg: 'bg-amber-900/30' },
  LUNCH: { label: 'Lunch', icon: Utensils, color: 'text-green-400', bg: 'bg-green-900/30' },
  DINNER: { label: 'Dinner', icon: Moon, color: 'text-indigo-400', bg: 'bg-indigo-900/30' },
  ACTIVITY: { label: 'Activity', icon: Sun, color: 'text-teal-400', bg: 'bg-teal-900/30' },
};

function StarRating({ rating: rawRating, reviewCount }) {
  const rating = parseFloat(rawRating) || 0;
  if (!rating) return null;
  const full = Math.floor(rating);
  const half = rating % 1 >= 0.5;
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-0.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Star
            key={i}
            size={14}
            className={i < full ? 'text-amber-400 fill-amber-400' : (i === full && half ? 'text-amber-400 fill-amber-400/50' : 'text-slate-600')}
          />
        ))}
      </div>
      <span className="text-sm font-semibold text-amber-400">{rating.toFixed(1)}</span>
      {reviewCount && (
        <span className="text-xs text-slate-500">({reviewCount.toLocaleString()} reviews)</span>
      )}
    </div>
  );
}

function buildGoogleMapsUrl(name, address) {
  const query = `${name} ${address || ''}`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function buildTikTokSearchUrl(name, destination) {
  const query = `${destination} ${name}`.trim();
  return `https://www.tiktok.com/search?q=${encodeURIComponent(query)}`;
}

export default function SuggestionDetailModal({ suggestion, onClose, tripId, destination, onPrev, onNext, hasPrev, hasNext, currentIndex, total }) {
  const config = TYPE_CONFIG[suggestion.type] || TYPE_CONFIG.ACTIVITY;
  const Icon = config.icon;
  const data = suggestion.data || {};

  const [enriched, setEnriched] = useState(null);

  useEffect(() => {
    setEnriched(null);
    placesApi.enrich(suggestion.name, data.address || '', tripId)
      .then(result => setEnriched(result))
      .catch(() => {});
  }, [suggestion.name, data.address]);

  useEffect(() => {
    const handleKey = (e) => {
      if (e.key === 'ArrowRight' && hasNext && onNext) { e.preventDefault(); onNext(); }
      else if (e.key === 'ArrowLeft' && hasPrev && onPrev) { e.preventDefault(); onPrev(); }
      else if (e.key === 'Escape') { onClose(); }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [hasNext, hasPrev, onNext, onPrev, onClose]);

  const photos = enriched?.photos || [];
  const rating = enriched?.rating || data.rating;
  const reviewCount = enriched?.reviewCount || data.reviewCount;
  const googleMapsUrl = enriched?.googleMapsUrl;
  const address = enriched?.address || data.address || '';

  const mustTryDishes = data.mustTryDishes || [];
  const reviewSummary = data.reviewSummary || [];
  const watchOutFor = data.watchOutFor || [];
  const isMeal = ['BREAKFAST', 'LUNCH', 'DINNER'].includes(suggestion.type);

  const showNav = !!(onPrev || onNext);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60" onClick={onClose}>
      {showNav && (
        <button
          onClick={(e) => { e.stopPropagation(); onPrev?.(); }}
          disabled={!hasPrev}
          title="Previous idea (←)"
          className="absolute left-2 sm:left-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-800/90 border border-slate-600 text-slate-300 flex items-center justify-center shadow-xl transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronLeft size={20} />
        </button>
      )}
      <div
        className="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto mx-4 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-slate-700">
          <div className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-lg ${config.bg} flex items-center justify-center`}>
              <Icon size={16} className={config.color} />
            </div>
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${config.bg} ${config.color}`}>
              {config.label}
            </span>
            {(data.cuisine || data.category) && (
              <span className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full border border-slate-600">
                {data.cuisine || data.category}
              </span>
            )}
            {data.priceRange && (
              <span className="text-xs text-emerald-400 font-semibold">{data.priceRange}</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {showNav && total > 0 && (
              <span className="text-xs text-slate-500 tabular-nums">{currentIndex + 1} / {total}</span>
            )}
            <button
              onClick={onClose}
              className="p-1.5 rounded-full hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <h2 className="text-xl font-bold text-slate-100">{suggestion.name}</h2>

          <StarRating rating={rating} reviewCount={reviewCount} />

          {address && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <MapPin size={14} className="text-slate-500 flex-shrink-0" />
              <span>{address}</span>
            </div>
          )}

          {data.operatingHours && (
            <div className="flex items-center gap-2 text-sm text-slate-400">
              <Clock size={14} className="text-slate-500 flex-shrink-0" />
              <span>{data.operatingHours}</span>
            </div>
          )}

          <div className="flex items-center gap-2 flex-wrap">
            {address && (
              <a
                href={googleMapsUrl || buildGoogleMapsUrl(suggestion.name, address)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-xs font-medium text-ocean-400 hover:text-ocean-300 transition-colors"
              >
                <ExternalLink size={12} />
                View on Google Maps
              </a>
            )}
            {destination && (
              <a
                href={buildTikTokSearchUrl(suggestion.name, destination)}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-xs font-medium text-pink-400 hover:text-pink-300 transition-colors"
              >
                <ExternalLink size={12} />
                Search on TikTok
              </a>
            )}
          </div>

          {/* Photos */}
          {photos.length > 0 && (
            <div className="grid grid-cols-2 gap-2">
              {photos.slice(0, 4).map((photo, pi) => {
                const labels = ['Exterior', 'Interior', 'Food', 'Food'];
                return (
                  <div key={pi} className="relative h-28 rounded-lg overflow-hidden bg-slate-700/50">
                    <img
                      src={photo.url}
                      alt={`${suggestion.name} - ${labels[pi] || 'Photo'}`}
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

          {/* Travel times */}
          {(data.walkMinutes || data.transitMinutes || data.driveMinutes) && (
            <div className="flex items-center gap-3 flex-wrap">
              {data.walkMinutes && (
                <div className="flex items-center gap-1 text-ocean-400">
                  <Footprints size={12} />
                  <span className="text-xs font-medium">{data.walkMinutes} min walk</span>
                </div>
              )}
              {data.transitMinutes && (
                <div className="flex items-center gap-1 text-teal-400">
                  <Bus size={12} />
                  <span className="text-xs font-medium">{data.transitMinutes} min transit</span>
                </div>
              )}
              {data.driveMinutes && (
                <div className="flex items-center gap-1 text-violet-400">
                  <Car size={12} />
                  <span className="text-xs font-medium">{data.driveMinutes} min drive</span>
                </div>
              )}
            </div>
          )}

          {suggestion.description && (
            <p className="text-sm text-slate-300 leading-relaxed">{suggestion.description}</p>
          )}

          {data.description && data.description !== suggestion.description && (
            <p className="text-sm text-slate-300 leading-relaxed">{data.description}</p>
          )}

          {/* Must-try dishes */}
          {isMeal && mustTryDishes.length > 0 && (
            <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <UtensilsCrossed size={13} className="text-amber-400" />
                <p className="text-xs font-semibold text-amber-400 uppercase tracking-wide">Must-try dishes</p>
              </div>
              <div className="space-y-1.5">
                {mustTryDishes.slice(0, 3).map((dish, j) => (
                  <div key={j} className="flex items-start gap-2">
                    <span className="text-sm mt-0.5">🍽️</span>
                    <span className="text-sm text-slate-200">{typeof dish === 'string' ? dish : dish.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review tips */}
          {reviewSummary.length > 0 && (
            <div className="bg-teal-900/20 border border-teal-700/30 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb size={13} className="text-teal-400" />
                <p className="text-xs font-semibold text-teal-400 uppercase tracking-wide">Tips from reviews</p>
              </div>
              <ul className="space-y-1">
                {reviewSummary.slice(0, 3).map((tip, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-slate-300">
                    <span className="text-teal-500 mt-1 flex-shrink-0">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Watch out for */}
          {watchOutFor.length > 0 && (
            <div className="bg-red-900/15 border border-red-700/30 rounded-xl p-3">
              <div className="flex items-center gap-1.5 mb-2">
                <ThumbsDown size={13} className="text-red-400" />
                <p className="text-xs font-semibold text-red-400 uppercase tracking-wide">Watch out for</p>
              </div>
              <ul className="space-y-1">
                {watchOutFor.slice(0, 3).map((reason, j) => (
                  <li key={j} className="flex items-start gap-2 text-sm text-slate-400">
                    <span className="text-red-500 mt-1 flex-shrink-0">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </div>
      {showNav && (
        <button
          onClick={(e) => { e.stopPropagation(); onNext?.(); }}
          disabled={!hasNext}
          title="Next idea (→)"
          className="absolute right-2 sm:right-6 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-slate-800/90 border border-slate-600 text-slate-300 flex items-center justify-center shadow-xl transition-colors hover:bg-slate-700 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed"
        >
          <ChevronRight size={20} />
        </button>
      )}
    </div>
  );
}
