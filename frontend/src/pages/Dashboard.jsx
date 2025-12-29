import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import DashboardSidebar from '../components/DashboardSidebar';
import MiniTradeLog from '../components/dashboard/MiniTradeLog';
import './Dashboard.css';
import { 
  toggleStrategy as runnerToggle, 
  getLiveSignals, 
  getRunningCount,
  isStrategyRunning,
  MAX_STRATEGIES,
  clearAllSignals,
  deleteStrategy
} from '../services/StrategyRunner';
import {
  getAllTrades,
  calculateMetrics as calcTradeMetrics,
  getEquityCurve,
  getCumulativePnLCurve,
  getTimePnL,
  getRecentTrades,
  getDashboardData as getLocalDashboardData,
  getDashboardDataAsync
} from '../services/tradeService';

// API base URL - use Vite env var or default to local backend (kept for signals/strategies endpoints)
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE)
  ? import.meta.env.VITE_API_BASE.replace(/\/$/, '')
  : 'http://127.0.0.1:5000';

// LocalStorage keys - matching WorkflowBuilder
const SAVES_KEY = 'flowgrid_workflow_v1::saves';
const ENABLED_STRATEGIES_KEY = 'flowgrid_enabled_strategies';
const DASHBOARD_LAYOUT_KEY = 'flowgrid_dashboard_layout';

// =============================================================================
// Utility Functions
// =============================================================================

const formatCurrency = (value, showSign = false) => {
  if (value === null || value === undefined || isNaN(value)) return '--';
  const sign = showSign && value > 0 ? '+' : '';
  // Format as percentage (no dollar sign) for percentage-based P&L system
  return `${sign}${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
};

const formatPercent = (value, showSign = false) => {
  if (value === null || value === undefined || isNaN(value)) return '--';
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
};

const formatNumber = (value, decimals = 2) => {
  if (value === null || value === undefined || isNaN(value)) return '--';
  return value.toLocaleString('en-US', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};

// =============================================================================
// Mini Chart Components
// =============================================================================

// Sparkline chart for P&L trend
const SparklineChart = ({ data, positive = true, width = 80, height = 40 }) => {
  if (!data || data.length < 2) {
    // Show placeholder line
    return (
      <div className="metric-sparkline">
        <svg viewBox={`0 0 ${width} ${height}`}>
          <path
            d={`M 0 ${height/2} L ${width} ${height/2}`}
            fill="none"
            stroke="rgba(255,255,255,0.1)"
            strokeWidth="2"
          />
        </svg>
      </div>
    );
  }
  
  const values = data.map(d => typeof d === 'number' ? d : d.v || d.value || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  
  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * width;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');
  
  const isPositive = values[values.length - 1] >= values[0];
  const color = isPositive ? '#3b82f6' : '#ef4444';
  
  // Create area path
  const areaPath = `M 0,${height} L ${points.split(' ').map((p, i) => {
    const [x, y] = p.split(',');
    return `${x},${y}`;
  }).join(' L ')} L ${width},${height} Z`;
  
  return (
    <div className="metric-sparkline">
      <svg viewBox={`0 0 ${width} ${height}`}>
        <defs>
          <linearGradient id={`sparkGradient-${positive}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.3" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={areaPath}
          fill={`url(#sparkGradient-${positive})`}
        />
        <polyline
          points={points}
          fill="none"
          stroke={color}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
};

// Ring/Donut chart for win rate
const WinRateRing = ({ winRate = 0, wins = 0, losses = 0, neutral = 0 }) => {
  const radius = 24;
  const circumference = 2 * Math.PI * radius;
  const winPercent = Math.min(100, Math.max(0, winRate));
  const offset = circumference - (winPercent / 100) * circumference;
  
  return (
    <div className="metric-ring-chart">
      <svg viewBox="0 0 60 60">
        <circle
          className="ring-bg"
          cx="30"
          cy="30"
          r={radius}
        />
        <circle
          className={`ring-progress ${winPercent >= 50 ? 'positive' : 'negative'}`}
          cx="30"
          cy="30"
          r={radius}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <div className="metric-trade-badges">
        <span className="trade-badge wins">{wins}</span>
        {neutral > 0 && <span className="trade-badge neutral">{neutral}</span>}
        <span className="trade-badge losses">{losses}</span>
      </div>
    </div>
  );
};

// Simple ring for profit factor
const ProfitFactorRing = ({ value = 0 }) => {
  const displayValue = value === Infinity ? '∞' : formatNumber(value, 2);
  const className = value >= 1.5 ? 'positive' : value >= 1 ? 'neutral' : 'negative';
  
  return (
    <div className={`profit-factor-ring ${className}`}>
      <span style={{ fontSize: '14px', fontWeight: 700, fontFamily: 'var(--font-mono)' }}>
        {displayValue}
      </span>
    </div>
  );
};

// =============================================================================
// Enhanced Metric Card Component with Mini Charts
// =============================================================================

const MetricCard = ({ 
  label, 
  value, 
  subValue, 
  delta, 
  tooltip, 
  isNegative, 
  isEmpty, 
  emptyMessage,
  chartType,
  chartData,
  wins,
  losses,
  neutral
}) => {
  const hasPositiveDelta = delta !== undefined && delta > 0;
  const hasNegativeDelta = delta !== undefined && delta < 0;
  const showEmptyState = isEmpty || value === '--' || value === '0' || value === 0 || value === '0%' || value === '$0.00' || value === '-0.00%';
  
  // Render appropriate mini chart
  const renderChart = () => {
    if (!chartType) return null;
    
    switch (chartType) {
      case 'sparkline':
        return <SparklineChart data={chartData} positive={!hasNegativeDelta} />;
      case 'winrate':
        const winRate = typeof value === 'string' ? parseFloat(value) : value;
        return <WinRateRing winRate={winRate} wins={wins} losses={losses} neutral={neutral} />;
      case 'profitfactor':
        const pfValue = value === '∞' ? Infinity : (typeof value === 'string' ? parseFloat(value) : value);
        return <ProfitFactorRing value={pfValue} />;
      default:
        return null;
    }
  };
  
  const hasChart = chartType && !showEmptyState;
  
  return (
    <div className={`metric-card ${showEmptyState ? 'empty-state' : ''}`}>
      <div className={hasChart ? 'metric-card-with-chart' : ''}>
        <div className={hasChart ? 'metric-card-content' : ''}>
          <div className="metric-label">
            {label}
            {tooltip && (
              <span className="metric-info-icon tooltip-trigger">
                ⓘ
                <span className="tooltip-content">{tooltip}</span>
              </span>
            )}
            {chartType === 'winrate' && !showEmptyState && (
              <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--text-muted)' }}>
                {(wins || 0) + (losses || 0) + (neutral || 0)}
              </span>
            )}
          </div>
          <div className={`metric-value ${isNegative ? 'negative' : ''} ${hasPositiveDelta ? 'positive' : ''} ${hasNegativeDelta ? 'negative' : ''} ${showEmptyState ? 'dimmed' : ''}`}>
            {showEmptyState && emptyMessage ? emptyMessage : value}
          </div>
          {subValue && (
            <div className={`metric-subvalue ${hasPositiveDelta ? 'positive' : ''} ${hasNegativeDelta ? 'negative' : ''}`}>
              {subValue}
            </div>
          )}
          {showEmptyState && !emptyMessage && (
            <div className="metric-empty-hint">No trades yet</div>
          )}
        </div>
        {hasChart && renderChart()}
      </div>
    </div>
  );
};

// =============================================================================
// Equity Chart Component (Canvas-based)
// =============================================================================

