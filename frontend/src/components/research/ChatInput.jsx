import React, { useState, useRef, useEffect } from 'react';
import { Send, Globe, Map, MessageCircle } from 'lucide-react';

const MODES = [
  { key: 'web', label: 'Web Research', icon: Globe, activeClass: 'text-violet-400 bg-violet-500/20 border border-violet-500/40' },
  { key: 'maps', label: 'Maps Research', icon: Map, activeClass: 'text-emerald-400 bg-emerald-500/20 border border-emerald-500/40' },
  { key: 'flash', label: 'Questions', icon: MessageCircle, activeClass: 'text-ocean-400 bg-ocean-500/20 border border-ocean-500/40' },
];

export default function ChatInput({ onSend, disabled, mode, onModeChange }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);

  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = Math.min(textareaRef.current.scrollHeight, 120) + 'px';
    }
  }, [text]);

  const handleSubmit = () => {
    const trimmed = text.trim();
    if (!trimmed || disabled) return;
    onSend(trimmed);
    setText('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-slate-700 p-3">
      <div className="flex items-center gap-2 mb-2">
        <div className="flex items-center bg-slate-800 border border-slate-700 rounded-full p-0.5 gap-0.5">
          {MODES.map((m) => {
            const Icon = m.icon;
            const isActive = mode === m.key;
            return (
              <button
                key={m.key}
                type="button"
                onClick={() => onModeChange(m.key)}
                className={`flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium transition-all rounded-full ${
                  isActive ? m.activeClass : 'text-slate-500 hover:text-slate-400 border border-transparent'
                }`}
              >
                <Icon size={11} />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            mode === 'web' ? 'Research with live web search...' :
            mode === 'maps' ? 'Find places, routes, neighborhoods...' :
            'Ask a quick question...'
          }
          disabled={disabled}
          rows={1}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 resize-none focus:outline-none focus:border-ocean-500 focus:ring-1 focus:ring-ocean-500/30 disabled:opacity-50"
        />
        <button
          onClick={handleSubmit}
          disabled={!text.trim() || disabled}
          className="flex-shrink-0 w-10 h-10 rounded-xl bg-ocean-600 hover:bg-ocean-500 text-white flex items-center justify-center transition-colors disabled:opacity-40 disabled:hover:bg-ocean-600"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
