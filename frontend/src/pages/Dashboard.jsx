import React, { useState, useEffect, useCallback } from 'react';
import DashboardSidebar from '../components/DashboardSidebar';
import './Dashboard.css';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';

// ============================================
// Utility Functions
// ============================================
const formatCurrency = (value) => {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};

const formatPercent = (value) => {
  if (value === null || value === undefined) return '—';
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

// ============================================
// LocalStorage Keys (same as WorkflowBuilder)
// ============================================
const SAVES_KEY = 'flowgrid_workflow_v1::saves';

// ============================================
// API Hook
// ============================================
const useFetchData = (endpoint, refreshInterval = null) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch(`${API_BASE}${endpoint}`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const result = await response.json();
      setData(result);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    fetchData();
    if (refreshInterval) {
      const interval = setInterval(fetchData, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [fetchData, refreshInterval]);

  return { data, loading, error, refetch: fetchData };
};

// ============================================
// Sync localStorage workflows to backend
// ============================================
const syncWorkflowsToBackend = async () => {
  try {
    const raw = localStorage.getItem(SAVES_KEY);
    if (!raw) return;
    
    const savedWorkflows = JSON.parse(raw);
    const workflowNames = Object.keys(savedWorkflows);
    
    for (const name of workflowNames) {
      const workflow = savedWorkflows[name];
      
      // Try to extract symbol from workflow nodes
      let symbol = 'UNKNOWN';
      let timeframe = '1D';
      
      if (workflow.nodes) {
        const dataNode = workflow.nodes.find(n => n.type === 'data' || n.type === 'fetchData');
        if (dataNode?.params) {
          symbol = dataNode.params.symbol || dataNode.params.ticker || 'UNKNOWN';
          timeframe = dataNode.params.timeframe || dataNode.params.interval || '1D';
        }
      }
      
      // Save to backend
      await fetch(`${API_BASE}/api/strategies/saved`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          symbol,
          timeframe,
          workflow
        })
      });
    }
  } catch (err) {
    console.error('Error syncing workflows:', err);
  }
};

// ============================================
// Toggle Switch Component
// ============================================
const ToggleSwitch = ({ isOn, onToggle, disabled }) => {
  return (
    <button 
      className={`toggle-switch ${isOn ? 'on' : 'off'} ${disabled ? 'disabled' : ''}`}
      onClick={() => !disabled && onToggle()}
      disabled={disabled}
    >
      <span className="toggle-slider" />
    </button>
  );
};

// ============================================
// Semi-Circle Gauge Component
// ============================================
const SemiCircleGauge = ({ value, maxValue = 100, color = '#2962ff', size = 60 }) => {
  const percentage = Math.min((value / maxValue) * 100, 100);
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = Math.PI * radius;
  const offset = circumference - (percentage / 100) * circumference;

  return (
    <svg width={size} height={size / 2 + 5} className="semi-gauge">
      <path
        d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
        fill="none"
        stroke="#2d3748"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
      />
      <path
        d={`M ${strokeWidth / 2} ${size / 2} A ${radius} ${radius} 0 0 1 ${size - strokeWidth / 2} ${size / 2}`}
        fill="none"
        stroke={color}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        className="gauge-progress"
      />
    </svg>
  );
};

// ============================================
// Donut Gauge Component
// ============================================
const DonutGauge = ({ value, total, winColor = '#10b981', lossColor = '#f59e0b', size = 60 }) => {
  const strokeWidth = 6;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const winPercent = total > 0 ? (value / total) * 100 : 0;
  const winOffset = circumference - (winPercent / 100) * circumference;

  return (
    <svg width={size} height={size} className="donut-gauge">
      <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={lossColor} strokeWidth={strokeWidth} />
      <circle
        cx={size / 2} cy={size / 2} r={radius} fill="none" stroke={winColor} strokeWidth={strokeWidth}
        strokeDasharray={circumference} strokeDashoffset={winOffset} strokeLinecap="round"
        transform={`rotate(-90 ${size / 2} ${size / 2})`} className="donut-progress"
      />
    </svg>
  );
};

// ============================================
// Mini Bar Chart Component
// ============================================
const MiniBarChart = ({ winValue, lossValue }) => {
  const maxVal = Math.max(Math.abs(winValue), Math.abs(lossValue), 1);
  const winHeight = (winValue / maxVal) * 20;
  const lossHeight = (Math.abs(lossValue) / maxVal) * 20;

  return (
    <div className="mini-bar-chart">
      <div className="bar-container">
        <div className="bar win-bar" style={{ height: `${winHeight}px` }} />
        <div className="bar loss-bar" style={{ height: `${lossHeight}px` }} />
      </div>
      <div className="bar-labels">
        <span className="win-label">${winValue.toFixed(2)}</span>
        <span className="loss-label">${Math.abs(lossValue).toFixed(2)}</span>
      </div>
    </div>
  );
};

