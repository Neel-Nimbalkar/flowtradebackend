import React, { useRef, useEffect } from 'react';

const PriceChart = ({ priceBars = [], signals = [] }) => {
  const ref = useRef(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    if (!priceBars || priceBars.length === 0) return;

    const closes = priceBars.map(p => p.close);
    const min = Math.min(...closes); const max = Math.max(...closes); const range = max - min || 1;

    // draw line
    ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 1.6; ctx.beginPath();
    priceBars.forEach((p, i) => {
      const x = (i / (priceBars.length - 1 || 1)) * w;
      const y = h - ((p.close - min) / range) * h;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Draw markers for signals
    signals && signals.forEach(sig => {
      const idx = priceBars.findIndex(pb => Math.abs(new Date(pb.time || pb.timestamp || pb.t || 0) - new Date(sig.time || sig.timestamp || 0)) < 60000);
      if (idx >= 0) {
        const p = priceBars[idx];
        const x = (idx / (priceBars.length - 1 || 1)) * w;
        const y = h - ((p.close - min) / range) * h;
        ctx.beginPath();
        if ((sig.signal || '').toLowerCase().includes('buy')) ctx.fillStyle = '#10b981';
        else if ((sig.signal || '').toLowerCase().includes('sell')) ctx.fillStyle = '#ef4444';
        else ctx.fillStyle = '#9ca3af';
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }, [priceBars, signals]);

  return (
    <div className="sr-chart-wrapper">
      <canvas ref={ref} className="sr-canvas" style={{ width: '100%', height: 240 }} />
    </div>
  );
};

export default PriceChart;
