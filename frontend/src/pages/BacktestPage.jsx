import React, { useState } from 'react';
import '../BacktestPage.css';
import './Dashboard.css';
import DashboardSidebar from '../components/DashboardSidebar';
import BacktestInputPanel from '../components/Backtest/BacktestInputPanel';
import BacktestResults from '../components/Backtest/BacktestResults';
import { runBacktest } from '../backtestEngine';

const BacktestPage = ({ onNavigate }) => {
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null);
  const [error, setError] = useState(null);
  const [configCollapsed, setConfigCollapsed] = useState(false);

  const handleRunBacktest = async (basicConfig) => {
    setLoading(true);
    setError(null);
    setResults(null);

    try {
      console.log('[Backtest] Running with config:', basicConfig);
      
      const backtestResults = await runBacktest(basicConfig);
      
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
    <div className="dashboard-page backtest-page-layout">
      <DashboardSidebar onNavigate={onNavigate} activeRoute="backtest" />
      <main className="dashboard-main backtest-main">
        <div className="backtest-page-header">
          <div className="header-left">
            <h1>Backtest</h1>
            <span className="page-subtitle">Test your strategies against historical data</span>
          </div>
          <div className="header-right">
            <button 
              className="toggle-config-btn"
              onClick={() => setConfigCollapsed(!configCollapsed)}
              title={configCollapsed ? 'Show Configuration' : 'Hide Configuration'}
            >
              <span className="toggle-icon">{configCollapsed ? '▶' : '◀'}</span>
              <span>{configCollapsed ? 'Show Config' : 'Hide Config'}</span>
            </button>
          </div>
        </div>

        <div className={`backtest-layout ${configCollapsed ? 'config-collapsed' : ''}`}>
          <aside className={`backtest-config-panel ${configCollapsed ? 'collapsed' : ''}`}>
            <div className="config-panel-inner">
              <BacktestInputPanel 
                onRun={handleRunBacktest} 
                loading={loading}
              />
            </div>
          </aside>
          
          <section className="backtest-results-area">
            {loading && (
              <div className="backtest-loading">
                <div className="loading-spinner"></div>
                <h3>Running Backtest</h3>
                <p>Processing historical data and computing trades...</p>
                <div className="loading-progress">
                  <div className="progress-bar"></div>
                </div>
              </div>
            )}

            {error && (
              <div className="backtest-error-state">
                <div className="error-icon-wrapper">
                  <span className="error-icon-svg"></span>
                </div>
                <h3>Backtest Failed</h3>
                <p>{error}</p>
                <button className="retry-btn" onClick={() => setError(null)}>
                  Try Again
                </button>
              </div>
            )}

            {!loading && !error && !results && (
              <div className="backtest-empty-state">
                <div className="empty-icon-wrapper">
                  <span className="chart-icon-svg"></span>
                </div>
                <h3>Ready to Backtest</h3>
                <p>Configure your backtest parameters and click "Run Backtest" to begin analyzing your strategy's historical performance.</p>
                <div className="empty-hints">
                  <div className="hint-item">
                    <span className="hint-icon strategy"></span>
                    <span>Select a saved strategy</span>
                  </div>
                  <div className="hint-item">
                    <span className="hint-icon calendar"></span>
                    <span>Choose date range</span>
                  </div>
                  <div className="hint-item">
                    <span className="hint-icon play"></span>
                    <span>Run backtest</span>
                  </div>
                </div>
              </div>
            )}

            {!loading && !error && results && (
              <BacktestResults results={results} />
            )}
          </section>
        </div>
      </main>
    </div>
  );
};

export default BacktestPage;
