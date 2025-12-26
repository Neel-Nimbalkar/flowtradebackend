import React, { useEffect, useRef, useState } from 'react';
import StrategyResults from './StrategyResults';

const buildPriceBars = (historical) => {
  if (!historical) return [];
  const { timestamps = [], open = [], high = [], low = [], close = [], volume = [] } = historical;
  const out = [];
  for (let i = 0; i < timestamps.length; i++) {
    out.push({
      time: timestamps[i] || null,
      open: open[i] || null,
      high: high[i] || null,
      low: low[i] || null,
      close: close[i] || null,
      volume: volume[i] || null
    });
  }
  return out;
};

const sliceIndicatorData = (indicatorData = {}, idx) => {
  const out = {};
  Object.keys(indicatorData || {}).forEach(k => {
    const s = indicatorData[k] || [];
    out[k] = s.slice(0, idx + 1);
  });
  return out;
};

const PastDataViewer = ({
  historicalBars = null,
  signals = [],
  indicatorData = {},
  workflowResults = {},
  aiAnalysis = null,
  marketContext = {},
  latency = null,
  apiStatus = null
}) => {
  const priceBars = buildPriceBars(historicalBars);
  const maxIndex = Math.max(0, priceBars.length - 1);
  const [index, setIndex] = useState(maxIndex);
  const [playing, setPlaying] = useState(false);
  const [speedMs, setSpeedMs] = useState(400);
  const timerRef = useRef(null);

  useEffect(() => {
    setIndex(maxIndex);
  }, [historicalBars]);

  useEffect(() => {
    if (!playing) {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
      return;
    }
    // start playback
    timerRef.current = setInterval(() => {
      setIndex(i => Math.min(maxIndex, i + 1));
    }, speedMs);
    return () => { if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; } };
  }, [playing, speedMs, maxIndex]);

  const onPlayPause = () => { if (playing) setPlaying(false); else { if (index >= maxIndex) setIndex(0); setPlaying(true); } };
  const onStep = (dir) => { setPlaying(false); setIndex(i => Math.max(0, Math.min(maxIndex, i + dir))); };

  const displayedPriceBars = priceBars.slice(0, index + 1);
  const displayedSignals = (signals || []).filter(s => {
    try { const st = new Date(s.time || s.timestamp || s.t || s[0]).getTime(); const cur = new Date(displayedPriceBars[displayedPriceBars.length - 1]?.time || 0).getTime(); return st <= cur; } catch (e) { return false; }
  });
  const slicedIndicators = sliceIndicatorData(indicatorData, index);

  const latestBar = displayedPriceBars[displayedPriceBars.length - 1] || {};
  const latestData = {
    open: latestBar.open,
    high: latestBar.high,
    low: latestBar.low,
    close: latestBar.close,
    volume: latestBar.volume,
    price: latestBar.close
  };

  return (
    <div>
      <div className="sr-controls">
        <button onClick={() => onStep(-1)} title="Step Back">◀</button>
        <button onClick={onPlayPause} title="Play/Pause">{playing ? '⏸' : '▶'}</button>
        <button onClick={() => onStep(1)} title="Step Forward">▶</button>
        <span className="sr-controls-info">{displayedPriceBars.length ? new Date(displayedPriceBars[displayedPriceBars.length - 1].time).toLocaleString() : 'No Data'}</span>
        <input type="range" min={0} max={Math.max(0, maxIndex)} value={index} onChange={(e) => { setIndex(Number(e.target.value)); setPlaying(false); }} style={{ flex: 1, margin: '0 8px' }} />
        <select value={speedMs} onChange={(e) => setSpeedMs(Number(e.target.value))} title="Playback speed">
          <option value={1000}>1x</option>
          <option value={600}>1.5x</option>
          <option value={400}>2x</option>
          <option value={200}>4x</option>
        </select>
      </div>

      <StrategyResults
        priceBars={displayedPriceBars}
        signals={displayedSignals}
        indicatorData={slicedIndicators}
        workflowResults={{ ...workflowResults, latest_data: latestData }}
        aiAnalysis={aiAnalysis}
        marketContext={marketContext}
        latency={latency}
        apiStatus={apiStatus}
      />
    </div>
  );
};

export default PastDataViewer;
