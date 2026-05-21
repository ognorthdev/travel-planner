import React from 'react';
import { Bot, User } from 'lucide-react';

export default function ChatMessage({ message }) {
  const isUser = message.role === 'user';

  return (
    <div className={`flex gap-3 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${
        isUser ? 'bg-ocean-600' : 'bg-slate-700'
      }`}>
        {isUser ? <User size={14} /> : <Bot size={14} />}
      </div>
      <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
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
    </div>
  );
}
