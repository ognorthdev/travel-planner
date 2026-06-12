import React, { useMemo } from 'react';
import { X, MapPin, Route, Loader2 } from 'lucide-react';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import SLOT_CONFIG from '../config/slotTypes.js';

// Pin colors per slot type (hex equivalents of the slotTypes tailwind colors).
const PIN_COLORS = {
  HOTEL: '#c084fc',
  BREAKFAST: '#fbbf24',
  LUNCH: '#4ade80',
  DINNER: '#818cf8',
  ACTIVITY: '#2dd4bf',
};

function slotCoords(slot) {
  const lat = slot.data?.lat ?? slot.data?.enrichment?.lat;
  const lng = slot.data?.lng ?? slot.data?.enrichment?.lng;
  if (lat == null || lng == null) return null;
  return [lat, lng];
}

function slotName(slot) {
  const config = SLOT_CONFIG[slot.type] || SLOT_CONFIG.ACTIVITY;
  return slot.data?.enrichment?.name || slot.data?.[config.previewField] || slot.data?.name || config.label;
}

// Numbered, color-coded pin rendered as a divIcon so we control styling in CSS.
function numberedIcon(number, color) {
  return L.divIcon({
    className: '',
    html: `<div style="
      width:30px;height:30px;border-radius:50% 50% 50% 4px;
      background:${color};transform:rotate(0deg);
      display:flex;align-items:center;justify-content:center;
      color:#0f172a;font-weight:800;font-size:13px;
      border:2.5px solid #0f172a;box-shadow:0 2px 8px rgba(0,0,0,.5)">${number}</div>`,
    iconSize: [30, 30],
    iconAnchor: [15, 15],
    popupAnchor: [0, -16],
  });
}

export default function DayMapModal({ day, onClose, onComputeTravelTimes, computingTravel }) {
  const located = useMemo(() => {
    return (day.slots || [])
      .map((slot, index) => ({ slot, index, coords: slotCoords(slot) }))
      .filter((s) => s.coords);
  }, [day.slots]);

  const unlocated = (day.slots || []).filter((s) => !slotCoords(s) && slotName(s) !== (SLOT_CONFIG[s.type] || SLOT_CONFIG.ACTIVITY).label);

  const bounds = useMemo(() => {
    if (located.length === 0) return null;
    return L.latLngBounds(located.map((s) => s.coords)).pad(0.25);
  }, [located]);

  const path = located.map((s) => s.coords);

  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-3xl animate-slide-up overflow-hidden flex flex-col" style={{ height: 'min(80vh, 640px)' }}>
        <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 flex-shrink-0">
          <div className="flex items-center gap-2">
            <MapPin size={18} className="text-teal-400" />
            <h3 className="font-bold text-slate-100">Day {day.dayNumber} map</h3>
            <span className="text-xs text-slate-500">{located.length} of {(day.slots || []).length} slots located</span>
          </div>
          <div className="flex items-center gap-2">
            {onComputeTravelTimes && (
              <button
                onClick={onComputeTravelTimes}
                disabled={computingTravel}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 border border-slate-600 text-slate-300 hover:text-slate-100 transition-colors text-xs font-medium"
                title="Locate slots and compute travel times between them"
              >
                {computingTravel ? <Loader2 size={13} className="animate-spin" /> : <Route size={13} />}
                {computingTravel ? 'Computing…' : 'Travel times'}
              </button>
            )}
            <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-700 text-slate-400 transition-colors">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 relative">
          {located.length === 0 ? (
            <div className="absolute inset-0 flex items-center justify-center text-center p-8">
              <div>
                <div className="text-4xl mb-3">🗺️</div>
                <p className="text-slate-300 font-medium mb-1">No located places yet</p>
                <p className="text-sm text-slate-500 max-w-sm">
                  Fill in some slots, then hit “Travel times” — it looks up
                  coordinates for each place and computes routes between them.
                </p>
              </div>
            </div>
          ) : (
            <MapContainer
              bounds={bounds}
              className="w-full h-full"
              scrollWheelZoom
              style={{ background: '#0f172a' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />
              {path.length > 1 && (
                <Polyline positions={path} pathOptions={{ color: '#2dd4bf', weight: 2.5, opacity: 0.6, dashArray: '6 8' }} />
              )}
              {located.map(({ slot, coords }, i) => (
                <Marker key={slot.id} position={coords} icon={numberedIcon(i + 1, PIN_COLORS[slot.type] || PIN_COLORS.ACTIVITY)}>
                  <Popup>
                    <div style={{ minWidth: 140 }}>
                      <strong>{i + 1}. {slotName(slot)}</strong>
                      <div style={{ fontSize: 11, opacity: 0.75, marginTop: 2 }}>
                        {(SLOT_CONFIG[slot.type] || SLOT_CONFIG.ACTIVITY).label}
                        {slot.data?.time ? ` · ${slot.data.time}` : ''}
                      </div>
                      {(slot.data?.address || slot.data?.enrichment?.address) && (
                        <div style={{ fontSize: 11, marginTop: 4 }}>{slot.data?.address || slot.data?.enrichment?.address}</div>
                      )}
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>

        {unlocated.length > 0 && located.length > 0 && (
          <div className="px-5 py-2 border-t border-slate-700 text-xs text-slate-500 flex-shrink-0">
            Not on the map yet: {unlocated.map(slotName).join(', ')} — run “Travel times” to locate them.
          </div>
        )}
      </div>
    </div>
  );
}
