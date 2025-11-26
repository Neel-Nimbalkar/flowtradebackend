import React, { useRef, useEffect } from 'react';

const IndicatorChart = ({ indicatorData = {} }) => {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.clientWidth; const h = canvas.clientHeight; const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr); ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const keys = Object.keys(indicatorData);
    if (!keys.length) {
      ctx.fillStyle = '#94a3b8'; ctx.font = '12px sans-serif'; ctx.fillText('No indicators configured', 12, 20); return;
    }

    // Find longest series
    let length = 0; keys.forEach(k => { const s = indicatorData[k] || []; if (s.length > length) length = s.length; });
    if (length === 0) return;

    // For scaling, find min/max across all series
    let min = Infinity, max = -Infinity;
    keys.forEach(k => { (indicatorData[k] || []).forEach(v => { if (typeof v === 'number') { if (v < min) min = v; if (v > max) max = v; } }); });
    if (!isFinite(min)) { min = 0; max = 1; }
    const range = max - min || 1;

    const colors = ['#60a5fa', '#f59e0b', '#34d399', '#fb7185', '#c084fc'];
    keys.forEach((k, ki) => {
      const series = indicatorData[k] || [];
      ctx.beginPath(); ctx.strokeStyle = colors[ki % colors.length]; ctx.lineWidth = 1.2;
      series.forEach((v, i) => {
        if (typeof v !== 'number') return;
        const x = (i / (length - 1 || 1)) * w; const y = h - ((v - min) / range) * h;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

  }, [indicatorData]);

  return (
    <div className="sr-indicator-wrapper">
      <canvas ref={ref} className="sr-canvas" style={{ width: '100%', height: 140 }} />
    </div>
  );
};

export default IndicatorChart;
