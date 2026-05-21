import React from 'react';
import { X, Coffee, Utensils, Moon, Sun, GripVertical } from 'lucide-react';

const TYPE_CONFIG = {
  BREAKFAST: { label: 'Breakfast', icon: Coffee, color: 'text-amber-400', bg: 'bg-amber-900/30', border: 'border-amber-700/50', dot: 'bg-amber-400' },
  LUNCH: { label: 'Lunch', icon: Utensils, color: 'text-green-400', bg: 'bg-green-900/30', border: 'border-green-700/50', dot: 'bg-green-400' },
  DINNER: { label: 'Dinner', icon: Moon, color: 'text-indigo-400', bg: 'bg-indigo-900/30', border: 'border-indigo-700/50', dot: 'bg-indigo-400' },
  ACTIVITY: { label: 'Activity', icon: Sun, color: 'text-teal-400', bg: 'bg-teal-900/30', border: 'border-teal-700/50', dot: 'bg-teal-400' },
};

export default function IdeaBubble({ idea, onDelete, isDragging }) {
  const config = TYPE_CONFIG[idea.type] || TYPE_CONFIG.ACTIVITY;
  const Icon = config.icon;

  const handleDragStart = (e) => {
    const payload = {
      source: 'research',
      type: idea.type,
      name: idea.name,
      description: idea.description,
      data: typeof idea.data === 'string' ? idea.data : JSON.stringify(idea.data || {}),
      ideaId: idea.id,
    };
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/json', JSON.stringify(payload));
  };

  return (
    <div
      draggable
      onDragStart={handleDragStart}
      className={`group flex-shrink-0 w-48 ${config.bg} border ${config.border} rounded-xl p-2.5 cursor-grab active:cursor-grabbing transition-all ${
        isDragging ? 'opacity-40 scale-95' : 'hover:brightness-110'
      }`}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <GripVertical size={12} className="text-slate-600 flex-shrink-0" />
        <div className={`w-2 h-2 rounded-full ${config.dot} flex-shrink-0`} />
        <span className={`text-[10px] font-medium ${config.color} truncate`}>{config.label}</span>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete?.(idea); }}
          className="ml-auto p-0.5 rounded opacity-0 group-hover:opacity-100 hover:bg-slate-700 text-slate-500 hover:text-red-400 transition-all"
        >
          <X size={12} />
        </button>
      </div>
      <p className="text-xs font-medium text-slate-200 truncate">{idea.name}</p>
      {idea.description && (
        <p className="text-[10px] text-slate-500 truncate mt-0.5">{idea.description}</p>
      )}
    </div>
  );
}
