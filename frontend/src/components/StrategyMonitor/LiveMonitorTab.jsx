import React, { useEffect, useState, useRef } from 'react';
import StaticChartPlaceholder from './StaticChartPlaceholder';
import LineChart from './LineChart';

// Live monitor tab keeps a local series buffer of last N points so the chart can
// animate/shift even if the backend returns only the latest datapoint.
// Accepts `nodeBuffers` prop with per-node time series for overlays.
const LiveMonitorTab = ({ data = null, nodeBuffers = {} }) => {
  const now = (data && (data.summary?.completedAt || data.latest_data?.timestamp || data.signals?.[0]?.time)) || new Date().toISOString();
  const status = (data && (data.finalSignal || data.summary?.status)) || 'NEUTRAL';
  const latest = data?.latest_data || {};
  const MAX_SERIES = 240;
  const [series, setSeries] = useState(() => []);
  const lastTsRef = useRef(null);
  // Build overlays from nodeBuffers. Each overlay: { id, name, series: [{t, v}], stroke }
  const overlayPalette = ['#ff8a00', '#3b82f6', '#ffd36b', '#a78bfa', '#fb7185', '#60a5fa'];
  const overlays = Object.entries(nodeBuffers || {}).map(([id, info], idx) => ({ id, name: info.name, series: info.buf || [], stroke: overlayPalette[idx % overlayPalette.length] }));

  // Append latest datapoint when data updates. If backend provides a full history
  // (data.historical_bars.close), prefer that; otherwise append latest.close.
  useEffect(() => {
    if (!data) return;
    try {
      if (data.historical_bars && data.historical_bars.close && Array.isArray(data.historical_bars.close)) {
        // Use server-provided full history
        setSeries(data.historical_bars.close.slice(-MAX_SERIES));
        lastTsRef.current = Date.now();
        return;
      }
      // Prefer the authoritative 'close' value for the chart (keeps chart aligned with displayed Price).
      // Fallback to 'price' (real-time tick) if 'close' not present.
      const v = data.latest_data && (data.latest_data.close ?? data.latest_data.price ?? data.latest_data.v ?? null);
      if (v == null) return;
      setSeries(prev => {
        // avoid adding duplicate sequential values at same timestamp
        const last = prev.length ? prev[prev.length - 1] : null;
        if (last === v) {
          // update timestamp marker but do not duplicate value
          lastTsRef.current = Date.now();
          // still log the no-op for debugging
          try { console.debug('[LiveMonitor] no-new-value', { v, last, len: prev.length }); } catch (e) {}
          return prev;
        }
        const next = [...prev.slice(-MAX_SERIES + 1), v];
        lastTsRef.current = Date.now();
        try { console.debug('[LiveMonitor] appended', { v, last, nextLen: next.length }); } catch (e) {}
        try { window.__liveMonitorSeries = next; } catch (e) {}
        return next;
      });
    } catch (e) { /* ignore */ }
  }, [data]);

  // ensure series is initialized if empty and we have a single datapoint
  useEffect(() => {
    if ((!series || series.length === 0) && data && data.latest_data && (data.latest_data.close != null)) {
      setSeries([data.latest_data.close]);
      try { window.__liveMonitorSeries = [data.latest_data.close]; console.debug('[LiveMonitor] init series', window.__liveMonitorSeries); } catch (e) {}
    }
  }, [data, series]);

  return (
    <div className="live-monitor-tab">
      <div className="grid-2">
        <div className="card">
          <div className="card-header">Current Strategy State</div>
          <div className="card-body">
            <div className="state-row"><strong>Status:</strong> <span className="status-badge status-neutral">NEUTRAL</span></div>
            <div className="state-row"><strong>Last Check:</strong> {now}</div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">Most Recent Signal</div>
          <div className="card-body">
            <div className="signal-large">{data?.signals && data.signals.length ? `${data.signals[0].signal} — ${data.signals[0].symbol} @ ${data.signals[0].price}` : `No recent signal`}</div>
            <div className="muted">{data?.signals && data.signals.length ? (data.signals[0].reason || '') : 'Short explanation: run workflow to populate signals.'}</div>
          </div>
        </div>
      </div>

      <div className="grid-3">
        <div className="card small">
          <div className="card-header">Latest Indicators</div>
          <div className="card-body">
            <div>RSI: <strong>{latest.rsi ?? '—'}</strong></div>
            <div>MACD: <strong>{latest.macd_hist ?? '—'}</strong></div>
            <div>EMA(20): <strong>{latest.ema ?? '—'}</strong></div>
          </div>
        </div>

        <div className="card small">
          <div className="card-header">Workflow Condition Map</div>
          <div className="card-body">
            <div>Fetch Price: <span className="pill true">TRUE</span></div>
            <div>RSI Check: <span className="pill false">FALSE</span></div>
            <div>Signal Gate: <span className="pill skipped">SKIPPED</span></div>
          </div>
        </div>

        <div className="card small">
          <div className="card-header">Real-Time Feed</div>
          <div className="card-body">
            <div className="muted">Real-Time Updates Coming Soon</div>
            <div className="skeleton-row" />
            <div className="skeleton-row small" />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">Live Price Chart</div>
        <div className="card-body chart-area">
          {series && series.length ? (
            <LineChart data={series} height={220} stroke="#5e8cff" overlays={overlays} />
          ) : (
            <StaticChartPlaceholder height={220} />
          )}
        </div>
      </div>
    </div>
  );
};

export default LiveMonitorTab;
