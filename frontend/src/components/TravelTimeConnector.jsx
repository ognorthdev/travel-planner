import React from 'react';
import { Footprints, TramFront, Car } from 'lucide-react';

// Compact travel-time row rendered between two consecutive slot cards.
// Only shown when the cached times were computed against the slot that is
// actually above this one right now (fromSlotId match) — stale pairs from a
// reorder simply disappear until travel times are recomputed.
export default function TravelTimeConnector({ slot, prevSlot }) {
  const t = slot?.data?.travelFromPrev;
  if (!t || !prevSlot || t.fromSlotId !== prevSlot.id) return null;

  const modes = [
    { Icon: Footprints, minutes: t.walkMinutes, label: 'walk' },
    { Icon: TramFront, minutes: t.transitMinutes, label: 'transit' },
    { Icon: Car, minutes: t.driveMinutes, label: 'drive' },
  ].filter((m) => m.minutes != null);

  if (modes.length === 0) return null;

  return (
    <div className="flex items-center gap-1 pl-7 -my-0.5">
      <div className="w-px h-3 bg-slate-600 ml-1.5" />
      <div className="flex items-center gap-2.5 text-[10px] text-slate-400 bg-slate-900/60 border border-slate-700/60 rounded-full px-2.5 py-0.5">
        {modes.map(({ Icon, minutes, label }) => (
          <span key={label} className="flex items-center gap-1 whitespace-nowrap" title={`${minutes} min ${label}`}>
            <Icon size={10} className="text-slate-500" />
            {minutes}m
          </span>
        ))}
      </div>
    </div>
  );
}
