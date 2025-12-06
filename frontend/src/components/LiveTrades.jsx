import React, { useState, useEffect } from 'react';
import { getAllTrades, getTradeStats, clearAllTrades } from '../tradeTracker';

const LiveTrades = () => {
  const [trades, setTrades] = useState([]);
  const [stats, setStats] = useState(null);
  const [filter, setFilter] = useState('ALL'); // ALL, LONG, SHORT
  const [sortBy, setSortBy] = useState('time'); // time, pnl

  // Load trades from storage
  const loadTrades = () => {
    const allTrades = getAllTrades();
    const tradeStats = getTradeStats();
    setTrades(allTrades);
    setStats(tradeStats);
  };

  useEffect(() => {
    loadTrades();

    // Listen for trade updates
    const handleTradesUpdated = () => {
      loadTrades();
    };

    window.addEventListener('flowgrid:trades-updated', handleTradesUpdated);
    
    // Refresh every 2 seconds in case of updates from other tabs
    const interval = setInterval(loadTrades, 2000);

    return () => {
      window.removeEventListener('flowgrid:trades-updated', handleTradesUpdated);
      clearInterval(interval);
    };
  }, []);

  // Filter trades
  const filteredTrades = trades.filter(trade => {
    if (filter === 'ALL') return true;
    return trade.direction === filter;
  });

  // Sort trades
  const sortedTrades = [...filteredTrades].sort((a, b) => {
    if (sortBy === 'time') {
      return new Date(b.exitTime).getTime() - new Date(a.exitTime).getTime();
    } else if (sortBy === 'pnl') {
      return b.netPnL - a.netPnL;
    }
    return 0;
  });

  const handleClearAll = () => {
    if (window.confirm('Clear ALL live trades? This cannot be undone.')) {
      clearAllTrades();
      loadTrades();
    }
  };

  const formatDuration = (ms) => {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) return `${days}d ${hours % 24}h`;
    if (hours > 0) return `${hours}h ${minutes % 60}m`;
    if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
    return `${seconds}s`;
  };

  const formatTime = (isoString) => {
    const date = new Date(isoString);
    return date.toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div style={{ padding: 0 }}>
      {/* Stats Summary */}
      {stats && (
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: 'repeat(4, 1fr)', 
          gap: 12,
          marginBottom: 16
        }}>
          <div className="stat-card">
            <div className="stat-label">Total Trades</div>
            <div className="stat-value">{stats.totalTrades}</div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Win Rate</div>
            <div className="stat-value">{stats.winRate.toFixed(1)}%</div>
            <div className="stat-detail">
              {stats.winningTrades}W / {stats.losingTrades}L
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Total P&L</div>
            <div className={`stat-value ${stats.totalPnL >= 0 ? 'positive' : 'negative'}`}>
              ${stats.totalPnL.toFixed(2)}
            </div>
          </div>
          <div className="stat-card">
            <div className="stat-label">Avg P&L per Trade</div>
            <div className={`stat-value ${stats.avgPnL >= 0 ? 'positive' : 'negative'}`}>
              ${stats.avgPnL.toFixed(2)}
            </div>
          </div>
        </div>
      )}

      {/* Controls */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 12
      }}>
        <div style={{ display: 'flex', gap: 8 }}>
          <select 
            value={filter} 
            onChange={(e) => setFilter(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #263141',
              background: '#071025',
              color: '#e5e7eb',
              fontSize: 12
            }}
          >
            <option value="ALL">All Trades</option>
            <option value="LONG">Long Only</option>
            <option value="SHORT">Short Only</option>
          </select>

          <select 
            value={sortBy} 
            onChange={(e) => setSortBy(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: 6,
              border: '1px solid #263141',
              background: '#071025',
              color: '#e5e7eb',
              fontSize: 12
            }}
          >
            <option value="time">Sort by Time</option>
            <option value="pnl">Sort by P&L</option>
          </select>
        </div>

        <button
          onClick={handleClearAll}
          style={{
            padding: '6px 12px',
            borderRadius: 6,
            border: '1px solid #263141',
            background: '#071025',
            color: '#ff6b6b',
            fontSize: 12,
            cursor: 'pointer'
          }}
        >
          Clear All Trades
        </button>
      </div>

      {/* Trades Table */}
      {sortedTrades.length === 0 ? (
        <div style={{ 
          textAlign: 'center', 
          padding: 40, 
          color: '#6b7280',
          fontSize: 14
        }}>
          No live trades yet. Start a strategy to begin tracking trades.
        </div>
      ) : (
        <div style={{ 
          maxHeight: 500, 
          overflowY: 'auto',
          border: '1px solid #263141',
          borderRadius: 6
        }}>
          <table style={{ 
            width: '100%', 
            borderCollapse: 'collapse',
            fontSize: 12
          }}>
            <thead style={{ 
              position: 'sticky', 
              top: 0, 
              background: '#0b0f14',
              borderBottom: '1px solid #263141'
            }}>
              <tr>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Strategy</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Symbol</th>
                <th style={{ padding: '8px 12px', textAlign: 'center' }}>Direction</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Entry</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Exit</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>P&L</th>
                <th style={{ padding: '8px 12px', textAlign: 'right' }}>Duration</th>
                <th style={{ padding: '8px 12px', textAlign: 'left' }}>Exit Time</th>
              </tr>
            </thead>
            <tbody>
              {sortedTrades.map((trade, index) => (
                <tr 
                  key={trade.id}
                  style={{ 
                    borderBottom: '1px solid rgba(255, 255, 255, 0.03)',
                    background: index % 2 === 0 ? 'transparent' : 'rgba(255, 255, 255, 0.01)'
                  }}
                >
                  <td style={{ padding: '8px 12px' }}>
                    <div style={{ fontWeight: 500 }}>{trade.strategyName}</div>
                    <div style={{ fontSize: 11, color: '#6b7280' }}>{trade.timeframe}</div>
                  </td>
                  <td style={{ padding: '8px 12px', fontWeight: 600 }}>
                    {trade.symbol}
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: 4,
                      fontSize: 11,
                      fontWeight: 600,
                      background: trade.direction === 'LONG' ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: trade.direction === 'LONG' ? '#22c55e' : '#ef4444'
                    }}>
                      {trade.direction}
                    </span>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                    ${trade.entryPrice.toFixed(2)}
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {formatTime(trade.entryTime)}
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', fontFamily: 'monospace' }}>
                    ${trade.exitPrice.toFixed(2)}
                    <div style={{ fontSize: 11, color: '#6b7280' }}>
                      {trade.exitSignal}
                    </div>
                  </td>
                  <td style={{ 
                    padding: '8px 12px', 
                    textAlign: 'right',
                    fontFamily: 'monospace',
                    fontWeight: 600,
                    color: trade.netPnL >= 0 ? '#22c55e' : '#ef4444'
                  }}>
                    {trade.netPnL >= 0 ? '+' : ''}${trade.netPnL.toFixed(2)}
                    <div style={{ fontSize: 11, color: '#6b7280', fontWeight: 400 }}>
                      {((trade.netPnL / (trade.entryPrice * trade.shares)) * 100).toFixed(2)}%
                    </div>
                  </td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: '#9ca3af' }}>
                    {formatDuration(trade.holdingDuration)}
                  </td>
                  <td style={{ padding: '8px 12px', color: '#9ca3af' }}>
                    {formatTime(trade.exitTime)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <style jsx>{`
        .stat-card {
          padding: 12px;
          background: rgba(255, 255, 255, 0.02);
          border: 1px solid rgba(255, 255, 255, 0.04);
          border-radius: 6px;
        }
        .stat-label {
          font-size: 11px;
          color: #9ca3af;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          margin-bottom: 4px;
        }
        .stat-value {
          font-size: 20px;
          font-weight: 700;
          color: #e5e7eb;
        }
        .stat-value.positive {
          color: #22c55e;
        }
        .stat-value.negative {
          color: #ef4444;
        }
        .stat-detail {
          font-size: 11px;
          color: #6b7280;
          margin-top: 2px;
        }
      `}</style>
    </div>
  );
};

export default LiveTrades;
