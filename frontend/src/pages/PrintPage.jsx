import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Printer, Loader2, MapPin, Clock, Phone, Hash, Footprints, TramFront, Car } from 'lucide-react';
import { tripsApi } from '../api/index.js';
import SLOT_CONFIG from '../config/slotTypes.js';
import { formatTime12 } from '../utils/time.js';

// Destination-inspired palettes. The destination name hashes to one of these,
// so every trip gets a stable look that feels tied to the place. Colors are
// chosen to stay legible in grayscale print too.
const PALETTES = [
  { name: 'azure',     accent: '#0e7490', soft: '#ecfeff', rule: '#67e8f9', motif: '✈' },  // sea / harbor towns
  { name: 'terracotta',accent: '#c2410c', soft: '#fff7ed', rule: '#fdba74', motif: '🏛' }, // old cities, warm stone
  { name: 'forest',    accent: '#15803d', soft: '#f0fdf4', rule: '#86efac', motif: '⛰' },  // mountains, parks
  { name: 'plum',      accent: '#7e22ce', soft: '#faf5ff', rule: '#d8b4fe', motif: '🌸' },  // gardens, spring trips
  { name: 'sunset',    accent: '#b45309', soft: '#fffbeb', rule: '#fcd34d', motif: '🌅' },  // deserts, beaches
  { name: 'midnight',  accent: '#1d4ed8', soft: '#eff6ff', rule: '#93c5fd', motif: '🌃' },  // big cities
];

function paletteFor(destination) {
  let h = 0;
  for (const c of destination || '') h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return PALETTES[h % PALETTES.length];
}

function parseLocalDate(dateStr) {
  return new Date(dateStr.slice(0, 10) + 'T00:00:00');
}

function slotName(slot) {
  const config = SLOT_CONFIG[slot.type] || SLOT_CONFIG.ACTIVITY;
  return slot.data?.enrichment?.name || slot.data?.[config.previewField] || slot.data?.name || '';
}

function TravelRow({ t, accent }) {
  const modes = [
    { Icon: Footprints, minutes: t?.walkMinutes },
    { Icon: TramFront, minutes: t?.transitMinutes },
    { Icon: Car, minutes: t?.driveMinutes },
  ].filter((m) => m.minutes != null);
  if (modes.length === 0) return null;
  return (
    <div className="flex items-center gap-3 pl-12 py-0.5 text-[11px]" style={{ color: accent }}>
      <span className="tracking-widest opacity-60">┊</span>
      {modes.map(({ Icon, minutes }, i) => (
        <span key={i} className="flex items-center gap-1"><Icon size={11} />{minutes} min</span>
      ))}
    </div>
  );
}

