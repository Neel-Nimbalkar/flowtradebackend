import React from 'react';
import './Dashboard.css';
import DashboardSidebar from '../components/DashboardSidebar';
// DashboardHeader removed to eliminate top bar
import DashboardSettings from '../components/DashboardSettings';
import PriceChart from '../components/StrategyResults/PriceChart';
import './Dashboard.css';

const ALERTS_STORAGE_KEY = 'flowgrid_alerts_v1';

const mockPrices = Array.from({ length: 60 }).map((_, i) => ({ time: Date.now() - (60 - i) * 60000, close: 100 + Math.sin(i / 6) * 4 + i * 0.05 }));
// Mock NVDA fallback generator
const makeMockSeries = (days = 7, base = 420) => {
  const now = Date.now();
  return Array.from({ length: days }).map((_, i) => {
    const t = now - (days - i - 1) * 24 * 3600 * 1000;
    const noise = Math.sin(i / 2) * 6 + (Math.random() - 0.5) * 4;
    const close = +(base + (i - days / 2) * 1.8 + noise).toFixed(2);
    return { time: t, close };
  });
};
const mockActivities = [
  { time: '2m ago', text: 'Edited strategy: Mean Reversion' },
  { time: '10m ago', text: 'Backtest completed: NVDA 1Hour' },
  { time: '1h ago', text: 'Alert triggered: SPY price above 450' },
];

const AccountPerformance = ({ initialRange = '1D' }) => {
  const [range, setRange] = React.useState(initialRange);

  // Mock equity curve generator for each range
  const ranges = React.useMemo(() => ({
    '1D': 24,
    '5D': 5 * 24,
    '1M': 30 * 24,
    '6M': 30 * 24 * 6,
    'YTD': 365 * 24,
    'All': 365 * 24 * 2
  }), []);

  const generateSeries = (r) => {
    const points = ranges[r] || 24;
    const now = Date.now();
    const base = 10000;
    // limit points for performance in the small widget
    const count = Math.min(points, 200);
    return Array.from({ length: count }).map((_, i) => ({ t: now - (points - i) * 3600 * 1000, v: +(base + Math.sin(i / 6) * 120 + i * 2 + (Math.random() - 0.5) * 40).toFixed(2) }));
  };

  const series = React.useMemo(() => generateSeries(range), [range]);
  // represent performance as percentage change from the period start
  const firstVal = series[0].v;
  const pctSeries = series.map(s => ({ t: s.t, v: +(((s.v - firstVal) / firstVal) * 100).toFixed(4) }));
  const latest = pctSeries[pctSeries.length - 1].v;
  const change = +(latest - pctSeries[0].v).toFixed(2); // effectively same as latest
  const pct = +latest.toFixed(2);

  return (
    <div className="account-perf">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 700 }}>{`${pct >= 0 ? '+' : ''}${pct}%`}</div>
          <div style={{ color: change >= 0 ? '#7ee787' : '#ff9b9b' }}>{`${change >= 0 ? '+' : ''}${change}% vs start`}</div>
        </div>
        <div style={{ display: 'flex', gap: 8 }}>
          {['1D','5D','1M','6M','YTD','All'].map(r => (
            <button key={r} onClick={() => setRange(r)} className={`toolbar-btn ${r===range? 'primary':''}`} style={{ padding: '6px 10px' }}>{r}</button>
          ))}
        </div>
      </div>
      <div style={{ marginTop: 8, height: '34vh', minHeight: 220 }}>
        <PriceChart priceBars={pctSeries.map(s => ({ time: s.t, close: s.v }))} />
      </div>
    </div>
  );
};

