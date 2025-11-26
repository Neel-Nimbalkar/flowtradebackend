import React, { useState } from 'react';
import { BlockResultItem } from './types';
import { formatMs, statusColor } from './helpers';

interface Props {
  item: BlockResultItem;
  index: number;
}

export const TimelineItem: React.FC<Props> = ({ item, index }) => {
  const [open, setOpen] = useState(false);
  const color = statusColor(item.status);

  return (
    <div className="relative pl-6">
      {/* connector */}
      <div className="absolute left-0 top-0 bottom-0 w-px bg-slate-700/40" />

      {/* bullet */}
      <div className={`absolute -left-1 top-1 h-2.5 w-2.5 rounded-full border ${color} bg-slate-900`} />

      <div className="mb-3 rounded-md border border-slate-700/40 bg-gradient-to-br from-slate-800/60 to-slate-900/60 p-3">
        <div className="flex items-center gap-2">
          <div className="text-base leading-none">{item.emoji}</div>
          <div className="font-semibold text-slate-200 text-sm">{index + 1}. {item.name}</div>
          <div className="ml-auto text-xs rounded-md px-2 py-0.5 border border-slate-700/40 text-slate-400">
            {formatMs(item.executionTimeMs)}
          </div>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
          <span className={`rounded-md border px-2 py-0.5 ${color} uppercase tracking-wide`}>{item.status}</span>
          {item.outputs && (
            <div className="text-slate-300">
              {Object.entries(item.outputs).slice(0, 4).map(([k, v]) => (
                <span key={k} className="mr-3"><span className="text-slate-400">{k}</span>=<span className="text-sky-300">{String(v)}</span></span>
              ))}
            </div>
          )}
        </div>
        {(item.explanation || item.failReason) && (
          <div className="mt-2 text-[13px] leading-relaxed text-slate-300">
            {item.explanation && <p>{item.explanation}</p>}
            {item.failReason && <p className="text-rose-300">{item.failReason}</p>}
          </div>
        )}
        {item.raw && (
          <button
            className="mt-2 text-xs text-sky-300 hover:text-sky-200"
            onClick={() => setOpen((s) => !s)}
          >{open ? 'Hide details' : 'Show details'}</button>
        )}
        {open && item.raw && (
          <pre className="mt-2 max-h-48 overflow-auto rounded bg-slate-950/70 p-3 text-xs text-slate-300 border border-slate-700/40">
            {JSON.stringify(item.raw, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
};
