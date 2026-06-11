import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Plus, Loader2,
  Trash2, X, AlertTriangle, GripVertical
} from 'lucide-react';
import { tripsApi, daysApi, slotsApi, researchApi } from '../api/index.js';
import ResearchBottomPanel from '../components/research/ResearchBottomPanel';
import ResearchOverlay from '../components/research/ResearchOverlay';
import SuggestionDetailModal from '../components/research/SuggestionDetailModal';
import TripSettings from '../components/TripSettings.jsx';
import TripHeader from '../components/TripHeader.jsx';
import ShareModal from '../components/ShareModal.jsx';
import SlotCard from '../components/SlotCard.jsx';
import SLOT_CONFIG from '../config/slotTypes.js';


const DEFAULT_DAY_SLOTS = [
  { type: 'HOTEL', sortOrder: 0 },
];

function parseLocalDate(dateStr) {
  // Append time to force local timezone parsing instead of UTC
  return new Date(dateStr.slice(0, 10) + 'T00:00:00');
}

function formatDate(dateStr) {
  const date = parseLocalDate(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function DayColumn({ day, tripId, onDeleteSlot, onDeleteDay, onReorderSlots, onMoveSlot, onResearchDrop, dragState, onDragStateChange }) {
  const [dropIndex, setDropIndex] = useState(null);

  const isDragSource = dragState?.sourceDayId === day.id;

  const handleSlotDragOver = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move';
    setDropIndex(index);
  };

  const handleColumnDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = e.dataTransfer.effectAllowed === 'copy' ? 'copy' : 'move';
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

        {day.slots?.length > 0 && (
          <div
            className="h-4"
            onDragOver={(e) => { e.preventDefault(); e.stopPropagation(); setDropIndex(day.slots.length); }}
            onDrop={(e) => handleDrop(e, day.slots.length)}
          >
            {dropIndex === day.slots.length && (
              <div className="h-1 bg-ocean-400 rounded-full mx-2 mt-1 animate-pulse" />
            )}
          </div>
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
  const [selectedIdea, setSelectedIdea] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);

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
      const targetDay = days.find(d => d.id === dayId);
      const currentSlots = [...(targetDay?.slots || [])];
      currentSlots.splice(position, 0, newSlot);
      setDays(prev => prev.map(day =>
        day.id === dayId ? { ...day, slots: currentSlots } : day
      ));
      await slotsApi.reorder(dayId, currentSlots.map(s => s.id));
      if (payload.ideaId) {
        await researchApi.deleteIdea(payload.ideaId);
        setSavedIdeas(prev => prev.filter(i => i.id !== payload.ideaId));
      }
    } catch (err) {
      console.error('Failed to create slot from idea:', err);
    }
  };

  // Drag a placed meal/activity slot back into the ideas collection: save it as an idea
  // (keeping its enrichment) and remove it from the day.
  const handleSlotToIdea = async (payload) => {
    const ideaTypes = ['ACTIVITY', 'BREAKFAST', 'LUNCH', 'DINNER'];
    if (!ideaTypes.includes(payload.type) || !payload.name) return;
    const data = typeof payload.data === 'string' ? JSON.parse(payload.data) : (payload.data || {});
    try {
      const saved = await researchApi.saveIdea(tripId, {
        type: payload.type,
        name: payload.name,
        description: payload.description || data.description || '',
        data,
      });
      setSavedIdeas(prev => [...prev, saved]);
      await slotsApi.delete(payload.slotId);
      setDays(prev => prev.map(d =>
        d.id === payload.sourceDayId
          ? { ...d, slots: (d.slots || []).filter(s => s.id !== payload.slotId) }
          : d
      ));
    } catch (err) {
      console.error('Failed to move slot back to ideas:', err);
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
    <div className="h-screen bg-slate-900 flex flex-col overflow-hidden">
      {/* Header */}
      <TripHeader
        trip={trip}
        tripId={tripId}
        onBack={() => navigate('/')}
        onAddDay={handleAddDay}
        addingDay={addingDay}
        onOpenSettings={() => setShowSettings(true)}
        onShare={() => setShowShare(true)}
      />

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
        onClickIdea={setSelectedIdea}
        onSlotDrop={handleSlotToIdea}
        dragState={dragState}
      />

      {selectedIdea && trip && (() => {
        const idx = savedIdeas.findIndex(i => i.id === selectedIdea.id);
        return (
          <SuggestionDetailModal
            suggestion={selectedIdea}
            onClose={() => setSelectedIdea(null)}
            tripId={tripId}
            destination={trip.destination}
            ideaId={selectedIdea.id}
            currentIndex={idx}
            total={savedIdeas.length}
            hasPrev={idx > 0}
            hasNext={idx >= 0 && idx < savedIdeas.length - 1}
            onPrev={() => { if (idx > 0) setSelectedIdea(savedIdeas[idx - 1]); }}
            onNext={() => { if (idx >= 0 && idx < savedIdeas.length - 1) setSelectedIdea(savedIdeas[idx + 1]); }}
          />
        );
      })()}

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
          trip={trip}
          tripId={tripId}
          destination={trip.destination}
          onClose={() => setShowResearch(false)}
          onAddDay={handleAddDay}
          addingDay={addingDay}
          onOpenSettings={() => setShowSettings(true)}
          savedIdeas={savedIdeas}
          onIdeasChange={setSavedIdeas}
          mealPreferences={trip.mealPreferences}
          activityPreferences={trip.activityPreferences}
          tripContext={trip.researchContext}
        />
      )}

      {showSettings && trip && (
        <TripSettings
          trip={trip}
          onClose={() => setShowSettings(false)}
          onTripUpdated={(updated) => setTrip(prev => ({ ...prev, ...updated }))}
        />
      )}

      {showShare && (
        <ShareModal tripId={tripId} onClose={() => setShowShare(false)} />
      )}
    </div>
  );
}
