import React, { useState, useCallback, useRef } from 'react';
import { ArrowLeft, MapPin } from 'lucide-react';
import ResearchChat from './ResearchChat';
import SuggestionPanel from './SuggestionPanel';
import SuggestionDetailModal from './SuggestionDetailModal';
import { researchApi } from '../../api/index.js';

export default function ResearchOverlay({ tripId, destination, onClose, savedIdeas, onIdeasChange, mealPreferences, activityPreferences }) {
  const [suggestions, setSuggestions] = useState([]);
  const [savedNames, setSavedNames] = useState(
    () => new Set(savedIdeas.map(i => i.name))
  );
  const [detailSuggestion, setDetailSuggestion] = useState(null);
  // Enrichment fetched by suggestion cards, keyed by suggestion id, so it can be saved
  // onto the idea (persisted in the DB) instead of being re-fetched from Places later.
  const enrichmentMap = useRef(new Map());

  const handleSuggestion = useCallback((suggestion) => {
    const id = `${suggestion.name}-${Date.now()}`;
    setSuggestions(prev => [...prev, { ...suggestion, id }]);
  }, []);

  const handleEnriched = useCallback((suggestion, enriched) => {
    if (suggestion?.id && enriched) enrichmentMap.current.set(suggestion.id, enriched);
  }, []);

  const handleRemoveSuggestion = useCallback((suggestion) => {
    setSuggestions(prev => prev.filter(s => s.id !== suggestion.id));
  }, []);

  const handleToggleSave = useCallback(async (suggestion) => {
    const isCurrentlySaved = savedNames.has(suggestion.name);

    if (isCurrentlySaved) {
      const existing = savedIdeas.find(i => i.name === suggestion.name);
      if (existing) {
        await researchApi.deleteIdea(existing.id);
        onIdeasChange(prev => prev.filter(i => i.id !== existing.id));
      }
      setSavedNames(prev => {
        const next = new Set(prev);
        next.delete(suggestion.name);
        return next;
      });
    } else {
      const enrichment = enrichmentMap.current.get(suggestion.id);
      const saved = await researchApi.saveIdea(tripId, {
        type: suggestion.type,
        name: suggestion.name,
        description: suggestion.description || '',
        // Persist the already-fetched enrichment onto the idea so it's never re-billed.
        data: { ...(suggestion.data || {}), ...(enrichment ? { enrichment } : {}) },
      });
      onIdeasChange(prev => [...prev, saved]);
      setSavedNames(prev => new Set([...prev, suggestion.name]));
    }
  }, [savedNames, savedIdeas, tripId, onIdeasChange]);

  const handleClose = async () => {
    const getMessages = ResearchChat._getMessagesRef;
    if (getMessages) {
      const messages = getMessages();
      const realMessages = messages.filter(m => m.id !== 'summary' && m.content.trim());
      if (realMessages.length >= 2) {
        try {
          const conversationText = realMessages
            .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
            .join('\n\n');
          const summaryText = conversationText.length > 4000
            ? conversationText.slice(0, 4000) + '...'
            : conversationText;
          await researchApi.saveSummary(tripId, summaryText);
        } catch (e) {
          console.error('Failed to save chat summary:', e);
        }
      }
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900 flex flex-col">
      {/* Header */}
      <div className="flex items-center gap-4 px-4 py-3 border-b border-slate-700 bg-slate-800">
        <button
          onClick={handleClose}
          className="p-2 rounded-full hover:bg-slate-700 text-slate-400 hover:text-slate-200 transition-colors"
        >
          <ArrowLeft size={20} />
        </button>
        <div className="flex items-center gap-3">
          <span className="text-lg">🧭</span>
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Research your trip</h2>
            <div className="flex items-center gap-1 text-xs text-slate-400">
              <MapPin size={10} className="text-teal-400" />
              {destination}
            </div>
          </div>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Chat */}
        <div className="flex-[3] border-r border-slate-700 flex flex-col min-w-0">
          <ResearchChat
            tripId={tripId}
            destination={destination}
            onSuggestion={handleSuggestion}
            mealPreferences={mealPreferences}
            activityPreferences={activityPreferences}
          />
        </div>

        {/* Right: Suggestions */}
        <div className="flex-[2] flex flex-col min-w-0">
          <SuggestionPanel
            suggestions={suggestions}
            savedIds={savedNames}
            onToggleSave={handleToggleSave}
            onRemove={handleRemoveSuggestion}
            onEnriched={handleEnriched}
            onBubbleClick={setDetailSuggestion}
            tripId={tripId}
            destination={destination}
          />
        </div>
      </div>

      {detailSuggestion && (
        <SuggestionDetailModal
          suggestion={detailSuggestion}
          onClose={() => setDetailSuggestion(null)}
          tripId={tripId}
          destination={destination}
        />
      )}
    </div>
  );
}