const EquityChart = ({ equityCurve, cumulativePnl, timeframe, showDrawdown = true }) => {
  const canvasRef = React.useRef(null);
  // Persist chart mode preference in localStorage
  const [chartMode, setChartMode] = useState(() => {
    return localStorage.getItem('flowgrid_chart_mode') || 'equity';
  });
  const [hoveredPoint, setHoveredPoint] = useState(null);
  
  // Save chart mode when changed
  const handleModeChange = useCallback((mode) => {
    setChartMode(mode);
    localStorage.setItem('flowgrid_chart_mode', mode);
  }, []);
  
  const data = useMemo(() => {
    return chartMode === 'equity' ? equityCurve : cumulativePnl;
  }, [chartMode, equityCurve, cumulativePnl]);
  
  const hasData = data && data.length >= 1;
  // For single point data, only consider empty if value is the base (100 for equity, 0 for pnl)
  const baseValue = chartMode === 'equity' ? 100 : 0;
  const isEmpty = !hasData || (data.length === 1 && data[0]?.v === baseValue) || 
    (data.length > 1 && data.every(d => d.v === data[0]?.v));
  
  // Check if we have a single data point (special rendering)
  const isSinglePoint = hasData && data.length === 1 && data[0]?.v !== baseValue;
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data || data.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 20, bottom: 30, left: 70 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Get values - ALWAYS prepend origin point so graph starts from baseline
    const baseValue = chartMode === 'equity' ? 100 : 0;
    let values = [baseValue, ...data.map(d => d.v)];
    let drawdowns = [0, ...data.map(d => d.drawdown || 0)];
    
    const minVal = Math.min(...values, baseValue) * 0.98;
    const maxVal = Math.max(...values, baseValue) * 1.02;
    const range = maxVal - minVal || 1;
    
    // Draw grid
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    // Horizontal grid lines
    const gridLines = 5;
    for (let i = 0; i <= gridLines; i++) {
      const y = padding.top + (chartHeight / gridLines) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
      
      // Y-axis labels
      const val = maxVal - (range / gridLines) * i;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'right';
      ctx.fillText(formatCurrency(val), padding.left - 8, y + 4);
    }
    
    // Draw drawdown regions if enabled
    if (showDrawdown && chartMode === 'equity') {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
      ctx.beginPath();
      
      for (let i = 0; i < data.length; i++) {
        const x = padding.left + (i / (data.length - 1)) * chartWidth;
        const dd = drawdowns[i] || 0;
        const ddHeight = (dd / 100) * chartHeight * 0.5; // Scale drawdown
        const y = padding.top;
        
        if (i === 0) {
          ctx.moveTo(x, y);
        }
        ctx.lineTo(x, y + ddHeight);
      }
      
      // Close the path
      ctx.lineTo(padding.left + chartWidth, padding.top);
      ctx.lineTo(padding.left, padding.top);
      ctx.closePath();
      ctx.fill();
    }
    
    // Draw area gradient
    const gradient = ctx.createLinearGradient(0, padding.top, 0, height - padding.bottom);
    const isPositive = values[values.length - 1] >= values[0];
    
    if (isPositive) {
      gradient.addColorStop(0, 'rgba(59, 130, 246, 0.3)');
      gradient.addColorStop(1, 'rgba(59, 130, 246, 0)');
    } else {
      gradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
      gradient.addColorStop(1, 'rgba(239, 68, 68, 0)');
    }
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(padding.left, height - padding.bottom);
    
    for (let i = 0; i < values.length; i++) {
      const x = padding.left + (i / (values.length - 1)) * chartWidth;
      const y = padding.top + ((maxVal - values[i]) / range) * chartHeight;
      ctx.lineTo(x, y);
    }
    
    ctx.lineTo(padding.left + chartWidth, height - padding.bottom);
    ctx.closePath();
    ctx.fill();
    
    // Draw line
    ctx.strokeStyle = '#3B82F6';
    ctx.lineWidth = 2;
    ctx.beginPath();
    
    for (let i = 0; i < values.length; i++) {
      const x = padding.left + (i / (values.length - 1)) * chartWidth;
      const y = padding.top + ((maxVal - values[i]) / range) * chartHeight;
      
      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.stroke();
    
    // Draw hovered point
    if (hoveredPoint !== null && hoveredPoint < values.length) {
      const x = padding.left + (hoveredPoint / (values.length - 1)) * chartWidth;
      const y = padding.top + ((maxVal - values[hoveredPoint]) / range) * chartHeight;
      
      ctx.fillStyle = '#3B82F6';
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      
      // Tooltip
      ctx.fillStyle = 'rgba(0, 0, 0, 0.8)';
      ctx.fillRect(x - 40, y - 30, 80, 22);
      ctx.fillStyle = '#fff';
      ctx.font = '11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(formatCurrency(values[hoveredPoint]), x, y - 14);
    }
    
  }, [data, showDrawdown, chartMode, hoveredPoint]);
  
  const handleMouseMove = useCallback((e) => {
    if (!data || data.length === 0) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padding = { left: 70, right: 20 };
    const chartWidth = rect.width - padding.left - padding.right;
    
    const relX = x - padding.left;
    const index = Math.round((relX / chartWidth) * (data.length - 1));
    
    if (index >= 0 && index < data.length) {
      setHoveredPoint(index);
    } else {
      setHoveredPoint(null);
    }
  }, [data]);
  
  const handleMouseLeave = useCallback(() => {
    setHoveredPoint(null);
  }, []);
  
  return (
    <div className="equity-chart-container">
      <div className="chart-toggles">
        <button
          className={`chart-toggle ${chartMode === 'equity' ? 'active' : ''}`}
          onClick={() => handleModeChange('equity')}
          title="Show account equity over time"
        >
          Equity
        </button>
        <button
          className={`chart-toggle ${chartMode === 'pnl' ? 'active' : ''}`}
          onClick={() => handleModeChange('pnl')}
          title="Show cumulative realized P&L"
        >
          Cumulative P&L
        </button>
      </div>
      {isEmpty ? (
        <div className="chart-empty-state">
          <div className="chart-placeholder" />
          <div className="chart-empty-message">
            <span className="empty-icon icon-chart"></span>
            <p>{chartMode === 'equity' ? 'Equity curve will appear here' : 'P&L history will appear here'}</p>
            <p className="empty-hint">Enable a strategy to start tracking performance</p>
          </div>
        </div>
      ) : (
        <canvas
          ref={canvasRef}
          className="equity-canvas"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        />
      )}
    </div>
  );
};

// =============================================================================
// Strategy Control Panel Component
// =============================================================================

