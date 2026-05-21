import React, { useState, useRef, useEffect } from 'react';
import { Send, Search, MessageCircle } from 'lucide-react';

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

  const isDeep = mode === 'deep';

  return (
    <div className="border-t border-slate-700 p-3">
      <div className="flex items-center gap-3 mb-2">
        <div
          className="relative flex items-center bg-slate-800 border border-slate-700 rounded-full p-0.5 cursor-pointer select-none"
          onClick={() => onModeChange(isDeep ? 'flash' : 'deep')}
        >
          <div
            className={`absolute top-0.5 bottom-0.5 rounded-full transition-all duration-200 ${
              isDeep ? 'left-0.5 w-[calc(50%)] bg-violet-500/25 border border-violet-500/40' : 'left-[50%] w-[calc(50%-2px)] bg-ocean-500/25 border border-ocean-500/40'
            }`}
          />
          <div className={`relative flex items-center gap-1 px-3 py-1 text-xs font-medium transition-colors z-10 ${
            isDeep ? 'text-violet-400' : 'text-slate-500'
          }`}>
            <Search size={11} />
            Research
          </div>
          <div className={`relative flex items-center gap-1 px-3 py-1 text-xs font-medium transition-colors z-10 ${
            !isDeep ? 'text-ocean-400' : 'text-slate-500'
          }`}>
            <MessageCircle size={11} />
            Questions
          </div>
        </div>
        {isDeep && (
          <span className="text-[10px] text-slate-500">Deep research — may take a few minutes</span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={isDeep ? 'Ask about places, food, activities...' : 'Follow up or ask a quick question...'}
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