// Print-optimized itinerary: one page per day, airmail-postcard borders, and
// a palette derived from the destination. Screen shows a toolbar; print hides it.
export default function PrintPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const [trip, setTrip] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    tripsApi.getById(tripId).then(setTrip).catch((err) => setError(err.message));
  }, [tripId]);

  if (error) {
    return <div className="min-h-screen bg-white flex items-center justify-center text-slate-600">{error}</div>;
  }
  if (!trip) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-slate-400" />
      </div>
    );
  }

  const palette = paletteFor(trip.destination);
  const start = parseLocalDate(trip.startDate);
  const end = parseLocalDate(trip.endDate);

  // Classic airmail edge: alternating accent/white diagonal stripes.
  const airmailBorder = {
    backgroundImage: `repeating-linear-gradient(45deg, ${palette.accent} 0 10px, #ffffff 10px 20px, ${palette.rule} 20px 30px, #ffffff 30px 40px)`,
    height: 8,
  };

  return (
    <div className="min-h-screen bg-slate-100 print:bg-white">
      {/* Screen-only toolbar */}
      <div className="print:hidden sticky top-0 z-10 bg-slate-900 text-slate-200 px-4 py-3 flex items-center justify-between">
        <button onClick={() => navigate(`/trips/${tripId}`)} className="flex items-center gap-2 text-sm hover:text-white transition-colors">
          <ArrowLeft size={16} /> Back to trip
        </button>
        <button
          onClick={() => window.print()}
          className="flex items-center gap-2 px-4 py-1.5 rounded-lg text-sm font-semibold text-white"
          style={{ background: palette.accent }}
        >
          <Printer size={15} /> Print / Save as PDF
        </button>
      </div>

      <div className="max-w-3xl mx-auto bg-white shadow-xl print:shadow-none my-6 print:my-0">
        {/* Cover */}
        <div style={airmailBorder} />
        <div className="relative">
          {trip.coverImageUrl && (
            <img
              src={trip.coverImageUrl}
              alt=""
              className="w-full h-56 object-cover"
              referrerPolicy="no-referrer"
              style={{ printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }}
            />
          )}
          <div className="px-8 py-6" style={{ background: palette.soft }}>
            <p className="text-xs font-bold uppercase tracking-[0.3em]" style={{ color: palette.accent }}>
              {palette.motif} Itinerary
            </p>
            <h1 className="text-4xl font-bold mt-1 text-slate-900" style={{ fontFamily: 'Georgia, "Times New Roman", serif' }}>
              {trip.name}
            </h1>
            <p className="text-slate-600 mt-2 flex items-center gap-4 text-sm">
              <span className="flex items-center gap-1"><MapPin size={13} style={{ color: palette.accent }} />{trip.destination}</span>
              <span>
                {start.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}
                {' — '}
                {end.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
              </span>
            </p>
          </div>
        </div>

        {/* Days */}
        {trip.days?.map((day) => {
          const filled = (day.slots || []).filter((s) => slotName(s));
          return (
            <section key={day.id} className="px-8 py-6 break-inside-avoid print:break-after-page border-t border-dashed" style={{ borderColor: palette.rule }}>
              <div className="flex items-baseline gap-4 mb-4">
                <span
                  className="text-5xl font-bold leading-none"
                  style={{ color: palette.accent, fontFamily: 'Georgia, "Times New Roman", serif' }}
                >
                  {String(day.dayNumber).padStart(2, '0')}
                </span>
                <div>
                  <p className="font-semibold text-slate-900">
                    {parseLocalDate(day.date).toLocaleDateString('en-US', { weekday: 'long' })}
                  </p>
                  <p className="text-sm text-slate-500">
                    {parseLocalDate(day.date).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                  </p>
                </div>
              </div>

              {filled.length === 0 ? (
                <p className="text-sm text-slate-400 italic pl-1">A free day — no plans yet.</p>
              ) : (
                <div>
                  {day.slots.map((slot, index) => {
                    const name = slotName(slot);
                    if (!name) return null;
                    const config = SLOT_CONFIG[slot.type] || SLOT_CONFIG.ACTIVITY;
                    const address = slot.data?.address || slot.data?.location || slot.data?.enrichment?.address;
                    const phone = slot.data?.phoneNumber || slot.data?.enrichment?.phoneNumber;
                    const prev = index > 0 ? day.slots[index - 1] : null;
                    const travel = slot.data?.travelFromPrev;
                    const showTravel = travel && prev && travel.fromSlotId === prev.id;
                    return (
                      <React.Fragment key={slot.id}>
                        {showTravel && <TravelRow t={travel} accent={palette.accent} />}
                        <div className="flex gap-3 py-2.5 break-inside-avoid">
                          <div className="w-12 flex-shrink-0 text-right">
                            {slot.data?.time ? (
                              <span className="text-xs font-bold text-slate-700">{formatTime12(slot.data.time)}</span>
                            ) : (
                              <span className="text-xs text-slate-300">·</span>
                            )}
                          </div>
                          <div className="relative flex-shrink-0 w-3 flex justify-center">
                            <div className="w-2.5 h-2.5 rounded-full mt-1" style={{ background: palette.accent, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} />
                          </div>
                          <div className="flex-1 min-w-0 pb-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[10px] font-bold uppercase tracking-widest" style={{ color: palette.accent }}>
                                {config.label}
                              </span>
                              {slot.data?.bookingStatus === 'booked' && (
                                <span className="text-[10px] font-semibold px-1.5 py-px rounded border border-emerald-600 text-emerald-700">BOOKED</span>
                              )}
                              {slot.data?.bookingStatus === 'needs-booking' && (
                                <span className="text-[10px] font-semibold px-1.5 py-px rounded border border-amber-600 text-amber-700">TO BOOK</span>
                              )}
                            </div>
                            <p className="font-semibold text-slate-900 text-[15px]">{name}</p>
                            {address && (
                              <p className="text-xs text-slate-500 flex items-start gap-1 mt-0.5">
                                <MapPin size={11} className="mt-px flex-shrink-0" />{address}
                              </p>
                            )}
                            <div className="flex items-center gap-4 mt-0.5">
                              {phone && (
                                <p className="text-xs text-slate-500 flex items-center gap-1"><Phone size={10} />{phone}</p>
                              )}
                              {slot.data?.confirmationNumber && (
                                <p className="text-xs text-slate-500 flex items-center gap-1"><Hash size={10} />{slot.data.confirmationNumber}</p>
                              )}
                              {slot.type === 'HOTEL' && slot.data?.roomType && (
                                <p className="text-xs text-slate-500">{slot.data.roomType}</p>
                              )}
                            </div>
                            {slot.data?.notes && (
                              <p className="text-xs text-slate-600 mt-1 italic border-l-2 pl-2" style={{ borderColor: palette.rule }}>
                                {slot.data.notes}
                              </p>
                            )}
                          </div>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              )}
            </section>
          );
        })}

        <div style={airmailBorder} />
        <p className="text-center text-[10px] text-slate-400 py-3 tracking-widest uppercase">
          {trip.destination} · Bon voyage {palette.motif}
        </p>
      </div>
    </div>
  );
}
