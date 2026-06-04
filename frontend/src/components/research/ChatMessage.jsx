import React, { useState } from 'react';
import { Bot, User, Sparkles, Loader2 } from 'lucide-react';

export default function ChatMessage({ message, onReextract }) {
  const isUser = message.role === 'user';
  const [reextracting, setReextracting] = useState(false);

  const canReextract = !isUser && !message.streaming && !message.isError && !!message.content?.trim();

  const handleReextract = async () => {
    if (reextracting) return;
    setReextracting(true);
    try {
      await onReextract?.(message);
    } finally {
      setReextracting(false);
    }
  };

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-ocean-600' : 'bg-slate-700'
      }`}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className="group relative max-w-[80%]">
        <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          message.isError
            ? 'bg-red-900/30 border border-red-800/50 text-red-300 rounded-bl-md'
            : isUser
              ? 'bg-ocean-600 text-white rounded-br-md'
              : 'bg-slate-800 border border-slate-700 text-slate-200 rounded-bl-md'
        }`}>
          <div className="whitespace-pre-wrap break-words">{message.content}</div>
          {message.streaming && (
            <span className="inline-block w-1.5 h-4 bg-ocean-400 animate-pulse ml-0.5 align-text-bottom rounded-sm" />
          )}
        </div>
        {canReextract && (
          <button
            onClick={handleReextract}
            disabled={reextracting}
            title="Re-extract ideas from this message"
            className="absolute -bottom-2.5 right-2 flex items-center gap-1 px-2 py-1 rounded-full bg-slate-700 border border-slate-600 text-[10px] font-medium text-amber-400 shadow-lg transition-opacity hover:bg-slate-600 hover:border-amber-500/50 disabled:cursor-default opacity-0 group-hover:opacity-100 focus:opacity-100 disabled:opacity-100"
          >
            {reextracting ? <Loader2 size={11} className="animate-spin" /> : <Sparkles size={11} />}
            {reextracting ? 'Extracting…' : 'Re-extract'}
          </button>
        )}
      </div>
    </div>
  );
}
