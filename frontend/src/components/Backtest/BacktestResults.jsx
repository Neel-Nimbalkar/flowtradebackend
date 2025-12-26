import React, { useState } from 'react';
import './BacktestResults.css';
import MetricsSummary from './MetricsSummary';
import TradesTable from './TradesTable';
import EquityCurveChart from './EquityCurveChart';
import PriceChart from './PriceChart';
import TradingViewChart from './TradingViewChart';
import DrawdownChart from './DrawdownChart';
import StatsDistribution from './StatsDistribution';
import AdvancedMetrics from './AdvancedMetrics';
import MonthlyReturns from './MonthlyReturns';
import Icon from '../Icon';

const BacktestResults = ({ results }) => {
  const [activeTab, setActiveTab] = useState('summary');

  const tabs = [
    { key: 'summary', label: 'Summary', icon: 'ai' },
    { key: 'trades', label: 'Trades', icon: 'list' },
    { key: 'advanced', label: 'Advanced', icon: 'target' },
    { key: 'monthly', label: 'Monthly', icon: 'chart' },
    { key: 'equity', label: 'Equity Curve', icon: 'chart' },
    { key: 'tradingview', label: 'TradingView', icon: 'bolt' },
    { key: 'price', label: 'Price Action', icon: 'bolt' },
    { key: 'drawdown', label: 'Drawdown', icon: 'drop' },
    { key: 'stats', label: 'Distribution', icon: 'search' }
  ];

  const exportCSV = () => {
    const { trades } = results;
    const headers = ['Entry Time', 'Exit Time', 'Direction', 'Entry Price', 'Exit Price', 'Net Profit', 'Profit %', 'Holding Duration (ms)', 'MAE', 'MFE'];
    const rows = trades.map(t => [
      new Date(t.entryTime).toISOString(),
      new Date(t.exitTime).toISOString(),
      t.direction,
      t.entryPrice.toFixed(2),
      t.exitPrice.toFixed(2),
      t.netProfit.toFixed(2),
      t.profitPercent.toFixed(2),
      t.holdingDuration,
      t.mae.toFixed(2),
      t.mfe.toFixed(2)
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest-trades-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(results, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="backtest-results">
      <div className="results-header">
        <h2>Backtest Results</h2>
        <div className="export-buttons">
          <button onClick={exportCSV} className="export-btn">Export CSV</button>
          <button onClick={exportJSON} className="export-btn">Export JSON</button>
        </div>
      </div>

      <div className="results-tabs">
        {tabs.map(tab => (
          <button
            key={tab.key}
            className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
            onClick={() => setActiveTab(tab.key)}
          >
            <Icon name={tab.icon} />
            <span className="tab-label">{tab.label}</span>
          </button>
        ))}
      </div>

      <div className="results-content">
        {activeTab === 'summary' && <MetricsSummary results={results} />}
        {activeTab === 'trades' && <TradesTable trades={results.trades} />}
        {activeTab === 'advanced' && <AdvancedMetrics results={results} />}
        {activeTab === 'monthly' && <MonthlyReturns results={results} />}
        {activeTab === 'equity' && <EquityCurveChart data={results.equityCurve} />}
        {activeTab === 'tradingview' && (
          <TradingViewChart 
            symbol={results.symbol || 'SPY'} 
            timeframe={results.timeframe || '15Min'}
            signals={results.signals}
            trades={results.trades}
            historicalData={results.historicalData}
            theme="dark"
          />
        )}
        {activeTab === 'price' && <PriceChart historicalData={results.historicalData} signals={results.signals} />}
        {activeTab === 'drawdown' && <DrawdownChart data={results.drawdownData.data} />}
        {activeTab === 'stats' && <StatsDistribution trades={results.trades} />}
      </div>
    </div>
  );
};

export default BacktestResults;
