import React, { useState } from 'react';
import { Compass, Maximize2, Minimize2, Lightbulb } from 'lucide-react';
import IdeaBubble from './IdeaBubble';

// Approx height of one compact idea card + the vertical gap between rows.
const ROW_HEIGHT = 80;

export default function ResearchBottomPanel({ ideas, onOpenResearch, onDeleteIdea, onClickIdea, onSlotDrop, dragState }) {
  const [expanded, setExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const rows = expanded ? 4 : 1;
  const maxHeight = rows * ROW_HEIGHT;

  // Highlight only while a placed slot (not an idea) is being dragged.
  const slotDragging = dragState?.source === 'slot';

  const handleDragOver = (e) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (slotDragging && !dragOver) setDragOver(true);
  };
  const handleDragLeave = (e) => {
    if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false);
  };
  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    let payload;
    try { payload = JSON.parse(e.dataTransfer.getData('application/json')); } catch { return; }
    if (payload?.source === 'slot') onSlotDrop?.(payload);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`bg-slate-800 border-t flex-shrink-0 transition-colors ${
        dragOver ? 'border-ocean-500 bg-ocean-900/10' : 'border-slate-700'
      }`}
    >
      {/* Header bar */}
      <div className="w-full flex items-center justify-between px-4 py-2">
        <div className="flex items-center gap-2">
          <Lightbulb size={14} className="text-amber-400" />
          <span className="text-xs font-medium text-slate-300">Trip Ideas</span>
          {ideas.length > 0 && (
            <span className="text-[10px] bg-ocean-600/30 text-ocean-400 px-1.5 py-0.5 rounded-full font-medium">
              {ideas.length}
            </span>
          )}
          {slotDragging && (
            <span className="text-[11px] font-medium text-ocean-400 ml-1">Drop here to move back to ideas</span>
          )}
        </div>
        {ideas.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            title={expanded ? 'Shrink ideas to one row' : 'Expand ideas to show more'}
            className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[11px] font-medium text-slate-400 hover:text-ocean-400 hover:bg-slate-700 transition-colors"
          >
            {expanded ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
            {expanded ? 'Shrink' : 'Expand'}
          </button>
        )}
      </div>

      {/* Content */}
      <div className="flex items-start gap-4 px-4 pb-3">
        {/* Research button — fixed at one row height, pinned to the top */}
        <button
          onClick={onOpenResearch}
          style={{ height: ROW_HEIGHT - 8 }}
          className="flex-shrink-0 flex flex-col items-center justify-center gap-2 w-32 rounded-xl border-2 border-dashed border-slate-600 hover:border-ocean-500 text-slate-400 hover:text-ocean-400 transition-all hover:bg-slate-800/80"
        >
          <Compass size={20} />
          <span className="text-xs font-medium">Research my trip</span>
        </button>

        {/* Saved ideas — wrap into rows and grow downward (vertical scroll, never horizontal) */}
        <div
          className="flex-1 overflow-y-auto overflow-x-hidden min-w-0 transition-[max-height] duration-300"
          style={{ maxHeight }}
        >
          {ideas.length === 0 ? (
            <div className="flex items-center text-xs text-slate-600" style={{ height: ROW_HEIGHT - 8 }}>
              Save ideas from research to drag them into your days
            </div>
          ) : (
            <div className="flex flex-wrap gap-2 content-start pr-1">
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
    </div>
  );
}
