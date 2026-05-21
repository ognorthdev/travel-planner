import React, { useState, useEffect } from 'react';
import { Heart, Coffee, Utensils, Moon, Sun, MapPin, Star, Footprints, Bus, Car, UtensilsCrossed, Lightbulb, ThumbsDown, Clock, ExternalLink } from 'lucide-react';
import { placesApi } from '../../api/index.js';

const TYPE_CONFIG = {
  BREAKFAST: { label: 'Breakfast', icon: Coffee, color: 'text-amber-400', bg: 'bg-amber-900/30', border: 'border-amber-700/50' },
  LUNCH: { label: 'Lunch', icon: Utensils, color: 'text-green-400', bg: 'bg-green-900/30', border: 'border-green-700/50' },
  DINNER: { label: 'Dinner', icon: Moon, color: 'text-indigo-400', bg: 'bg-indigo-900/30', border: 'border-indigo-700/50' },
  ACTIVITY: { label: 'Activity', icon: Sun, color: 'text-teal-400', bg: 'bg-teal-900/30', border: 'border-teal-700/50' },
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
            size={11}
            className={i < full ? 'text-amber-400 fill-amber-400' : (i === full && half ? 'text-amber-400 fill-amber-400/50' : 'text-slate-600')}
          />
        ))}
      </div>
      <span className="text-xs font-semibold text-amber-400">{rating.toFixed(1)}</span>
      {reviewCount && (
        <span className="text-[10px] text-slate-500">({reviewCount.toLocaleString()})</span>
      )}
    </div>
  );
}

