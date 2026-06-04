import React from 'react';
import { Lightbulb } from 'lucide-react';
import SuggestionBubble from './SuggestionBubble';

export default function SuggestionPanel({ suggestions, savedIds, onToggleSave, onRemove, onEnriched, onBubbleClick, tripId, destination }) {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-700">
        <Lightbulb size={16} className="text-amber-400" />
        <h3 className="text-sm font-semibold text-slate-200">Ideas</h3>
        {suggestions.length > 0 && (
          <span className="text-xs bg-slate-700 text-slate-400 px-2 py-0.5 rounded-full">
            {suggestions.length}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {suggestions.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center px-4">
            <Lightbulb size={32} className="text-slate-700 mb-3" />
            <p className="text-sm text-slate-500">Ideas will appear here as the AI suggests activities and restaurants</p>
          </div>
        ) : (
          suggestions.map((suggestion, i) => (
            <SuggestionBubble
              key={suggestion.id || `${suggestion.name}-${i}`}
              suggestion={suggestion}
              isSaved={savedIds.has(suggestion.name)}
              onToggleSave={onToggleSave}
              onRemove={onRemove}
              onEnriched={onEnriched}
              onClick={onBubbleClick}
              style={{ animationDelay: `${Math.min(i * 100, 500)}ms` }}
              tripId={tripId}
              destination={destination}
            />
          ))
        )}
      </div>
    </div>
  );
}
