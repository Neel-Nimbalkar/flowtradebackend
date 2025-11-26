import React, { useRef, useEffect } from 'react';

const PerformanceChart = ({ priceBars = [], signals = [] }) => {
  const ref = useRef(null);

  // Simple hypothetical PnL: assume each BUY enters 1 unit at price, SELL exits
  useEffect(() => {
    const canvas = ref.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); const w = canvas.clientWidth; const h = canvas.clientHeight; const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr); canvas.height = Math.floor(h * dpr); ctx.scale(dpr, dpr); ctx.clearRect(0,0,w,h);

    if (!priceBars || priceBars.length === 0) return;

    const closes = priceBars.map(p => p.close);
    // Build equity curve
    let equity = 0; let position = 0; const equityPoints = [];
    priceBars.forEach((p, i) => {
      const t = p.close;
      // check if there's a signal at this time
      const sig = signals && signals.find(s => Math.abs(new Date(s.time || s.timestamp || 0) - new Date(p.time || p.timestamp || 0)) < 60000);
      if (sig) {
        const s = (sig.signal || '').toLowerCase();
        if (s.includes('buy') && position === 0) { position = 1; equity -= t; }
        if (s.includes('sell') && position === 1) { position = 0; equity += t; }
      }
      const currentEquity = equity + (position === 1 ? p.close : 0);
      equityPoints.push(currentEquity);
    });

    const min = Math.min(...equityPoints); const max = Math.max(...equityPoints); const range = max - min || 1;
    ctx.strokeStyle = '#60f0b0'; ctx.lineWidth = 1.6; ctx.beginPath();
    equityPoints.forEach((v,i) => { const x = (i/(equityPoints.length-1||1))*w; const y = h - ((v-min)/range)*h; if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
    ctx.stroke();

    // Draw return summary
    const ret = ((equityPoints[equityPoints.length-1] - equityPoints[0]) / (Math.abs(equityPoints[0]) || 1)) * 100;
    ctx.fillStyle = '#cbd5e1'; ctx.font = '12px sans-serif'; ctx.fillText(`Return: ${ret.toFixed(2)}%`, 10, 16);

  }, [priceBars, signals]);

  return (
    <div className="sr-performance-wrapper">
      <canvas ref={ref} className="sr-canvas" style={{ width: '100%', height: 160 }} />
    </div>
  );
};

export default PerformanceChart;
