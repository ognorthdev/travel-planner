import React, { useState, useRef, useEffect, useMemo } from 'react';
import { Clock, X, Check } from 'lucide-react';
import { formatTime12 } from '../utils/time.js';

// A themed 12-hour time selector. Stores/returns 24h "HH:MM" for compatibility with the
// rest of the app, but displays and lists options as 12h AM/PM. Replaces the native
// <input type="time">, whose appearance is browser-controlled and clashes with dark mode.
const BASE_OPTIONS = (() => {
  const out = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      out.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
    }
  }
  return out;
})();

export default function TimePicker({ value, onChange, placeholder = 'Select time', className = '' }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const listRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  // Scroll the selected option into view when the dropdown opens.
  useEffect(() => {
    if (open && listRef.current) {
      const sel = listRef.current.querySelector('[data-selected="true"]');
      if (sel) sel.scrollIntoView({ block: 'center' });
    }
  }, [open]);

  // Include the current value even if it isn't on the 15-minute grid (e.g. legacy data).
  const options = useMemo(() => {
    if (value && !BASE_OPTIONS.includes(value)) {
      return [...BASE_OPTIONS, value].sort();
    }
    return BASE_OPTIONS;
  }, [value]);

  const display = formatTime12(value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <div
        onClick={() => setOpen(o => !o)}
        className="input w-full flex items-center justify-between cursor-pointer select-none"
      >
        <span className="flex items-center gap-2 min-w-0">
          <Clock size={14} className="text-slate-400 flex-shrink-0" />
          <span className={display ? 'text-slate-200' : 'text-slate-500'}>
            {display || placeholder}
          </span>
        </span>
        {value && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(''); }}
            className="text-slate-500 hover:text-slate-300 flex-shrink-0"
            title="Clear time"
          >
            <X size={14} />
          </button>
        )}
      </div>
      {open && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full max-h-60 overflow-y-auto bg-slate-800 border border-slate-600 rounded-xl shadow-xl py-1"
        >
          {options.map(opt => {
            const selected = opt === value;
            return (
              <button
                key={opt}
                type="button"
                data-selected={selected}
                onClick={() => { onChange(opt); setOpen(false); }}
                className={`w-full text-left px-3 py-1.5 text-sm flex items-center justify-between transition-colors ${
                  selected ? 'bg-ocean-600/30 text-ocean-300' : 'text-slate-300 hover:bg-slate-700'
                }`}
              >
                {formatTime12(opt)}
                {selected && <Check size={13} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
