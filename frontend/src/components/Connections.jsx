import React, { useEffect, useState } from 'react';

// connections: [{ id, from: { nodeId, port }, to: { nodeId, port } }]
const Connections = ({ svgRef, connections = [], connecting = null, selectedId = null, onSelect = () => {}, onDelete = () => {}, nodes = [], canvasScale = 1, canvasOffset = { x: 0, y: 0 } }) => {
  const [paths, setPaths] = useState([]);

  useEffect(() => {
    let mounted = true;
    let raf = null;

    const computeAll = () => {
      const svg = svgRef?.current;
      if (!svg) return [];

      const svgRect = svg.getBoundingClientRect();
      const makePoint = (el) => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2 - svgRect.left, y: r.top + r.height / 2 - svgRect.top };
      };

      const results = [];
      connections.forEach(conn => {
        const fromEl = document.querySelector(`.port-dot[data-node-id="${conn.from.nodeId}"][data-port="${conn.from.port}"][data-port-type="output"]`);
        const toEl = document.querySelector(`.port-dot[data-node-id="${conn.to.nodeId}"][data-port="${conn.to.port}"][data-port-type="input"]`);
        const p1 = makePoint(fromEl);
        const p2 = makePoint(toEl);
        if (!p1 || !p2) return;
        const dx = Math.max(40, Math.abs(p2.x - p1.x) * 0.5);
        const d = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y} ${p2.x - dx} ${p2.y} ${p2.x} ${p2.y}`;
        const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
        results.push({ id: conn.id, d, mid });
      });

      // temporary connecting path
      if (connecting && svg) {
        const fromEl = document.querySelector(`.port-dot[data-node-id="${connecting.from.nodeId}"][data-port="${connecting.from.port}"][data-port-type="output"]`);
        const p1 = makePoint(fromEl);
        const svgRect2 = svg.getBoundingClientRect();
        if (p1 && typeof connecting.x === 'number' && typeof connecting.y === 'number') {
          const p2 = { x: connecting.x - svgRect2.left, y: connecting.y - svgRect2.top };
          const dx = Math.max(40, Math.abs(p2.x - p1.x) * 0.5);
          const d = `M ${p1.x} ${p1.y} C ${p1.x + dx} ${p1.y} ${p2.x - dx} ${p2.y} ${p2.x} ${p2.y}`;
          const mid = { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
          results.push({ id: '__temp__', d, mid });
        }
      }

      return results;
    };

    const schedule = () => {
      if (raf) return;
      raf = window.requestAnimationFrame(() => {
        raf = null;
        if (!mounted) return;
        try { const newPaths = computeAll(); setPaths(newPaths); } catch (e) { /* ignore */ }
      });
    };

    // initial compute
    schedule();

    // observe DOM changes that may move ports (nodes dragging, etc.)
    let mo = null;
    try {
      const canvas = document.querySelector('.canvas');
      if (canvas && typeof MutationObserver !== 'undefined') {
        mo = new MutationObserver(schedule);
        mo.observe(canvas, { attributes: true, childList: true, subtree: true });
      }
    } catch (e) {}

    const onResize = () => schedule();
    window.addEventListener('resize', onResize);

    return () => {
      mounted = false;
      if (raf) window.cancelAnimationFrame(raf);
      window.removeEventListener('resize', onResize);
      try { if (mo) mo.disconnect(); } catch (e) {}
    };
    // Re-run when these values change
  }, [connections, connecting, svgRef, JSON.stringify(nodes || []), canvasScale, canvasOffset.x, canvasOffset.y]);


  // SVG marker for arrowhead
  // Only render once at top level
  const ArrowMarker = (
    <marker id="arrowhead" markerWidth="10" markerHeight="7" refX="8" refY="3.5" orient="auto" markerUnits="strokeWidth">
      <path d="M0,0 L10,3.5 L0,7" fill="#60a5fa" />
    </marker>
  );

  return (
    <g className="connection-layer">
      <defs>{ArrowMarker}</defs>
      {paths.map(p => (
        <g key={p.id}>
          {/* Invisible thick path for easier click/hover */}
          <path
            d={p.d}
            stroke="#6e7380"
            strokeWidth={12}
            fill="none"
            opacity={0}
            style={{ cursor: 'pointer' }}
            onClick={() => onSelect(p.id)}
          />
          {/* Main wire */}
          <path
            d={p.d}
            className={
              p.id === '__temp__'
                ? 'temp-connection connection-wire'
                : 'connection-wire'
            }
            stroke={p.id === selectedId ? '#60a5fa' : '#6e7380'}
            strokeWidth={p.id === selectedId ? 3.2 : 2.2}
            fill="none"
            markerEnd="url(#arrowhead)"
            style={{
              pointerEvents: 'auto',
              cursor: 'pointer',
              opacity: p.id === '__temp__' ? 0.5 : 0.8,
              filter:
                p.id === selectedId
                  ? 'drop-shadow(0 0 6px #60a5fa)'
                  : p.id === '__temp__'
                  ? 'drop-shadow(0 0 6px #787b86)'
                  : 'none',
              strokeDasharray: p.id === '__temp__' ? '6 4' : undefined,
              animation: p.id === '__temp__' ? 'dashmove 1s linear infinite' : undefined,
              transition: 'stroke 0.18s, filter 0.18s',
            }}
            onMouseEnter={e => {
              if (p.id !== '__temp__') e.target.style.stroke = '#2962ff';
              if (p.id !== '__temp__') e.target.style.opacity = 1;
              if (p.id !== '__temp__') e.target.style.strokeWidth = 3;
            }}
            onMouseLeave={e => {
              if (p.id !== '__temp__') e.target.style.stroke = p.id === selectedId ? '#60a5fa' : '#6e7380';
              if (p.id !== '__temp__') e.target.style.opacity = 0.8;
              if (p.id !== '__temp__') e.target.style.strokeWidth = p.id === selectedId ? 3.2 : 2.2;
            }}
            onClick={() => onSelect(p.id)}
          />
          {/* Delete button for selected connection */}
          {p.id === selectedId && (
            <g>
              <circle cx={p.mid.x} cy={p.mid.y} r={12} fill="#1f2937" stroke="#374151" />
              <text x={p.mid.x} y={p.mid.y + 5} textAnchor="middle" fontSize="16" fill="#f8fafc" style={{ cursor: 'pointer' }} onClick={() => onDelete(p.id)}>×</text>
            </g>
          )}
        </g>
      ))}
    </g>
  );
};

export default Connections;
