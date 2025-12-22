import React, { useEffect, useState } from 'react';
import LineChart from './LineChart';

// A lightweight port of the legacy drawer "Continuous Strategy Monitor" chart
// This tab prefers full historical bars when available, otherwise it will
// render a short series from the latest_data.close values.
const LegacyMonitorTab = ({ data = null }) => {
  const [series, setSeries] = useState([]);
  const [timestamps, setTimestamps] = useState([]);

  useEffect(() => {
    try {
      if (!data) {
        setSeries([]); setTimestamps([]); return;
      }
      // Prefer server-provided history
      if (data.historical_bars && Array.isArray(data.historical_bars.close) && data.historical_bars.close.length) {
        const prices = data.historical_bars.close.slice(-400);
        const times = (data.historical_bars.timestamps || []).slice(-400);
        setSeries(prices.map(p => (typeof p === 'string' ? parseFloat(p.replace(/[$,]/g, '')) : p)));
        setTimestamps(times);
        return;
      }

      // Otherwise, if the UI has a live series exposed (window.__liveMonitorSeries), use it
      if (window.__liveMonitorSeries && Array.isArray(window.__liveMonitorSeries) && window.__liveMonitorSeries.length) {
        setSeries(window.__liveMonitorSeries.slice(-240));
        setTimestamps([]);
        return;
      }

      // Finally, if only latest_data is present, seed a short series so chart shows a point
      const latest = data.latest_data || {};
      const v = latest.close ?? latest.price ?? null;
      if (v != null) {
        setSeries([Number(v)]);
        setTimestamps([latest.timestamp || new Date().toISOString()]);
        return;
      }

      setSeries([]); setTimestamps([]);
    } catch (e) {
      console.warn('LegacyMonitorTab update failed', e);
    }
  }, [data]);

  return (
    <div className="legacy-monitor-tab">
      <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
        <div style={{ flex: 1, padding: 12, background: '#0b0f14', borderRadius: 8, border: '1px solid #1f2937' }}>
          <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>Continuous Strategy Monitor</div>
          <div style={{ height: 260 }}>
            {series && series.length ? (
              <LineChart data={series} height={260} stroke="#2962ff" />
            ) : (
              <div style={{ height: 260, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#787b86' }}>No price history available</div>
            )}
          </div>
        </div>

        <div style={{ width: 320, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ padding: 12, background: '#0b0f14', borderRadius: 8, border: '1px solid #1f2937' }}>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>Latest Snapshot</div>
            <div style={{ fontSize: 18, fontWeight: 700 }}>{data?.latest_data?.close ?? data?.latest_data?.price ?? '--'}</div>
            <div style={{ color: '#9ca3af', fontSize: 12 }}>{data?.finalSignal ? `Signal: ${data.finalSignal}` : (data?.summary?.status || '')}</div>
            <div style={{ marginTop: 8, fontSize: 12 }}>
              <div>RSI: <strong>{data?.latest_data?.rsi ?? '—'}</strong></div>
              <div>EMA(20): <strong>{data?.latest_data?.ema ?? '—'}</strong></div>
              <div>Volume: <strong>{data?.latest_data?.volume ?? '—'}</strong></div>
            </div>
          </div>

          <div style={{ padding: 12, background: '#0b0f14', borderRadius: 8, border: '1px solid #1f2937' }}>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>Legend</div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <div style={{ width: 12, height: 12, background: '#2962ff', borderRadius: 2 }} />
              <div style={{ fontSize: 13 }}>Asset price</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <div style={{ width: 12, height: 12, background: '#3b82f6', borderRadius: 6 }} />
              <div style={{ fontSize: 13 }}>BUY marker</div>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <div style={{ width: 12, height: 12, background: '#ef4444', borderRadius: 6 }} />
              <div style={{ fontSize: 13 }}>SELL marker</div>
            </div>
          </div>

          <div style={{ padding: 12, background: '#0b0f14', borderRadius: 8, border: '1px solid #1f2937' }}>
            <div style={{ fontSize: 12, color: '#9ca3af', marginBottom: 8 }}>Quick Signals</div>
            <div style={{ maxHeight: 180, overflow: 'auto' }}>
              {data?.signals && data.signals.length ? data.signals.slice(0, 8).map((s, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px dashed #111827' }}>
                  <div>{new Date(s.time).toLocaleTimeString()} - {s.signal}</div>
                  <div style={{ fontWeight: 700 }}>{s.price}</div>
                </div>
              )) : (<div style={{ color: '#6b7280' }}>No recent signals</div>)}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default LegacyMonitorTab;
