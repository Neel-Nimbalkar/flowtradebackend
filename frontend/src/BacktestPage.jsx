import React, { useState, useEffect } from 'react';
import './BacktestPage.css';
import BackButton from './components/BackButton';
import BacktestInputPanel from './components/Backtest/BacktestInputPanel';
import BacktestResults from './components/Backtest/BacktestResults';
import { runBacktest } from './backtestEngine';

const BacktestPage = ({ onNavigate }) => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);

  const handleRunBacktest = async (config) => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      console.log('[Backtest] Running with config:', config);
      const backtestResults = await runBacktest(config);
      console.log('[Backtest] Results:', backtestResults);
      setResults(backtestResults);
    } catch (err) {
      console.error('[Backtest] Error:', err);
      setError(err.message || 'Backtest failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="backtest-page">
      <div className="backtest-header">
        <BackButton onNavigate={onNavigate} />
        <h1>Backtesting Suite</h1>
        <div className="backtest-subtitle">
          Test your strategies against historical data with precision
        </div>
      </div>

      <div className="backtest-container">
        <BacktestInputPanel 
          onRun={handleRunBacktest} 
          loading={loading}
        />
        
        <div className="backtest-output">
          {loading && (
            <div className="backtest-loading">
              <div className="spinner"></div>
              <p>Running backtest simulation...</p>
              <small>Processing historical data and computing trades</small>
            </div>
          )}

          {error && (
            <div className="backtest-error">
              <div className="error-icon">⚠</div>
              <h3>Backtest Failed</h3>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && !results && (
            <div className="backtest-empty">
              <div className="empty-icon">📊</div>
              <h3>Ready to Backtest</h3>
              <p>Configure your backtest parameters and click "Run Backtest" to begin.</p>
            </div>
          )}

          {!loading && !error && results && (
            <BacktestResults results={results} />
          )}
        </div>
      </div>
    </div>
  );
};

export default BacktestPage;