// ============================================
// Metric Card Component
// ============================================
const MetricCard = ({ label, value, subLabel, icon, chart, loading }) => {
  return (
    <div className="metric-card">
      <div className="metric-card-header">
        <span className="metric-label">{label}</span>
        {icon && <span className="metric-icon">{icon}</span>}
      </div>
      <div className="metric-card-body">
        {loading ? (
          <div className="metric-skeleton" />
        ) : (
          <>
            <div className="metric-value">{value}</div>
            {chart && <div className="metric-chart">{chart}</div>}
          </>
        )}
      </div>
      {subLabel && <div className="metric-sub-label">{subLabel}</div>}
    </div>
  );
};

// ============================================
// Account Performance Chart Component
// ============================================
const PerformanceChart = ({ data, timeframe, onTimeframeChange, loading }) => {
  const timeframes = ['1D', '1W', '1M', '3M', 'YTD', 'All'];

  const renderChart = () => {
    if (!data || data.length === 0) {
      return <div className="chart-empty">No performance data</div>;
    }

    const width = 600;
    const height = 200;
    const padding = { top: 20, right: 20, bottom: 30, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;

    const values = data.map(d => d.value);
    const minVal = Math.min(...values);
    const maxVal = Math.max(...values);
    const range = maxVal - minVal || 1;

    const getY = (val) => padding.top + chartHeight - ((val - minVal) / range) * chartHeight;

    const points = data.map((d, i) => {
      const x = padding.left + (i / (data.length - 1)) * chartWidth;
      const y = getY(d.value);
      return `${x},${y}`;
    }).join(' ');

    const areaPath = `M ${padding.left} ${height - padding.bottom} ` +
      data.map((d, i) => {
        const x = padding.left + (i / (data.length - 1)) * chartWidth;
        const y = getY(d.value);
        return `L ${x} ${y}`;
      }).join(' ') +
      ` L ${width - padding.right} ${height - padding.bottom} Z`;

    const isPositive = values[values.length - 1] >= values[0];

    return (
      <svg viewBox={`0 0 ${width} ${height}`} className="performance-chart-svg">
        <defs>
          <linearGradient id="perfGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={isPositive ? '#2962ff' : '#ef4444'} stopOpacity="0.3" />
            <stop offset="100%" stopColor={isPositive ? '#2962ff' : '#ef4444'} stopOpacity="0" />
          </linearGradient>
        </defs>

        {/* Grid lines */}
        {[0, 1, 2, 3, 4].map(i => (
          <line key={i} x1={padding.left} y1={padding.top + (i / 4) * chartHeight}
            x2={width - padding.right} y2={padding.top + (i / 4) * chartHeight}
            stroke="#2d3748" strokeWidth="1" />
        ))}

        {/* Area fill */}
        <path d={areaPath} fill="url(#perfGradient)" />

        {/* Line */}
        <polyline points={points} fill="none" stroke={isPositive ? '#2962ff' : '#ef4444'} strokeWidth="2" />

        {/* Y-axis labels */}
        {[maxVal, (maxVal + minVal) / 2, minVal].map((val, i) => (
          <text key={i} x={padding.left - 8} y={getY(val) + 4} textAnchor="end" fill="#8b949e" fontSize="10">
            {formatCurrency(val)}
          </text>
        ))}
      </svg>
    );
  };

  return (
    <div className="panel performance-panel">
      <div className="panel-header">
        <h3>Account Performance</h3>
        <div className="timeframe-selector">
          {timeframes.map(tf => (
            <button key={tf} className={`tf-btn ${timeframe === tf ? 'active' : ''}`}
              onClick={() => onTimeframeChange(tf)}>{tf}</button>
          ))}
        </div>
      </div>
      <div className="panel-body">
        {loading ? <div className="panel-loading"><div className="spinner" /></div> : renderChart()}
      </div>
    </div>
  );
};

// ============================================
// Saved Strategies Panel
// ============================================
const SavedStrategiesPanel = ({ strategies, onToggleStrategy, onDeleteStrategy, loading }) => {
  return (
    <div className="panel strategies-panel">
      <div className="panel-header">
        <h3>Saved Strategies</h3>
        <span className="panel-count">{strategies?.filter(s => s.isRunning).length || 0} running</span>
      </div>
      <div className="panel-body">
        {loading ? (
          <div className="panel-loading"><div className="spinner" /></div>
        ) : !strategies || strategies.length === 0 ? (
          <div className="panel-empty">
            <span className="empty-icon">📋</span>
            <span>No saved strategies</span>
            <small>Create strategies in the Workflow Builder</small>
          </div>
        ) : (
          <div className="strategies-list">
            {strategies.map(strategy => (
              <div key={strategy.id} className={`strategy-item ${strategy.isRunning ? 'running' : ''}`}>
                <div className="strategy-info">
                  <span className="strategy-name">{strategy.name}</span>
                  <span className="strategy-symbol">{strategy.symbol} • {strategy.timeframe}</span>
                </div>
                <div className="strategy-actions">
                  {strategy.isRunning && <span className="status-dot" />}
                  <ToggleSwitch 
                    isOn={strategy.isRunning} 
                    onToggle={() => onToggleStrategy(strategy.id)}
                  />
                  <button 
                    className="delete-btn" 
                    onClick={() => onDeleteStrategy(strategy.id)}
                    title="Delete strategy"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// Live Signals Panel
// ============================================
const SignalsPanel = ({ signals, loading }) => {
  const getSignalClass = (signal) => {
    switch (signal?.toUpperCase()) {
      case 'BUY': return 'buy';
      case 'SELL': return 'sell';
      case 'HOLD': return 'hold';
      default: return 'neutral';
    }
  };

  return (
    <div className="panel signals-panel">
      <div className="panel-header">
        <h3>Live Signals</h3>
        <span className="live-indicator">● LIVE</span>
      </div>
      <div className="panel-body">
        {loading ? (
          <div className="panel-loading"><div className="spinner" /></div>
        ) : !signals || signals.length === 0 ? (
          <div className="panel-empty">
            <span>No active signals</span>
            <small>Enable strategies to see signals</small>
          </div>
        ) : (
          <div className="signals-list">
            <div className="signals-header">
              <span>Strategy</span>
              <span>Symbol</span>
              <span>Price</span>
              <span>Signal</span>
            </div>
            {signals.map((signal, index) => (
              <div key={index} className="signal-item">
                <span className="signal-strategy">{signal.strategyName}</span>
                <span className="signal-symbol">{signal.symbol}</span>
                <span className="signal-price">{formatCurrency(signal.price)}</span>
                <span className={`signal-action ${getSignalClass(signal.signal)}`}>
                  {signal.signal || 'HOLD'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// Flow Score Panel
// ============================================
const FlowScorePanel = ({ score, metrics, loading }) => {
  const getGradeColor = (score) => {
    if (score >= 80) return '#10b981';
    if (score >= 60) return '#2962ff';
    if (score >= 40) return '#f59e0b';
    return '#ef4444';
  };

  return (
    <div className="panel flow-score-panel">
      <div className="panel-header">
        <h3>Flow Score</h3>
      </div>
      <div className="panel-body">
        {loading ? (
          <div className="panel-loading"><div className="spinner" /></div>
        ) : (
          <div className="flow-score-content">
            <div className="score-ring">
              <svg viewBox="0 0 100 100" className="score-ring-svg">
                <circle cx="50" cy="50" r="40" fill="none" stroke="#2d3748" strokeWidth="8" />
                <circle cx="50" cy="50" r="40" fill="none" stroke={getGradeColor(score)}
                  strokeWidth="8" strokeLinecap="round"
                  strokeDasharray={`${score * 2.51} 251`}
                  transform="rotate(-90 50 50)" className="score-progress" />
                <text x="50" y="50" textAnchor="middle" dominantBaseline="middle"
                  fill={getGradeColor(score)} fontSize="24" fontWeight="700">{score}</text>
                <text x="50" y="65" textAnchor="middle" fill="#8b949e" fontSize="10">/100</text>
              </svg>
            </div>
            <div className="score-metrics">
              <div className="score-metric">
                <span className="metric-name">Win Rate</span>
                <span className="metric-val">{metrics?.winRate?.toFixed(1)}%</span>
              </div>
              <div className="score-metric">
                <span className="metric-name">Profit Factor</span>
                <span className="metric-val">{metrics?.profitFactor?.toFixed(2)}</span>
              </div>
              <div className="score-metric">
                <span className="metric-name">Sharpe</span>
                <span className="metric-val">{metrics?.sharpeRatio?.toFixed(2)}</span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ============================================
// Main Dashboard Component
// ============================================
const Dashboard = ({ onNavigate }) => {
  const [perfTimeframe, setPerfTimeframe] = useState('1M');
  const [savedStrategies, setSavedStrategies] = useState([]);
  const [syncComplete, setSyncComplete] = useState(false);

  // Sync localStorage workflows to backend on mount
  useEffect(() => {
    const doSync = async () => {
      await syncWorkflowsToBackend();
      setSyncComplete(true);
    };
    doSync();
  }, []);

  // Fetch data
  const { data: metrics, loading: metricsLoading } = useFetchData('/api/dashboard/metrics', 30000);
  const { data: perfData, loading: perfLoading } = useFetchData(`/api/dashboard/performance?timeframe=${perfTimeframe}`, 60000);
  const { data: flowScore, loading: scoreLoading } = useFetchData('/api/dashboard/flow-grade', 60000);
  const { data: signals, loading: signalsLoading } = useFetchData('/api/dashboard/signals', 5000);
  const { data: strategiesData, loading: strategiesLoading, refetch: refetchStrategies } = useFetchData('/api/strategies/saved', 10000);

  // Update saved strategies when data loads or after sync
  useEffect(() => {
    if (strategiesData) {
      setSavedStrategies(strategiesData);
    }
  }, [strategiesData]);

  // Refetch after sync completes
  useEffect(() => {
    if (syncComplete) {
      refetchStrategies();
    }
  }, [syncComplete, refetchStrategies]);

  // Toggle strategy on/off
  const handleToggleStrategy = async (strategyId) => {
    const strategy = savedStrategies.find(s => s.id === strategyId);
    if (!strategy) return;

    const newState = !strategy.isRunning;
    
    // Optimistic update
    setSavedStrategies(prev => prev.map(s => 
      s.id === strategyId ? { ...s, isRunning: newState } : s
    ));

    try {
      await fetch(`${API_BASE}/api/strategies/${strategyId}/toggle`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isRunning: newState })
      });
    } catch (err) {
      // Revert on error
      setSavedStrategies(prev => prev.map(s => 
        s.id === strategyId ? { ...s, isRunning: !newState } : s
      ));
    }
  };

  // Delete strategy
  const handleDeleteStrategy = async (strategyId) => {
    if (!confirm('Delete this strategy?')) return;
    
    setSavedStrategies(prev => prev.filter(s => s.id !== strategyId));
    
    try {
      await fetch(`${API_BASE}/api/strategies/${strategyId}`, {
        method: 'DELETE'
      });
    } catch (err) {
      refetchStrategies();
    }
  };

  // Derive metrics
  const netPnL = metrics?.netPnL ?? 0;
  const tradeCount = metrics?.tradeCount ?? 0;
  const profitFactor = metrics?.profitFactor ?? 0;
  const winPercent = metrics?.winPercent ?? 0;
  const winCount = metrics?.winCount ?? 0;
  const lossCount = metrics?.lossCount ?? 0;
  const avgWinLossRatio = metrics?.avgWinLossRatio ?? 0;
  const avgWin = metrics?.avgWin ?? 0;
  const avgLoss = metrics?.avgLoss ?? 0;

  return (
    <div className="dashboard-page">
      <DashboardSidebar onNavigate={onNavigate} activeRoute="home" />
      
      <main className="dashboard-main">
        <div className="dashboard-header">
          <h1>Dashboard</h1>
        </div>

        {/* Top Metrics Row */}
        <div className="metrics-row">
          <MetricCard label="Net P&L" value={formatCurrency(netPnL)} 
            subLabel={`${tradeCount} trades`} loading={metricsLoading} />
          <MetricCard label="Profit Factor" value={profitFactor.toFixed(2)}
            chart={<SemiCircleGauge value={profitFactor} maxValue={3} />} loading={metricsLoading} />
          <MetricCard label="Win %" value={`${winPercent.toFixed(1)}%`}
            subLabel={`${winCount} / ${winCount + lossCount}`}
            chart={<DonutGauge value={winCount} total={winCount + lossCount} />} loading={metricsLoading} />
          <MetricCard label="Avg Win/Loss" value={avgWinLossRatio.toFixed(2)}
            chart={<MiniBarChart winValue={avgWin} lossValue={avgLoss} />} loading={metricsLoading} />
        </div>

        {/* Main Content Grid */}
        <div className="dashboard-grid">
          {/* Left Column */}
          <div className="grid-left">
            <PerformanceChart data={perfData?.data || []} timeframe={perfTimeframe}
              onTimeframeChange={setPerfTimeframe} loading={perfLoading} />
            
            <SignalsPanel signals={signals || []} loading={signalsLoading} />
          </div>

          {/* Right Column */}
          <div className="grid-right">
            <SavedStrategiesPanel strategies={savedStrategies}
              onToggleStrategy={handleToggleStrategy} 
              onDeleteStrategy={handleDeleteStrategy}
              loading={strategiesLoading} />
            
            <FlowScorePanel score={flowScore?.score || 0} 
              metrics={flowScore?.metrics || {}} loading={scoreLoading} />
          </div>
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
