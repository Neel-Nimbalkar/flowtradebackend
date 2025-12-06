import React from 'react';
import './MetricsSummary.css';
import EquityCurveChart from './EquityCurveChart';
import DrawdownChart from './DrawdownChart';

const MetricsSummary = ({ results }) => {
  const { metrics, config, trades } = results;

  const formatCurrency = (val) => `$${val.toFixed(2)}`;
  const formatPercent = (val) => `${val.toFixed(2)}%`;
  const formatNumber = (val) => val.toFixed(2);
  const formatDuration = (ms) => {
    const hours = ms / (1000 * 60 * 60);
    if (hours < 24) return `${hours.toFixed(1)}h`;
    const days = hours / 24;
    return `${days.toFixed(1)}d`;
  };

  const metricCards = [
    { label: 'Total Trades', value: metrics.totalTrades, color: '#3b82f6' },
    { label: 'Win Rate', value: formatPercent(metrics.winRate), color: metrics.winRate > 50 ? '#10b981' : '#f59e0b' },
    { label: 'Net Profit', value: formatCurrency(metrics.netProfit), color: metrics.netProfit > 0 ? '#10b981' : '#ef4444' },
    { label: 'Return', value: formatPercent(metrics.netProfitPercent), color: metrics.netProfitPercent > 0 ? '#10b981' : '#ef4444' },
    { label: 'Open P&L', value: formatCurrency(metrics.openPnL || 0), color: (metrics.openPnL || 0) >= 0 ? '#10b981' : '#ef4444' },
    { label: 'Current Capital', value: formatCurrency(metrics.currentCapital || config.startingCapital), color: '#3b82f6' },
    { label: 'Profit Factor', value: formatNumber(metrics.profitFactor), color: metrics.profitFactor > 1 ? '#10b981' : '#ef4444' },
    { label: 'Sharpe Ratio', value: formatNumber(metrics.sharpeRatio), color: metrics.sharpeRatio > 1 ? '#10b981' : '#f59e0b' },
    { label: 'Avg Win', value: formatCurrency(metrics.avgWin), color: '#10b981' },
    { label: 'Avg Loss', value: formatCurrency(metrics.avgLoss), color: '#ef4444' },
    { label: 'Best Trade', value: formatCurrency(metrics.bestTrade), color: '#10b981' },
    { label: 'Worst Trade', value: formatCurrency(metrics.worstTrade), color: '#ef4444' },
    { label: 'Expectancy', value: formatCurrency(metrics.expectancy), color: metrics.expectancy > 0 ? '#10b981' : '#ef4444' },
    { label: 'Avg Hold Time', value: formatDuration(metrics.avgHoldingTime), color: '#8b5cf6' }
  ];

  return (
    <div className="metrics-summary">
      <div className="summary-config">
        <h3>Configuration</h3>
        <div className="config-grid">
          <div className="config-item">
            <span className="config-label">Strategy:</span>
            <span className="config-value">{config.strategyName}</span>
          </div>
          <div className="config-item">
            <span className="config-label">Symbol:</span>
            <span className="config-value">{config.symbol}</span>
          </div>
          <div className="config-item">
            <span className="config-label">Timeframe:</span>
            <span className="config-value">{config.timeframe}</span>
          </div>
          <div className="config-item">
            <span className="config-label">Period:</span>
            <span className="config-value">{config.startDate} to {config.endDate}</span>
          </div>
          <div className="config-item">
            <span className="config-label">Starting Capital:</span>
            <span className="config-value">{formatCurrency(config.startingCapital)}</span>
          </div>
          <div className="config-item">
            <span className="config-label">Fees:</span>
            <span className="config-value">{formatPercent(config.fees * 100)}</span>
          </div>
        </div>
      </div>

      <div className="summary-metrics">
        <h3>Performance Metrics</h3>
        <div className="metrics-grid">
          {metricCards.map((card, idx) => (
            <div key={idx} className="metric-card" style={{ borderLeftColor: card.color }}>
              <div className="metric-label">{card.label}</div>
              <div className="metric-value" style={{ color: card.color }}>{card.value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="summary-charts">
        <h3>Performance Charts</h3>
        <div className="charts-grid">
          <div className="chart-panel">
            <h4>Equity Curve</h4>
            <EquityCurveChart data={results.equityCurve} />
          </div>
          <div className="chart-panel">
            <h4>Drawdown</h4>
            <DrawdownChart data={results.drawdownData.data} />
          </div>
        </div>
      </div>

      <div className="summary-breakdown">
        <h3>Trade Breakdown</h3>
        <div className="breakdown-grid">
          <div className="breakdown-item win">
            <div className="breakdown-count">{metrics.winningTrades || 0}</div>
            <div className="breakdown-label">Winning Trades</div>
          </div>
          <div className="breakdown-item loss">
            <div className="breakdown-count">{metrics.losingTrades || 0}</div>
            <div className="breakdown-label">Losing Trades</div>
          </div>
          <div className="breakdown-item neutral">
            <div className="breakdown-count">{formatNumber(metrics.tradesPerDay)}</div>
            <div className="breakdown-label">Trades/Day</div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MetricsSummary;