const StrategyControlPanel = ({ strategies, onToggle, onEdit, onDelete, loading, togglingStrategy }) => {
  const visibleStrategies = strategies.slice(0, 5);
  const hasMore = strategies.length > 5;
  const [showAll, setShowAll] = useState(false);
  
  const displayStrategies = showAll ? strategies : visibleStrategies;
  
  return (
    <div className="strategy-control-panel">
      {loading && (
        <div className="panel-loading">
          <span className="loading-spinner">⏳</span> Loading strategies...
        </div>
      )}
      {!loading && strategies.length === 0 && (
        <div className="empty-strategies">
          <div className="empty-icon icon-strategies"></div>
          <p>No strategies saved yet</p>
          <p className="empty-hint">Create strategies in the Strategy Builder</p>
        </div>
      )}
      {!loading && displayStrategies.map((strategy) => {
        const isRunning = isStrategyRunning(strategy.name);
        const isToggling = togglingStrategy === strategy.name;
        
        return (
          <div
            key={strategy.name}
            className={`strategy-row ${strategy.enabled ? 'enabled' : 'disabled'} ${isRunning ? 'running' : ''} ${isToggling ? 'toggling' : ''}`}
          >
            <label className={`strategy-toggle-switch ${isToggling ? 'disabled' : ''}`}>
              <input
                type="checkbox"
                checked={strategy.enabled}
                onChange={() => !isToggling && onToggle(strategy.name, !strategy.enabled)}
                disabled={isToggling}
              />
              <span className="toggle-slider">
                {isToggling && <span className="toggle-loading">⏳</span>}
              </span>
            </label>
            <div className="strategy-details">
              <div className="strategy-name">
                {strategy.name}
                {isRunning && (
                  <span className="live-indicator">LIVE</span>
                )}
              </div>
              <div className="strategy-stats">
                <span className={`stat-pnl ${strategy.net_pnl >= 0 ? 'positive' : 'negative'}`}>
                  {formatCurrency(strategy.net_pnl, true)}
                </span>
                <span className="stat-divider">•</span>
                <span className="stat-winrate">{strategy.win_rate?.toFixed(1) || 0}% win</span>
                <span className="stat-divider">•</span>
                <span className="stat-trades">{strategy.trade_count || 0} trades</span>
              </div>
            </div>
            <div className="strategy-actions">
              <button 
                className="strategy-edit-btn" 
                onClick={() => onEdit(strategy)}
                disabled={isToggling}
                title="Edit strategy"
              >
              </button>
              <button 
                className="strategy-delete-btn" 
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete(strategy.name);
                }}
                disabled={isToggling || strategy.enabled}
                title={strategy.enabled ? "Stop strategy before deleting" : "Delete strategy"}
              >
              </button>
            </div>
          </div>
        );
      })}
      {hasMore && !showAll && (
        <button className="show-more-btn" onClick={() => setShowAll(true)}>
          Show {strategies.length - 5} more...
        </button>
      )}
      {showAll && hasMore && (
        <button className="show-more-btn" onClick={() => setShowAll(false)}>
          Show less
        </button>
      )}
    </div>
  );
};

// =============================================================================
// Risk & Trade Quality Panel Component
// =============================================================================

const RiskQualityPanel = ({ riskData }) => {
  const {
    avg_win = 0,
    avg_loss = 0,
    largest_win = 0,
    largest_loss = 0,
    profit_factor = 0,
    risk_reward_ratio = 0
  } = riskData || {};
  
  const maxBar = Math.max(Math.abs(avg_win), Math.abs(avg_loss), 1);
  const hasData = avg_win > 0 || avg_loss > 0 || largest_win > 0 || largest_loss > 0;
  
  return (
    <div className="risk-quality-panel">
      <div className="risk-bars">
        <div className="risk-bar-row">
          <span className="risk-label tooltip-trigger">
            Avg Win
            <span className="tooltip-content">Mean profit per winning trade = Total Wins ÷ # Wins</span>
          </span>
          <div className="risk-bar-container">
            <div
              className={`risk-bar positive ${!hasData ? 'empty' : ''}`}
              style={{ width: hasData ? `${(avg_win / maxBar) * 100}%` : '0%' }}
            />
          </div>
          <span className={`risk-value positive ${!hasData ? 'dimmed' : ''}`}>{formatCurrency(avg_win)}</span>
        </div>
        <div className="risk-bar-row">
          <span className="risk-label tooltip-trigger">
            Avg Loss
            <span className="tooltip-content">Mean loss per losing trade = Total Losses ÷ # Losses</span>
          </span>
          <div className="risk-bar-container">
            <div
              className={`risk-bar negative ${!hasData ? 'empty' : ''}`}
              style={{ width: hasData ? `${(Math.abs(avg_loss) / maxBar) * 100}%` : '0%' }}
            />
          </div>
          <span className={`risk-value negative ${!hasData ? 'dimmed' : ''}`}>{formatCurrency(-Math.abs(avg_loss))}</span>
        </div>
      </div>
      {!hasData && (
        <div className="risk-empty-hint">
          Win/loss metrics will populate after your first closed trade
        </div>
      )}
      <div className="risk-stats-grid">
        <div className="risk-stat tooltip-trigger">
          <span className="risk-stat-label">Largest Win</span>
          <span className={`risk-stat-value positive ${!hasData ? 'dimmed' : ''}`}>{formatCurrency(largest_win)}</span>
          <span className="tooltip-content">Best single trade profit</span>
        </div>
        <div className="risk-stat tooltip-trigger">
          <span className="risk-stat-label">Largest Loss</span>
          <span className={`risk-stat-value negative ${!hasData ? 'dimmed' : ''}`}>{formatCurrency(largest_loss)}</span>
          <span className="tooltip-content">Worst single trade loss</span>
        </div>
        <div className="risk-stat tooltip-trigger">
          <span className="risk-stat-label">Risk/Reward</span>
          <span className={`risk-stat-value ${!hasData ? 'dimmed' : ''}`}>{formatNumber(risk_reward_ratio)}</span>
          <span className="tooltip-content">Avg Win ÷ Avg Loss. Higher is better.</span>
        </div>
        <div className="risk-stat tooltip-trigger">
          <span className="risk-stat-label">Profit Factor</span>
          <span className={`risk-stat-value ${profit_factor >= 1 ? 'positive' : 'negative'} ${!hasData ? 'dimmed' : ''}`}>
            {profit_factor === Infinity ? '∞' : formatNumber(profit_factor)}
          </span>
          <span className="tooltip-content">Gross Profit ÷ Gross Loss. Values &gt; 1 = profitable</span>
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Time-Based Performance Panel Component
// =============================================================================

const TimePerformancePanel = ({ dataByDay, dataByHour }) => {
  const [view, setView] = useState('day'); // 'day' | 'hour'
  const canvasRef = useRef(null);
  
  const data = view === 'day' ? dataByDay : dataByHour;
  const hasData = (data || []).some(d => d.pnl !== 0);
  
  // Default skeleton labels for empty state
  const defaultDayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
  const defaultHourLabels = ['9AM', '10AM', '11AM', '12PM', '1PM', '2PM', '3PM'];
  const skeletonData = view === 'day' 
    ? defaultDayLabels.map(l => ({ label: l, pnl: 0 }))
    : defaultHourLabels.map(l => ({ label: l, pnl: 0 }));
  
  const displayData = hasData ? data : skeletonData;
  
  // Draw bar chart on canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !displayData || displayData.length === 0) return;
    
    const ctx = canvas.getContext('2d');
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const padding = { top: 15, bottom: 25, left: 10, right: 10 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    ctx.clearRect(0, 0, width, height);
    
    // Calculate max absolute value for scaling
    const maxAbs = Math.max(...displayData.map(d => Math.abs(d.pnl)), 0.01);
    
    // Center line Y position (middle of chart area)
    const centerY = padding.top + chartHeight / 2;
    
    // Draw center line (zero line)
    ctx.strokeStyle = 'rgba(156, 163, 175, 0.3)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(padding.left, centerY);
    ctx.lineTo(width - padding.right, centerY);
    ctx.stroke();
    ctx.setLineDash([]);
    
    // Bar settings
    const barCount = displayData.length;
    const gap = 8;
    const totalGaps = (barCount - 1) * gap;
    const barWidth = Math.min(32, (chartWidth - totalGaps) / barCount);
    const totalBarsWidth = barCount * barWidth + totalGaps;
    const startX = padding.left + (chartWidth - totalBarsWidth) / 2;
    
    // Draw bars
    displayData.forEach((item, i) => {
      const x = startX + i * (barWidth + gap);
      const barHeight = (Math.abs(item.pnl) / maxAbs) * (chartHeight / 2 - 5);
      
      // Determine bar position and color
      const isPositive = item.pnl >= 0;
      const y = isPositive ? centerY - barHeight : centerY;
      
      // Draw bar with rounded corners
      const radius = 2;
      ctx.beginPath();
      
      if (hasData && item.pnl !== 0) {
        ctx.fillStyle = isPositive ? '#3b82f6' : '#ef4444';
        
        if (isPositive) {
          // Rounded top corners for positive bars
          ctx.moveTo(x + radius, y);
          ctx.lineTo(x + barWidth - radius, y);
          ctx.quadraticCurveTo(x + barWidth, y, x + barWidth, y + radius);
          ctx.lineTo(x + barWidth, centerY);
          ctx.lineTo(x, centerY);
          ctx.lineTo(x, y + radius);
          ctx.quadraticCurveTo(x, y, x + radius, y);
        } else {
          // Rounded bottom corners for negative bars
          ctx.moveTo(x, centerY);
          ctx.lineTo(x + barWidth, centerY);
          ctx.lineTo(x + barWidth, y + barHeight - radius);
          ctx.quadraticCurveTo(x + barWidth, y + barHeight, x + barWidth - radius, y + barHeight);
          ctx.lineTo(x + radius, y + barHeight);
          ctx.quadraticCurveTo(x, y + barHeight, x, y + barHeight - radius);
          ctx.lineTo(x, centerY);
        }
      } else {
        // Skeleton bar (small gray placeholder)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.05)';
        const skeletonHeight = chartHeight / 6;
        const skY = centerY - skeletonHeight / 2;
        ctx.moveTo(x + radius, skY);
        ctx.lineTo(x + barWidth - radius, skY);
        ctx.quadraticCurveTo(x + barWidth, skY, x + barWidth, skY + radius);
        ctx.lineTo(x + barWidth, skY + skeletonHeight - radius);
        ctx.quadraticCurveTo(x + barWidth, skY + skeletonHeight, x + barWidth - radius, skY + skeletonHeight);
        ctx.lineTo(x + radius, skY + skeletonHeight);
        ctx.quadraticCurveTo(x, skY + skeletonHeight, x, skY + skeletonHeight - radius);
        ctx.lineTo(x, skY + radius);
        ctx.quadraticCurveTo(x, skY, x + radius, skY);
      }
      
      ctx.closePath();
      ctx.fill();
      
      // Draw label
      ctx.fillStyle = hasData ? '#9ca3af' : '#4b5563';
      ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(item.label, x + barWidth / 2, height - 8);
    });
    
    // Draw Y-axis labels (only if there's data)
    if (hasData) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
      ctx.textAlign = 'right';
      
      // Top label (max positive)
      ctx.fillText(`+${maxAbs.toFixed(0)}`, padding.left + chartWidth + 5, padding.top + 10);
      
      // Bottom label (max negative)
      ctx.fillText(`-${maxAbs.toFixed(0)}`, padding.left + chartWidth + 5, height - padding.bottom - 5);
    }
    
  }, [displayData, hasData, view]);
  
  return (
    <div className="time-performance-panel">
      <div className={`time-chart-canvas-container ${!hasData ? 'skeleton' : ''}`}>
        <canvas ref={canvasRef} className="time-chart-canvas" />
        {!hasData && (
          <div className="time-empty-overlay">
            <span>Performance by time will appear after trades close</span>
          </div>
        )}
      </div>
      <div className="time-tabs">
        <button
          className={`time-tab ${view === 'day' ? 'active' : ''}`}
          onClick={() => setView('day')}
          title="View P&L breakdown by day of week"
        >
          By Day
        </button>
        <button
          className={`time-tab ${view === 'hour' ? 'active' : ''}`}
          onClick={() => setView('hour')}
          title="View P&L breakdown by trading hour"
        >
          By Hour
        </button>
      </div>
    </div>
  );
};

