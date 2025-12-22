import React, { useRef, useEffect, useState } from 'react';
import LineChart from '../StrategyMonitor/LineChart';

const PriceChart = ({ priceBars = [], signals = [], verticalBias = 0.12 }) => {
  const wrapRef = useRef(null);
  const [height, setHeight] = useState(180);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => {
      try { setHeight(Math.max(80, Math.round(el.getBoundingClientRect().height))); } catch (e) {}
    }) : null;
    try { setHeight(Math.max(80, Math.round(el.getBoundingClientRect().height))); } catch (e) {}
    if (ro) ro.observe(el);
    return () => { try { if (ro) ro.disconnect(); } catch (e) {} };
  }, []);

  // map priceBars -> LineChart data shape: { t, v }
  const data = (priceBars || []).map((p) => {
    const t = p.time || p.timestamp || p.t || null;
    const tms = t != null ? (typeof t === 'number' ? t : Date.parse(String(t))) : null;
    return { t: Number.isFinite(tms) ? tms : null, v: (p.close != null ? Number(p.close) : NaN) };
  }).filter(it => Number.isFinite(it.v));

  return (
    <div ref={wrapRef} className="sr-chart-wrapper" style={{ height: '100%', width: '100%', overflow: 'hidden' }}>
      <LineChart data={data} height={height} stroke="#5e8cff" fill={true} showXAxis={false} />
    </div>
  );
};

export default PriceChart;
