import React, { useEffect, useRef, useState } from 'react';
import { EquityPoint } from './types';
import { subscribe, getState } from './store';

interface Props {
  data?: EquityPoint[]; // Optional for live mode
  height?: number;
  className?: string;
}

export const StrategyChart: React.FC<Props> = ({ data, height = 220, className }: Props) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [hover, setHover] = useState<{ x: number; y: number; i: number } | null>(null);
  const [liveData, setLiveData] = useState(getState());

  useEffect(() => {
    const unsub = subscribe(() => {
      setLiveData(getState());
    });
    return unsub;
  }, []);

  // Use liveData if no props.data (live mode), else use props.data (backtest)
  const chartData = data && data.length ? data : liveData.priceData.map((d: any) => ({ time: d.timestamp, value: d.close }));

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    const dpr = window.devicePixelRatio || 1;
    const resize = () => {
      const w = container.clientWidth;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(height * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${height}px`;
      draw();
    };
    const ro = new (window as any).ResizeObserver(resize);
    ro.observe(container);
    resize();
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chartData, height]);

  const draw = () => {
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    // Professional dark background
    ctx.fillStyle = '#181A20';
    ctx.fillRect(0, 0, w, h);
    if (!chartData || chartData.length < 2) return;
    // Responsive padding
    const pad = { l: Math.max(48, w*0.07), r: Math.max(18, w*0.04), t: 24, b: 36 };
    const chartW = w - pad.l - pad.r;
    const chartH = h - pad.t - pad.b;
    const xs = chartData.map((d: any) => (typeof d.time === 'string' ? new Date(d.time).getTime() : (d.time as number)));
    const ys = chartData.map((d: any) => d.value);
    const xMin = xs[0];
    const xMax = xs[xs.length - 1];
    // Dynamic price scaling with padding
    const yMinRaw = Math.min(...ys);
    const yMaxRaw = Math.max(...ys);
    const yPad = (yMaxRaw-yMinRaw)*0.08 || 1;
    const yMin = yMinRaw - yPad;
    const yMax = yMaxRaw + yPad;
    // Smooth transitions (optional: animate scale)
    const xScale = (x: number) => pad.l + ((x - xMin) / (xMax - xMin || 1)) * chartW;
    const yScale = (y: number) => pad.t + (1 - (y - yMin) / (yMax - yMin || 1)) * chartH;

    // Subtle grid lines
    ctx.save();
    ctx.strokeStyle = 'rgba(60,65,80,0.18)';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = pad.t + (i / 4) * chartH;
      ctx.beginPath();
      ctx.moveTo(pad.l, y);
      ctx.lineTo(w - pad.r, y);
      ctx.stroke();
    }
    const xTicks = Math.min(6, Math.max(3, Math.floor(chartW/140)));
    for (let i=0;i<=xTicks;i++){
      const x = pad.l + (i/xTicks)*chartW;
      ctx.beginPath();
      ctx.moveTo(x, pad.t);
      ctx.lineTo(x, pad.t + chartH);
      ctx.stroke();
    }
    ctx.restore();

    // X-axis labels (auto-format)
    ctx.font = `${Math.max(10,Math.floor(w/80))}px monospace`;
    ctx.fillStyle = '#A1A6B2';
    ctx.textAlign = 'center';
    let lastLabelX = -Infinity;
    for (let i=0;i<=xTicks;i++){
      const t = xMin + (i/xTicks)*(xMax-xMin);
      const x = pad.l + (i/xTicks)*chartW;
      let label;
      if ((xMax-xMin)<1000*60*60*6) label = new Date(t).toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit'});
      else label = new Date(t).toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});
      if (x-lastLabelX > 40) { ctx.fillText(label, x, pad.t+chartH+22); lastLabelX = x; }
    }

    // Y-axis labels
    ctx.textAlign = 'right';
    for (let i=0;i<=4;i++){
      const val = yMin + (1-i/4)*(yMax-yMin);
      ctx.fillText(val.toFixed(2), pad.l-8, pad.t + (i/4)*chartH + 4);
    }

    // Price line (high-contrast)
    ctx.save();
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = Math.max(2,Math.floor(w/220));
    ctx.beginPath();
    xs.forEach((xv: number, i: number) => {
      const x = xScale(xv);
      const y = yScale(ys[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.stroke();
    ctx.restore();

    // Signal markers (BUY/SELL/HOLD)
    if (liveData.signals && liveData.signals.length) {
      liveData.signals.forEach(sig => {
        const idx = xs.findIndex(t => t === sig.timestamp);
        if (idx === -1) return;
        const x = xScale(xs[idx]);
        const y = yScale(ys[idx]);
        if (sig.type === 'BUY') {
          // Upward green triangle below price
          ctx.save();
          ctx.fillStyle = '#22c55e';
          ctx.beginPath();
          ctx.moveTo(x, y+12);
          ctx.lineTo(x-7, y+2);
          ctx.lineTo(x+7, y+2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else if (sig.type === 'SELL') {
          // Downward red triangle above price
          ctx.save();
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.moveTo(x, y-12);
          ctx.lineTo(x-7, y-2);
          ctx.lineTo(x+7, y-2);
          ctx.closePath();
          ctx.fill();
          ctx.restore();
        } else {
          // Neutral: small dot on line
          ctx.save();
          ctx.fillStyle = '#A1A6B2';
          ctx.beginPath();
          ctx.arc(x, y, 3, 0, Math.PI*2);
          ctx.fill();
          ctx.restore();
        }
      });
    }

    // Hover marker
    if (hover) {
      const i = hover.i;
      const x = xScale(xs[i]);
      const y = yScale(ys[i]);
      ctx.save();
      ctx.shadowColor = '#93c5fd';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#93c5fd';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  };

  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hover]);

  const onMove = (e: React.MouseEvent) => {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    if (!chartData || chartData.length < 2) return;
    // naive nearest by index based on x
    const width = rect.width;
    const i = Math.max(0, Math.min(chartData.length - 1, Math.round((x / width) * (chartData.length - 1))));
    setHover({ x, y, i });
  };

  return (
    <div ref={containerRef} className={className}>
      <canvas
        ref={canvasRef}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(null)}
        className="block w-full rounded-md border border-slate-700/50 bg-[#0f1419]"
        style={{ height: height }}
      />
      {hover && chartData[hover.i] && (
        <div className="mt-2 text-xs text-slate-300">
          <span className="text-slate-400">{new Date(chartData[hover.i].time).toLocaleString()}</span>
          <span className="mx-2">•</span>
          <span className="text-sky-300">{chartData[hover.i].value.toLocaleString()}</span>
        </div>
      )}
    </div>
  );
};
// end of StrategyChart component