// =============================================================================
// Current Signals Panel Component
// =============================================================================

// Activity type configurations
const ACTIVITY_ICONS = {
  signal: '◆',
  trade_open: '↗',
  trade_close: '↘',
  strategy_start: '▸',
  strategy_stop: '■',
  strategy_edit: '○',
  default: '·'
};

const RecentTradesPanel = ({ trades, activityLog, onTradeClick }) => {
  // Combine trades and activity events
  const allActivity = useMemo(() => {
    const combined = [...(trades || [])];
    
    // Add activity log items
    if (activityLog && activityLog.length > 0) {
      activityLog.forEach(event => {
        combined.push({
          id: event.id || `event-${event.timestamp}`,
          type: event.type,
          timestamp: event.timestamp,
          strategy_name: event.strategy_name,
          symbol: event.symbol || '',
          message: event.message,
          isEvent: true
        });
      });
    }
    
    // Sort by timestamp descending
    combined.sort((a, b) => {
      const timeA = a.timestamp || a.exitTime || '';
      const timeB = b.timestamp || b.exitTime || '';
      return timeB.localeCompare(timeA);
    });
    
    return combined.slice(0, 15);
  }, [trades, activityLog]);
  
  if (allActivity.length === 0) {
    return (
      <div className="recent-trades-panel empty-panel">
        <div className="no-trades">
          <span className="empty-icon icon-list"></span>
          <p>No current signals</p>
          <p className="empty-hint">Active strategy signals will appear here</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="recent-trades-panel">
      {allActivity.map((item, i) => {
        // Handle activity events (non-trade items)
        if (item.isEvent) {
          const icon = ACTIVITY_ICONS[item.type] || ACTIVITY_ICONS.default;
          const timeStr = item.timestamp ? new Date(item.timestamp).toLocaleTimeString() : '';
          
          return (
            <div key={item.id || i} className={`activity-row event-${item.type}`}>
              <span className="activity-icon">{icon}</span>
              <div className="activity-info">
                <span className="activity-message">{item.message || item.type}</span>
                {item.strategy_name && <span className="activity-strategy">{item.strategy_name}</span>}
              </div>
              <span className="activity-time">{timeStr}</span>
            </div>
          );
        }
        
        // Handle trade/signal items
        const isLiveSignal = item.timestamp && !item.exitTime;
        const timeStr = item.timestamp 
          ? new Date(item.timestamp).toLocaleTimeString()
          : item.exitTime 
            ? new Date(item.exitTime).toLocaleTimeString()
            : '';
        
        const direction = (item.direction || (item.type === 'entry' ? 'BUY' : 'SELL')).toLowerCase();
        const isBuy = direction === 'buy' || direction === 'long';
        
        // Extract symbol from strategy config or parse from strategy name as fallback
        const displaySymbol = item.symbol && item.symbol !== 'SPY' 
          ? item.symbol 
          : (item.strategy_name?.split(' ')[0] || item.symbol || 'SPY');
        
        return (
          <div
            key={item.id || i}
            className={`trade-row ${isLiveSignal ? `live-signal ${isBuy ? 'buy' : 'sell'}` : ''}`}
            onClick={() => onTradeClick?.(item)}
          >
            <span className={`trade-direction ${direction}`}>
              {item.direction || (item.type === 'entry' ? 'BUY' : 'SELL')}
            </span>
            <div className="trade-info">
              <span className="trade-strategy">{item.strategy_name}</span>
              {item.confidence && <span className="trade-node-info">{item.confidence}</span>}
              {timeStr && <span className="trade-time">{timeStr}</span>}
            </div>
            <span className={`trade-pnl ${isLiveSignal ? 'live-price' : ((item.pnl || 0) >= 0 ? 'positive' : 'negative')}`}>
              <span className="trade-symbol-inline">{displaySymbol}</span>
              {item.pnl !== undefined && item.pnl !== null 
                ? formatCurrency(item.pnl, true) 
                : (item.price ? `@${item.price.toFixed(2)}` : '--')}
            </span>
          </div>
        );
      })}
    </div>
  );
};

// =============================================================================
// Main Dashboard Component
// =============================================================================

const Dashboard = ({ onNavigate }) => {
  const [timeframe, setTimeframe] = useState('1M');
  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [localStrategies, setLocalStrategies] = useState([]);
  const [enabledStrategies, setEnabledStrategies] = useState({});
  const [togglingStrategy, setTogglingStrategy] = useState(null); // Track which strategy is currently toggling
  const [activityLog, setActivityLog] = useState([]); // Track strategy events for Recent Activity
  const [displayName, setDisplayName] = useState(() => localStorage.getItem('flowgrid_display_name') || '');
  
  // Edit Dashboard Mode State
  const [editMode, setEditMode] = useState(false);
  const [panelOrder, setPanelOrder] = useState(['performance', 'strategies', 'risk', 'time', 'trades']);
  const [hiddenPanels, setHiddenPanels] = useState([]);
  const [draggedPanel, setDraggedPanel] = useState(null);
  const [dragOverPanel, setDragOverPanel] = useState(null);
  
  // Listen for settings changes (display name)
  useEffect(() => {
    const handleSettingsUpdate = (e) => {
      if (e.detail?.displayName !== undefined) {
        setDisplayName(e.detail.displayName);
      }
    };
    window.addEventListener('flowgrid:settings-updated', handleSettingsUpdate);
    return () => window.removeEventListener('flowgrid:settings-updated', handleSettingsUpdate);
  }, []);
  
  // Load saved layout from localStorage
  useEffect(() => {
    const savedLayout = localStorage.getItem(DASHBOARD_LAYOUT_KEY);
    if (savedLayout) {
      try {
        const { order, hidden } = JSON.parse(savedLayout);
        if (order) setPanelOrder(order);
        if (hidden) setHiddenPanels(hidden);
      } catch (e) {
        console.error('Failed to load dashboard layout:', e);
      }
    }
  }, []);
  
  // Save layout to localStorage
  const saveLayout = useCallback(() => {
    localStorage.setItem(DASHBOARD_LAYOUT_KEY, JSON.stringify({
      order: panelOrder,
      hidden: hiddenPanels
    }));
    setEditMode(false);
  }, [panelOrder, hiddenPanels]);
  
  // Reset layout to default
  const resetLayout = useCallback(() => {
    const defaultOrder = ['performance', 'strategies', 'risk', 'time', 'trades'];
    setPanelOrder(defaultOrder);
    setHiddenPanels([]);
    localStorage.removeItem(DASHBOARD_LAYOUT_KEY);
    setEditMode(false);
  }, []);
  
  // Toggle panel visibility
  const togglePanelVisibility = useCallback((panelId) => {
    setHiddenPanels(prev => 
      prev.includes(panelId) 
        ? prev.filter(id => id !== panelId)
        : [...prev, panelId]
    );
  }, []);
  
  // Drag and drop handlers
  const handleDragStart = useCallback((e, panelId) => {
    setDraggedPanel(panelId);
    e.dataTransfer.effectAllowed = 'move';
  }, []);
  
  const handleDragOver = useCallback((e, panelId) => {
    e.preventDefault();
    if (draggedPanel && draggedPanel !== panelId) {
      setDragOverPanel(panelId);
    }
  }, [draggedPanel]);
  
  const handleDragLeave = useCallback(() => {
    setDragOverPanel(null);
  }, []);
  
  const handleDrop = useCallback((e, targetPanelId) => {
    e.preventDefault();
    if (draggedPanel && draggedPanel !== targetPanelId) {
      setPanelOrder(prev => {
        const newOrder = [...prev];
        const draggedIdx = newOrder.indexOf(draggedPanel);
        const targetIdx = newOrder.indexOf(targetPanelId);
        newOrder.splice(draggedIdx, 1);
        newOrder.splice(targetIdx, 0, draggedPanel);
        return newOrder;
      });
    }
    setDraggedPanel(null);
    setDragOverPanel(null);
  }, [draggedPanel]);
  
  const handleDragEnd = useCallback(() => {
    setDraggedPanel(null);
    setDragOverPanel(null);
  }, []);
  
  // Load strategies from localStorage (where WorkflowBuilder saves them)
  const loadLocalStrategies = useCallback(() => {
    try {
      const raw = localStorage.getItem(SAVES_KEY);
      const enabledRaw = localStorage.getItem(ENABLED_STRATEGIES_KEY);
      
      if (raw) {
        const map = JSON.parse(raw);
        const enabled = enabledRaw ? JSON.parse(enabledRaw) : {};
        
        const list = Object.keys(map).map(name => ({
          name,
          enabled: !!enabled[name],
          savedAt: map[name]?.savedAt || null,
          nodes: map[name]?.nodes || [],
          connections: map[name]?.connections || []
        }));
        
        // Sort by savedAt descending
        list.sort((a, b) => {
          if (!a.savedAt) return 1;
          if (!b.savedAt) return -1;
          return new Date(b.savedAt) - new Date(a.savedAt);
        });
        
        setLocalStrategies(list);
        setEnabledStrategies(enabled);
      } else {
        setLocalStrategies([]);
        setEnabledStrategies({});
      }
    } catch (e) {
      console.error('Error loading local strategies:', e);
      setLocalStrategies([]);
    }
  }, []);
  
  // Fetch dashboard data from backend API with localStorage fallback
  const fetchDashboardData = useCallback(async (dateRange) => {
    try {
      setError(null);
      
      // Try to get data from backend API first, falls back to localStorage
      const localData = await getDashboardDataAsync();
      
      // Log data source for debugging
      console.log(`[Dashboard] Data source: ${localData.source || 'unknown'}`);
      
      // Merge with local strategies info
      const strategiesWithMetrics = localStrategies.map(s => {
        const stratData = localData.strategies?.find(st => st.name === s.name);
        return {
          name: s.name,
          enabled: s.enabled,
          net_pnl: stratData?.total_pnl || 0,
          win_rate: stratData ? (stratData.wins / (stratData.trade_count || 1)) * 100 : 0,
          trade_count: stratData?.trade_count || 0,
          created_at: s.savedAt,
          updated_at: s.savedAt
        };
      });
      
      const dashData = {
        ...localData,
        strategies: strategiesWithMetrics
      };
      
      setDashboardData(dashData);
      setLastUpdate(new Date());
      
      // Log trade count for debugging
      const trades = getAllTrades();
      console.log(`[Dashboard] Loaded ${localData.metrics?.total_trades || trades.length} trades`);
      
    } catch (err) {
      console.error('Failed to load dashboard data:', err);
      setError(err.message);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Load strategies from localStorage on mount and listen for changes
  useEffect(() => {
    // Load strategies immediately and turn off loading once done
    loadLocalStrategies();
    setLoading(false);
    
    // Listen for strategy saves from WorkflowBuilder
    const handleStrategySaved = () => {
      loadLocalStrategies();
      // Also refresh dashboard data to reflect new strategy
      setTimeout(() => fetchDashboardData(), 500);
    };
    
    // Listen for strategy toggles from StrategiesPanel
    const handleStrategyToggled = (e) => {
      const { name, enabled } = e.detail || {};
      if (name) {
        setLocalStrategies(prev => 
          prev.map(s => s.name === name ? { ...s, enabled } : s)
        );
        // Reload enabled strategies from localStorage
        const raw = localStorage.getItem(ENABLED_STRATEGIES_KEY);
        if (raw) {
          setEnabledStrategies(JSON.parse(raw));
        }
      }
    };
    
    const handleStorageChange = (e) => {
      if (e.key === SAVES_KEY || e.key === ENABLED_STRATEGIES_KEY) {
        loadLocalStrategies();
      }
    };
    
    window.addEventListener('flowgrid:strategy-saved', handleStrategySaved);
    window.addEventListener('flowgrid:strategy-toggled', handleStrategyToggled);
    window.addEventListener('storage', handleStorageChange);
    
    // Poll for changes (for same-tab updates)
    const pollInterval = setInterval(loadLocalStrategies, 2000);
    
    return () => {
      window.removeEventListener('flowgrid:strategy-saved', handleStrategySaved);
      window.removeEventListener('flowgrid:strategy-toggled', handleStrategyToggled);
      window.removeEventListener('storage', handleStorageChange);
      clearInterval(pollInterval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Initial load and periodic refresh of dashboard data
  useEffect(() => {
    // Wait a bit for local strategies to load first
    const timer = setTimeout(() => {
      fetchDashboardData();
    }, 100);
    
    // Refresh every 10 seconds to catch new trades
    const interval = setInterval(() => fetchDashboardData(), 10000);
    
    return () => {
      clearTimeout(timer);
      clearInterval(interval);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Listen for trade completion to refresh metrics
  useEffect(() => {
    const handleTradeCompleted = (e) => {
      console.log('[Dashboard] Trade completed event - refreshing metrics', e.detail);
      fetchDashboardData();
    };
    
    const handleTradesUpdated = () => {
      console.log('[Dashboard] Trades updated event - refreshing metrics');
      fetchDashboardData();
    };
    
    window.addEventListener('flowgrid:trade-completed', handleTradeCompleted);
    window.addEventListener('flowgrid:trades-updated', handleTradesUpdated);
    
    return () => {
      window.removeEventListener('flowgrid:trade-completed', handleTradeCompleted);
      window.removeEventListener('flowgrid:trades-updated', handleTradesUpdated);
    };
  }, [fetchDashboardData]);
  
  // Handle timeframe change
  const handleTimeframeChange = useCallback((tf) => {
    setTimeframe(tf);
    setLoading(true);
    fetchDashboardData(tf);
  }, [fetchDashboardData]);
  
  // Handle clearing all signals
  const handleClearSignals = useCallback(() => {
    if (window.confirm('Clear all current signals?')) {
      clearAllSignals();
      setLiveSignals([]);
    }
  }, []);

  // Handle deleting a strategy
  const handleDeleteStrategy = useCallback((strategyName) => {
    if (window.confirm(`Delete strategy "${strategyName}"? This cannot be undone.`)) {
      const success = deleteStrategy(strategyName);
      if (success) {
        loadLocalStrategies();
        // Refresh dashboard data
        setTimeout(() => fetchDashboardData(), 300);
      }
    }
  }, [loadLocalStrategies, fetchDashboardData]);

  // Handle strategy toggle - syncs with WorkflowBuilder/StrategiesPanel
  const handleStrategyToggle = useCallback(async (strategyName, enabled) => {
    try {
      // Check if we hit max strategies
      if (enabled && getRunningCount() >= MAX_STRATEGIES) {
        alert(`Maximum ${MAX_STRATEGIES} strategies can run at once. Please stop another strategy first.`);
        return;
      }
      
      // Set loading state for this specific strategy
      setTogglingStrategy(strategyName);
      
      // Actually START/STOP the strategy execution via StrategyRunner
      const success = await runnerToggle(strategyName, enabled);
      
      if (!success && enabled) {
        setTogglingStrategy(null);
        alert(`Failed to start strategy "${strategyName}". Check if it has valid nodes.`);
        return;
      }
      
      // Update localStorage (same key as StrategiesPanel uses)
      const newEnabled = {
        ...enabledStrategies,
        [strategyName]: enabled
      };
      
      localStorage.setItem(ENABLED_STRATEGIES_KEY, JSON.stringify(newEnabled));
      setEnabledStrategies(newEnabled);
      
      // Update local strategies list
      setLocalStrategies(prev => 
        prev.map(s => s.name === strategyName ? { ...s, enabled } : s)
      );
      
      // Dispatch event so other components know about the change
      window.dispatchEvent(new CustomEvent('flowgrid:strategy-toggled', {
        detail: { name: strategyName, enabled }
      }));
      
      // Brief delay for visual feedback
      setTimeout(() => setTogglingStrategy(null), 300);
      
      console.log(`Strategy "${strategyName}" ${enabled ? 'STARTED ▶️' : 'STOPPED ⏹️'} (${getRunningCount()}/${MAX_STRATEGIES} running)`);
    } catch (err) {
      console.error('Failed to toggle strategy:', err);
      setTogglingStrategy(null);
      alert(`Error toggling strategy: ${err.message}`);
    }
  }, [enabledStrategies]);
  
  // Handle edit strategy
  const handleEditStrategy = useCallback((strategy) => {
    // Log edit activity
    setActivityLog(prev => [{
      id: `strategy_edit-${Date.now()}`,
      type: 'strategy_edit',
      timestamp: new Date().toISOString(),
      strategy_name: strategy.name,
      message: `Editing strategy: ${strategy.name}`
    }, ...prev.slice(0, 49)]);
    
    localStorage.setItem('flowgrid_workflow_v1::load_request', strategy.name);
    window.dispatchEvent(new CustomEvent('flowgrid:load-request', { detail: strategy.name }));
    onNavigate('builder');
  }, [onNavigate]);
  
  // Handle trade click (for future drill-down)
  const handleTradeClick = useCallback((trade) => {
    console.log('Trade clicked:', trade);
    // Future: Open trade detail modal
  }, []);
  
  // Use localStrategies loaded from localStorage, enriched with backend metrics if available
  const strategies = useMemo(() => {
    if (!localStrategies.length) return [];
    
    // If we have backend data, merge it with local strategies
    const backendStrategies = dashboardData?.strategies || [];
    const backendMap = new Map(backendStrategies.map(s => [s.name, s]));
    
    return localStrategies.map(local => {
      const backend = backendMap.get(local.name);
      return {
        name: local.name,
        enabled: local.enabled,
        net_pnl: backend?.net_pnl || 0,
        win_rate: backend?.win_rate || 0,
        trade_count: backend?.trade_count || 0,
        created_at: local.savedAt,
        updated_at: local.savedAt
      };
    });
  }, [localStrategies, dashboardData?.strategies]);
  
  const equityCurve = dashboardData?.equity_curve || [];
  const cumulativePnl = dashboardData?.cumulative_pnl_curve || [];
  const timePnlByDay = dashboardData?.time_pnl_by_day || [];
  const timePnlByHour = dashboardData?.time_pnl_by_hour || [];
  const recentTrades = dashboardData?.recent_trades || [];
  const [liveSignals, setLiveSignals] = useState([]);
  const [runningCount, setRunningCount] = useState(0);
  const [liveMetrics, setLiveMetrics] = useState(null);
  const [localTrades, setLocalTrades] = useState([]);
  
  // Listen for new signals from StrategyRunner
  useEffect(() => {
    const loadSignals = () => {
      const signals = getLiveSignals();
      setLiveSignals(signals);
      setRunningCount(getRunningCount());
      
      // Load trades and calculate metrics
      const trades = getAllTrades();
      setLocalTrades(trades);
      const calculatedMetrics = calcTradeMetrics();
      if (calculatedMetrics.total_trades > 0) {
        setLiveMetrics(calculatedMetrics);
      }
    };
    
    // Initial load
    loadSignals();
    
    // Listen for new signal events
    const handleNewSignal = (e) => {
      console.log('📊 New signal received:', e.detail);
      loadSignals();
    };
    
    const handleStrategyChange = () => {
      setRunningCount(getRunningCount());
      loadSignals(); // Refresh metrics too
    };
    
    const handleTradeEvent = () => {
      loadSignals(); // Refresh metrics when trade opens/closes
    };
    
    // When a trade is completed by the backend trade engine, refresh dashboard data
    const handleTradeCompleted = (e) => {
      console.log('💰 Trade completed event received:', e.detail);
      loadSignals(); // Refresh local metrics
      fetchDashboardData(); // Refresh backend metrics immediately
    };
    
    const handleMaxReached = (e) => {
      alert(`Maximum ${e.detail.max} strategies can run at once!`);
    };
    
    const handleCredentialsMissing = (e) => {
      alert(e.detail.message || 'Alpaca API credentials are required to run strategies.');
    };
    
    const handleSignalsCleared = () => {
      console.log('🗑️ Signals cleared event received');
      setLiveSignals([]);
    };
    
    window.addEventListener('flowgrid:new-signal', handleNewSignal);
    window.addEventListener('flowgrid:strategy-started', handleStrategyChange);
    window.addEventListener('flowgrid:strategy-stopped', handleStrategyChange);
    window.addEventListener('flowgrid:trade-opened', handleTradeEvent);
    window.addEventListener('flowgrid:trade-closed', handleTradeEvent);
    window.addEventListener('flowgrid:trade-completed', handleTradeCompleted);
    window.addEventListener('flowgrid:max-strategies-reached', handleMaxReached);
    window.addEventListener('flowgrid:credentials-missing', handleCredentialsMissing);
    window.addEventListener('flowgrid:signals-cleared', handleSignalsCleared);
    
    // Poll every 1 second to match strategy runner
    const interval = setInterval(loadSignals, 1000);
    
    return () => {
      window.removeEventListener('flowgrid:new-signal', handleNewSignal);
      window.removeEventListener('flowgrid:strategy-started', handleStrategyChange);
      window.removeEventListener('flowgrid:strategy-stopped', handleStrategyChange);
      window.removeEventListener('flowgrid:trade-opened', handleTradeEvent);
      window.removeEventListener('flowgrid:trade-closed', handleTradeEvent);
      window.removeEventListener('flowgrid:trade-completed', handleTradeCompleted);
      window.removeEventListener('flowgrid:max-strategies-reached', handleMaxReached);
      window.removeEventListener('flowgrid:credentials-missing', handleCredentialsMissing);
      window.removeEventListener('flowgrid:signals-cleared', handleSignalsCleared);
      clearInterval(interval);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fetchDashboardData]);
  
  // Get list of enabled strategy names
  const enabledStrategyNames = useMemo(() => {
    return localStrategies
      .filter(s => s.enabled)
      .map(s => s.name);
  }, [localStrategies]);
  
  // Combine live signals with local trades and historical trades for display
  // ONLY show trades from enabled strategies when there are enabled strategies
  const allRecentActivity = useMemo(() => {
    // If no strategies are enabled, only show live signals (which should be empty)
    // This prevents "ghost" trades from old data
    if (enabledStrategyNames.length === 0 && runningCount === 0) {
      return []; // No enabled strategies = no recent activity
    }
    
    // Include local trades from StrategyRunner
    const localTradeSignals = localTrades.map(t => ({
      id: t.id,
      timestamp: t.exitTime || t.entryTime,
      strategy_name: t.strategy_name,
      symbol: t.symbol,
      direction: t.direction,
      type: t.status === 'closed' ? 'exit' : 'entry',
      price: t.exitPrice || t.entryPrice,
      pnl: t.pnl
    }));
    
    // Filter recentTrades to only include trades from enabled strategies
    const filteredRecentTrades = recentTrades.filter(t => 
      enabledStrategyNames.includes(t.strategy_name) || 
      enabledStrategyNames.includes(t.strategy_id)
    );
    
    const combined = [...liveSignals, ...localTradeSignals, ...filteredRecentTrades];
    
    // Remove duplicates by id
    const uniqueMap = new Map();
    combined.forEach(item => {
      if (!uniqueMap.has(item.id)) {
        uniqueMap.set(item.id, item);
      }
    });
    
    // Sort by timestamp/exitTime descending
    const unique = Array.from(uniqueMap.values());
    unique.sort((a, b) => {
      const timeA = a.timestamp || a.exitTime || '';
      const timeB = b.timestamp || b.exitTime || '';
      return timeB.localeCompare(timeA);
    });
    return unique.slice(0, 15);
  }, [liveSignals, localTrades, recentTrades, enabledStrategyNames, runningCount]);
  
  // Use live metrics if we have trades, otherwise fall back to backend metrics
  const metrics = useMemo(() => {
    if (liveMetrics && liveMetrics.total_trades > 0) {
      return liveMetrics;
    }
    return dashboardData?.metrics || {};
  }, [liveMetrics, dashboardData?.metrics]);
  
  const risk = useMemo(() => {
    if (liveMetrics && liveMetrics.total_trades > 0) {
      return {
        avg_win: liveMetrics.avg_win,
        avg_loss: liveMetrics.avg_loss,
        largest_win: liveMetrics.largest_win,
        largest_loss: liveMetrics.largest_loss,
        risk_reward_ratio: liveMetrics.avg_loss > 0 ? liveMetrics.avg_win / liveMetrics.avg_loss : 0,
        profit_factor: liveMetrics.profit_factor
      };
    }
    return dashboardData?.risk || {};
  }, [liveMetrics, dashboardData?.risk]);
  
  const timeframes = ['1D', '1W', '1M', '3M', '1Y', 'ALL'];
  
  return (
    <div className="dashboard-page">
      <DashboardSidebar onNavigate={onNavigate} activeRoute="home" />
      
      <main className="dashboard-main">
        {/* Header */}
        <div className="dashboard-header">
          <div className="header-left">
            <h1>{displayName ? `Welcome back, ${displayName}` : 'Dashboard'}</h1>
            {lastUpdate && (
              <span className="last-update">
                Last updated: {lastUpdate.toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="header-right">
            {runningCount > 0 && (
              <span className="running-badge" title={`${runningCount} strategies running`}>
                <span className="running-dot"></span> {runningCount}/{MAX_STRATEGIES} Running
              </span>
            )}
            <button
              className={`edit-dashboard-btn ${editMode ? 'active' : ''}`}
              onClick={() => setEditMode(!editMode)}
              title="Customize dashboard layout"
            >
              {editMode ? '× Cancel' : 'Edit Dashboard'}
            </button>
            <button
              className="refresh-btn"
              onClick={() => fetchDashboardData()}
              disabled={loading}
            >
              Refresh
            </button>
          </div>
        </div>
        
        {/* Edit Mode Toolbar */}
        {editMode && (
          <div className="edit-mode-toolbar">
            <span>Drag panels to reorder • Click × to hide panels</span>
            <div style={{ marginLeft: 'auto', display: 'flex', gap: '8px' }}>
              <button className="edit-toolbar-save" onClick={saveLayout}>
                Save Layout
              </button>
              <button className="edit-toolbar-reset" onClick={resetLayout}>
                ↺ Reset
              </button>
              <button className="edit-toolbar-cancel" onClick={() => setEditMode(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        
        {/* Error Banner */}
        {error && (
          <div className="error-banner">
            {error} - Displaying local/demo data
          </div>
        )}
        
        {/* Top Metrics Row */}
        <div className="metrics-row">
          <MetricCard
            label="NET P&L"
            value={formatPercent(metrics.net_pnl, true)}
            delta={metrics.net_pnl}
            tooltip="Total profit and loss percentage after fees, commissions, and slippage"
            chartType="sparkline"
            chartData={cumulativePnl}
          />
          <MetricCard
            label="TRADE WIN %"
            value={`${metrics.win_rate?.toFixed(2) || '0.00'}%`}
            tooltip="Percentage of profitable trades"
            chartType="winrate"
            wins={metrics.wins || 0}
            losses={metrics.losses || 0}
            neutral={0}
          />
          <MetricCard
            label="PROFIT FACTOR"
            value={metrics.profit_factor === Infinity ? '∞' : formatNumber(metrics.profit_factor)}
            tooltip="Gross profits divided by gross losses. Values > 1 indicate profitability"
            chartType="profitfactor"
          />
          <MetricCard
            label="EXPECTANCY"
            value={formatPercent(metrics.expectancy)}
            subValue={`Avg: +${formatPercent(metrics.avg_win)} / -${formatPercent(metrics.avg_loss)}`}
            tooltip="Expected profit per trade based on win rate and average win/loss"
          />
          <MetricCard
            label="TOTAL TRADES"
            value={metrics.total_trades || 0}
            tooltip="Total number of completed trades"
          />
          <MetricCard
            label="MAX DRAWDOWN"
            value={`-${formatPercent(metrics.max_drawdown_pct)}`}
            isNegative={true}
            tooltip="Maximum peak-to-trough decline in account equity"
          />
        </div>
        
        {/* Main Content Grid */}
        <div className={`dashboard-grid ${editMode ? 'edit-mode' : ''}`}>
          {/* Left Column - Performance Chart (spans 2 columns) */}
          {!hiddenPanels.includes('performance') && (
            <div 
              className={`panel performance-panel ${draggedPanel === 'performance' ? 'dragging' : ''} ${dragOverPanel === 'performance' ? 'drag-over' : ''}`}
              draggable={editMode}
              onDragStart={(e) => handleDragStart(e, 'performance')}
              onDragOver={(e) => handleDragOver(e, 'performance')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'performance')}
              onDragEnd={handleDragEnd}
            >
              {editMode && <span className="panel-drag-handle">⋮⋮</span>}
              {editMode && (
                <button 
                  className="panel-delete-btn" 
                  onClick={() => togglePanelVisibility('performance')}
                  title="Hide panel"
                >
                  ✕
                </button>
              )}
              <div className="panel-header">
                <span className="panel-title">
                  Account Performance
                </span>
                <div className="timeframe-tabs">
                  {timeframes.map(tf => (
                    <button
                      key={tf}
                      className={`timeframe-tab ${timeframe === tf ? 'active' : ''}`}
                      onClick={() => handleTimeframeChange(tf)}
                    >
                      {tf}
                    </button>
                  ))}
                </div>
              </div>
              <div className="panel-content">
                <EquityChart
                  equityCurve={equityCurve}
                  cumulativePnl={cumulativePnl}
                  timeframe={timeframe}
                  showDrawdown={true}
                />
              </div>
            </div>
          )}
          
          {/* Right Column - Strategy Control */}
          {!hiddenPanels.includes('strategies') && (
            <div 
              className={`panel strategies-panel ${draggedPanel === 'strategies' ? 'dragging' : ''} ${dragOverPanel === 'strategies' ? 'drag-over' : ''}`}
              draggable={editMode}
              onDragStart={(e) => handleDragStart(e, 'strategies')}
              onDragOver={(e) => handleDragOver(e, 'strategies')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'strategies')}
              onDragEnd={handleDragEnd}
            >
              {editMode && <span className="panel-drag-handle">⋮⋮</span>}
              {editMode && (
                <button 
                  className="panel-delete-btn" 
                  onClick={() => togglePanelVisibility('strategies')}
                  title="Hide panel"
                >
                  ✕
                </button>
              )}
              <div className="panel-header">
                <span className="panel-title">
                  My Strategies
                </span>
              </div>
              <div className="panel-content">
                <StrategyControlPanel
                  strategies={strategies}
                  onToggle={handleStrategyToggle}
                  onEdit={handleEditStrategy}
                  onDelete={handleDeleteStrategy}
                  loading={loading}
                  togglingStrategy={togglingStrategy}
                />
              </div>
            </div>
          )}
          
          {/* Bottom Row - 3 Panels */}
          {!hiddenPanels.includes('risk') && (
            <div 
              className={`panel risk-panel ${draggedPanel === 'risk' ? 'dragging' : ''} ${dragOverPanel === 'risk' ? 'drag-over' : ''}`}
              draggable={editMode}
              onDragStart={(e) => handleDragStart(e, 'risk')}
              onDragOver={(e) => handleDragOver(e, 'risk')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'risk')}
              onDragEnd={handleDragEnd}
            >
              {editMode && <span className="panel-drag-handle">⋮⋮</span>}
              {editMode && (
                <button 
                  className="panel-delete-btn" 
                  onClick={() => togglePanelVisibility('risk')}
                  title="Hide panel"
                >
                  ✕
                </button>
              )}
              <div className="panel-header">
                <span className="panel-title">
                  Risk & Trade Quality
                </span>
              </div>
              <div className="panel-content">
                <RiskQualityPanel riskData={risk} />
              </div>
            </div>
          )}
          
          {!hiddenPanels.includes('time') && (
            <div 
              className={`panel time-panel ${draggedPanel === 'time' ? 'dragging' : ''} ${dragOverPanel === 'time' ? 'drag-over' : ''}`}
              draggable={editMode}
              onDragStart={(e) => handleDragStart(e, 'time')}
              onDragOver={(e) => handleDragOver(e, 'time')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'time')}
              onDragEnd={handleDragEnd}
            >
              {editMode && <span className="panel-drag-handle">⋮⋮</span>}
              {editMode && (
                <button 
                  className="panel-delete-btn" 
                  onClick={() => togglePanelVisibility('time')}
                  title="Hide panel"
                >
                  ✕
                </button>
              )}
              <div className="panel-header">
                <span className="panel-title">
                  Time-Based P&L
                </span>
              </div>
              <div className="panel-content">
                <TimePerformancePanel
                  dataByDay={timePnlByDay}
                  dataByHour={timePnlByHour}
                />
              </div>
            </div>
          )}
          
          {!hiddenPanels.includes('trades') && (
            <div 
              className={`panel trades-panel ${draggedPanel === 'trades' ? 'dragging' : ''} ${dragOverPanel === 'trades' ? 'drag-over' : ''}`}
              draggable={editMode}
              onDragStart={(e) => handleDragStart(e, 'trades')}
              onDragOver={(e) => handleDragOver(e, 'trades')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'trades')}
              onDragEnd={handleDragEnd}
            >
              {editMode && <span className="panel-drag-handle">⋮⋮</span>}
              {editMode && (
                <button 
                  className="panel-delete-btn" 
                  onClick={() => togglePanelVisibility('trades')}
                  title="Hide panel"
                >
                  ✕
                </button>
              )}
              <div className="panel-header">
                <span className="panel-title">
                  Latest Signal
                </span>
                {liveSignals.length > 0 && (
                  <button className="clear-signals-btn" onClick={handleClearSignals} title="Clear all signals">
                    Clear
                  </button>
                )}
              </div>
              <div className="panel-content">
                <RecentTradesPanel
                  trades={allRecentActivity}
                  activityLog={activityLog}
                  onTradeClick={handleTradeClick}
                />
              </div>
            </div>
          )}
          
          {/* Trade Log Panel */}
          {!hiddenPanels.includes('tradelog') && (
            <div 
              className={`panel tradelog-panel ${draggedPanel === 'tradelog' ? 'dragging' : ''} ${dragOverPanel === 'tradelog' ? 'drag-over' : ''}`}
              draggable={editMode}
              onDragStart={(e) => handleDragStart(e, 'tradelog')}
              onDragOver={(e) => handleDragOver(e, 'tradelog')}
              onDragLeave={handleDragLeave}
              onDrop={(e) => handleDrop(e, 'tradelog')}
              onDragEnd={handleDragEnd}
            >
              {editMode && <span className="panel-drag-handle">⋮⋮</span>}
              {editMode && (
                <button 
                  className="panel-delete-btn" 
                  onClick={() => togglePanelVisibility('tradelog')}
                  title="Hide panel"
                >
                  ✕
                </button>
              )}
              <div className="panel-header">
                <span className="panel-title">
                  Recent Trades
                </span>
              </div>
              <div className="panel-content">
                <MiniTradeLog />
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;