const Dashboard = ({ onNavigate }) => {
  const [alerts, setAlerts] = React.useState([]);

  const syncAlertsFromStorage = React.useCallback(() => {
    if (typeof window === 'undefined') { setAlerts([]); return; }
    try {
      const raw = localStorage.getItem(ALERTS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      setAlerts(Array.isArray(parsed) ? parsed : []);
    } catch (e) {
      console.warn('[Dashboard] Failed to read alerts', e);
      setAlerts([]);
    }
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    syncAlertsFromStorage();
    const handleStorage = (e) => {
      if (!e || e.key !== ALERTS_STORAGE_KEY) return;
      syncAlertsFromStorage();
    };
    const handleCustom = () => syncAlertsFromStorage();
    window.addEventListener('storage', handleStorage);
    window.addEventListener('flowgrid:alerts-updated', handleCustom);
    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('flowgrid:alerts-updated', handleCustom);
    };
  }, [syncAlertsFromStorage]);

  const clearAlerts = React.useCallback(() => {
    try {
      localStorage.removeItem(ALERTS_STORAGE_KEY);
    } catch (e) { console.warn('[Dashboard] clearAlerts localStorage remove failed', e); }
    setAlerts([]);
    try { window.dispatchEvent(new Event('flowgrid:alerts-updated')); } catch (e) {}
  }, []);

  const alertsToShow = React.useMemo(() => alerts.slice(0, 4), [alerts]);

  return (
    <div className="dashboard-root">
      <DashboardSidebar onNavigate={onNavigate} hideHome={true} activeKey={'home'} />
      <div className="dashboard-content">
        <div className="dashboard-main">
          <div className="top-cards">
            <button className="card primary" onClick={() => onNavigate('builder')}>
              <div className="card-title">Start New Strategy</div>
              <div className="card-desc">Open FlowGrid strategy builder</div>
            </button>
            <button className="card" onClick={() => onNavigate('backtest')}>
              <div className="card-title">Run Backtest</div>
              <div className="card-desc">Evaluate strategy performance</div>
            </button>
            <button className="card" onClick={() => onNavigate('analytics')}>
              <div className="card-title">View Analytics</div>
              <div className="card-desc">Open analytics & insights</div>
            </button>
          </div>
          {/* Move Alpaca API Settings panel to bottom of grid */}

          <div className="grid" style={{ gridTemplateColumns: '1fr 3fr 360px', gridTemplateRows: 'auto auto auto', gap: 16 }}>
            <div className="panel large" style={{ gridColumn: '1 / span 2', gridRow: '1', minWidth: 0 }}>
              <div className="panel-header">Account Performance</div>
              <AccountPerformance range={'1D'} />
            </div>

            <div style={{ gridColumn: '1 / span 2', gridRow: '2', display: 'flex', gap: 16, alignItems: 'stretch' }}>
              <div className="panel" style={{ flex: '1 1 0', minWidth: 0 }}>
                <div className="panel-header">RSI Strategy</div>
                <StrategyWidget strategy="RSI" />
              </div>
              <div className="panel" style={{ flex: '1 1 0', minWidth: 0 }}>
                <div className="panel-header">EMA Cross Strategy</div>
                <StrategyWidget strategy="EMA Cross" />
              </div>
              <div className="panel" style={{ flex: '1 1 0', minWidth: 0 }}>
                <div className="panel-header">Volume Strategy</div>
                <StrategyWidget strategy="Volume" />
              </div>
            </div>
            {/* Alpaca API Settings panel moved up into right column row 2 */}
            <div className="panel" style={{ gridColumn: '3', gridRow: '2', minHeight: 300 }}>
              <div className="panel-header">Alpaca API Settings</div>
              <DashboardSettings noWrapper={true} />
            </div>

            <div className="panel" style={{ gridColumn: '3', gridRow: '1' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div className="panel-header">Alerts Overview</div>
                <button className="toolbar-btn clear-alerts-btn" onClick={clearAlerts} title="Clear recent alerts">Clear Alerts</button>
              </div>
              <div className="panel-body alerts-panel">
                {alertsToShow.length === 0 ? (
                  <div className="muted">No recent signals</div>
                ) : (
                  <div className="alerts-list">
                    {alertsToShow.map((alert) => {
                      const signalLabel = (alert.signal || 'HOLD').toUpperCase();
                      const priceText = alert.price != null && !Number.isNaN(Number(alert.price))
                        ? `$${Number(alert.price).toFixed(2)}`
                        : '--';
                      const ts = alert.timestamp ? new Date(alert.timestamp) : null;
                      const timeText = ts ? ts.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
                      const dateText = ts ? ts.toLocaleDateString([], { month: 'short', day: 'numeric' }) : '';
                      const signalClass = signalLabel.toLowerCase();
                      return (
                        <div key={alert.id || alert.timestamp} className={`alert-row ${signalClass}`}>
                          <div className="alert-left">
                            <div className="alert-details">
                              <div className="alert-strategy" title={alert.strategyName || 'Strategy'}>{alert.strategyName || 'Strategy'}</div>
                              <div className="alert-meta">
                                {alert.symbol || '—'} · {alert.timeframe || '—'}
                                {timeText && (<span> · {timeText}</span>)}
                              </div>
                            </div>
                          </div>
                          <div className="alert-right">
                            <div className="alert-action">{signalLabel} <span className="alert-price">@ {priceText}</span></div>
                            <div className="alert-timestamp">{dateText}{timeText && ` · ${timeText}`}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            

          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

// NVDAWidget: fetches price history for NVDA (1D/1W/1M ranges) using backend /price_history
const NVDAWidget = ({ symbol = 'NVDA' }) => {
  const [range, setRange] = React.useState('1W');
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [bars, setBars] = React.useState(makeMockSeries(7, 420));

  const rangeToDays = (r) => {
    switch (r) {
      case '1D': return 1;
      case '5D': return 5;
      case '1W': return 7;
      case '1M': return 30;
      case '6M': return 180;
      case 'YTD': {
        const now = new Date();
        const start = new Date(now.getFullYear(), 0, 1);
        return Math.max(1, Math.round((now - start) / (1000 * 60 * 60 * 24)));
      }
      case 'All': return 365 * 2;
      default: return 7;
    }
  };

  React.useEffect(() => {
    let mounted = true;
    const doFetch = async () => {
      setLoading(true); setError(null);
      const days = rangeToDays(range);
      // try to get keys from localStorage
      let alpacaKeyId = null, alpacaSecretKey = null;
      try { alpacaKeyId = localStorage.getItem('alpaca_key_id'); alpacaSecretKey = localStorage.getItem('alpaca_secret_key'); } catch (e) {}
      if (!alpacaKeyId || !alpacaSecretKey) {
        // no keys -> use mock
        setBars(makeMockSeries(Math.max(7, days), 420));
        setLoading(false);
        return;
      }

      try {
        const params = new URLSearchParams({ symbol, timeframe: '1Day', days: String(days), alpacaKeyId, alpacaSecretKey });
        const urls = [`/price_history?${params.toString()}`, `http://127.0.0.1:5000/price_history?${params.toString()}`];
        let res = null; let data = null;
        for (const url of urls) {
          try {
            res = await fetch(url);
            if (!res.ok) continue;
            data = await res.json();
            break;
          } catch (e) { continue; }
        }
        if (!data) throw new Error('No response');
        if (data.error) throw new Error(data.error || 'No data');
        const parsed = (data.bars || []).map(b => ({ time: b.t || b.tms || b.time || Date.now(), close: b.close }));
        if (mounted && parsed.length > 0) setBars(parsed);
      } catch (e) {
        console.warn('NVDAWidget fetch error', e);
        if (mounted) { setError(String(e)); setBars(makeMockSeries(Math.max(7, rangeToDays(range)), 420)); }
      }
      if (mounted) setLoading(false);
    };
    doFetch();
    return () => { mounted = false; };
  }, [range, symbol]);
    // convert bars to percent series relative to period start
    const pctSeries = (bars && bars.length > 0) ? (() => {
      const firstVal = bars[0].close || bars[0].v || 0;
      if (!firstVal) return bars.map(b => ({ time: b.time, close: 0 }));
      return bars.map(b => ({ time: b.time, close: (((b.close - firstVal) / firstVal) * 100) }));
    })() : [];

    const latest = pctSeries && pctSeries.length ? pctSeries[pctSeries.length - 1].close : null;
    const firstPct = pctSeries && pctSeries.length ? pctSeries[0].close : null;
    const change = latest != null && firstPct != null ? +(latest - firstPct).toFixed(2) : null;

    return (
      <div className="panel-body" style={{ height: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ fontWeight: 700 }}>{symbol}</div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700 }}>{latest != null ? `${latest.toFixed(2)}%` : '--'}</div>
            <div style={{ color: change >= 0 ? '#7ee787' : '#ff9b9b' }}>{change != null ? `${change >= 0 ? '+' : ''}${change}% vs start` : (loading ? 'Loading…' : (error ? 'Error' : '--'))}</div>
          </div>
        </div>
        <div style={{ flex: 1 }}>
          <PriceChart verticalBias={0.12} priceBars={pctSeries.map(p => ({ time: p.time, close: p.close }))} />
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
          {['1D','5D','1W','1M','6M','YTD','All'].map(r => (
            <button key={r} onClick={() => setRange(r)} className={`toolbar-btn ${r===range? 'primary':''}`} style={{ padding: '6px 10px' }}>{r}</button>
          ))}
        </div>
      </div>
    );
};

// StrategyWidget: simplified widget for strategy previews (no external fetching)
const StrategyWidget = ({ strategy = 'RSI', initialRange = '1W' }) => {
  const [range, setRange] = React.useState(initialRange);
  // choose a base to vary the mock series per strategy for visual distinction
  const baseMap = { 'RSI': 120, 'EMA Cross': 200, 'Volume': 80 };
  const base = baseMap[strategy] || 100;
  const days = range === '1D' ? 1 : range === '5D' ? 5 : range === '1W' ? 7 : range === '1M' ? 30 : 7;
  const series = React.useMemo(() => makeMockSeries(Math.max(7, days), base), [range, base]);
  // convert mock series to percent change relative to period start
  const pctSeries = React.useMemo(() => {
    if (!series || series.length === 0) return [];
    const f = series[0].close || series[0].v || 0;
    if (!f) return series.map(s => ({ time: s.time, close: 0 }));
    return series.map(s => ({ time: s.time, close: (((s.close - f) / f) * 100) }));
  }, [series]);

  const latest = pctSeries && pctSeries.length ? pctSeries[pctSeries.length - 1].close : null;
  const first = pctSeries && pctSeries.length ? pctSeries[0].close : null;
  const change = latest != null && first != null ? +(latest - first).toFixed(2) : null;
  const pct = latest != null && first != null ? +latest.toFixed(2) : null;

  return (
    <div className="panel-body" style={{ height: 200, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ fontWeight: 700 }}>{strategy}</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700 }}>{pct != null ? `${pct}%` : '--'}</div>
          <div style={{ color: change >= 0 ? '#7ee787' : '#ff9b9b' }}>{change != null ? `${change >= 0 ? '+' : ''}${change} (${pct}%)` : '--'}</div>
        </div>
      </div>
      <div style={{ flex: 1 }}>
        <PriceChart verticalBias={0.08} priceBars={pctSeries.map(p => ({ time: p.time, close: p.close }))} />
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'center', marginTop: 8 }}>
        {['1D','5D','1W','1M','6M','YTD','All'].map(r => (
          <button key={r} onClick={() => setRange(r)} className={`toolbar-btn ${r===range? 'primary':''}`} style={{ padding: '6px 10px' }}>{r}</button>
        ))}
      </div>
    </div>
  );
};
