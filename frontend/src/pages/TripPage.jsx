import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Calendar, MapPin, Loader2, Hotel, Coffee, Sun,
  Moon, Utensils, ChevronRight, Trash2, X, AlertTriangle, Clock, GripVertical
} from 'lucide-react';
import { tripsApi, daysApi, slotsApi, researchApi } from '../api/index.js';
import ResearchBottomPanel from '../components/research/ResearchBottomPanel';
import ResearchOverlay from '../components/research/ResearchOverlay';

const SLOT_CONFIG = {
  HOTEL: {
    label: 'Hotel',
    icon: Hotel,
    color: 'text-purple-400',
    bg: 'bg-purple-900/30',
    border: 'border-purple-700/50',
    dot: 'bg-purple-400',
    addLabel: 'Add Hotel',
    previewField: 'hotelName'
  },
  BREAKFAST: {
    label: 'Breakfast',
    icon: Coffee,
    color: 'text-amber-400',
    bg: 'bg-amber-900/30',
    border: 'border-amber-700/50',
    dot: 'bg-amber-400',
    addLabel: 'Add Breakfast',
    previewField: 'restaurantName'
  },
  LUNCH: {
    label: 'Lunch',
    icon: Utensils,
    color: 'text-green-400',
    bg: 'bg-green-900/30',
    border: 'border-green-700/50',
    dot: 'bg-green-400',
    addLabel: 'Add Lunch',
    previewField: 'restaurantName'
  },
  DINNER: {
    label: 'Dinner',
    icon: Moon,
    color: 'text-indigo-400',
    bg: 'bg-indigo-900/30',
    border: 'border-indigo-700/50',
    dot: 'bg-indigo-400',
    addLabel: 'Add Dinner',
    previewField: 'restaurantName'
  },
  ACTIVITY: {
    label: 'Activity',
    icon: Sun,
    color: 'text-teal-400',
    bg: 'bg-teal-900/30',
    border: 'border-teal-700/50',
    dot: 'bg-teal-400',
    addLabel: 'Add Activity',
    previewField: 'activityName'
  }
};

const DEFAULT_DAY_SLOTS = [
  { type: 'HOTEL', sortOrder: 0 },
  { type: 'BREAKFAST', sortOrder: 1 },
  { type: 'ACTIVITY', sortOrder: 2 },
  { type: 'LUNCH', sortOrder: 5 },
  { type: 'ACTIVITY', sortOrder: 6 },
  { type: 'DINNER', sortOrder: 9 }
];

function parseLocalDate(dateStr) {
  // Append time to force local timezone parsing instead of UTC
  return new Date(dateStr.slice(0, 10) + 'T00:00:00');
}

