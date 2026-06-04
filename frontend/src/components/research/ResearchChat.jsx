import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Loader2 } from 'lucide-react';
import ChatMessage from './ChatMessage';
import ChatInput from './ChatInput';
import { researchApi, streamResearch } from '../../api/index.js';

export default function ResearchChat({ tripId, destination, onSuggestion, mealPreferences, activityPreferences }) {
  const [messages, setMessages] = useState([]);
  const [mode, setMode] = useState('flash');
  const [streaming, setStreaming] = useState(false);
  const [status, setStatus] = useState(null);
  const [elapsed, setElapsed] = useState(0);
  const [summaryLoaded, setSummaryLoaded] = useState(false);
  const messagesEndRef = useRef(null);
  const abortRef = useRef(null);

  useEffect(() => {
    if (summaryLoaded) return;
    setSummaryLoaded(true);
    researchApi.getSummary(tripId).then(summary => {
      if (summary?.summary) {
        setMessages([{
          id: 'summary',
          role: 'assistant',
          content: `Here's what we discussed last time:\n\n${summary.summary}`,
        }]);
      }
    }).catch(() => {});
  }, [tripId, summaryLoaded]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSend = useCallback(async (text) => {
    if (streaming) return;

    const userMsg = { id: Date.now().toString(), role: 'user', content: text };
    const assistantMsg = { id: (Date.now() + 1).toString(), role: 'assistant', content: '', streaming: true };

    setMessages(prev => [...prev, userMsg, assistantMsg]);
    setStreaming(true);
    setStatus(null);
    setElapsed(0);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const chatHistory = messages
        .filter(m => m.id !== 'summary')
        .map(m => ({ role: m.role, content: m.content }));

      const eventStream = streamResearch(tripId, {
        query: text,
        mode,
        messages: chatHistory,
        destination,
        mealPreferences,
        activityPreferences,
        signal: controller.signal,
      });

      for await (const { event, data } of eventStream) {
        if (controller.signal.aborted) break;

        if (event === 'text') {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === 'assistant') {
              updated[updated.length - 1] = { ...last, content: last.content + data.content };
            }
            return updated;
          });
        } else if (event === 'suggestion') {
          onSuggestion?.(data);
        } else if (event === 'status') {
          setStatus(data.phase);
          if (data.elapsed != null) setElapsed(data.elapsed);
        } else if (event === 'error') {
          setMessages(prev => {
            const updated = [...prev];
            const last = updated[updated.length - 1];
            if (last.role === 'assistant') {
              updated[updated.length - 1] = {
                ...last,
                content: last.content ? last.content : data.message,
                streaming: false,
                isError: !last.content,
              };
            }
            return updated;
          });
        }
      }
    } catch (err) {
      if (err.name !== 'AbortError') {
        setMessages(prev => {
          const updated = [...prev];
          const last = updated[updated.length - 1];
          if (last.role === 'assistant') {
            updated[updated.length - 1] = {
              ...last,
              content: last.content || `Something went wrong: ${err.message}`,
              streaming: false,
            };
          }
          return updated;
        });
      }
    }

    setMessages(prev => {
      const updated = [...prev];
      const last = updated[updated.length - 1];
      if (last.role === 'assistant') {
        updated[updated.length - 1] = { ...last, streaming: false };
      }
      return updated;
    });
    setStreaming(false);
    setStatus(null);
    abortRef.current = null;
  }, [streaming, messages, mode, tripId, destination, onSuggestion]);

  const handleReextract = useCallback(async (message) => {
    if (!message?.content?.trim()) return;
    try {
      const result = await researchApi.extract(tripId, message.content, destination);
      (result?.suggestions || []).forEach(s => onSuggestion?.(s));
    } catch (err) {
      console.error('Re-extract failed:', err);
    }
  }, [tripId, destination, onSuggestion]);

  const getMessages = useCallback(() => messages, [messages]);

  useEffect(() => {
    const ref = ResearchChat._getMessagesRef;
    ResearchChat._getMessagesRef = getMessages;
    return () => { if (ResearchChat._getMessagesRef === getMessages) ResearchChat._getMessagesRef = ref; };
  }, [getMessages]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center px-6">
            <div className="text-4xl mb-3">🧭</div>
            <h3 className="text-lg font-semibold text-slate-200 mb-2">Research your trip</h3>
            <p className="text-sm text-slate-400 max-w-md">
              Plan your trip to {destination}.
              Use <span className="text-violet-400">Web Research</span> to discover new activity/meal ideas,{' '}
              <span className="text-emerald-400">Maps Research</span> to lookup places you know,{' '}
              or <span className="text-ocean-400">Questions</span> to ask questions about your trip.
            </p>
          </div>
        )}
        {messages.map(msg => (
          <ChatMessage key={msg.id} message={msg} onReextract={handleReextract} />
        ))}
        {streaming && status === 'researching' && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-violet-400">
            <Loader2 size={12} className="animate-spin" />
            {mode === 'web' ? 'Searching the web...' : mode === 'maps' ? 'Searching maps...' : 'Thinking...'}
          </div>
        )}
        {streaming && status === 'retrying' && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-amber-400">
            <Loader2 size={12} className="animate-spin" />
            High demand — retrying...
          </div>
        )}
        {streaming && status === 'extracting' && (
          <div className="flex items-center gap-2 px-4 py-2 text-xs text-amber-400">
            <Loader2 size={12} className="animate-spin" />
            Extracting ideas from the research...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>
      <ChatInput
        onSend={handleSend}
        disabled={streaming}
        mode={mode}
        onModeChange={setMode}
      />
    </div>
  );
}

ResearchChat._getMessagesRef = null;
