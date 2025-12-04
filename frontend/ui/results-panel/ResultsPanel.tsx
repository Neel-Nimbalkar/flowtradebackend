import React, { useEffect, useMemo, useRef, useState } from 'react';
import { PanelData, FinalSignal } from './types';
import { badgeBg, downloadJSON, formatMs, formatNumber, formatTs, signalColors } from './helpers';
import { TimelineItem } from './TimelineItem';
import { StrategyChart } from './StrategyChart';

interface Props {
  data: PanelData | null;
  isOpen: boolean;
  onClose?: () => void;
  onRerun?: () => void;
  onDownload?: () => void;
}

export const ResultsPanel: React.FC<Props> = ({ data, isOpen, onClose, onRerun, onDownload }: Props) => {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [showChart, setShowChart] = useState(true);

  // Slide-in behavior + scroll-to-top after each run
  useEffect(() => {
    if (isOpen && wrapRef.current) {
      wrapRef.current.scrollTop = 0;
    }
  }, [isOpen, data]);

  const statusBadge = useMemo(() => (data ? badgeBg(data.summary.status) : 'bg-slate-700/40'), [data]);
  const signalStyling = useMemo(() => (data ? signalColors(data.finalSignal) : signalColors('HOLD')), [data]);

  const handleDownload = () => {
    if (!data) return;
    if (onDownload) return onDownload();
    downloadJSON(`results-${Date.now()}.json`, data);
  };

  return (
    <aside
      className={`fixed right-0 top-0 z-[1000] h-screen w-[420px] transform bg-[#1e222d] shadow-[-2px_0_8px_rgba(0,0,0,0.3)] transition-transform duration-200 ${
        isOpen ? 'translate-x-0' : 'translate-x-full'
      } border-l border-[#2a2e39]`}
    >
      {/* Header */}
      <div className="bg-gradient-to-br from-[#161a22] to-[#10141b] border-b border-sky-400/15 p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-[15px] font-bold bg-gradient-to-r from-sky-400 to-violet-400 bg-clip-text text-transparent">
                {data?.summary.strategyName || 'Strategy Results'}
              </h3>
              {data && (
                <span className={`text-[11px] px-2 py-0.5 rounded-md border ${statusBadge}`}>{data.summary.status}</span>
              )}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {data ? formatTs(data.summary.completedAt) : '—'}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="rounded-lg shadow-sm border border-slate-600/30 px-3 py-1.5 text-xs text-slate-200 hover:border-sky-400/40 hover:text-white bg-gradient-to-br from-[#232634] to-[#1f2430]" onClick={onRerun}>Re-run</button>
            <button className="rounded-lg shadow-sm border border-slate-600/30 px-3 py-1.5 text-xs text-slate-200 hover:border-sky-400/40 hover:text-white bg-gradient-to-br from-[#232634] to-[#1f2430]" onClick={handleDownload}>Download</button>
            <button className="ml-1 h-9 w-9 rounded-full border border-slate-600/30 text-slate-200 hover:border-sky-400/40 flex items-center justify-center shadow-sm bg-[#1e222d]" onClick={onClose}>×</button>
          </div>
        </div>
        {/* Tabs placeholder could go here if needed */}
      </div>

      {/* Body */}
      <div ref={wrapRef} className="h-[calc(100vh-76px)] overflow-y-auto p-4">
        {/* Strategy Overview */}
        {data && (
          <details open className="rounded-lg border border-slate-700/40 bg-gradient-to-br from-slate-800/60 to-slate-900/60">
            <summary className="cursor-pointer list-none select-none px-3 py-2 text-[13px] font-semibold text-slate-200">
              Strategy Overview
            </summary>
            <div className="px-3 pb-3">
              <div className="grid grid-cols-2 gap-2 text-[13px] text-slate-300">
                <div className="rounded-md border border-slate-700/40 p-2"><div className="text-slate-400 text-[11px] uppercase">Symbol</div>{data.summary.symbol}</div>
                <div className="rounded-md border border-slate-700/40 p-2"><div className="text-slate-400 text-[11px] uppercase">Timeframe</div>{data.summary.timeframe}</div>
                <div className="rounded-md border border-slate-700/40 p-2"><div className="text-slate-400 text-[11px] uppercase">Lookback</div>{data.summary.lookbackDays}d</div>
                <div className="rounded-md border border-slate-700/40 p-2"><div className="text-slate-400 text-[11px] uppercase">Candles</div>{data.summary.candlesProcessed}</div>
                <div className="rounded-md border border-slate-700/40 p-2 col-span-2"><div className="text-slate-400 text-[11px] uppercase">Start</div>{formatTs(data.summary.startTimestamp)}</div>
                <div className="rounded-md border border-slate-700/40 p-2 col-span-2"><div className="text-slate-400 text-[11px] uppercase">End</div>{formatTs(data.summary.endTimestamp)}</div>
                <div className="rounded-md border border-slate-700/40 p-2"><div className="text-slate-400 text-[11px] uppercase">Runtime</div>{formatMs(data.summary.runtimeMs)}</div>
                <div className="rounded-md border border-slate-700/40 p-2"><div className="text-slate-400 text-[11px] uppercase">Blocks</div>{data.summary.workflowLength}</div>
              </div>
            </div>
          </details>
        )}

        {/* Timeline */}
        {data && (
          <div className="mt-4">
            <div className="mb-2 text-[13px] font-semibold text-slate-200">Execution Timeline</div>
            <div>
              {data.blocks.map((b, i) => (
                <TimelineItem key={b.id} item={b} index={i} />
              ))}
            </div>
          </div>
        )}

        {/* Final Decision */}
        {data && (
          <div className={`mt-4 rounded-lg border ${signalStyling.ring} bg-gradient-to-b ${signalStyling.bg} p-3`}>
            <div className="flex items-center gap-2">
              <div className={`text-sm font-bold ${signalStyling.text}`}>Final Decision</div>
              <div className="ml-auto text-xs text-slate-400">Confidence: {formatNumber(data.confidence ?? 0, 0)}%</div>
            </div>
            <div className={`mt-1 text-xl font-bold ${signalStyling.text}`}>{data.finalSignal as FinalSignal}</div>
            {data.aiAnalysis && (
              <div className="mt-2 max-h-40 overflow-auto rounded-md border border-slate-600/30 bg-slate-900/40 p-2 text-[13px] leading-relaxed text-slate-200">
                {data.aiAnalysis}
              </div>
            )}
          </div>
        )}

        {/* Graph */}
        {data && (
          <div className="mt-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[13px] font-semibold text-slate-200">Performance</div>
              <button
                className="text-xs text-slate-300 hover:text-white"
                onClick={() => setShowChart((s) => !s)}
              >{showChart ? 'Hide' : 'Show'} graph</button>
            </div>
            {showChart && (
              <StrategyChart data={data.equityCurve} height={220} />
            )}
          </div>
        )}

        {!data && (
          <div className="rounded-lg border border-slate-700/40 bg-slate-900/40 p-4 text-slate-300">
            Press Run Workflow to view results.
          </div>
        )}
      </div>
    </aside>
  );
};
