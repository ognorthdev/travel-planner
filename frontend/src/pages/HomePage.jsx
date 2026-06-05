import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, MapPin, Calendar, Plane, X, Loader2, Globe, LogOut, Shield } from 'lucide-react';
import { tripsApi } from '../api/index.js';
import { InlineCost } from '../components/CostBadge';
import { useAuth } from '../lib/auth.jsx';

const DESTINATION_EMOJIS = {
  paris: '🗼', france: '🗼',
  tokyo: '🗾', japan: '🗾',
  bali: '🏝️', indonesia: '🏝️',
  london: '🎡', uk: '🎡',
  new_york: '🗽', nyc: '🗽', 'new york': '🗽',
  rome: '🏛️', italy: '🏛️',
  barcelona: '💃', spain: '💃',
  sydney: '🦘', australia: '🦘',
  dubai: '🌆', uae: '🌆',
  amsterdam: '🌷', netherlands: '🌷',
  prague: '🏰', czech: '🏰',
  santorini: '🌅', greece: '🌅',
  bangkok: '🙏', thailand: '🙏',
  singapore: '🦁',
  lisbon: '🍊', portugal: '🍊',
  morocco: '🕌', marrakech: '🕌',
  iceland: '🌋',
  default: '✈️'
};

function getDestinationEmoji(destination) {
  if (!destination) return DESTINATION_EMOJIS.default;
  const lower = destination.toLowerCase();
  for (const [key, emoji] of Object.entries(DESTINATION_EMOJIS)) {
    if (lower.includes(key)) return emoji;
  }
  return DESTINATION_EMOJIS.default;
}

const CARD_GRADIENTS = [
  'from-ocean-400 to-teal-500',
  'from-teal-400 to-ocean-600',
  'from-sunset-400 to-red-500',
  'from-purple-400 to-indigo-500',
  'from-emerald-400 to-teal-600',
  'from-pink-400 to-rose-500',
  'from-amber-400 to-orange-500',
  'from-cyan-400 to-blue-500'
];

function parseLocalDate(dateStr) {
  return new Date(dateStr.slice(0, 10) + 'T00:00:00');
}

function formatDateRange(startDate, endDate) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const options = { month: 'short', day: 'numeric' };
  const startStr = start.toLocaleDateString('en-US', options);
  const endStr = end.toLocaleDateString('en-US', { ...options, year: 'numeric' });
  return `${startStr} – ${endStr}`;
}

function getDaysCount(startDate, endDate) {
  const start = parseLocalDate(startDate);
  const end = parseLocalDate(endDate);
  const diff = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  return diff;
}

function TripCard({ trip, index, onClick }) {
  const gradient = CARD_GRADIENTS[index % CARD_GRADIENTS.length];
  const emoji = getDestinationEmoji(trip.destination);
  const days = getDaysCount(trip.startDate, trip.endDate);

  return (
    <div
      onClick={onClick}
      className="card cursor-pointer group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 animate-fade-in"
    >
      <div className={`bg-gradient-to-br ${gradient} h-48 flex items-center justify-center relative overflow-hidden`}>
        <span className="text-7xl group-hover:scale-110 transition-transform duration-300 select-none">
          {emoji}
        </span>
        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/10 transition-colors duration-300" />
        <div className="absolute top-3 right-3 bg-black/30 backdrop-blur-sm rounded-full px-3 py-1 text-white text-xs font-semibold">
          {days} {days === 1 ? 'day' : 'days'}
        </div>
      </div>
      <div className="p-5">
        <h3 className="font-bold text-lg text-slate-100 mb-1 group-hover:text-ocean-400 transition-colors duration-200">
          {trip.name}
        </h3>
        <div className="flex items-center gap-1 text-slate-400 mb-3">
          <MapPin size={14} className="text-teal-400 flex-shrink-0" />
          <span className="text-sm">{trip.destination}</span>
        </div>
        <div className="flex items-center gap-1 text-slate-500">
          <Calendar size={14} className="text-ocean-400 flex-shrink-0" />
          <span className="text-xs">{formatDateRange(trip.startDate, trip.endDate)}</span>
        </div>
        <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-xs text-slate-500">
              {trip._count?.days || 0} {trip._count?.days === 1 ? 'day planned' : 'days planned'}
            </span>
            <InlineCost totalCostCents={trip.totalCostCents} costByService={trip.costByService} />
          </div>
          <span className="text-xs font-semibold text-ocean-400 group-hover:text-ocean-300">
            View trip →
          </span>
        </div>
      </div>
    </div>
  );
}

function NewTripModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    name: '',
    destination: '',
    startDate: '',
    endDate: ''
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.destination || !form.startDate || !form.endDate) {
      setError('All fields are required');
      return;
    }
    if (new Date(form.endDate) < new Date(form.startDate)) {
      setError('End date must be after start date');
      return;
    }

    setLoading(true);
    setError('');
    try {
      const trip = await tripsApi.create(form);
      onCreated(trip);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create trip');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md animate-slide-up border border-slate-700">
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-ocean-400 to-teal-500 flex items-center justify-center">
              <Plane size={18} className="text-white" />
            </div>
            <h2 className="text-xl font-bold text-slate-100">Plan a New Trip</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-full hover:bg-slate-700 transition-colors text-slate-400"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="bg-red-900/40 border border-red-700 rounded-lg px-4 py-3 text-red-300 text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="label">Trip Name</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Summer in Europe"
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
            />
          </div>

          <div>
            <label className="label">Destination</label>
            <div className="relative">
              <Globe size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                className="input pl-9"
                placeholder="e.g. Paris, France"
                value={form.destination}
                onChange={e => setForm({ ...form, destination: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Start Date</label>
              <input
                type="date"
                className="input"
                value={form.startDate}
                onChange={e => setForm({ ...form, startDate: e.target.value })}
              />
            </div>
            <div>
              <label className="label">End Date</label>
              <input
                type="date"
                className="input"
                value={form.endDate}
                onChange={e => setForm({ ...form, endDate: e.target.value })}
              />
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary flex-1 justify-center">
              Cancel
            </button>
            <button type="submit" disabled={loading} className="btn-primary flex-1 justify-center">
              {loading ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Creating...
                </>
              ) : (
                <>
                  <Plane size={16} />
                  Create Trip
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function HomePage() {
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const navigate = useNavigate();
  const { profile, signOut } = useAuth();

  useEffect(() => {
    loadTrips();
  }, []);

  const loadTrips = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await tripsApi.getAll();
      setTrips(data);
    } catch (err) {
      setError('Could not connect to the server. Make sure the backend is running on port 3001.');
    } finally {
      setLoading(false);
    }
  };

  const handleTripCreated = (trip) => {
    setTrips(prev => [trip, ...prev]);
    navigate(`/trips/${trip.id}`);
  };

  return (
    <div className="min-h-screen bg-slate-900">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 shadow-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-ocean-400 to-teal-500 flex items-center justify-center">
                <Plane size={18} className="text-white" />
              </div>
              <div>
                <h1 className="font-bold text-slate-100 text-lg leading-tight">Travel Planner</h1>
                <p className="text-xs text-slate-400 leading-tight">Plan your adventures</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {profile?.isAdmin && (
                <button
                  onClick={() => navigate('/admin')}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 hover:text-slate-100 transition-colors text-sm font-medium"
                >
                  <Shield size={14} />
                  Admin
                </button>
              )}
              <button
                onClick={() => signOut()}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 hover:text-slate-100 transition-colors text-sm font-medium"
                title="Sign out"
              >
                <LogOut size={14} />
                Sign out
              </button>
              <button
                onClick={() => setShowModal(true)}
                className="btn-primary"
              >
                <Plus size={18} />
                New Trip
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <div className="bg-gradient-to-r from-ocean-600 to-teal-600 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <div className="max-w-2xl">
            <h2 className="text-4xl font-extrabold mb-3 leading-tight">
              Your next adventure<br />starts here ✈️
            </h2>
            <p className="text-ocean-200 text-lg">
              Plan every detail of your trips — meals, activities, hotels, and more.
              All in one beautifully organized planner.
            </p>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {loading && (
          <div className="flex items-center justify-center py-24">
            <div className="flex flex-col items-center gap-4">
              <Loader2 size={40} className="animate-spin text-ocean-400" />
              <p className="text-slate-500 font-medium">Loading your trips...</p>
            </div>
          </div>
        )}

        {error && !loading && (
          <div className="bg-red-900/30 border border-red-700 rounded-2xl p-8 text-center">
            <div className="text-4xl mb-3">⚠️</div>
            <h3 className="font-bold text-red-300 text-lg mb-2">Connection Error</h3>
            <p className="text-red-400 mb-4">{error}</p>
            <button onClick={loadTrips} className="btn-primary mx-auto">
              Try Again
            </button>
          </div>
        )}

        {!loading && !error && (
          <>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-100">
                {trips.length > 0 ? `Your Trips (${trips.length})` : 'Your Trips'}
              </h2>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {trips.map((trip, index) => (
                <TripCard
                  key={trip.id}
                  trip={trip}
                  index={index}
                  onClick={() => navigate(`/trips/${trip.id}`)}
                />
              ))}

              {/* Add New Trip Card */}
              <div
                onClick={() => setShowModal(true)}
                className="cursor-pointer group hover:shadow-xl hover:-translate-y-1 transition-all duration-300 rounded-2xl border-2 border-dashed border-slate-600 hover:border-ocean-500 min-h-[300px] flex flex-col items-center justify-center gap-4 bg-slate-800/50"
              >
                <div className="w-16 h-16 rounded-full bg-slate-700 group-hover:bg-ocean-900/50 transition-colors flex items-center justify-center">
                  <Plus size={32} className="text-ocean-400 group-hover:text-ocean-300 transition-colors" />
                </div>
                <div className="text-center">
                  <p className="font-semibold text-slate-300 group-hover:text-ocean-400 transition-colors">
                    Add New Trip
                  </p>
                  <p className="text-sm text-slate-500 mt-1">
                    Start planning your adventure
                  </p>
                </div>
              </div>
            </div>

            {trips.length === 0 && (
              <div className="text-center py-8">
                <p className="text-slate-500 text-lg">
                  No trips yet. Click the card above to plan your first adventure!
                </p>
              </div>
            )}
          </>
        )}
      </main>

      {showModal && (
        <NewTripModal
          onClose={() => setShowModal(false)}
          onCreated={handleTripCreated}
        />
      )}
    </div>
  );
}
