import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { tripsApi } from '../api/index.js';

function useAutosave(tripId, field, value, onSaved) {
  const timerRef = useRef(null);
  const lastSavedRef = useRef(value);

  useEffect(() => {
    if (value === lastSavedRef.current) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(async () => {
      try {
        await tripsApi.update(tripId, { [field]: value });
        lastSavedRef.current = value;
        onSaved?.();
      } catch (e) {
        console.error(`Failed to save ${field}:`, e);
      }
    }, 2000);
    return () => clearTimeout(timerRef.current);
  }, [value, tripId, field, onSaved]);
}

export default function TripSettings({ trip, onClose, onTripUpdated }) {
  const [name, setName] = useState(trip.name);
  const [destination, setDestination] = useState(trip.destination);
  const [startDate, setStartDate] = useState(trip.startDate.slice(0, 10));
  const [endDate, setEndDate] = useState(trip.endDate.slice(0, 10));
  const [mealPreferences, setMealPreferences] = useState(trip.mealPreferences || '');
  const [activityPreferences, setActivityPreferences] = useState(trip.activityPreferences || '');
  const [savedField, setSavedField] = useState(null);

  const showSaved = useCallback((field) => {
    setSavedField(field);
    setTimeout(() => setSavedField(prev => prev === field ? null : prev), 2000);
  }, []);

  useAutosave(trip.id, 'name', name, () => {
    onTripUpdated({ ...trip, name });
    showSaved('name');
  });
  useAutosave(trip.id, 'destination', destination, () => {
    onTripUpdated({ ...trip, destination });
    showSaved('destination');
  });
  useAutosave(trip.id, 'mealPreferences', mealPreferences, () => {
    onTripUpdated({ ...trip, mealPreferences });
    showSaved('meal');
  });
  useAutosave(trip.id, 'activityPreferences', activityPreferences, () => {
    onTripUpdated({ ...trip, activityPreferences });
    showSaved('activity');
  });

  const handleDateChange = async (field, value) => {
    if (field === 'startDate') setStartDate(value);
    else setEndDate(value);
    try {
      const update = { [field]: new Date(value + 'T00:00:00').toISOString() };
      await tripsApi.update(trip.id, update);
      onTripUpdated({ ...trip, [field]: update[field] });
      showSaved('dates');
    } catch (e) {
      console.error('Failed to save date:', e);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
      <div className="flex items-center gap-4 px-6 py-4 border-b border-slate-700 bg-slate-800">
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <h2 className="text-lg font-semibold text-slate-100">Trip Settings</h2>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-xl mx-auto p-6 space-y-8">

          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm font-medium text-slate-300">Trip Name</label>
              <SavedIndicator visible={savedField === 'name'} />
            </div>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500/30"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm font-medium text-slate-300">Destination</label>
              <SavedIndicator visible={savedField === 'destination'} />
            </div>
            <input
              type="text"
              value={destination}
              onChange={(e) => setDestination(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500/30"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm font-medium text-slate-300">Dates</label>
              <SavedIndicator visible={savedField === 'dates'} />
            </div>
            <div className="flex items-center gap-3">
              <input
                type="date"
                value={startDate}
                onChange={(e) => handleDateChange('startDate', e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500/30 [color-scheme:dark]"
              />
              <span className="text-slate-500">to</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => handleDateChange('endDate', e.target.value)}
                className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 focus:outline-none focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500/30 [color-scheme:dark]"
              />
            </div>
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm font-medium text-slate-300">Meal Preferences</label>
              <SavedIndicator visible={savedField === 'meal'} />
            </div>
            <p className="text-xs text-slate-500 mb-2">
              Add any dietary requirements, cuisine preferences, or budget constraints to consider when researching meals.
            </p>
            <textarea
              value={mealPreferences}
              onChange={(e) => setMealPreferences(e.target.value)}
              placeholder="e.g. Vegetarian, no shellfish, prefer local cuisine, budget under $30/person..."
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500/30"
            />
          </div>

          <div>
            <div className="flex items-center gap-2 mb-2">
              <label className="text-sm font-medium text-slate-300">Activity Preferences</label>
              <SavedIndicator visible={savedField === 'activity'} />
            </div>
            <p className="text-xs text-slate-500 mb-2">
              Add any preferences or requirements to consider when researching activities.
            </p>
            <textarea
              value={activityPreferences}
              onChange={(e) => setActivityPreferences(e.target.value)}
              placeholder="e.g. Traveling with kids, wheelchair accessible, prefer outdoor activities, interested in history..."
              rows={3}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-slate-200 placeholder-slate-600 resize-none focus:outline-none focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500/30"
            />
          </div>

        </div>
      </div>
    </div>
  );
}

function SavedIndicator({ visible }) {
  if (!visible) return null;
  return (
    <span className="flex items-center gap-1 text-xs text-emerald-400 animate-fade-in">
      <Check size={12} />
      Saved
    </span>
  );
}
