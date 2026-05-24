import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { DollarSign } from 'lucide-react';
import { costsApi } from '../api/index.js';

const SERVICE_LABELS = {
  'claude-opus': 'Claude Opus',
  'claude-sonnet': 'Claude Sonnet',
  'claude': 'Claude Sonnet',
  'gemini-flash': 'Gemini Flash',
  'gemini': 'Gemini Flash',
  'gemini-ai': 'Gemini Flash',
  'google-places': 'Google Places',
};

function formatCost(cents) {
  if (cents < 1) return `<$0.01`;
  return `$${(cents / 100).toFixed(2)}`;
}

function CostTooltip({ anchor, children }) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPos({ top: rect.bottom + 8, right: window.innerWidth - rect.right });
  }, [anchor]);

  if (!pos) return null;

  return createPortal(
    <div
      className="fixed z-[9999]"
      style={{ top: pos.top, right: pos.right }}
    >
      {children}
    </div>,
    document.body
  );
}

function InlineCostTooltip({ anchor, children }) {
  const [pos, setPos] = useState(null);

  useEffect(() => {
    if (!anchor) return;
    const rect = anchor.getBoundingClientRect();
    setPos({ bottom: window.innerHeight - rect.top + 8, right: window.innerWidth - rect.right });
  }, [anchor]);

  if (!pos) return null;

  return createPortal(
    <div
      className="fixed z-[9999]"
      style={{ bottom: pos.bottom, right: pos.right }}
    >
      {children}
    </div>,
    document.body
  );
}

export default function CostBadge({ tripId }) {
  const [costs, setCosts] = useState(null);
  const [hovered, setHovered] = useState(false);
  const ref = useRef(null);

  const fetchCosts = useCallback(async () => {
    if (!tripId) return;
    try {
      const data = await costsApi.getByTrip(tripId);
      setCosts(data);
    } catch {
      // silently fail
    }
  }, [tripId]);

  useEffect(() => {
    fetchCosts();
    const handler = () => fetchCosts();
    window.addEventListener('cost-updated', handler);
    return () => window.removeEventListener('cost-updated', handler);
  }, [fetchCosts]);

  if (!costs || costs.totalCents === 0) return null;

  return (
    <div
      ref={ref}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-full px-3 py-1.5 cursor-default transition-colors">
        <DollarSign size={13} className="text-emerald-400" />
        <span className="text-xs font-semibold text-slate-200">
          {formatCost(costs.totalCents)}
        </span>
      </div>

      {hovered && (
        <CostTooltip anchor={ref.current}>
          <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl p-4 min-w-[220px]">
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide mb-3">
              API Cost Breakdown
            </p>
            <div className="space-y-2">
              {costs.breakdown.map((item) => (
                <div key={item.service} className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      item.service === 'claude-opus' ? 'bg-violet-400' :
                      ['claude-sonnet', 'claude'].includes(item.service) ? 'bg-purple-400' :
                      ['gemini-flash', 'gemini', 'gemini-ai'].includes(item.service) ? 'bg-blue-400' :
                      'bg-emerald-400'
                    }`} />
                    <span className="text-sm text-slate-300 truncate">
                      {SERVICE_LABELS[item.service] || item.service}
                    </span>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <span className="text-sm font-semibold text-slate-200">
                      {formatCost(item.costCents)}
                    </span>
                    <span className="text-xs text-slate-500 ml-1.5">
                      ({item.callCount})
                    </span>
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-3 pt-3 border-t border-slate-700 flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-400">Total</span>
              <span className="text-sm font-bold text-emerald-400">
                {formatCost(costs.totalCents)}
              </span>
            </div>
          </div>
        </CostTooltip>
      )}
    </div>
  );
}

export function InlineCost({ totalCostCents, costByService }) {
  const [hovered, setHovered] = useState(false);
  const ref = useRef(null);

  if (!totalCostCents || totalCostCents === 0) return null;

  const hasBreakdown = costByService && Object.keys(costByService).length > 0;

  return (
    <div
      ref={ref}
      className="inline-flex"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <span className="flex items-center gap-1 text-xs text-emerald-400 font-semibold">
        <DollarSign size={11} />
        {formatCost(totalCostCents)}
      </span>

      {hovered && hasBreakdown && (
        <InlineCostTooltip anchor={ref.current}>
          <div className="bg-slate-800 border border-slate-600 rounded-lg shadow-2xl p-3 min-w-[180px]">
            <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-2">
              API Costs
            </p>
            <div className="space-y-1.5">
              {Object.entries(costByService).sort((a, b) => b[1] - a[1]).map(([service, cents]) => (
                <div key={service} className="flex items-center justify-between gap-3">
                  <span className="text-xs text-slate-300">
                    {SERVICE_LABELS[service] || service}
                  </span>
                  <span className="text-xs font-semibold text-slate-200">
                    {formatCost(cents)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </InlineCostTooltip>
      )}
    </div>
  );
}
