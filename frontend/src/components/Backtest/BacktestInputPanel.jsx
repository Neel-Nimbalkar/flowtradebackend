import React, { useState, useEffect } from 'react';
import './BacktestInputPanel.css';

const SAVES_KEY = 'flowgrid_workflow_v1::saves';

const BacktestInputPanel = ({ onRun, loading }) => {
  const [strategies, setStrategies] = useState([]);
  const [config, setConfig] = useState({
    strategyName: '',
    symbol: 'SPY',
    timeframe: '1Hour',
    startDate: getDefaultStartDate(),
    endDate: getDefaultEndDate(),
    startingCapital: 10000,
    fees: 0.001,
    slippage: 0.0005,
    orderType: 'market'
  });

  useEffect(() => {
    loadStrategies();
  }, []);

  function loadStrategies() {
    try {
      const raw = localStorage.getItem(SAVES_KEY);
      if (!raw) return;
      const saves = JSON.parse(raw);
      const list = Object.keys(saves).map(name => ({ name, savedAt: saves[name].savedAt }));
      setStrategies(list);
      if (list.length > 0 && !config.strategyName) {
        setConfig(prev => ({ ...prev, strategyName: list[0].name }));
      }
    } catch (e) {
      console.error('Failed to load strategies', e);
    }
  }

  function getDefaultStartDate() {
    const d = new Date();
    d.setMonth(d.getMonth() - 3); // 3 months ago
    return d.toISOString().split('T')[0];
  }

  function getDefaultEndDate() {
    return new Date().toISOString().split('T')[0];
  }

  const handleChange = (field, value) => {
    setConfig(prev => ({ ...prev, [field]: value }));
  };

  const handleSubmit = () => {
    if (!config.strategyName) {
      alert('Please select a strategy');
      return;
    }
    if (!config.symbol) {
      alert('Please enter a ticker symbol');
      return;
    }
    onRun(config);
  };

  return (
    <div className="backtest-input-panel">
      <div className="input-panel-header">
        <h2>Configuration</h2>
      </div>

      <div className="input-panel-body">
        <div className="input-group">
          <label>Strategy</label>
          <select
            value={config.strategyName}
            onChange={(e) => handleChange('strategyName', e.target.value)}
            disabled={loading}
          >
            <option value="">Select a strategy...</option>
            {strategies.map(s => (
              <option key={s.name} value={s.name}>{s.name}</option>
            ))}
          </select>
          {strategies.length === 0 && (
            <small className="input-hint">No saved strategies found. Create one in the Strategy Builder first.</small>
          )}
        </div>

        <div className="input-group">
          <label>Ticker Symbol</label>
          <input
            type="text"
            value={config.symbol}
            onChange={(e) => handleChange('symbol', e.target.value.toUpperCase())}
            placeholder="e.g., SPY, AAPL, NVDA"
            disabled={loading}
          />
        </div>

        <div className="input-group">
          <label>Timeframe</label>
          <select
            value={config.timeframe}
            onChange={(e) => handleChange('timeframe', e.target.value)}
            disabled={loading}
          >
            <option value="1Min">1 Minute</option>
            <option value="5Min">5 Minutes</option>
            <option value="15Min">15 Minutes</option>
            <option value="1Hour">1 Hour</option>
            <option value="4Hour">4 Hours</option>
            <option value="1Day">1 Day</option>
          </select>
        </div>

        <div className="input-row">
          <div className="input-group">
            <label>Start Date</label>
            <input
              type="date"
              value={config.startDate}
              onChange={(e) => handleChange('startDate', e.target.value)}
              disabled={loading}
            />
          </div>
          <div className="input-group">
            <label>End Date</label>
            <input
              type="date"
              value={config.endDate}
              onChange={(e) => handleChange('endDate', e.target.value)}
              disabled={loading}
            />
          </div>
        </div>

        <div className="input-group">
          <label>Starting Capital ($)</label>
          <input
            type="number"
            value={config.startingCapital}
            onChange={(e) => handleChange('startingCapital', parseFloat(e.target.value))}
            min="100"
            step="100"
            disabled={loading}
          />
        </div>

        <details className="advanced-settings">
          <summary>Advanced Settings</summary>
          <div className="advanced-content">
            <div className="input-group">
              <label>Fees (%)</label>
              <input
                type="number"
                value={config.fees * 100}
                onChange={(e) => handleChange('fees', parseFloat(e.target.value) / 100)}
                min="0"
                step="0.01"
                disabled={loading}
              />
              <small className="input-hint">Trading fees per side (default: 0.1%)</small>
            </div>

            <div className="input-group">
              <label>Slippage (%)</label>
              <input
                type="number"
                value={config.slippage * 100}
                onChange={(e) => handleChange('slippage', parseFloat(e.target.value) / 100)}
                min="0"
                step="0.01"
                disabled={loading}
              />
              <small className="input-hint">Estimated slippage per trade (default: 0.05%)</small>
            </div>

            <div className="input-group">
              <label>Order Type</label>
              <select
                value={config.orderType}
                onChange={(e) => handleChange('orderType', e.target.value)}
                disabled={loading}
              >
                <option value="market">Market Order</option>
                <option value="limit">Limit Order</option>
              </select>
            </div>
          </div>
        </details>

        <button
          className="run-backtest-btn"
          onClick={handleSubmit}
          disabled={loading || !config.strategyName || !config.symbol}
        >
          {loading ? 'Running...' : 'Run Backtest'}
        </button>
      </div>
    </div>
  );
};

export default BacktestInputPanel;
