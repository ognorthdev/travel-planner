import React from 'react';
import { ArrowLeft, MapPin, Calendar, Plus, Settings, Loader2 } from 'lucide-react';
import CostBadge from './CostBadge';

function parseLocalDate(dateStr) {
  // Append time to force local timezone parsing instead of UTC.
  return new Date(dateStr.slice(0, 10) + 'T00:00:00');
}

// Shared trip header used by both the date view and the research view, so they stay
// identical. `onBack` returns to the previous view (home from the date view; the date
// view from research). The action buttons are optional.
export default function TripHeader({ trip, tripId, onBack, onAddDay, addingDay, onOpenSettings }) {
  return (
    <header className="bg-slate-800 border-b border-slate-700 shadow-sm flex-shrink-0 z-10">
      <div className="max-w-full px-4 sm:px-6">
        <div className="flex items-center gap-4 h-16">
          <button
            onClick={onBack}
            className="p-2 rounded-full hover:bg-slate-700 transition-colors text-slate-400"
          >
            <ArrowLeft size={20} />
          </button>

          <div className="flex-1 min-w-0">
            <h1 className="font-bold text-lg text-slate-100 truncate">{trip?.name}</h1>
            <div className="flex items-center gap-3 text-sm text-slate-400">
              <span className="flex items-center gap-1">
                <MapPin size={12} className="text-teal-500" />
                {trip?.destination}
              </span>
              {trip && (
                <span className="flex items-center gap-1">
                  <Calendar size={12} className="text-ocean-400" />
                  {parseLocalDate(trip.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' – '}
                  {parseLocalDate(trip.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <CostBadge tripId={tripId} />
            {onAddDay && (
              <button onClick={onAddDay} disabled={addingDay} className="btn-primary">
                {addingDay ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Add Day
              </button>
            )}
            {onOpenSettings && (
              <button
                onClick={onOpenSettings}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 hover:text-slate-100 transition-colors text-sm font-medium"
              >
                <Settings size={14} />
                Settings
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
