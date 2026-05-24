import React, { useState } from 'react';
import { Compass, ChevronUp, ChevronDown, Lightbulb } from 'lucide-react';
import IdeaBubble from './IdeaBubble';

export default function ResearchBottomPanel({ ideas, onOpenResearch, onDeleteIdea, onClickIdea }) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div className="bg-slate-800 border-t border-slate-700 flex-shrink-0 transition-all duration-300">
      {/* Toggle bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between px-4 py-2 hover:bg-slate-750 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Lightbulb size={14} className="text-amber-400" />
          <span className="text-xs font-medium text-slate-300">Trip Ideas</span>
          {ideas.length > 0 && (
            <span className="text-[10px] bg-ocean-600/30 text-ocean-400 px-1.5 py-0.5 rounded-full font-medium">
              {ideas.length}
            </span>
          )}
        </div>
        {expanded ? <ChevronDown size={14} className="text-slate-500" /> : <ChevronUp size={14} className="text-slate-500" />}
      </button>

      {/* Expanded content */}
      {expanded && (
        <div className="flex items-stretch gap-4 px-4 pb-3 min-h-[80px]">
          {/* Research button */}
          <button
            onClick={onOpenResearch}
            className="flex-shrink-0 flex flex-col items-center justify-center gap-2 w-32 rounded-xl border-2 border-dashed border-slate-600 hover:border-ocean-500 text-slate-400 hover:text-ocean-400 transition-all hover:bg-slate-800/80"
          >
            <Compass size={20} />
            <span className="text-xs font-medium">Research my trip</span>
          </button>

          {/* Saved ideas scroll area */}
          <div className="flex-1 overflow-x-auto min-w-0">
            {ideas.length === 0 ? (
              <div className="flex items-center justify-center h-full text-xs text-slate-600">
                Save ideas from research to drag them into your days
              </div>
            ) : (
              <div className="flex gap-2 h-full items-start py-0.5">
                {ideas.map(idea => (
                  <IdeaBubble
                    key={idea.id}
                    idea={idea}
                    onDelete={onDeleteIdea}
                    onClickIdea={onClickIdea}
                  />
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
