/**
 * Mini Trade Log Component for Dashboard
 * Displays recent trades with simplified view
 */

import React, { useState, useEffect } from 'react';
import { fetchTradesFromBackend } from '../../services/tradeService';
import './MiniTradeLog.css';

const MiniTradeLog = () => {
  const [trades, setTrades] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadTrades();
    
    // Listen for trade updates
    const handleTradeUpdate = () => {
      loadTrades();
    };
    
    window.addEventListener('flowgrid:trade-completed', handleTradeUpdate);
    
    return () => {
      window.removeEventListener('flowgrid:trade-completed', handleTradeUpdate);
    };
  }, []);

  const loadTrades = async () => {
    try {
      setLoading(true);
      const data = await fetchTradesFromBackend();
      // Get last 10 trades
      const recentTrades = data.slice(-10).reverse();
      setTrades(recentTrades);
    } catch (error) {
      console.error('Failed to load trades:', error);
      setTrades([]);
    } finally {
      setLoading(false);
    }
  };

  const formatPercent = (value) => {
    if (value === null || value === undefined || isNaN(value)) return '--';
    const sign = value > 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
  };

  const formatDateTime = (ts) => {
    if (!ts) return '--';
    try {
      return new Date(ts).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return '--';
    }
  };

  const shortUUID = (id) => {
    if (!id) return '--';
    const str = String(id);
    return str.slice(0, 8);
  };

  if (loading) {
    return (
      <div className="mini-trade-log-loading">
        <div className="spinner"></div>
        <span>Loading trades...</span>
      </div>
    );
  }

  if (!trades || trades.length === 0) {
    return (
      <div className="mini-trade-log-empty">
        <div className="empty-icon">📊</div>
        <div className="empty-text">No trades yet</div>
      </div>
    );
  }

  return (
    <div className="mini-trade-log">
      <div className="mini-trade-log-header">
        <span className="trade-count">{trades.length} Recent Trades</span>
      </div>
      <div className="mini-trade-log-list">
        {trades.map((trade) => (
          <div 
            key={trade.id} 
            className={`mini-trade-item ${(trade.net_pct || 0) > 0 ? 'win' : 'loss'}`}
          >
            <div className="trade-row-1">
              <span className="trade-id">{shortUUID(trade.id)}</span>
              <span className={`trade-side ${(trade.open_side || '').toLowerCase()}`}>
                {trade.open_side || '--'}
              </span>
              <span className={`trade-pnl ${(trade.net_pct || 0) > 0 ? 'positive' : 'negative'}`}>
                {formatPercent(trade.net_pct)}
              </span>
            </div>
            <div className="trade-row-2">
              <span className="trade-time">{formatDateTime(trade.close_ts)}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default MiniTradeLog;
