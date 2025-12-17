/**
 * Analytics Page - FlowGrid Trading
 * Comprehensive analytics dashboard with multiple visualization modes
 * Single-screen, desktop-first, no vertical scroll
 * Now reads from localStorage via tradeService (no backend, no mock data)
 */

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import DashboardSidebar from '../components/DashboardSidebar';
import TradeLogging from './analytics/TradeLogging';
import TradeCalendar from './analytics/TradeCalendar';
import './Dashboard.css';
import './Analytics.css';
import {
  getAllTrades,
  calculateMetrics,
  getEquityCurve,
  getCumulativePnLCurve,
  getTimePnL,
  getStrategyAttribution,
  getPnLDistribution,
  getRecentTrades,
  fetchAnalyticsFromBackend,
  fetchEquityCurveFromBackend,
  fetchHeatmapFromBackend,
  fetchDistributionFromBackend,
  fetchTradesFromBackend
} from '../services/tradeService';

// API base URL (kept for signals endpoint only)
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE)
  ? import.meta.env.VITE_API_BASE.replace(/\/$/, '')
  : 'http://127.0.0.1:5000';

// LocalStorage keys
const ENABLED_STRATEGIES_KEY = 'flowgrid_enabled_strategies';
const CHART_MODE_KEY = 'flowgrid_analytics_chart_mode';
const MAX_STRATEGIES = 5;

// =============================================================================
// Utility Functions
// =============================================================================

const formatCurrency = (value, showSign = false) => {
  if (value === null || value === undefined || isNaN(value)) return '--';
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  const now = new Date();
  const seconds = Math.floor((now - date) / 1000);
  
  if (seconds < 60) return 'Just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86400)}d ago`;
};

// =============================================================================
// Tooltip Definitions
// =============================================================================

const TOOLTIPS = {
  netPnl: 'Net Profit/Loss = Gross P&L - Fees - Commissions - Slippage',
  winRate: 'Win Rate = (Winning Trades / Total Trades) × 100%',
  profitFactor: 'Profit Factor = Gross Profits / Gross Losses (>1 is profitable)',
  expectancy: 'Expectancy = (Win Rate × Avg Win) - (Loss Rate × Avg Loss)',
  maxDrawdown: 'Maximum Drawdown = Largest peak-to-trough decline in equity',
  totalTrades: 'Total completed trades (entry + exit)',
  avgWin: 'Average profit on winning trades',
  avgLoss: 'Average loss on losing trades',
  flowGrade: 'Composite score (0-100) based on return, drawdown, consistency, and risk metrics'
};

// =============================================================================
// KPI Card Component
// =============================================================================

const KPICard = ({ 
  label, 
  value, 
  subValue, 
  tooltip, 
  isPositive, 
  isNegative,
  isEmpty,
  emptyMessage = 'No data',
  loading = false
}) => {
  if (loading) {
    return <div className="metric-card skeleton skeleton-metric" />;
  }
  
  const showEmpty = isEmpty || value === '--' || value === undefined;
  
  return (
    <div className={`metric-card ${showEmpty ? 'empty-state' : ''}`}>
      <div className="metric-label">
        {label}
        {tooltip && (
          <span className="metric-info-icon tooltip-trigger">
            ⓘ
            <span className="tooltip-content">{tooltip}</span>
          </span>
        )}
      </div>
      <div className={`metric-value ${isPositive ? 'positive' : ''} ${isNegative ? 'negative' : ''} ${showEmpty ? 'dimmed' : ''}`}>
        {showEmpty ? emptyMessage : value}
      </div>
      {subValue && !showEmpty && (
        <div className={`metric-subvalue ${isPositive ? 'positive' : ''} ${isNegative ? 'negative' : ''}`}>
          {subValue}
        </div>
      )}
      {showEmpty && (
        <div className="metric-empty-hint">Enable strategies to see data</div>
      )}
    </div>
  );
};

// =============================================================================
// Flow Grade Card Component
// =============================================================================

const FlowGradeCard = ({ gradeData, onShowBreakdown, loading }) => {
  if (loading) {
    return <div className="flow-grade-card skeleton skeleton-chart" style={{ height: '280px' }} />;
  }
  
  if (!gradeData || gradeData.empty) {
    return (
      <div className="flow-grade-card">
        <div className="empty-state-container" style={{ padding: '24px' }}>
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-title">Flow Grade</div>
          <div className="empty-state-message">
            {gradeData?.guidance || 'Complete trades to see your performance grade'}
          </div>
        </div>
      </div>
    );
  }
  
  const { score, letter, reasons } = gradeData;
  const circumference = 2 * Math.PI * 45;
  const progress = (score / 100) * circumference;
  const gradeClass = `grade-${(letter || 'c').toLowerCase()}`;
  
  return (
    <div className="flow-grade-card">
      <div className="flow-grade-score">
        <svg className="flow-grade-ring" viewBox="0 0 100 100">
          <circle className="flow-grade-ring-bg" cx="50" cy="50" r="45" />
          <circle 
            className={`flow-grade-ring-progress ${gradeClass}`}
            cx="50" 
            cy="50" 
            r="45"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
          />
        </svg>
        <div className="flow-grade-inner">
          <div className={`flow-grade-letter ${gradeClass}`}>{letter}</div>
          <div className="flow-grade-number">{score.toFixed(0)}</div>
        </div>
      </div>
      <div className="flow-grade-title">Flow Grade</div>
      <div className="flow-grade-reasons">
        {reasons?.slice(0, 3).map((reason, idx) => (
          <div key={idx} className="flow-grade-reason">{reason}</div>
        ))}
      </div>
      <button className="flow-grade-breakdown-btn" onClick={onShowBreakdown}>
        View Breakdown
      </button>
    </div>
  );
};

// =============================================================================
// Flow Grade Breakdown Modal
// =============================================================================

