import React, { useState, useEffect } from 'react';
import MonitorTabs from './MonitorTabs';
import './monitor-drawer.css';

const StrategyMonitorDrawer = ({ open, onClose, initialTab = 'live', className = '', resultsData = null, nodeBuffers = {} }) => {
  const [active, setActive] = useState(initialTab);
  const [rightOffset, setRightOffset] = useState(16);
  const [heightPx, setHeightPx] = useState(() => {
    try {
      const v = Number(localStorage.getItem('monitor_height_px'));
      if (!Number.isNaN(v) && v > 0) return v;
    } catch (e) {}
    return Math.round(window.innerHeight * 0.5);
  });
  const drawerRef = React.useRef(null);
  const draggingRef = React.useRef(false);

  useEffect(() => {
    // Compute the right offset so the drawer sits flush with the left edge of the right-side panel
    function updateOffset() {
      try {
        const out = document.querySelector('.output-panel');
        if (out && out.classList.contains('open')) {
          const r = Math.round(out.getBoundingClientRect().width || 0);
          setRightOffset(r);
        } else {
          setRightOffset(16);
        }
      } catch (e) {
        setRightOffset(16);
      }
    }

    updateOffset();

    // Watch for resizes of the right panel (drag-to-resize)
    let ro;
    try {
      const outEl = document.querySelector('.output-panel');
      if (outEl && typeof ResizeObserver !== 'undefined') {
        ro = new ResizeObserver(() => updateOffset());
        ro.observe(outEl);
      }
    } catch (e) { /* ignore */ }

    window.addEventListener('resize', updateOffset);
    const mo = new MutationObserver(updateOffset);
    const doc = document.body;
    mo.observe(doc, { attributes: true, childList: true, subtree: true });

    return () => {
      window.removeEventListener('resize', updateOffset);
      try { mo.disconnect(); } catch (e) {}
      try { if (ro) ro.disconnect(); } catch (e) {}
    };
  }, []);

  useEffect(() => {
    const onResize = () => {
      // ensure height doesn't exceed available viewport
      const max = Math.round(window.innerHeight - 80);
      setHeightPx(h => Math.min(h, max));
    };
    window.addEventListener('resize', onResize);
    // expose setter to allow external code to switch active tab (e.g., open backtest results)
    try { window.setMonitorTab = (tab) => { if (tab) setActive(tab); }; } catch (e) {}
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    return () => {
      try { delete window.setMonitorTab; } catch (e) {}
    };
  }, []);

  // Persist height when changed
  useEffect(() => {
    try { localStorage.setItem('monitor_height_px', String(heightPx)); } catch (e) {}
  }, [heightPx]);

  const startDrag = (startY) => {
    draggingRef.current = true;
    const startH = heightPx;
    const max = Math.round(window.innerHeight - 80);
    const min = 80;
    const rafRef = { id: null };
    const lastHeightRef = { current: startH };

    // add a class to remove CSS transitions while dragging for snappier updates
    try { drawerRef.current && drawerRef.current.classList.add('dragging'); } catch (e) {}

    const onMove = (ev) => {
      const clientY = ev.clientY ?? (ev.touches && ev.touches[0] && ev.touches[0].clientY);
      if (clientY == null) return;
      if (ev.cancelable) ev.preventDefault();
      const delta = startY - clientY; // drag up increases height
      let nh = Math.min(max, Math.max(min, startH + delta));
      lastHeightRef.current = nh;

      if (rafRef.id == null) {
        rafRef.id = window.requestAnimationFrame(() => {
          rafRef.id = null;
          try {
            if (drawerRef.current) drawerRef.current.style.height = `${lastHeightRef.current}px`;
          } catch (e) {}
        });
      }
    };

    const onEnd = () => {
      draggingRef.current = false;
      if (rafRef.id != null) { window.cancelAnimationFrame(rafRef.id); rafRef.id = null; }
      // apply final height to React state (and persist via effect)
      setHeightPx(lastHeightRef.current);
      try { drawerRef.current && drawerRef.current.classList.remove('dragging'); } catch (e) {}
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };

    document.addEventListener('mousemove', onMove, { passive: false });
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  return (
    <div
      ref={drawerRef}
      className={`monitor-drawer ${open ? 'open' : ''} ${className}`}
      role="dialog"
      aria-hidden={!open}
      style={{ right: `${rightOffset}px`, height: open ? `${heightPx}px` : 0 }}
    >
      <div
        className="monitor-drawer-handle"
        onMouseDown={(e) => { if (e.button === 0) startDrag(e.clientY); }}
        onTouchStart={(e) => { const t = e.touches && e.touches[0]; if (t) startDrag(t.clientY); }}
        aria-hidden
      >
        <div className="handle-bar" />
        <div className="monitor-drawer-title">Strategy Monitor</div>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, alignItems: 'center' }}>
          <button className="md-btn" onClick={() => setActive('live')}>Live</button>
          <button className="md-btn" onClick={() => setActive('backtest')}>Backtest</button>
          <button className="md-btn" onClick={() => setActive('past')}>Past Signals</button>
          <button
            className="md-btn md-stop"
            onClick={() => {
              try {
                // write a timestamp so other tabs receive a storage event
                localStorage.setItem('monitor_stop', String(Date.now()));
                // clear shortly after to avoid leaving a stale flag
                setTimeout(() => {
                  try { localStorage.removeItem('monitor_stop'); } catch (e) {}
                }, 1000);
              } catch (e) {}
            }}
            title="Stop live monitoring"
          >
            Stop
          </button>
          <button className="md-close" onClick={onClose} title="Close Monitor">×</button>
        </div>
      </div>

      <div className="monitor-drawer-body">
        <MonitorTabs active={active} onChange={setActive} resultsData={resultsData} nodeBuffers={nodeBuffers} />
      </div>
    </div>
  );
};

export default StrategyMonitorDrawer;
