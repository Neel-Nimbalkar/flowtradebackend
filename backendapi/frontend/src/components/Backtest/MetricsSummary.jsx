import React from 'react';
import './MetricsSummary.css';

const MetricsSummary = ({ results }) => {
  const { metrics, config, trades, equityCurve, drawdownData } = results;

  const formatCurrency = (val) => `$${val?.toFixed(2) || '0.00'}`;
  const formatPercent = (val) => `${val?.toFixed(2) || '0.00'}%`;
  const formatNumber = (val) => val?.toFixed(2) || '0.00';
  const formatDuration = (ms) => {
    if (!ms) return '0m';
    const hours = ms / (1000 * 60 * 60);
    if (hours < 1) return `${(ms / (1000 * 60)).toFixed(0)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    const days = hours / 24;
    return `${days.toFixed(1)}d`;
  };

  // Calculate additional summary stats
  const wins = trades?.filter(t => t.netProfit > 0) || [];
  const losses = trades?.filter(t => t.netProfit <= 0) || [];
  const avgWin = wins.length > 0 ? wins.reduce((s, t) => s + t.netProfit, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, t) => s + t.netProfit, 0) / losses.length) : 0;
  const expectancy = metrics?.expectancy || (metrics?.winRate / 100 * avgWin - (1 - metrics?.winRate / 100) * avgLoss);
  
  // Calculate risk-reward ratio
  const riskReward = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
  
  // Calculate profit factor
  const grossProfit = wins.reduce((s, t) => s + t.netProfit, 0);
  const grossLoss = Math.abs(losses.reduce((s, t) => s + t.netProfit, 0));
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

  // Performance grade calculation
  const calculateGrade = () => {
    let score = 0;
    if (metrics?.winRate > 50) score += 20;
    if (metrics?.winRate > 60) score += 10;
    if (profitFactor > 1.5) score += 20;
    if (profitFactor > 2) score += 10;
    if (metrics?.sharpeRatio > 1) score += 15;
    if (metrics?.sharpeRatio > 2) score += 10;
    if (riskReward > 1) score += 15;
    if (riskReward > 2) score += 10;
    if (metrics?.netProfit > 0) score += 10;
    
    if (score >= 90) return { grade: 'A+', color: '#3b82f6' };
    if (score >= 80) return { grade: 'A', color: '#3b82f6' };
    if (score >= 70) return { grade: 'B+', color: '#60a5fa' };
    if (score >= 60) return { grade: 'B', color: '#84cc16' };
    if (score >= 50) return { grade: 'C+', color: '#f59e0b' };
    if (score >= 40) return { grade: 'C', color: '#f97316' };
    if (score >= 30) return { grade: 'D', color: '#ef4444' };
    return { grade: 'F', color: '#dc2626' };
  };

  const gradeInfo = calculateGrade();

  return (
    <div className="metrics-summary-enhanced">
      {/* Header Overview */}
      <div className="summary-header">
        <div className="header-left">
          <h3>Strategy Performance</h3>
          <div className="strategy-info">
            <span className="symbol-badge">{config?.symbol || 'N/A'}</span>
            <span className="timeframe-badge">{config?.timeframe || 'N/A'}</span>
            <span className="period-badge">{config?.startDate} → {config?.endDate}</span>
          </div>
        </div>
        <div className="header-right">
          <div className="performance-grade" style={{ borderColor: gradeInfo.color }}>
            <span className="grade-label">Grade</span>
            <span className="grade-value" style={{ color: gradeInfo.color }}>{gradeInfo.grade}</span>
          </div>
        </div>
      </div>

      {/* Key Performance Indicators */}
      <div className="kpi-section">
        <div className="kpi-row">
          <div className={`kpi-card primary ${metrics?.netProfit >= 0 ? 'profit' : 'loss'}`}>
            <div className="kpi-icon">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Net Profit/Loss</span>
              <span className="kpi-value">{formatCurrency(metrics?.netProfit)}</span>
              <span className={`kpi-change ${metrics?.netProfitPercent >= 0 ? 'up' : 'down'}`}>
                {metrics?.netProfitPercent >= 0 ? '↑' : '↓'} {formatPercent(Math.abs(metrics?.netProfitPercent || 0))}
              </span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon blue">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Total Trades</span>
              <span className="kpi-value">{metrics?.totalTrades || 0}</span>
              <span className="kpi-sub">{formatNumber(metrics?.tradesPerDay || 0)} / day</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon" style={{ color: metrics?.winRate >= 50 ? '#3b82f6' : '#f59e0b' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
                <polyline points="22,4 12,14.01 9,11.01" />
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Win Rate</span>
              <span className="kpi-value" style={{ color: metrics?.winRate >= 50 ? '#3b82f6' : '#f59e0b' }}>
                {formatPercent(metrics?.winRate)}
              </span>
              <span className="kpi-sub">{wins.length}W / {losses.length}L</span>
            </div>
          </div>

          <div className="kpi-card">
            <div className="kpi-icon" style={{ color: profitFactor >= 1 ? '#3b82f6' : '#ef4444' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 3v18h18" />
                <path d="M18.7 8l-5.1 5.2-2.8-2.7L7 14.3" />
              </svg>
            </div>
            <div className="kpi-content">
              <span className="kpi-label">Profit Factor</span>
              <span className="kpi-value" style={{ color: profitFactor >= 1 ? '#3b82f6' : '#ef4444' }}>
                {profitFactor === Infinity ? '∞' : formatNumber(profitFactor)}
              </span>
              <span className="kpi-sub">Gross: {formatCurrency(grossProfit)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Performance Metrics Grid */}
      <div className="metrics-grid-section">
        <h4>Performance Metrics</h4>
        <div className="metrics-cards-grid">
          <div className="metric-card-new">
            <div className="metric-header">
              <span className="metric-title">Risk-Reward Ratio</span>
              <span className={`metric-badge ${riskReward >= 1 ? 'good' : 'bad'}`}>
                {riskReward >= 2 ? 'Excellent' : riskReward >= 1 ? 'Good' : 'Poor'}
              </span>
            </div>
            <div className="metric-main" style={{ color: riskReward >= 1 ? '#3b82f6' : '#ef4444' }}>
              {riskReward === Infinity ? '∞' : `${formatNumber(riskReward)}:1`}
            </div>
            <div className="metric-details">
              <span>Avg Win: <b style={{ color: '#3b82f6' }}>{formatCurrency(avgWin)}</b></span>
              <span>Avg Loss: <b style={{ color: '#ef4444' }}>{formatCurrency(avgLoss)}</b></span>
            </div>
          </div>

          <div className="metric-card-new">
            <div className="metric-header">
              <span className="metric-title">Sharpe Ratio</span>
              <span className={`metric-badge ${metrics?.sharpeRatio >= 1 ? 'good' : 'neutral'}`}>
                {metrics?.sharpeRatio >= 2 ? 'Excellent' : metrics?.sharpeRatio >= 1 ? 'Good' : 'Low'}
              </span>
            </div>
            <div className="metric-main" style={{ color: metrics?.sharpeRatio >= 1 ? '#3b82f6' : '#f59e0b' }}>
              {formatNumber(metrics?.sharpeRatio)}
            </div>
            <div className="metric-details">
              <span>Risk-adjusted returns</span>
            </div>
          </div>

          <div className="metric-card-new">
            <div className="metric-header">
              <span className="metric-title">Expectancy</span>
              <span className={`metric-badge ${expectancy >= 0 ? 'good' : 'bad'}`}>
                {expectancy >= 0 ? 'Positive' : 'Negative'}
              </span>
            </div>
            <div className="metric-main" style={{ color: expectancy >= 0 ? '#3b82f6' : '#ef4444' }}>
              {formatCurrency(expectancy)}
            </div>
            <div className="metric-details">
              <span>Per trade expected value</span>
            </div>
          </div>

          <div className="metric-card-new">
            <div className="metric-header">
              <span className="metric-title">Max Drawdown</span>
              <span className={`metric-badge ${(drawdownData?.maxDrawdown || 0) < 10 ? 'good' : 'bad'}`}>
                {(drawdownData?.maxDrawdown || 0) < 10 ? 'Low Risk' : 'High Risk'}
              </span>
            </div>
            <div className="metric-main" style={{ color: '#ef4444' }}>
              {formatCurrency(drawdownData?.maxDrawdown || 0)}
            </div>
            <div className="metric-details">
              <span>Peak to trough decline</span>
            </div>
          </div>
        </div>
      </div>

      {/* Trade Statistics */}
      <div className="trade-stats-section">
        <h4>Trade Statistics</h4>
        <div className="stats-container">
          <div className="stats-column winners">
            <div className="stats-header">
              <span className="stats-icon win">↑</span>
              <span>Winning Trades</span>
            </div>
            <div className="stats-number">{wins.length}</div>
            <div className="stats-breakdown">
              <div className="stat-row">
                <span>Total Profit</span>
                <span className="win">{formatCurrency(grossProfit)}</span>
              </div>
              <div className="stat-row">
                <span>Average Win</span>
                <span className="win">{formatCurrency(avgWin)}</span>
              </div>
              <div className="stat-row">
                <span>Best Trade</span>
                <span className="win">{formatCurrency(metrics?.bestTrade)}</span>
              </div>
              <div className="stat-row">
                <span>Avg Win %</span>
                <span className="win">{wins.length > 0 ? formatPercent(wins.reduce((s, t) => s + t.profitPercent, 0) / wins.length) : '0%'}</span>
              </div>
            </div>
          </div>

          <div className="stats-divider">
            <div className="divider-circle">VS</div>
          </div>

          <div className="stats-column losers">
            <div className="stats-header">
              <span className="stats-icon loss">↓</span>
              <span>Losing Trades</span>
            </div>
            <div className="stats-number">{losses.length}</div>
            <div className="stats-breakdown">
              <div className="stat-row">
                <span>Total Loss</span>
                <span className="loss">{formatCurrency(grossLoss)}</span>
              </div>
              <div className="stat-row">
                <span>Average Loss</span>
                <span className="loss">{formatCurrency(avgLoss)}</span>
              </div>
              <div className="stat-row">
                <span>Worst Trade</span>
                <span className="loss">{formatCurrency(Math.abs(metrics?.worstTrade || 0))}</span>
              </div>
              <div className="stat-row">
                <span>Avg Loss %</span>
                <span className="loss">{losses.length > 0 ? formatPercent(Math.abs(losses.reduce((s, t) => s + t.profitPercent, 0) / losses.length)) : '0%'}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Stats Bar */}
      <div className="quick-stats-bar">
        <div className="quick-stat">
          <span className="quick-label">Starting Capital</span>
          <span className="quick-value">{formatCurrency(config?.startingCapital)}</span>
        </div>
        <div className="quick-stat">
          <span className="quick-label">Current Capital</span>
          <span className="quick-value" style={{ color: (metrics?.currentCapital || config?.startingCapital) >= config?.startingCapital ? '#3b82f6' : '#ef4444' }}>
            {formatCurrency(metrics?.currentCapital || config?.startingCapital)}
          </span>
        </div>
        <div className="quick-stat">
          <span className="quick-label">Open P&L</span>
          <span className="quick-value" style={{ color: (metrics?.openPnL || 0) >= 0 ? '#3b82f6' : '#ef4444' }}>
            {formatCurrency(metrics?.openPnL || 0)}
          </span>
        </div>
        <div className="quick-stat">
          <span className="quick-label">Avg Hold Time</span>
          <span className="quick-value">{formatDuration(metrics?.avgHoldingTime)}</span>
        </div>
        <div className="quick-stat">
          <span className="quick-label">Fees Paid</span>
          <span className="quick-value" style={{ color: '#f59e0b' }}>{formatCurrency((config?.fees || 0) * (metrics?.totalTrades || 0) * 2)}</span>
        </div>
      </div>
    </div>
  );
};

export default MetricsSummary;
