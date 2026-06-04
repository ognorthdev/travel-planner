import React from 'react';
import { useNavigate } from 'react-router-dom';
import { GripVertical, ChevronRight, Clock, X } from 'lucide-react';
import SLOT_CONFIG from '../config/slotTypes.js';
import { formatTime12 } from '../utils/time.js';

export default function SlotCard({ slot, dayId, tripId, onDelete, index, isDragging, onDragStateChange, onClick, onDragStart, compact }) {
  const navigate = useNavigate();
  const config = SLOT_CONFIG[slot.type] || SLOT_CONFIG.ACTIVITY;
  const Icon = config.icon;
  const enrichment = slot.data?.enrichment;

  const preview = enrichment?.name || slot.data?.[config.previewField];
  const isEmpty = !preview;
  const time = slot.data?.time;
  const description = slot.data?.description || '';
  const photos = enrichment?.photos || [];
  const isMeal = ['BREAKFAST', 'LUNCH', 'DINNER'].includes(slot.type);
  const thumbnailUrl = photos.length > 0
    ? (isMeal ? (photos[2]?.url || photos[0]?.url) : (photos[1]?.url || photos[0]?.url))
    : null;

  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (dayId && tripId) {
      navigate(`/trips/${tripId}/days/${dayId}/slots/${slot.id}`);
    }
  };

  const handleDeleteClick = (e) => {
    e.stopPropagation();
    onDelete?.(slot.id);
  };

  const handleDragStart = (e) => {
    if (onDragStart) {
      onDragStart(e);
    } else {
      // Include idea fields so this slot can be dropped back into the ideas collection,
      // alongside the slotId/source fields used for day-to-day moves.
      const payload = {
        source: 'slot',
        slotId: slot.id,
        sourceDayId: dayId,
        sourceIndex: index,
        type: slot.type,
        name: preview,
        description: slot.data?.description || '',
        data: slot.data || {},
      };
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('application/json', JSON.stringify(payload));
      onDragStateChange?.(payload);
    }
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      className={`group relative rounded-xl border ${config.border} ${config.bg} p-3 cursor-pointer hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 ${isDragging ? 'opacity-40 scale-95' : ''} ${compact ? 'flex-shrink-0 w-48' : ''}`}
    >
      <div className="flex items-center gap-2">
        <div
          className="flex-shrink-0 cursor-grab active:cursor-grabbing text-slate-600 hover:text-slate-400 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <GripVertical size={14} />
        </div>
        {thumbnailUrl ? (
          <div className="w-9 h-9 rounded-lg overflow-hidden flex-shrink-0 shadow-sm">
            <img src={thumbnailUrl} alt="" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
        ) : (
          <div className="w-7 h-7 rounded-lg flex items-center justify-center bg-slate-700 shadow-sm flex-shrink-0">
            <Icon size={14} className={config.color} />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <p className={`text-xs font-semibold ${config.color} uppercase tracking-wide whitespace-nowrap`}>
              {config.label}
            </p>
            {time && (
              <span className="flex items-center gap-0.5 text-[10px] text-slate-400 whitespace-nowrap">
                <Clock size={9} />
                {formatTime12(time)}
              </span>
            )}
          </div>
          {!isEmpty ? (
            <>
              <p className="text-[10px] font-medium text-slate-200 truncate mt-0.5">
                {preview}
              </p>
              {description && (
                <p className="text-[10px] text-slate-400 truncate mt-0.5">
                  {description}
                </p>
              )}
            </>
          ) : (
            <p className="text-sm text-slate-500 mt-0.5">
              {config.addLabel}
            </p>
          )}
        </div>
        {!compact && <ChevronRight size={14} className={`${config.color} opacity-50 flex-shrink-0`} />}
      </div>

      {onDelete && (
        <button
          onClick={handleDeleteClick}
          className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full hidden group-hover:flex items-center justify-center shadow-md hover:bg-red-600 transition-colors z-10"
        >
          <X size={10} />
        </button>
      )}
    </div>
  );
}
