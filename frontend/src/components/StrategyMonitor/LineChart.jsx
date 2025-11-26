import React, { useRef, useEffect, useState } from 'react';

// Lightweight canvas line chart. Expects `data` as array of numbers or objects with `v`.
// Adds a small pulsating marker on the latest point when new data arrives to visually
// indicate incoming updates without heavy animation work.
const LineChart = ({ data = [], height = 140, stroke = '#5e8cff', fill = true, grid = true, highlightNew = true, showXAxis = false }) => {
  const ref = useRef(null);
  const prevLastRef = useRef(null);
  const animRef = useRef(null);
  const [pulse, setPulse] = useState(0); // 0..1
  const [hover, setHover] = useState(null); // { clientX, clientY, p }
  const containerRef = useRef(null);
  const pointsRef = useRef([]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const container = containerRef.current;
    // Observe container size changes to trigger redraw
    let ro;
    try {
      const parent = canvas.parentElement;
      if (parent && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => {
          // trigger effect by resizing canvas bounding rect read
          try {
            const rect = canvas.getBoundingClientRect();
            // noop - reading rect ensures effect re-runs when DOM changes
          } catch (e) {}
        });
        ro.observe(parent);
      }
    } catch (e) {}
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, height);

    // Normalize incoming data. Accept:
    // - array of numbers
    // - array of objects with numeric field (`v`, `value`, `y`, `close`, `price`)
    // - array of objects with `{ time: <iso|ms>, value: <number> }` or `{ t: <...>, v: <...> }`
    // If timestamps are present, map x positions by timestamps; otherwise fall back to index spacing.
    const parseNum = (raw) => {
      if (raw == null) return NaN;
      if (typeof raw === 'number') return raw;
      try {
        let s = String(raw).trim();
        s = s.replace(/\$/g, '').replace(/,/g, '');
        return parseFloat(s);
      } catch (e) {
        return NaN;
      }
    };

    // produce items: { t: timestamp|null, v: numeric }
    const items = (data || []).map((x, idx) => {
      if (x == null) return { t: null, v: NaN };
      if (typeof x === 'number' || typeof x === 'string') {
        return { t: null, v: parseNum(x) };
      }
      // object
      const timeCandidate = x.t ?? x.time ?? x.timestamp ?? x.tms ?? null;
      const valCandidate = x.v ?? x.value ?? x.y ?? x.close ?? x.price ?? null;
      const t = timeCandidate != null ? (typeof timeCandidate === 'number' ? timeCandidate : Date.parse(String(timeCandidate))) : null;
      return { t: Number.isFinite(t) ? t : null, v: parseNum(valCandidate) };
    }).filter(it => Number.isFinite(it.v));

    const values = items.map(it => it.v);

    if (values.length === 0) {
      // draw empty grid
      ctx.fillStyle = 'rgba(255,255,255,0.02)';
      ctx.fillRect(0, 0, rect.width, height);
      if (ro) try { ro.disconnect(); } catch (e) {}
      // no drawable points; ensure refs are cleared and exit effect
      pointsRef.current = [];
      return;
    }
    const max = Math.max(...values);
    const min = Math.min(...values);
    const range = Math.max(1e-6, max - min);
    const w = rect.width;
    const h = height;

    // grid
    if (grid) {
      ctx.strokeStyle = 'rgba(255,255,255,0.03)';
      ctx.lineWidth = 1;
      const rows = 3;
      for (let i = 0; i <= rows; i++) {
        const y = (h / rows) * i;
        ctx.beginPath();
        ctx.moveTo(0, y + 0.5);
        ctx.lineTo(w, y + 0.5);
        ctx.stroke();
      }
    }

    // path
    ctx.beginPath();
    let points = [];
    const hasTimestamps = items.some(it => it.t !== null);
    if (hasTimestamps) {
      // Build timestamp array and handle missing/null timestamps by
      // assigning them a position interpolated along the overall time range
      const ts = items.map(it => Number.isFinite(it.t) ? it.t : NaN);
      const finiteTs = ts.filter(t => Number.isFinite(t));
      const minT = finiteTs.length ? Math.min(...finiteTs) : 0;
      const maxT = finiteTs.length ? Math.max(...finiteTs) : minT + 1;
      const tRange = Math.max(1, maxT - minT);
      points = items.map((it, idx) => {
        const tVal = Number.isFinite(it.t) ? it.t : (minT + (idx / Math.max(1, items.length - 1)) * tRange);
        const x = ((tVal - minT) / tRange) * w;
        const y = h - ((it.v - min) / range) * h;
        return { x, y, v: it.v, t: tVal };
      });
    } else {
      const step = w / Math.max(1, values.length - 1);
      points = values.map((v, i) => ({ x: i * step, y: h - ((v - min) / range) * h, v }));
    }
    // expose points for pointer handlers and DOM tooltip rendering
    pointsRef.current = points;
    points.forEach((p, i) => {
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    });
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 2;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.stroke();

    if (fill) {
      // fill under curve
        if (points.length) {
          ctx.lineTo(w, h);
          ctx.lineTo(0, h);
          ctx.closePath();
        }
      const grad = ctx.createLinearGradient(0, 0, 0, h);
      const hexToRgba = (hex, a = 0.18) => {
        if (!hex) return `rgba(94,140,255,${a})`;
        if (hex.startsWith('rgb')) {
          const nums = hex.match(/\d+,?\s*\d+,?\s*\d+/);
          if (nums) return `rgba(${nums[0]},${a})`;
        }
        const hh = hex.replace('#', '');
        const bigint = parseInt(hh.length === 3 ? hh.split('').map(c => c + c).join('') : hh, 16);
        const r = (bigint >> 16) & 255;
        const g = (bigint >> 8) & 255;
        const b = bigint & 255;
        return `rgba(${r},${g},${b},${a})`;
      };
      grad.addColorStop(0, hexToRgba(stroke, 0.18));
      grad.addColorStop(1, hexToRgba(stroke, 0.02));
      try { ctx.fillStyle = grad; ctx.fill(); } catch (e) { /* ignore */ }
    }

    // draw latest marker (small circle)
    const last = points[points.length - 1];
    if (last) {
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.95;
      ctx.arc(last.x, last.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    // If highlightNew, detect last value change and kick off a pulse
    if (highlightNew) {
      const lastVal = values[values.length - 1];
      const prev = prevLastRef.current;
      if (prev == null || prev !== lastVal) {
        // start pulse animation
        prevLastRef.current = lastVal;
        setPulse(1);
        const start = performance.now();
        const dur = 480;
        if (animRef.current) cancelAnimationFrame(animRef.current);
        const tick = (t) => {
          const p = Math.min(1, (t - start) / dur);
          setPulse(1 - p);
          if (p < 1) animRef.current = requestAnimationFrame(tick);
          else { animRef.current = null; setPulse(0); }
        };
        animRef.current = requestAnimationFrame(tick);
      }
    }

    // Draw pulse overlay (on top) if active
    if (pulse > 0 && points.length) {
      const lastP = points[points.length - 1];
      ctx.beginPath();
      const r = 6 + (1 - pulse) * 18;
      const alpha = 0.22 * pulse;
      ctx.fillStyle = `rgba(94,140,255,${alpha})`;
      ctx.arc(lastP.x, lastP.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    // Optional simple X axis: handled via DOM labels below for clarity/accessibility

    // cleanup: ensure any leftover animations aren't running unnecessarily (handled by cleanup below)
    if (ro) try { ro.disconnect(); } catch (e) {}
    // Hover UI is rendered as a DOM tooltip (see render) so we don't draw it on canvas here.
  }, [data, height, stroke, fill, grid, pulse, highlightNew, hover]);

  // cleanup animation frame on unmount
  useEffect(() => {
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, []);

  // Pointer handlers: compute nearest point and surface via DOM tooltip
  useEffect(() => {
    const canvas = ref.current;
    const container = containerRef.current;
    if (!canvas || !container) return;
    let rect = null;
    const onMove = (e) => {
      try {
        rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left);
        const y = (e.clientY - rect.top);
        const pts = pointsRef.current || [];
        if (!pts.length) { setHover(null); return; }
        // find nearest by x distance
        let best = null;
        for (let i = 0; i < pts.length; i++) {
          const p = pts[i];
          const dx = Math.abs(p.x - x);
          if (!best || dx < best.dx) best = { p, dx };
        }
        if (best && best.p) {
          setHover({ clientX: Math.max(0, Math.min(rect.width, best.p.x)), clientY: Math.max(0, Math.min(rect.height, best.p.y)), p: best.p });
        } else setHover(null);
      } catch (err) { }
    };
    const onLeave = () => setHover(null);
    container.addEventListener('pointermove', onMove);
    container.addEventListener('pointerleave', onLeave);
    return () => {
      container.removeEventListener('pointermove', onMove);
      container.removeEventListener('pointerleave', onLeave);
    };
  }, [ref, containerRef]);

  // DOM tooltip / X-axis rendering based on pointer state and last computed points
  const pts = pointsRef.current || [];
  const hasTimestampPts = pts.length && pts.some(p => p.t != null);
  let tooltipEl = null;
  if (hover && hover.p) {
    const p = hover.p;
    const left = Math.min(Math.max(6, hover.clientX + 12), (containerRef.current ? containerRef.current.getBoundingClientRect().width - 140 : 400));
    const top = Math.max(6, hover.clientY - 36);
    const dateStr = p.t ? new Date(p.t).toLocaleString() : '';
    const valStr = Number.isFinite(p.v) ? p.v.toFixed(2) : String(p.v);
    const style = { position: 'absolute', left: `${left}px`, top: `${top}px`, pointerEvents: 'none', background: 'rgba(0,0,0,0.75)', color: '#fff', padding: '6px 8px', borderRadius: 6, fontSize: 12, zIndex: 20, minWidth: 120 };
    tooltipEl = (<div style={style}>{dateStr} — {valStr}</div>);
  }

  let xAxisEl = null;
  if (showXAxis && hasTimestampPts) {
    const first = pts[0];
    const mid = pts[Math.floor(pts.length / 2)];
    const last = pts[pts.length - 1];
    const mk = (p) => {
      if (!p) return null;
      const txt = p && p.t ? new Date(p.t).toLocaleString() : '';
      const style = { position: 'absolute', left: `${Math.max(6, p.x)}px`, top: `${height + 6}px`, transform: 'translateX(-50%)', color: 'rgba(255,255,255,0.75)', fontSize: 11, pointerEvents: 'none' };
      return (<div key={(p.t || '') + '-' + Math.round(p.x || 0)} style={style}>{txt}</div>);
    };
    xAxisEl = (<>{mk(first)}{mk(mid)}{mk(last)}</>);
  }

  return (
    <div ref={containerRef} style={{ position: 'relative', width: '100%', height }}>
      <canvas ref={ref} style={{ width: '100%', height }} />
      {tooltipEl}
      {xAxisEl}
    </div>
  );
};

export default LineChart;
