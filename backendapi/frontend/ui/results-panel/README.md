# Results Panel (React + Tailwind)

This module provides a premium, right-side results panel for a trading workflow builder, featuring:
- Header with strategy name, timestamp, status badge, Re-run/Download
- Strategy Overview collapsible card
- Block-by-block execution timeline
- Final Strategy Decision card with optional AI analysis
- Minimal, polished single-line performance chart with tooltip

## Files
- `types.ts` – Strongly-typed data models for the panel
- `helpers.ts` – Formatters, color helpers, and a JSON downloader
- `StrategyChart.tsx` – Canvas-based, auto-resizing line chart
- `TimelineItem.tsx` – Timeline list item with expand/collapse raw details
- `ResultsPanel.tsx` – Main panel component with slide-in UX
- `example-response.json` – Sample backend payload for local testing

## Expected Backend Shape

```json
{
  "summary": {
    "strategyName": "Momentum Trend Breakout",
    "startedAt": "2025-11-15T14:31:02Z",
    "completedAt": "2025-11-15T14:31:03Z",
    "status": "completed",
    "symbol": "NVDA",
    "timeframe": "1Min",
    "lookbackDays": 5,
    "startTimestamp": "2025-11-10T14:31:02Z",
    "endTimestamp": "2025-11-15T14:31:02Z",
    "candlesProcessed": 1245,
    "runtimeMs": 812.5,
    "workflowLength": 7
  },
  "blocks": [
    {
      "id": 1,
      "type": "rsi",
      "emoji": "⚡",
      "name": "RSI",
      "status": "passed",
      "outputs": { "rsi": 28.4 },
      "explanation": "RSI is below 30 (oversold).",
      "executionTimeMs": 3.7
    }
  ],
  "finalSignal": "HOLD",
  "confidence": 62,
  "aiAnalysis": "…",
  "equityCurve": [
    { "time": "2025-11-15T14:00:00Z", "value": 100000 }
  ]
}
```

If you use the existing Flask backend in this repo, a v2 route is provided:
- `POST /execute_workflow_v2` returns the exact shape above.

## Usage (in React)

```tsx
import { ResultsPanel } from './ui/results-panel/ResultsPanel';
import type { PanelData } from './ui/results-panel/types';

function RightPanel({ open, data, onClose }: { open: boolean; data: PanelData | null; onClose: () => void }) {
  return (
    <ResultsPanel
      isOpen={open}
      data={data}
      onClose={onClose}
      onRerun={() => {/* trigger run */}}
      onDownload={() => {/* download report */}}
    />
  );
}
```

Tailwind classes are embedded directly in components; ensure Tailwind is configured in your app. The palette assumes a dark, blue-accent theme.

## Notes
- The chart is canvas-based and auto-resizes using `ResizeObserver`.
- Tooltip shows time/value on hover.
- Panel auto-scrolls to top after each run and persists until re-run.
- For live execution animations, render block items as they arrive, updating `blocks` in order.