function formatDate(dateStr) {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function loadPlanSelection(slotId) {
  try {
    const raw = localStorage.getItem(`travel-planner-plan-selection-${slotId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function SlotCard({ slot, dayId, tripId, onDelete, index, isDragging, onDragStateChange }) {
  const navigate = useNavigate();
  const config = SLOT_CONFIG[slot.type] || SLOT_CONFIG.ACTIVITY;
  const Icon = config.icon;
  const isMealOrActivity = ['BREAKFAST', 'LUNCH', 'DINNER', 'ACTIVITY'].includes(slot.type);
  const planSelection = isMealOrActivity ? loadPlanSelection(slot.id) : null;
  const hasPlan = planSelection?.result != null;

  const preview = hasPlan ? planSelection.result.name : slot.data?.[config.previewField];
  const isEmpty = !preview;
  const time = hasPlan ? planSelection.time : slot.data?.time;
  const description = hasPlan ? (planSelection.result.shortDescription || '') : null;
  const photos = hasPlan ? (planSelection.result.photos || []) : [];
  const isMeal = ['BREAKFAST', 'LUNCH', 'DINNER'].includes(slot.type);
  const thumbnailUrl = photos.length > 0
    ? (isMeal ? (photos[2]?.url || photos[0]?.url) : (photos[1]?.url || photos[0]?.url))
    : null;

  const handleClick = () => {
    const phase = hasPlan ? 'plan' : '';
    const url = `/trips/${tripId}/days/${dayId}/slots/${slot.id}${phase ? `?phase=${phase}` : ''}`;
    navigate(url);
  };

  const handleDeleteClick = async (e) => {
    e.stopPropagation();
    onDelete(slot.id);
  };

  const handleDragStart = (e) => {
    const payload = { slotId: slot.id, sourceDayId: dayId, sourceIndex: index };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
    onDragStateChange(payload);
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      onClick={handleClick}
      className={`group relative rounded-xl border ${config.border} ${config.bg} p-3 cursor-pointer hover:shadow-lg transition-all duration-200 hover:-translate-y-0.5 ${isDragging ? 'opacity-40 scale-95' : ''}`}
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
          <div className="flex items-center gap-2">
            <p className={`text-xs font-semibold ${config.color} uppercase tracking-wide`}>
              {config.label}
            </p>
            {time && (
              <span className="flex items-center gap-0.5 text-xs text-slate-400">
                <Clock size={10} />
                {time}
              </span>
            )}
          </div>
          {!isEmpty ? (
            <>
              <p className="text-sm font-medium text-slate-200 truncate mt-0.5">
                {preview}
              </p>
              {description && (
                <p className="text-xs text-slate-400 truncate mt-0.5">
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
        <ChevronRight size={14} className={`${config.color} opacity-50 flex-shrink-0`} />
      </div>

      <button
        onClick={handleDeleteClick}
        className="absolute -top-2 -right-2 w-6 h-6 bg-red-500 text-white rounded-full hidden group-hover:flex items-center justify-center shadow-md hover:bg-red-600 transition-colors z-10"
      >
        <X size={10} />
      </button>
    </div>
  );
}

function DayColumn({ day, tripId, onAddSlot, onDeleteSlot, onDeleteDay, onReorderSlots, onMoveSlot, onResearchDrop, dragState, onDragStateChange }) {
  const [showAddSlot, setShowAddSlot] = useState(false);
  const [dropIndex, setDropIndex] = useState(null);
  const slotTypes = ['BREAKFAST', 'LUNCH', 'DINNER', 'ACTIVITY', 'HOTEL'];

  const isDragSource = dragState?.sourceDayId === day.id;

  const handleSlotDragOver = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDropIndex(index);
  };

  const handleColumnDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dropIndex === null && day.slots?.length === 0) {
      setDropIndex(0);
    }
  };

  const handleDrop = (e, targetIndex) => {
    e.preventDefault();
    e.stopPropagation();
    setDropIndex(null);

    let payload;
    try { payload = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }

    if (payload.source === 'research') {
      onResearchDrop?.(day.id, payload, targetIndex);
      onDragStateChange(null);
      return;
    }

    const { slotId, sourceDayId, sourceIndex } = payload;

    if (sourceDayId === day.id) {
      if (sourceIndex !== targetIndex) {
        const slots = [...(day.slots || [])];
        const [moved] = slots.splice(sourceIndex, 1);
        const adjustedTarget = targetIndex > sourceIndex ? targetIndex - 1 : targetIndex;
        slots.splice(adjustedTarget, 0, moved);
        onReorderSlots(day.id, slots);
      }
    } else {
      onMoveSlot(slotId, sourceDayId, day.id, targetIndex);
    }
    onDragStateChange(null);
  };

  const handleColumnDrop = (e) => {
    handleDrop(e, day.slots?.length || 0);
  };

  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) {
      setDropIndex(null);
    }
  };

  const handleDragEnd = () => {
    setDropIndex(null);
    onDragStateChange(null);
  };

  return (
    <div
      className={`flex-shrink-0 w-64 bg-slate-800 rounded-2xl border shadow-sm overflow-hidden transition-colors duration-200 ${
        dropIndex !== null ? 'border-ocean-500 bg-slate-800/80' : 'border-slate-700'
      }`}
      onDragOver={handleColumnDragOver}
      onDrop={handleColumnDrop}
      onDragLeave={handleDragLeave}
      onDragEnd={handleDragEnd}
    >
      {/* Day Header */}
      <div className="bg-gradient-to-r from-ocean-600 to-teal-600 p-4 text-white relative">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-ocean-100 text-xs font-semibold uppercase tracking-widest">
              Day {day.dayNumber}
            </p>
            <p className="font-bold text-lg mt-0.5">{formatDate(day.date)}</p>
          </div>
          <button
            onClick={() => onDeleteDay(day.id)}
            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/30 transition-colors"
            title="Delete day"
          >
            <Trash2 size={13} />
          </button>
        </div>
      </div>

      {/* Slots */}
      <div className="p-3 space-y-2">
        {day.slots && day.slots.length > 0 ? (
          day.slots.map((slot, index) => (
            <React.Fragment key={slot.id}>
              {dropIndex === index && (
                <div className="h-1 bg-ocean-400 rounded-full mx-2 animate-pulse" />
              )}
              <div
                onDragOver={(e) => handleSlotDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
              >
                <SlotCard
                  slot={slot}
                  dayId={day.id}
                  tripId={tripId}
                  onDelete={onDeleteSlot}
                  index={index}
                  isDragging={isDragSource && dragState?.slotId === slot.id}
                  onDragStateChange={onDragStateChange}
                />
              </div>
            </React.Fragment>
          ))
        ) : (
          <div
            className="text-center text-slate-500 text-sm py-4 border-2 border-dashed border-transparent rounded-xl transition-colors"
            onDragOver={(e) => { e.preventDefault(); setDropIndex(0); }}
            onDrop={(e) => handleDrop(e, 0)}
          >
            {dropIndex !== null ? (
              <p className="text-ocean-400 font-medium">Drop here</p>
            ) : (
              <p>No slots yet</p>
            )}
          </div>
        )}

        {day.slots?.length > 0 && dropIndex === day.slots.length && (
          <div className="h-1 bg-ocean-400 rounded-full mx-2 animate-pulse" />
        )}

        {/* Add Slot */}
        {showAddSlot ? (
          <div className="bg-slate-700/50 rounded-xl border border-slate-600 p-2">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-2 px-1">
              Add Slot Type
            </p>
            <div className="space-y-1">
              {slotTypes.map(type => {
                const config = SLOT_CONFIG[type];
                const Icon = config.icon;
                return (
                  <button
                    key={type}
                    onClick={() => { onAddSlot(day.id, type); setShowAddSlot(false); }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-slate-600 transition-colors text-left"
                  >
                    <Icon size={14} className={config.color} />
                    <span className="text-sm font-medium text-slate-200">{config.label}</span>
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setShowAddSlot(false)}
              className="w-full mt-2 text-xs text-slate-500 hover:text-slate-300 py-1"
            >
              Cancel
            </button>
          </div>
        ) : (
          <button
            onClick={() => setShowAddSlot(true)}
            className="w-full border-2 border-dashed border-slate-600 rounded-xl py-3 flex items-center justify-center gap-2 text-slate-500 hover:text-ocean-400 hover:border-ocean-500 transition-all duration-200 text-sm font-medium"
          >
            <Plus size={16} />
            Add Slot
          </button>
        )}
      </div>
    </div>
  );
}

function DeleteConfirmModal({ title, message, onConfirm, onCancel }) {
  return (
    <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-slate-800 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm animate-slide-up p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-full bg-red-900/50 flex items-center justify-center">
            <AlertTriangle size={20} className="text-red-400" />
          </div>
          <h3 className="font-bold text-slate-100 text-lg">{title}</h3>
        </div>
        <p className="text-slate-400 mb-6">{message}</p>
        <div className="flex gap-3">
          <button onClick={onCancel} className="btn-secondary flex-1 justify-center">Cancel</button>
          <button onClick={onConfirm} className="btn-danger flex-1 justify-center">Delete</button>
        </div>
      </div>
    </div>
  );
}

export default function TripPage() {
  const { tripId } = useParams();
  const navigate = useNavigate();
  const scrollRef = useRef(null);

  const [trip, setTrip] = useState(null);
  const [days, setDays] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [addingDay, setAddingDay] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(null);
  const [dragState, setDragState] = useState(null);
  const [showResearch, setShowResearch] = useState(false);
  const [savedIdeas, setSavedIdeas] = useState([]);

  useEffect(() => {
    loadTripData();
    researchApi.getIdeas(tripId).then(setSavedIdeas).catch(() => {});
  }, [tripId]);

  const loadTripData = async () => {
    setLoading(true);
    setError('');
    try {
      const tripData = await tripsApi.getById(tripId);
      setTrip(tripData);
      setDays(tripData.days || []);
    } catch (err) {
      setError(err.message || 'Failed to load trip');
    } finally {
      setLoading(false);
    }
  };

  const handleAddDay = async () => {
    setAddingDay(true);
    try {
      const newDay = await daysApi.create(tripId, {});

      // Create default slots for the new day
      const createdSlots = await Promise.all(
        DEFAULT_DAY_SLOTS.map(slot =>
          slotsApi.create(newDay.id, { type: slot.type, sortOrder: slot.sortOrder, data: {} })
        )
      );

      const dayWithSlots = { ...newDay, slots: createdSlots };
      setDays(prev => [...prev, dayWithSlots]);

      // Scroll to the new day
      setTimeout(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
        }
      }, 100);
    } catch (err) {
      console.error('Failed to add day:', err);
    } finally {
      setAddingDay(false);
    }
  };

  const handleAddSlot = async (dayId, type) => {
    try {
      const newSlot = await slotsApi.create(dayId, { type, data: {} });
      setDays(prev => prev.map(day =>
        day.id === dayId
          ? { ...day, slots: [...(day.slots || []), newSlot].sort((a, b) => a.sortOrder - b.sortOrder) }
          : day
      ));
    } catch (err) {
      console.error('Failed to add slot:', err);
    }
  };

  const handleReorderSlots = async (dayId, reorderedSlots) => {
    const slotIds = reorderedSlots.map(s => s.id);
    setDays(prev => prev.map(day =>
      day.id === dayId ? { ...day, slots: reorderedSlots } : day
    ));
    try {
      await slotsApi.reorder(dayId, slotIds);
    } catch (err) {
      console.error('Failed to reorder slots:', err);
      loadTripData();
    }
  };

  const handleMoveSlot = async (slotId, sourceDayId, targetDayId, position) => {
    const sourceDay = days.find(d => d.id === sourceDayId);
    const targetDay = days.find(d => d.id === targetDayId);
    if (!sourceDay || !targetDay) return;

    const movedSlot = sourceDay.slots.find(s => s.id === slotId);
    if (!movedSlot) return;

    // Optimistic update
    setDays(prev => prev.map(day => {
      if (day.id === sourceDayId) {
        return { ...day, slots: day.slots.filter(s => s.id !== slotId) };
      }
      if (day.id === targetDayId) {
        const newSlots = [...(day.slots || [])];
        newSlots.splice(position, 0, movedSlot);
        return { ...day, slots: newSlots };
      }
      return day;
    }));

    try {
      const result = await slotsApi.move(slotId, targetDayId, position);
      setDays(prev => prev.map(day => {
        if (day.id === result.sourceDayId) return { ...day, slots: result.sourceDaySlots };
        if (day.id === result.targetDayId) return { ...day, slots: result.targetDaySlots };
        return day;
      }));
    } catch (err) {
      console.error('Failed to move slot:', err);
      loadTripData();
    }
  };

  const handleDragStateChange = (state) => {
    setDragState(state);
  };

  const handleDeleteIdea = async (idea) => {
    try {
      await researchApi.deleteIdea(idea.id);
      setSavedIdeas(prev => prev.filter(i => i.id !== idea.id));
    } catch (err) {
      console.error('Failed to delete idea:', err);
    }
  };

  const handleResearchDrop = async (dayId, payload, position) => {
    const data = typeof payload.data === 'string' ? JSON.parse(payload.data) : (payload.data || {});
    const slotData = payload.type === 'ACTIVITY'
      ? { activityName: payload.name, description: payload.description, ...data }
      : { restaurantName: payload.name, description: payload.description, ...data };

    try {
      const newSlot = await slotsApi.create(dayId, {
        type: payload.type,
        sortOrder: position,
        data: slotData,
      });
      setDays(prev => prev.map(day =>
        day.id === dayId
          ? { ...day, slots: [...(day.slots || []), newSlot].sort((a, b) => a.sortOrder - b.sortOrder) }
          : day
      ));
    } catch (err) {
      console.error('Failed to create slot from idea:', err);
    }
  };

  const handleDeleteSlot = (slotId) => {
    setDeleteConfirm({
      type: 'slot',
      id: slotId,
      title: 'Delete Slot',
      message: 'Are you sure you want to delete this slot? This action cannot be undone.'
    });
  };

  const handleDeleteDay = (dayId) => {
    setDeleteConfirm({
      type: 'day',
      id: dayId,
      title: 'Delete Day',
      message: 'Are you sure you want to delete this day and all its slots? This action cannot be undone.'
    });
  };

  const handleDeleteTrip = () => {
    setDeleteConfirm({
      type: 'trip',
      id: tripId,
      title: 'Delete Trip',
      message: `Are you sure you want to delete "${trip?.name}"? All days and slots will be permanently deleted.`
    });
  };

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    const { type, id } = deleteConfirm;
    setDeleteConfirm(null);

    try {
      if (type === 'slot') {
        await slotsApi.delete(id);
        setDays(prev => prev.map(day => ({
          ...day,
          slots: (day.slots || []).filter(s => s.id !== id)
        })));
      } else if (type === 'day') {
        await daysApi.delete(id);
        setDays(prev => prev.filter(d => d.id !== id));
      } else if (type === 'trip') {
        await tripsApi.delete(id);
        navigate('/');
      }
    } catch (err) {
      console.error('Delete failed:', err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 size={40} className="animate-spin text-ocean-400" />
          <p className="text-slate-400 font-medium">Loading trip details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
        <div className="bg-slate-800 border border-slate-700 rounded-2xl p-8 text-center shadow-sm max-w-md w-full">
          <div className="text-4xl mb-3">⚠️</div>
          <h3 className="font-bold text-slate-100 text-lg mb-2">Error Loading Trip</h3>
          <p className="text-slate-400 mb-4">{error}</p>
          <button onClick={() => navigate('/')} className="btn-secondary mx-auto">
            <ArrowLeft size={16} />
            Back to Home
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 flex flex-col">
      {/* Header */}
      <header className="bg-slate-800 border-b border-slate-700 shadow-sm sticky top-0 z-10">
        <div className="max-w-full px-4 sm:px-6">
          <div className="flex items-center gap-4 h-16">
            <button
              onClick={() => navigate('/')}
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
                <span className="flex items-center gap-1">
                  <Calendar size={12} className="text-ocean-400" />
                  {trip && parseLocalDate(trip.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                  {' – '}
                  {trip && parseLocalDate(trip.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={handleAddDay}
                disabled={addingDay}
                className="btn-primary"
              >
                {addingDay ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Plus size={16} />
                )}
                Add Day
              </button>
              <button
                onClick={handleDeleteTrip}
                className="p-2 rounded-full hover:bg-red-900/30 text-slate-500 hover:text-red-400 transition-colors"
                title="Delete trip"
              >
                <Trash2 size={18} />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Horizontal Day Scroll */}
      <div className="flex-1 overflow-hidden">
        {days.length === 0 ? (
          <div className="flex items-center justify-center h-full min-h-[60vh]">
            <div className="text-center">
              <div className="text-6xl mb-4">🗓️</div>
              <h3 className="text-xl font-bold text-slate-200 mb-2">No days planned yet</h3>
              <p className="text-slate-400 mb-6">Add your first day to start planning your trip</p>
              <button onClick={handleAddDay} disabled={addingDay} className="btn-primary mx-auto">
                {addingDay ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} />}
                Add First Day
              </button>
            </div>
          </div>
        ) : (
          <div
            ref={scrollRef}
            className="flex gap-4 p-6 overflow-x-auto h-full"
            style={{ alignItems: 'flex-start' }}
          >
            {days.map(day => (
              <DayColumn
                key={day.id}
                day={day}
                tripId={tripId}
                onAddSlot={handleAddSlot}
                onDeleteSlot={handleDeleteSlot}
                onDeleteDay={handleDeleteDay}
                onReorderSlots={handleReorderSlots}
                onMoveSlot={handleMoveSlot}
                onResearchDrop={handleResearchDrop}
                dragState={dragState}
                onDragStateChange={handleDragStateChange}
              />
            ))}

            {/* Add Day Column */}
            <div className="flex-shrink-0 w-64">
              <button
                onClick={handleAddDay}
                disabled={addingDay}
                className="w-full h-48 border-2 border-dashed border-slate-700 rounded-2xl flex flex-col items-center justify-center gap-3 text-slate-500 hover:text-ocean-400 hover:border-ocean-600 transition-all duration-200 bg-slate-800/50 hover:bg-slate-800"
              >
                {addingDay ? (
                  <Loader2 size={24} className="animate-spin" />
                ) : (
                  <Plus size={24} />
                )}
                <span className="font-medium text-sm">Add Day {days.length + 1}</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Bottom Panel */}
      <ResearchBottomPanel
        ideas={savedIdeas}
        onOpenResearch={() => setShowResearch(true)}
        onDeleteIdea={handleDeleteIdea}
      />

      {deleteConfirm && (
        <DeleteConfirmModal
          title={deleteConfirm.title}
          message={deleteConfirm.message}
          onConfirm={confirmDelete}
          onCancel={() => setDeleteConfirm(null)}
        />
      )}

      {showResearch && trip && (
        <ResearchOverlay
          tripId={tripId}
          destination={trip.destination}
          onClose={() => setShowResearch(false)}
          savedIdeas={savedIdeas}
          onIdeasChange={setSavedIdeas}
        />
      )}
    </div>
  );
}
