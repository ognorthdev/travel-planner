import React from 'react';
import { ArrowLeft, MapPin, Calendar, Plus, Settings, Loader2, Users, Printer, Trash2 } from 'lucide-react';
import CostBadge from './CostBadge';
import { paletteFor } from '../lib/tripTheme.js';

function parseLocalDate(dateStr) {
  return new Date(dateStr.slice(0, 10) + 'T00:00:00');
}

// Immersive trip-page header: the cover photo bleeds behind editorial serif
// type and melts into the page background. Falls back to the trip-palette
// gradient when there's no cover image yet.
export default function TripHero({ trip, tripId, onBack, onAddDay, addingDay, onOpenSettings, onShare, onPrint, onDeleteTrip }) {
  const palette = paletteFor(trip?.destination);

  return (
    <header className="relative flex-shrink-0 overflow-hidden">
      {/* Backdrop */}
      <div className="absolute inset-0">
        {trip?.coverImageUrl ? (
          <img
            src={trip.coverImageUrl}
            alt=""
            referrerPolicy="no-referrer"
            className="w-full h-full object-cover animate-ken-burns"
          />
        ) : (
          <div className="w-full h-full trip-grad opacity-60" />
        )}
        <div className="absolute inset-0 bg-gradient-to-b from-slate-950/30 via-slate-900/55 to-slate-900" />
      </div>

      <div className="relative px-4 sm:px-6 pt-3 pb-4">
        {/* Top row: back + actions */}
        <div className="flex items-center justify-between">
          <button
            onClick={onBack}
            className="p-2 rounded-full glass text-slate-200 hover:bg-slate-950/60 transition-colors"
          >
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <CostBadge tripId={tripId} />
            {onPrint && (
              <button onClick={onPrint} className="p-2 rounded-lg glass text-slate-200 hover:bg-slate-950/60 transition-colors" title="Printable day sheets">
                <Printer size={14} />
              </button>
            )}
            {onShare && (
              <button onClick={onShare} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass text-slate-200 hover:bg-slate-950/60 transition-colors text-sm font-medium">
                <Users size={14} />
                Share
              </button>
            )}
            {onOpenSettings && (
              <button onClick={onOpenSettings} className="p-2 rounded-lg glass text-slate-200 hover:bg-slate-950/60 transition-colors" title="Trip settings">
                <Settings size={14} />
              </button>
            )}
            {onDeleteTrip && (
              <button onClick={onDeleteTrip} className="p-2 rounded-lg glass text-slate-200 hover:text-red-400 hover:bg-slate-950/60 transition-colors" title="Delete trip">
                <Trash2 size={14} />
              </button>
            )}
            {onAddDay && (
              <button onClick={onAddDay} disabled={addingDay} className="btn-primary shadow-lg shadow-black/30">
                {addingDay ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Add Day
              </button>
            )}
          </div>
        </div>

        {/* Editorial title */}
        <div className="mt-5 sm:mt-7">
          <p className="text-[11px] font-bold uppercase tracking-[0.35em] text-glow/90 text-shadow-hero">
            {palette.motif} {trip?.destination}
          </p>
          <h1 className="font-display font-semibold text-3xl sm:text-5xl text-white text-shadow-hero leading-tight mt-0.5 truncate">
            {trip?.name}
          </h1>
          {trip && (
            <p className="flex items-center gap-4 text-sm text-slate-200/90 mt-2 text-shadow-hero">
              <span className="flex items-center gap-1.5">
                <Calendar size={13} className="text-glow" />
                {parseLocalDate(trip.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                {' – '}
                {parseLocalDate(trip.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
              </span>
              <span className="flex items-center gap-1.5">
                <MapPin size={13} className="text-glow" />
                {trip.days?.length ?? ''} {trip.days?.length === 1 ? 'day' : 'days'}
              </span>
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