function buildGoogleMapsUrl(name, address) {
  const query = `${name} ${address || ''}`.trim();
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

export default function SuggestionBubble({ suggestion, isSaved, onToggleSave, onClick, style }) {
  const config = TYPE_CONFIG[suggestion.type] || TYPE_CONFIG.ACTIVITY;
  const Icon = config.icon;
  const data = suggestion.data || {};
  const address = data.address || '';

  const [enriched, setEnriched] = useState(null);
  const [enriching, setEnriching] = useState(false);

  useEffect(() => {
    if (enriching || enriched) return;
    setEnriching(true);
    placesApi.enrich(suggestion.name, address)
      .then(result => setEnriched(result))
      .catch(() => setEnriched(null))
      .finally(() => setEnriching(false));
  }, [suggestion.name, address]);

  const photos = enriched?.photos || [];
  const rating = enriched?.rating || data.rating;
  const reviewCount = enriched?.reviewCount || data.reviewCount;
  const googleMapsUrl = enriched?.googleMapsUrl;
  const enrichedAddress = enriched?.address || address;

  const mustTryDishes = data.mustTryDishes || [];
  const reviewSummary = data.reviewSummary || [];
  const watchOutFor = data.watchOutFor || [];
  const isMeal = ['BREAKFAST', 'LUNCH', 'DINNER'].includes(suggestion.type);

  return (
    <div
      className="bg-slate-800 border border-slate-700 rounded-2xl p-4 cursor-pointer hover:border-slate-600 transition-all animate-slide-up"
      style={style}
      onClick={() => onClick?.(suggestion)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Header: type badge, name, cuisine/category, price */}
          <div className="flex items-center gap-2 flex-wrap mb-1.5">
            <div className={`w-6 h-6 rounded-lg ${config.bg} flex items-center justify-center flex-shrink-0`}>
              <Icon size={13} className={config.color} />
            </div>
            <h4 className="font-bold text-slate-100 text-sm">{suggestion.name}</h4>
            {(data.cuisine || data.category) && (
              <span className="text-[10px] bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-full border border-slate-600">
                {data.cuisine || data.category}
              </span>
            )}
            {data.priceRange && (
              <span className="text-[10px] text-emerald-400 font-semibold">{data.priceRange}</span>
            )}
          </div>

          {/* Star rating */}
          <StarRating rating={rating} reviewCount={reviewCount} />

          {/* Address */}
          {enrichedAddress && (
            <div className="flex items-center gap-1 mt-1.5 text-slate-400">
              <MapPin size={11} className="flex-shrink-0" />
              <span className="text-[11px] truncate">{enrichedAddress}</span>
            </div>
          )}

          {/* Operating hours */}
          {data.operatingHours && (
            <div className="flex items-center gap-1 mt-1 text-slate-400">
              <Clock size={11} className="flex-shrink-0" />
              <span className="text-[11px]">{data.operatingHours}</span>
            </div>
          )}

          {/* Google Maps link */}
          {enrichedAddress && (
            <a
              href={googleMapsUrl || buildGoogleMapsUrl(suggestion.name, enrichedAddress)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="inline-flex items-center gap-1 mt-1.5 px-2 py-1 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-[10px] font-medium text-ocean-400 hover:text-ocean-300 transition-colors"
            >
              <ExternalLink size={10} />
              Google Maps
            </a>
          )}

          {/* Photos */}
          {photos.length > 0 && (
            <div className={`grid gap-1.5 mt-2.5 ${photos.length >= 4 ? 'grid-cols-2' : photos.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
              {photos.slice(0, 4).map((photo, pi) => {
                const labels = ['Exterior', 'Interior', 'Food', 'Food'];
                return (
                  <div key={pi} className="relative h-20 rounded-lg overflow-hidden bg-slate-700/50">
                    <img
                      src={photo.url}
                      alt={`${suggestion.name} - ${labels[pi] || 'Photo'}`}
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <span className="absolute bottom-0.5 left-0.5 text-[8px] font-medium bg-black/60 text-white px-1 py-0.5 rounded">
                      {labels[pi]}
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {/* Travel times */}
          {(data.walkMinutes || data.transitMinutes || data.driveMinutes) && (
            <div className="flex items-center gap-2.5 mt-2 flex-wrap">
              {data.walkMinutes && (
                <div className="flex items-center gap-1 text-ocean-400">
                  <Footprints size={11} />
                  <span className="text-[10px] font-medium">{data.walkMinutes} min</span>
                </div>
              )}
              {data.transitMinutes && (
                <div className="flex items-center gap-1 text-teal-400">
                  <Bus size={11} />
                  <span className="text-[10px] font-medium">{data.transitMinutes} min</span>
                </div>
              )}
              {data.driveMinutes && (
                <div className="flex items-center gap-1 text-violet-400">
                  <Car size={11} />
                  <span className="text-[10px] font-medium">{data.driveMinutes} min</span>
                </div>
              )}
            </div>
          )}

          {/* Description */}
          {suggestion.description && (
            <p className="text-xs text-slate-300 mt-2 leading-relaxed line-clamp-3">{suggestion.description}</p>
          )}

          {/* Must-try dishes (meals only) */}
          {isMeal && mustTryDishes.length > 0 && (
            <div className="mt-2 bg-amber-900/20 border border-amber-700/30 rounded-xl p-2.5">
              <div className="flex items-center gap-1 mb-1.5">
                <UtensilsCrossed size={11} className="text-amber-400" />
                <span className="text-[10px] font-semibold text-amber-400 uppercase tracking-wide">Must-try dishes</span>
              </div>
              <div className="space-y-1">
                {mustTryDishes.slice(0, 3).map((dish, j) => (
                  <div key={j} className="flex items-start gap-1.5">
                    <span className="text-xs mt-0.5">🍽️</span>
                    <span className="text-xs text-slate-200">{typeof dish === 'string' ? dish : dish.name}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Review tips */}
          {reviewSummary.length > 0 && (
            <div className="mt-1.5 bg-teal-900/20 border border-teal-700/30 rounded-xl p-2.5">
              <div className="flex items-center gap-1 mb-1.5">
                <Lightbulb size={11} className="text-teal-400" />
                <span className="text-[10px] font-semibold text-teal-400 uppercase tracking-wide">Tips from reviews</span>
              </div>
              <ul className="space-y-0.5">
                {reviewSummary.slice(0, 3).map((tip, j) => (
                  <li key={j} className="flex items-start gap-1.5 text-xs text-slate-300">
                    <span className="text-teal-500 mt-0.5 flex-shrink-0">•</span>
                    <span>{tip}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Watch out for */}
          {watchOutFor.length > 0 && (
            <div className="mt-1.5 bg-red-900/15 border border-red-700/30 rounded-xl p-2.5">
              <div className="flex items-center gap-1 mb-1.5">
                <ThumbsDown size={11} className="text-red-400" />
                <span className="text-[10px] font-semibold text-red-400 uppercase tracking-wide">Watch out for</span>
              </div>
              <ul className="space-y-0.5">
                {watchOutFor.slice(0, 2).map((reason, j) => (
                  <li key={j} className="flex items-start gap-1.5 text-xs text-slate-400">
                    <span className="text-red-500 mt-0.5 flex-shrink-0">•</span>
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        {/* Heart button */}
        <button
          onClick={(e) => { e.stopPropagation(); onToggleSave?.(suggestion); }}
          className={`flex-shrink-0 w-9 h-9 rounded-xl flex items-center justify-center transition-all duration-200 ${
            isSaved
              ? 'bg-rose-500/20 border border-rose-500/50 text-rose-400'
              : 'bg-slate-700 border border-slate-600 text-slate-400 hover:text-rose-400 hover:border-rose-500/50'
          }`}
        >
          <Heart size={16} className={isSaved ? 'fill-rose-400' : ''} />
        </button>
      </div>
    </div>
  );
}