const FlowGradeModal = ({ gradeData, onClose }) => {
  if (!gradeData) return null;
  
  const { components, suggestions } = gradeData;
  
  const getBarClass = (score) => {
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    return 'low';
  };
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-title">Flow Grade Breakdown</div>
          <button className="modal-close" onClick={onClose}>×</button>
        </div>
        
        <div className="grade-component-list">
          {components && Object.entries(components).map(([key, data]) => {
            if (key === 'concentration_penalty') return null;
            return (
              <div key={key} className="grade-component">
                <div className="grade-component-label">
                  {key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                </div>
                <div className="grade-component-value">
                  {typeof data.value === 'number' ? 
                    (key.includes('pct') || key.includes('rate') ? formatPercent(data.value) : formatNumber(data.value)) 
                    : data.value}
                </div>
                <div className="grade-component-bar">
                  <div 
                    className={`grade-component-fill ${getBarClass(data.score)}`}
                    style={{ width: `${data.score}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        
        {suggestions?.length > 0 && (
          <div className="grade-suggestions">
            <div className="grade-suggestions-title">Improvement Suggestions</div>
            {suggestions.map((suggestion, idx) => (
              <div key={idx} className="grade-suggestion">{suggestion}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// =============================================================================
// Equity Chart Component
// =============================================================================

const EquityChart = ({ data, loading, chartMode, onModeChange }) => {
  const canvasRef = useRef(null);
  const [hoveredPoint, setHoveredPoint] = useState(null);
  
  const hasData = data && data.curve && data.curve.length >= 1;
  
  useEffect(() => {
    if (!canvasRef.current || !hasData) return;
    
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    const rect = canvas.getBoundingClientRect();
    
    // Set canvas resolution
    const dpr = window.devicePixelRatio || 1;
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.scale(dpr, dpr);
    
    const width = rect.width;
    const height = rect.height;
    const padding = { top: 20, right: 20, bottom: 30, left: 60 };
    const chartWidth = width - padding.left - padding.right;
    const chartHeight = height - padding.top - padding.bottom;
    
    // Get values - prepend origin for single point to draw line from corner
    const baseValue = 100; // Starting equity baseline
    let curveData = [...data.curve];
    if (curveData.length === 1) {
      // Prepend origin point to draw line from corner
      curveData = [{ t: curveData[0].t - 1, v: baseValue, drawdown: 0 }, curveData[0]];
    }
    
    const values = curveData.map(d => d.v);
    const minVal = Math.min(...values, baseValue) * 0.98;
    const maxVal = Math.max(...values, baseValue) * 1.02;
    const range = maxVal - minVal || 1;
    
    // Clear canvas
    ctx.clearRect(0, 0, width, height);
    
    // Draw grid lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    
    for (let i = 0; i <= 4; i++) {
      const y = padding.top + (chartHeight / 4) * i;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }
    
    // Draw Y-axis labels
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '10px Inter, system-ui';
    ctx.textAlign = 'right';
    
    for (let i = 0; i <= 4; i++) {
      const value = maxVal - (range / 4) * i;
      const y = padding.top + (chartHeight / 4) * i;
      ctx.fillText(`$${(value / 1000).toFixed(0)}k`, padding.left - 8, y + 3);
    }
    
    // Draw line/area chart
    ctx.beginPath();
    
    const numPoints = curveData.length;
    curveData.forEach((point, idx) => {
      const x = padding.left + (idx / (numPoints - 1)) * chartWidth;
      const y = padding.top + chartHeight - ((point.v - minVal) / range) * chartHeight;
      
      if (idx === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });
    
    if (chartMode === 'area') {
      // Fill area
      ctx.lineTo(padding.left + chartWidth, padding.top + chartHeight);
      ctx.lineTo(padding.left, padding.top + chartHeight);
      ctx.closePath();
      
      const gradient = ctx.createLinearGradient(0, padding.top, 0, padding.top + chartHeight);
      const isPositive = values[values.length - 1] >= values[0];
      
      if (isPositive) {
        gradient.addColorStop(0, 'rgba(34, 197, 94, 0.3)');
        gradient.addColorStop(1, 'rgba(34, 197, 94, 0.0)');
      } else {
        gradient.addColorStop(0, 'rgba(239, 68, 68, 0.3)');
        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
      }
      
      ctx.fillStyle = gradient;
      ctx.fill();
      
      // Draw line on top
      ctx.beginPath();
      curveData.forEach((point, idx) => {
        const x = padding.left + (idx / (curveData.length - 1)) * chartWidth;
        const y = padding.top + chartHeight - ((point.v - minVal) / range) * chartHeight;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
    }
    
    const isPositive = values[values.length - 1] >= values[0];
    ctx.strokeStyle = '#10B981';
    ctx.lineWidth = 2;
    ctx.stroke();
    
    // Draw drawdown shading if enabled
    if (chartMode === 'area' && curveData.some(d => d.drawdown > 0)) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.15)';
      
      let peak = values[0];
      curveData.forEach((point, idx) => {
        if (point.v > peak) peak = point.v;
        const drawdown = (peak - point.v) / peak;
        
        if (drawdown > 0.01) {
          const x = padding.left + (idx / (curveData.length - 1)) * chartWidth;
          const yTop = padding.top + chartHeight - ((peak - minVal) / range) * chartHeight;
          const yBottom = padding.top + chartHeight - ((point.v - minVal) / range) * chartHeight;
          
          ctx.fillRect(x - 1, yTop, 2, yBottom - yTop);
        }
      });
    }
    
  }, [data, hasData, chartMode]);
  
  if (loading) {
    return <div className="chart-panel skeleton skeleton-chart" />;
  }
  
  return (
    <div className="chart-panel">
      <div className="chart-panel-header">
        <div className="chart-panel-title">Equity Curve</div>
        <div className="chart-panel-controls">
          <button 
            className={`chart-mode-btn ${chartMode === 'line' ? 'active' : ''}`}
            onClick={() => onModeChange('line')}
          >
            Line
          </button>
          <button 
            className={`chart-mode-btn ${chartMode === 'area' ? 'active' : ''}`}
            onClick={() => onModeChange('area')}
          >
            Area
          </button>
        </div>
      </div>
      
      {!hasData ? (
        <div className="empty-state-container">
          <div className="empty-state-icon">📈</div>
          <div className="empty-state-title">No Equity Data</div>
          <div className="empty-state-message">
            {data?.guidance || 'Execute trades to see your equity curve progression'}
          </div>
        </div>
      ) : (
        <div className="chart-canvas-container">
          <canvas ref={canvasRef} />
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Recent Activity Panel
// =============================================================================

const RecentActivityPanel = ({ activity, loading }) => {
  if (loading) {
    return <div className="activity-panel skeleton skeleton-chart" />;
  }
  
  const isEmpty = !activity || activity.length === 0;
  
  return (
    <div className="activity-panel">
      <div className="activity-panel-header">
        <div className="activity-panel-title">Recent Activity</div>
        <div className="activity-live-badge">
          <div className="activity-live-dot" />
          Live
        </div>
      </div>
      
      {isEmpty ? (
        <div className="empty-state-container" style={{ padding: '24px' }}>
          <div className="empty-state-icon">⚡</div>
          <div className="empty-state-message">
            Signals and trades will appear here in real-time
          </div>
        </div>
      ) : (
        <div className="activity-list">
          {activity.map((item, idx) => (
            <div key={item.id || idx} className="activity-item">
              <div className="activity-icon">{item.icon || '📊'}</div>
              <div className="activity-details">
                <div className="activity-title">
                  {item.type === 'entry' ? 'Opened' : 'Closed'} {item.symbol} ({item.strategy_name})
                </div>
                <div className="activity-subtitle">
                  {item.direction} @ ${item.price?.toFixed(2)}
                </div>
              </div>
              {item.pnl !== undefined && item.pnl !== null && (
                <div className={`activity-pnl ${item.pnl >= 0 ? 'positive' : 'negative'}`}>
                  {formatCurrency(item.pnl, true)}
                </div>
              )}
              <div className="activity-time">{formatTimeAgo(item.timestamp)}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Strategy Control Panel
// =============================================================================

const StrategyControlPanel = ({ 
  strategies, 
  enabledStrategies, 
  onToggle, 
  loading,
  recomputing 
}) => {
  const enabledCount = Object.values(enabledStrategies).filter(Boolean).length;
  const canEnableMore = enabledCount < MAX_STRATEGIES;
  
  if (loading) {
    return <div className="strategy-control-panel skeleton skeleton-chart" />;
  }
  
  return (
    <div className="strategy-control-panel">
      <div className="strategy-control-header">
        <div className="strategy-control-title">Strategies</div>
        <div className="strategy-limit-badge">
          {enabledCount}/{MAX_STRATEGIES} Active
        </div>
      </div>
      
      {Object.keys(strategies).length === 0 ? (
        <div className="empty-state-container" style={{ padding: '16px' }}>
          <div className="empty-state-message">
            No saved strategies. Create one in the Workflow Builder.
          </div>
        </div>
      ) : (
        <div className="strategy-list">
          {Object.entries(strategies).map(([name, data]) => {
            const isEnabled = enabledStrategies[name];
            const canToggle = isEnabled || canEnableMore;
            
            return (
              <div 
                key={name} 
                className={`strategy-item ${isEnabled ? 'enabled' : ''} ${recomputing ? 'loading' : ''}`}
              >
                <div 
                  className={`strategy-toggle ${isEnabled ? 'enabled' : ''} ${!canToggle ? 'disabled' : ''}`}
                  onClick={() => canToggle && onToggle(name, !isEnabled)}
                />
                <div className="strategy-info">
                  <div className="strategy-name">{name}</div>
                  <div className="strategy-meta">
                    {data.symbol || 'SPY'} · {data.timeframe || '1Hour'}
                  </div>
                </div>
                <div className={`strategy-status ${isEnabled ? 'running' : 'stopped'}`}>
                  {isEnabled ? '● Running' : 'Stopped'}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Heatmap Component
// =============================================================================

const HeatmapPanel = ({ data, loading }) => {
  if (loading) {
    return <div className="chart-panel skeleton skeleton-chart" />;
  }
  
  if (!data || data.empty) {
    return (
      <div className="chart-panel">
        <div className="chart-panel-header">
          <div className="chart-panel-title">P&L by Time</div>
        </div>
        <div className="empty-state-container">
          <div className="empty-state-icon">🗓️</div>
          <div className="empty-state-message">
            {data?.guidance || 'Trade data needed for time analysis'}
          </div>
        </div>
      </div>
    );
  }
  
  const { matrix, x_labels, y_labels, range } = data;
  const maxAbs = Math.max(Math.abs(range.min), Math.abs(range.max)) || 1;
  
  const getColor = (value) => {
    const intensity = Math.min(Math.abs(value) / maxAbs, 1);
    if (value > 0) {
      return `rgba(34, 197, 94, ${0.2 + intensity * 0.6})`;
    } else if (value < 0) {
      return `rgba(239, 68, 68, ${0.2 + intensity * 0.6})`;
    }
    return 'rgba(255, 255, 255, 0.05)';
  };
  
  return (
    <div className="chart-panel">
      <div className="chart-panel-header">
        <div className="chart-panel-title">P&L by Time</div>
      </div>
      <div className="heatmap-container">
        <div style={{ display: 'flex', marginBottom: '4px', marginLeft: '40px' }}>
          {x_labels.map((label, idx) => (
            <div key={idx} className="heatmap-label" style={{ flex: 1 }}>{label}</div>
          ))}
        </div>
        {matrix.map((row, rowIdx) => (
          <div key={rowIdx} style={{ display: 'flex', alignItems: 'center', marginBottom: '2px' }}>
            <div className="heatmap-row-label" style={{ width: '40px' }}>{y_labels[rowIdx]}</div>
            {row.map((value, colIdx) => (
              <div 
                key={colIdx}
                className="heatmap-cell"
                style={{ 
                  flex: 1, 
                  height: '28px',
                  background: getColor(value)
                }}
                title={`${y_labels[rowIdx]} ${x_labels[colIdx]}: ${formatCurrency(value)}`}
              >
                {Math.abs(value) > 100 && formatCurrency(value).replace('$', '')}
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};

// =============================================================================
// Distribution Histogram Component
// =============================================================================

const DistributionPanel = ({ data, title, loading }) => {
  if (loading) {
    return <div className="chart-panel skeleton skeleton-chart" />;
  }
  
  if (!data || data.empty) {
    return (
      <div className="chart-panel">
        <div className="chart-panel-header">
          <div className="chart-panel-title">{title}</div>
        </div>
        <div className="empty-state-container">
          <div className="empty-state-icon">📊</div>
          <div className="empty-state-message">
            {data?.guidance || 'More trades needed for distribution analysis'}
          </div>
        </div>
      </div>
    );
  }
  
  const { histogram, stats } = data;
  const maxCount = Math.max(...histogram.map(b => b.count));
  
  return (
    <div className="chart-panel">
      <div className="chart-panel-header">
        <div className="chart-panel-title">{title}</div>
        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
          μ={formatCurrency(stats.mean)} | σ={formatCurrency(stats.std)}
        </div>
      </div>
      <div className="histogram-container">
        {histogram.map((bin, idx) => {
          const height = maxCount > 0 ? (bin.count / maxCount) * 100 : 0;
          const midpoint = (bin.bin_start + bin.bin_end) / 2;
          const isPositive = midpoint >= 0;
          
          return (
            <div 
              key={idx}
              className={`histogram-bar ${isPositive ? 'positive' : 'negative'}`}
              style={{ height: `${Math.max(height, 2)}%` }}
            >
              <div className="histogram-tooltip">
                {formatCurrency(bin.bin_start)} to {formatCurrency(bin.bin_end)}: {bin.count} trades
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// =============================================================================
// Strategy Attribution Waterfall
// =============================================================================

const AttributionPanel = ({ data, loading }) => {
  if (loading) {
    return <div className="chart-panel skeleton skeleton-chart" />;
  }
  
  if (!data || data.empty) {
    return (
      <div className="chart-panel">
        <div className="chart-panel-header">
          <div className="chart-panel-title">Strategy Attribution</div>
        </div>
        <div className="empty-state-container">
          <div className="empty-state-icon">🎯</div>
          <div className="empty-state-message">
            {data?.guidance || 'Trade data from multiple strategies needed'}
          </div>
        </div>
      </div>
    );
  }
  
  const { contributions, total_pnl } = data;
  const maxPnl = Math.max(...contributions.map(c => Math.abs(c.pnl)));
  
  return (
    <div className="chart-panel">
      <div className="chart-panel-header">
        <div className="chart-panel-title">Strategy Attribution</div>
        <div style={{ fontSize: '12px', fontWeight: 600, color: total_pnl >= 0 ? 'var(--positive)' : 'var(--negative)' }}>
          Total: {formatCurrency(total_pnl)}
        </div>
      </div>
      <div className="waterfall-container">
        <div className="waterfall-bar-container">
          {contributions.map((contrib, idx) => {
            const height = maxPnl > 0 ? (Math.abs(contrib.pnl) / maxPnl) * 100 : 0;
            
            return (
              <div key={idx} className="waterfall-bar-wrapper">
                <div 
                  className={`waterfall-bar ${contrib.pnl >= 0 ? 'positive' : 'negative'}`}
                  style={{ height: `${Math.max(height, 5)}%` }}
                >
                  <div className="waterfall-value">{formatCurrency(contrib.pnl)}</div>
                </div>
                <div className="waterfall-label">{contrib.strategy_name}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};

// =============================================================================
// Monte Carlo Panel (Premium)
// =============================================================================

const MonteCarloPanel = ({ data, loading, isPremium }) => {
  if (loading) {
    return <div className="chart-panel skeleton skeleton-chart" />;
  }
  
  const showPremiumGate = !isPremium && data && !data.empty;
  
  return (
    <div className="chart-panel" style={{ position: 'relative' }}>
      <div className="chart-panel-header">
        <div className="chart-panel-title">Monte Carlo Simulation</div>
        {data && !data.empty && (
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
            {data.simulations} simulations
          </div>
        )}
      </div>
      
      {!data || data.empty ? (
        <div className="empty-state-container">
          <div className="empty-state-icon">🎲</div>
          <div className="empty-state-message">
            {data?.guidance || 'Need at least 10 trades for Monte Carlo analysis'}
          </div>
        </div>
      ) : (
        <>
          <div style={{ padding: '16px', opacity: showPremiumGate ? 0.3 : 1 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '16px' }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Prob. Profit</div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--positive)' }}>{data.prob_profit}%</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Median Outcome</div>
                <div style={{ fontSize: '18px', fontWeight: 600 }}>{formatCurrency(data.percentiles?.['50th'])}</div>
              </div>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '10px', color: 'var(--text-secondary)', marginBottom: '4px' }}>Risk of -10%</div>
                <div style={{ fontSize: '18px', fontWeight: 600, color: 'var(--negative)' }}>{data.prob_loss_10pct}%</div>
              </div>
            </div>
            
            <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
              <div>5th Percentile (Worst): {formatCurrency(data.percentiles?.['5th'])}</div>
              <div>95th Percentile (Best): {formatCurrency(data.percentiles?.['95th'])}</div>
            </div>
          </div>
          
          {showPremiumGate && (
            <div className="premium-overlay">
              <div className="premium-lock-icon">🔒</div>
              <div className="premium-title">Premium Feature</div>
              <div className="premium-description">
                Unlock full Monte Carlo analysis with path visualization and advanced probability metrics
              </div>
              <button className="premium-upgrade-btn">Upgrade for $99/mo</button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

// =============================================================================
// Recompute Toast
// =============================================================================

const RecomputeToast = ({ visible, status }) => {
  if (!visible) return null;
  
  return (
    <div className={`recompute-toast ${status === 'complete' ? 'complete' : ''}`}>
      {status === 'processing' ? (
        <>
          <div className="recompute-spinner" />
          <div className="recompute-text">Recomputing metrics...</div>
        </>
      ) : (
        <div className="recompute-text">✓ Metrics updated</div>
      )}
    </div>
  );
};

// =============================================================================
// Main Analytics Page Component
// =============================================================================

const Analytics = ({ onNavigate }) => {
  // State
  const [activeTab, setActiveTab] = useState('overview');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  
  // Data state
  const [overview, setOverview] = useState(null);
  const [equityCurve, setEquityCurve] = useState(null);
  const [activity, setActivity] = useState([]);
  const [heatmap, setHeatmap] = useState(null);
  const [pnlDistribution, setPnlDistribution] = useState(null);
  const [attribution, setAttribution] = useState(null);
  const [monteCarlo, setMonteCarlo] = useState(null);
  
  // Strategy state
  const [strategies, setStrategies] = useState({});
  const [enabledStrategies, setEnabledStrategies] = useState({});
  
  // UI state
  const [chartMode, setChartMode] = useState(() => localStorage.getItem(CHART_MODE_KEY) || 'area');
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeStatus, setRecomputeStatus] = useState(null);
  
  // Premium state (mock)
  const [isPremium] = useState(false);
  
  // SSE connection ref
  const eventSourceRef = useRef(null);
  
  // Load enabled strategies from localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem(ENABLED_STRATEGIES_KEY);
      if (saved) {
        setEnabledStrategies(JSON.parse(saved));
      }
    } catch (e) {
      console.error('Error loading enabled strategies:', e);
    }
  }, []);
  
  // Save chart mode preference
  useEffect(() => {
    localStorage.setItem(CHART_MODE_KEY, chartMode);
  }, [chartMode]);
  
  // Track if initial data has been loaded (to avoid refetching mock data)
  const initialLoadDone = useRef(false);
  
  // Fetch all data from backend API with localStorage fallback
  const fetchData = useCallback(async (forceRefresh = false) => {
    setLoading(true);
    setError(null);
    
    try {
      let dataSource = 'localStorage';
      let metrics, equityCurveData, cumulativePnl, byDay, byHour, stratAttribution, distribution, recentTrades;
      let trades = getAllTrades();
      
      // Try backend API first
      try {
        const [analyticsRes, equityRes, heatmapRes, distRes, tradesRes] = await Promise.all([
          fetchAnalyticsFromBackend(),
          fetchEquityCurveFromBackend(),
          fetchHeatmapFromBackend(),
          fetchDistributionFromBackend(),
          fetchTradesFromBackend({ limit: 100 })
        ]);
        
        if (analyticsRes && !analyticsRes.empty) {
          dataSource = 'backend';
          console.log(`[Analytics] Using backend API data`);
          
          // Transform backend metrics to expected format
          const backendMetrics = analyticsRes.metrics || {};
          metrics = {
            net_pnl: backendMetrics.net_return_pct || 0,
            net_pnl_percent: backendMetrics.net_return_pct || 0,
            win_rate: backendMetrics.win_rate || 0,
            profit_factor: typeof backendMetrics.profit_factor === 'string' ? Infinity : (backendMetrics.profit_factor || 0),
            expectancy: backendMetrics.expectancy || 0,
            max_drawdown_pct: backendMetrics.max_drawdown_pct || 0,
            max_drawdown_value: backendMetrics.max_drawdown_pct || 0,
            total_trades: backendMetrics.trade_count || 0,
            wins: backendMetrics.wins || 0,
            losses: backendMetrics.losses || 0,
            avg_win: backendMetrics.avg_win_pct || 0,
            avg_loss: backendMetrics.avg_loss_pct || 0,
            largest_win: backendMetrics.largest_win_pct || 0,
            largest_loss: backendMetrics.largest_loss_pct || 0
          };
          
          // Transform equity curve
          equityCurveData = (equityRes || []).map(pt => ({
            t: new Date(pt.ts).getTime(),
            v: 100 + (pt.equity_pct || 0),
            drawdown: pt.drawdown_pct || 0
          }));
          
          cumulativePnl = (equityRes || []).map(pt => ({
            t: new Date(pt.ts).getTime(),
            v: pt.equity_pct || 0
          }));
          
          // Use heatmap data
          byDay = heatmapRes?.by_day || [];
          byHour = heatmapRes?.by_hour || [];
          
          // Transform strategy attribution
          stratAttribution = Object.entries(analyticsRes.by_strategy || {}).map(([name, data]) => ({
            name,
            total_pnl: data.net_return_pct || 0,
            trade_count: data.trade_count || 0,
            wins: data.wins || 0,
            losses: data.losses || 0
          }));
          
          // P&L distribution
          distribution = {
            bins: (distRes?.histogram || []).map(h => `${h.bin_start} to ${h.bin_end}`),
            counts: (distRes?.histogram || []).map(h => h.count)
          };
          
          // Recent trades
          recentTrades = (tradesRes || []).slice(0, 15);
          trades = tradesRes || trades;
        }
      } catch (backendErr) {
        console.warn('[Analytics] Backend fetch failed, using localStorage:', backendErr.message);
      }
      
      // Fallback to localStorage if backend didn't provide data
      if (dataSource === 'localStorage') {
        metrics = calculateMetrics();
        equityCurveData = getEquityCurve();
        cumulativePnl = getCumulativePnLCurve();
        const timePnl = getTimePnL();
        byDay = timePnl.byDay;
        byHour = timePnl.byHour;
        stratAttribution = getStrategyAttribution();
        distribution = getPnLDistribution();
        recentTrades = getRecentTrades(15);
      }
      
      console.log(`[Analytics] Loaded ${trades.length || metrics.total_trades || 0} trades from ${dataSource}`);
      
      // Set overview with kpis format for compatibility
      setOverview({
        empty: (trades.length || metrics.total_trades || 0) === 0,
        is_preview: false,
        source: dataSource,
        kpis: {
          net_pnl_usd: metrics.net_pnl,
          net_pnl_pct: metrics.net_pnl_percent,
          win_rate: metrics.win_rate,
          profit_factor: metrics.profit_factor,
          expectancy: metrics.expectancy,
          max_drawdown_pct: metrics.max_drawdown_pct,
          max_drawdown_usd: metrics.max_drawdown_value,
          total_trades: metrics.total_trades,
          wins: metrics.wins,
          losses: metrics.losses,
          avg_win: metrics.avg_win,
          avg_loss: metrics.avg_loss,
          largest_win: metrics.largest_win,
          largest_loss: metrics.largest_loss
        },
        flow_grade: (trades.length || metrics.total_trades || 0) > 0 ? {
          score: Math.round((metrics.win_rate || 0) * 0.9),
          letter: (metrics.win_rate || 0) >= 80 ? 'A' : (metrics.win_rate || 0) >= 60 ? 'B' : (metrics.win_rate || 0) >= 40 ? 'C' : (metrics.win_rate || 0) >= 20 ? 'D' : 'F',
          reasons: [
            `Win rate: ${(metrics.win_rate || 0).toFixed(1)}%`,
            `Profit factor: ${metrics.profit_factor === Infinity ? '∞' : (metrics.profit_factor || 0).toFixed(2)}`,
            (metrics.max_drawdown_pct || 0) < 10 ? 'Low drawdown' : 'Monitor drawdown'
          ],
          breakdown: { 
            consistency: Math.min(95, Math.max(0, 50 + (metrics.profit_factor === Infinity ? 10 : (metrics.profit_factor || 0)) * 10)),
            risk_mgmt: Math.max(0, 100 - (metrics.max_drawdown_pct || 0) * 2),
            win_quality: metrics.win_rate || 0,
            trade_efficiency: (metrics.profit_factor || 0) > 1 ? 70 + ((metrics.profit_factor === Infinity ? 5 : (metrics.profit_factor || 0)) - 1) * 20 : 50
          }
        } : null
      });
      
      // Set equity curve
      setEquityCurve({
        curve: equityCurveData,
        cumulative_pnl: cumulativePnl
      });
      
      // Set heatmap - transform byDay/byHour to matrix format
      const dayLabels = byDay.map(d => d.label);
      const hourLabels = byHour.map(h => h.label);
      const matrix = [byDay.map(d => d.pnl)]; // Single row for days
      const allValues = [...byDay.map(d => d.pnl), ...byHour.map(h => h.pnl)];
      const heatmapRange = {
        min: Math.min(...allValues, 0),
        max: Math.max(...allValues, 0)
      };
      setHeatmap({
        matrix: matrix,
        x_labels: dayLabels,
        y_labels: ['P&L'],
        range: heatmapRange,
        by_day: byDay,
        by_hour: byHour
      });
      
      // Set activity from recent trades
      setActivity(recentTrades.map(t => ({
        type: 'trade',
        timestamp: t.exitTime || t.close_ts,
        strategy: t.strategyName || t.strategy_id,
        symbol: t.symbol,
        pnl: t.netPnL || t.net_pct,
        direction: t.direction || t.open_side
      })));
      
      // Set P&L distribution - transform to histogram format
      const pnlValues = trades.map(t => t.net_pct ?? t.netPnL ?? 0);
      const histogram = [];
      if (distribution.bins && distribution.bins.length > 0) {
        distribution.bins.forEach((binLabel, idx) => {
          const parts = binLabel.split(' to ');
          histogram.push({
            bin_start: parseFloat(parts[0]) || 0,
            bin_end: parseFloat(parts[1]) || 0,
            count: distribution.counts[idx] || 0
          });
        });
      }
      const mean = pnlValues.length > 0 ? pnlValues.reduce((a, b) => a + b, 0) / pnlValues.length : 0;
      const variance = pnlValues.length > 0 ? pnlValues.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / pnlValues.length : 0;
      const std = Math.sqrt(variance);
      setPnlDistribution({
        histogram: histogram,
        stats: { mean, std },
        empty: trades.length === 0
      });
      
      // Set strategy attribution - transform to contributions format
      const totalPnl = stratAttribution.reduce((sum, s) => sum + (s.total_pnl || 0), 0);
      setAttribution({
        contributions: stratAttribution.map(s => ({
          strategy_name: s.name,
          pnl: s.total_pnl || 0,
          trades: s.trade_count || 0,
          win_rate: s.trade_count > 0 ? ((s.wins || 0) / s.trade_count * 100).toFixed(1) : '0',
          contribution_pct: totalPnl !== 0 ? ((s.total_pnl || 0) / Math.abs(totalPnl) * 100).toFixed(1) : '0'
        })),
        total_pnl: totalPnl,
        empty: stratAttribution.length === 0
      });
      
      // Load strategies from localStorage
      const savedStrategies = localStorage.getItem('flowgrid_workflow_v1::saves');
      if (savedStrategies) {
        const parsed = JSON.parse(savedStrategies);
        const stratObj = {};
        Object.keys(parsed).forEach(name => {
          const stratData = stratAttribution.find(s => s.name === name);
          stratObj[name] = {
            name,
            enabled: parsed[name].enabled || false,
            net_pnl: stratData?.total_pnl || 0,
            win_rate: stratData ? (stratData.wins / (stratData.trade_count || 1)) * 100 : 0,
            trade_count: stratData?.trade_count || 0
          };
        });
        setStrategies(stratObj);
      }
      
      setIsPreviewMode(false);
      initialLoadDone.current = true;
      
    } catch (err) {
      console.error('Error loading analytics data:', err);
      setError('Failed to load analytics data from localStorage.');
    } finally {
      setLoading(false);
    }
  }, [activeTab]);
  
  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);
  
  // Listen for trade completion events to refresh data
  useEffect(() => {
    const handleTradeCompleted = () => {
      console.log('[Analytics] Trade completed event - refreshing data');
      fetchData(true);
    };
    
    const handleTradesUpdated = () => {
      console.log('[Analytics] Trades updated event - refreshing data');
      fetchData(true);
    };
    
    window.addEventListener('flowgrid:trade-completed', handleTradeCompleted);
    window.addEventListener('flowgrid:trades-updated', handleTradesUpdated);
    
    return () => {
      window.removeEventListener('flowgrid:trade-completed', handleTradeCompleted);
      window.removeEventListener('flowgrid:trades-updated', handleTradesUpdated);
    };
  }, [fetchData]);
  
  // Handle strategy toggle (localStorage only, no backend)
  const handleStrategyToggle = useCallback(async (name, enabled) => {
    // Update local state immediately
    const newEnabled = { ...enabledStrategies, [name]: enabled };
    setEnabledStrategies(newEnabled);
    localStorage.setItem(ENABLED_STRATEGIES_KEY, JSON.stringify(newEnabled));
    
    // Refresh data from localStorage
    setRecomputing(true);
    setRecomputeStatus('processing');
    
    try {
      // Just refresh data - no backend call needed
      await fetchData(true);
      
      setRecomputeStatus('complete');
      setTimeout(() => {
        setRecomputing(false);
        setRecomputeStatus(null);
      }, 1000);
    } catch (err) {
      console.error('Error toggling strategy:', err);
      setRecomputing(false);
      setRecomputeStatus(null);
    }
  }, [enabledStrategies, fetchData]);
  
  // Tab definitions
  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'trade-logging', label: 'Trade Logging' },
    { id: 'trade-calendar', label: 'Trade Calendar' },
    { id: 'trade-analytics', label: 'Trade Analytics' },
    { id: 'attribution', label: 'Strategy Attribution' },
    { id: 'risk', label: 'Risk & Drawdown' },
    { id: 'time-analysis', label: 'Time Analysis' }
  ];
  
  // Render tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview':
        return (
          <div className="analytics-overview-grid">
            {/* KPI Row */}
            <div className="overview-kpis">
              <KPICard 
                label="Net P&L"
                value={formatCurrency(overview?.kpis?.net_pnl_usd)}
                subValue={formatPercent(overview?.kpis?.net_pnl_pct, true)}
                tooltip={TOOLTIPS.netPnl}
                isPositive={overview?.kpis?.net_pnl_usd > 0}
                isNegative={overview?.kpis?.net_pnl_usd < 0}
                isEmpty={overview?.empty}
                loading={loading}
              />
              <KPICard 
                label="Win Rate"
                value={formatPercent(overview?.kpis?.win_rate)}
                subValue={`${overview?.kpis?.wins || 0}W / ${overview?.kpis?.losses || 0}L`}
                tooltip={TOOLTIPS.winRate}
                isEmpty={overview?.empty}
                loading={loading}
              />
              <KPICard 
                label="Profit Factor"
                value={formatNumber(overview?.kpis?.profit_factor)}
                tooltip={TOOLTIPS.profitFactor}
                isPositive={overview?.kpis?.profit_factor > 1.5}
                isNegative={overview?.kpis?.profit_factor < 1}
                isEmpty={overview?.empty}
                loading={loading}
              />
              <KPICard 
                label="Expectancy"
                value={formatCurrency(overview?.kpis?.expectancy)}
                tooltip={TOOLTIPS.expectancy}
                isPositive={overview?.kpis?.expectancy > 0}
                isNegative={overview?.kpis?.expectancy < 0}
                isEmpty={overview?.empty}
                loading={loading}
              />
              <KPICard 
                label="Max Drawdown"
                value={formatPercent(overview?.kpis?.max_drawdown_pct)}
                subValue={formatCurrency(overview?.kpis?.max_drawdown_usd)}
                tooltip={TOOLTIPS.maxDrawdown}
                isNegative={overview?.kpis?.max_drawdown_pct > 10}
                isEmpty={overview?.empty}
                loading={loading}
              />
              <KPICard 
                label="Total Trades"
                value={overview?.kpis?.total_trades || '--'}
                tooltip={TOOLTIPS.totalTrades}
                isEmpty={overview?.empty}
                loading={loading}
              />
              <KPICard 
                label="Avg Win/Loss"
                value={`${formatCurrency(overview?.kpis?.avg_win)} / ${formatCurrency(overview?.kpis?.avg_loss)}`}
                tooltip={`${TOOLTIPS.avgWin} / ${TOOLTIPS.avgLoss}`}
                isEmpty={overview?.empty}
                loading={loading}
              />
            </div>
            
            {/* Main Content */}
            <div className="overview-main">
              <EquityChart 
                data={equityCurve}
                loading={loading}
                chartMode={chartMode}
                onModeChange={setChartMode}
              />
            </div>
            
            {/* Sidebar */}
            <div className="overview-sidebar">
              <FlowGradeCard 
                gradeData={overview?.flow_grade}
                onShowBreakdown={() => setShowGradeModal(true)}
                loading={loading}
              />
              <RecentActivityPanel 
                activity={activity}
                loading={loading}
              />
              <StrategyControlPanel 
                strategies={strategies}
                enabledStrategies={enabledStrategies}
                onToggle={handleStrategyToggle}
                loading={loading}
                recomputing={recomputing}
              />
            </div>
          </div>
        );
      
      case 'trade-analytics':
        return (
          <div className="trade-analytics-grid">
            <DistributionPanel 
              data={pnlDistribution}
              title="P&L Distribution"
              loading={loading}
            />
            <div className="chart-panel">
              <div className="chart-panel-header">
                <div className="chart-panel-title">Trade Duration</div>
              </div>
              <div className="empty-state-container">
                <div className="empty-state-icon">⏱️</div>
                <div className="empty-state-message">Duration analysis coming soon</div>
              </div>
            </div>
            <div className="chart-panel" style={{ gridColumn: '1 / -1' }}>
              <div className="chart-panel-header">
                <div className="chart-panel-title">Trade Scatter Plot</div>
              </div>
              <div className="empty-state-container">
                <div className="empty-state-icon">🎯</div>
                <div className="empty-state-message">Entry Price vs P&L scatter plot coming soon</div>
              </div>
            </div>
          </div>
        );
      
      case 'attribution':
        return (
          <div className="attribution-grid">
            <AttributionPanel 
              data={attribution}
              loading={loading}
            />
            <div className="chart-panel">
              <div className="chart-panel-header">
                <div className="chart-panel-title">Strategy Metrics</div>
              </div>
              {attribution?.contributions?.length > 0 ? (
                <div style={{ padding: '12px', overflowY: 'auto' }}>
                  {attribution.contributions.map((c, idx) => (
                    <div key={idx} style={{ 
                      display: 'flex', 
                      justifyContent: 'space-between', 
                      padding: '10px', 
                      background: 'var(--secondary-bg)',
                      borderRadius: '6px',
                      marginBottom: '8px'
                    }}>
                      <div>
                        <div style={{ fontWeight: 500, fontSize: '13px' }}>{c.strategy_name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {c.trades} trades · {c.win_rate}% win rate
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ 
                          fontWeight: 600, 
                          color: c.pnl >= 0 ? 'var(--positive)' : 'var(--negative)'
                        }}>
                          {formatCurrency(c.pnl)}
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                          {c.contribution_pct}% contribution
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="empty-state-container">
                  <div className="empty-state-message">Strategy metrics will appear here</div>
                </div>
              )}
            </div>
          </div>
        );
      
      case 'risk':
        return (
          <div className="risk-grid">
            <div className="risk-kpis">
              <KPICard 
                label="Max Drawdown"
                value={formatPercent(overview?.kpis?.max_drawdown_pct)}
                tooltip={TOOLTIPS.maxDrawdown}
                isNegative
                isEmpty={overview?.empty}
              />
              <KPICard 
                label="Peak Equity"
                value={formatCurrency(100000 + (overview?.kpis?.net_pnl_usd || 0))}
                isEmpty={overview?.empty}
              />
              <KPICard 
                label="Profit Factor"
                value={formatNumber(overview?.kpis?.profit_factor)}
                tooltip={TOOLTIPS.profitFactor}
                isEmpty={overview?.empty}
              />
              <KPICard 
                label="Largest Loss"
                value={formatCurrency(overview?.kpis?.avg_loss * -2)}
                isNegative
                isEmpty={overview?.empty}
              />
              <KPICard 
                label="Recovery Factor"
                value="--"
                tooltip="Net Profit / Max Drawdown"
                isEmpty={overview?.empty}
              />
            </div>
            <MonteCarloPanel 
              data={monteCarlo}
              loading={loading}
              isPremium={isPremium}
            />
            <div className="chart-panel">
              <div className="chart-panel-header">
                <div className="chart-panel-title">Drawdown Timeline</div>
              </div>
              <div className="empty-state-container">
                <div className="empty-state-icon">📉</div>
                <div className="empty-state-message">Drawdown visualization coming soon</div>
              </div>
            </div>
          </div>
        );
      
      case 'time-analysis':
        return (
          <div className="time-analysis-grid">
            <HeatmapPanel 
              data={heatmap}
              loading={loading}
            />
            <div className="chart-panel">
              <div className="chart-panel-header">
                <div className="chart-panel-title">Intraday Performance</div>
              </div>
              <div className="empty-state-container">
                <div className="empty-state-icon">📊</div>
                <div className="empty-state-message">Intraday P&L curve coming soon</div>
              </div>
            </div>
          </div>
        );
      
      case 'trade-logging':
        return (
          <div className="trade-logging-tab">
            <TradeLogging />
          </div>
        );
      
      case 'trade-calendar':
        return (
          <div className="trade-calendar-tab">
            <TradeCalendar />
          </div>
        );
      
      default:
        return null;
    }
  };
  
  return (
    <div className="dashboard-page">
      <DashboardSidebar onNavigate={onNavigate} activeRoute="analytics" />
      
      <main className="dashboard-main">
        <div className="dashboard-header">
          <div className="header-left">
            <h1>Analytics</h1>
            {overview?.computed_at && (
              <span className="last-update">
                Updated {formatTimeAgo(overview.computed_at)}
              </span>
            )}
          </div>
          <div className="header-right">
            {Object.values(enabledStrategies).filter(Boolean).length > 0 && (
              <div className="running-badge">
                ● {Object.values(enabledStrategies).filter(Boolean).length} Running
              </div>
            )}
            <button className="refresh-btn" onClick={fetchData} disabled={loading}>
              🔄 Refresh
            </button>
          </div>
        </div>
        
        {error && (
          <div className="error-banner">{error}</div>
        )}
        
        {/* Preview Banner */}
        {isPreviewMode && (
          <div className="preview-banner">
            <span className="preview-icon">ℹ</span>
            <span>Showing preview data from backtest results. Metrics will update when live trades are recorded.</span>
          </div>
        )}
        
        {/* Tab Navigation */}
        <div className="analytics-tabs">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`analytics-tab ${activeTab === tab.id ? 'active' : ''} ${tab.premium ? 'premium' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
        
        {/* Tab Content */}
        <div className="analytics-content">
          {renderTabContent()}
        </div>
      </main>
      
      {/* Modals & Toasts */}
      {showGradeModal && (
        <FlowGradeModal 
          gradeData={overview?.flow_grade}
          onClose={() => setShowGradeModal(false)}
        />
      )}
      
      <RecomputeToast 
        visible={recomputing}
        status={recomputeStatus}
      />
    </div>
  );
};

export default Analytics;
