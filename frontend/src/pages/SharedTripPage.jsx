import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { MapPin, Calendar, Clock, Phone, Loader2, Footprints, TramFront, Car, CheckCircle2 } from 'lucide-react';
import { publicApi } from '../api/index.js';
import SLOT_CONFIG from '../config/slotTypes.js';
import { formatTime12 } from '../utils/time.js';

function parseLocalDate(dateStr) {
  return new Date(dateStr.slice(0, 10) + 'T00:00:00');
}

function slotName(slot) {
  const config = SLOT_CONFIG[slot.type] || SLOT_CONFIG.ACTIVITY;
  return slot.data?.enrichment?.name || slot.data?.[config.previewField] || slot.data?.name || '';
}

function TravelChip({ t }) {
  const modes = [
    { Icon: Footprints, minutes: t?.walkMinutes },
    { Icon: TramFront, minutes: t?.transitMinutes },
    { Icon: Car, minutes: t?.driveMinutes },
  ].filter((m) => m.minutes != null);
  if (modes.length === 0) return null;
  return (
    <div className="flex items-center gap-2.5 text-[11px] text-slate-400 pl-10 py-1">
      {modes.map(({ Icon, minutes }, i) => (
        <span key={i} className="flex items-center gap-1"><Icon size={11} className="text-slate-500" />{minutes}m</span>
      ))}
    </div>
  );
}

// Read-only itinerary served by a share token — no auth, no editing.
export default function SharedTripPage() {
  const { token } = useParams();
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    publicApi.getSharedTrip(token).then(setTrip).catch((err) => setError(err.message));
  }, [token]);

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="text-center">
          <div className="text-4xl mb-3">🔗</div>
          <h3 className="text-lg font-bold text-slate-200 mb-1">This link isn't available</h3>
          <p className="text-slate-400 text-sm">{error}</p>
        </div>
      </div>
    );
  }

  if (!trip) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <Loader2 size={36} className="animate-spin text-ocean-400" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 pb-16">
      {/* Cover header */}
      <div className="relative h-44 sm:h-56 overflow-hidden">
        {trip.coverImageUrl ? (
          <img src={trip.coverImageUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-ocean-600 to-teal-600" />
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/40 to-transparent" />
        <div className="absolute bottom-0 left-0 right-0 p-5 max-w-2xl mx-auto">
          <h1 className="text-2xl sm:text-3xl font-bold text-white">{trip.name}</h1>
          <div className="flex items-center gap-4 text-sm text-slate-300 mt-1">
            <span className="flex items-center gap-1"><MapPin size={13} className="text-teal-400" />{trip.destination}</span>
            <span className="flex items-center gap-1">
              <Calendar size={13} className="text-ocean-400" />
              {parseLocalDate(trip.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' – '}
              {parseLocalDate(trip.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </span>
          </div>
        </div>
      </div>

      {/* Days */}
      <div className="max-w-2xl mx-auto px-4 mt-6 space-y-6">
        {trip.days.map((day) => (
          <div key={day.id} className="bg-slate-800 border border-slate-700 rounded-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-ocean-600 to-teal-600 px-4 py-3">
              <p className="text-ocean-100 text-[10px] font-semibold uppercase tracking-widest">Day {day.dayNumber}</p>
              <p className="font-bold text-white">
                {parseLocalDate(day.date).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
              </p>
            </div>
            <div className="p-3">
              {day.slots.filter((s) => slotName(s)).length === 0 && (
                <p className="text-sm text-slate-500 text-center py-3">Nothing planned yet</p>
              )}
              {day.slots.map((slot, index) => {
                const name = slotName(slot);
                if (!name) return null;
                const config = SLOT_CONFIG[slot.type] || SLOT_CONFIG.ACTIVITY;
                const Icon = config.icon;
                const address = slot.data?.address || slot.data?.location || slot.data?.enrichment?.address;
                const phone = slot.data?.enrichment?.phoneNumber;
                const prev = index > 0 ? day.slots[index - 1] : null;
                const travel = slot.data?.travelFromPrev;
                const showTravel = travel && prev && travel.fromSlotId === prev.id;
                return (
                  <React.Fragment key={slot.id}>
                    {showTravel && <TravelChip t={travel} />}
                    <div className={`rounded-xl border ${config.border} ${config.bg} p-3 mb-2`}>
                      <div className="flex items-start gap-2.5">
                        <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-700 flex-shrink-0 mt-0.5">
                          <Icon size={14} className={config.color} />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className={`text-[10px] font-semibold ${config.color} uppercase tracking-wide`}>{config.label}</p>
                            {slot.data?.time && (
                              <span className="flex items-center gap-0.5 text-[10px] text-slate-400">
                                <Clock size={9} />{formatTime12(slot.data.time)}
                              </span>
                            )}
                            {slot.data?.bookingStatus === 'booked' && (
                              <span className="flex items-center gap-0.5 text-[10px] text-emerald-400">
                                <CheckCircle2 size={9} />Booked
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium text-slate-100 mt-0.5">{name}</p>
                          {address && <p className="text-xs text-slate-400 mt-0.5">{address}</p>}
                          {phone && (
                            <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1"><Phone size={10} />{phone}</p>
                          )}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })}
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-xs text-slate-600 mt-8">Shared read-only via Travel Planner</p>
    </div>
  );
}
