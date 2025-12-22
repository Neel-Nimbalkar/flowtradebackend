/**
 * Trade Logging Tab - FlowGrid Trading
 * Displays completed trades with filters, summary stats, and export
 * Reads from backend API with localStorage fallback
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import TradeDetailModal from './TradeDetailModal';
import { getAllTrades, getTradesAsBackendFormat, fetchTradesFromBackend } from '../../services/tradeService';

// =============================================================================
// Utility Functions
// =============================================================================

const formatCurrency = (value) => {
  if (value === null || value === undefined || isNaN(value)) return '--';
  return `$${Math.abs(value).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
};

const formatPercent = (value, showSign = true) => {
  if (value === null || value === undefined || isNaN(value)) return '--';
  const sign = showSign && value > 0 ? '+' : '';
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

const formatDuration = (openTs, closeTs) => {
  if (!openTs || !closeTs) return '--';
  try {
    const ms = new Date(closeTs) - new Date(openTs);
    const hours = ms / (1000 * 60 * 60);
    if (hours < 1) return `${Math.floor(ms / (1000 * 60))}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  } catch {
    return '--';
  }
};

const shortUUID = (id) => {
  if (!id) return '--';
  const str = String(id);
  return str.slice(0, 8);
};

// =============================================================================
// FilterBar Component
// =============================================================================

const FilterBar = ({ 
  strategies, 
  filters, 
  onFilterChange, 
  onClear 
}) => {
  return (
    <div className="trade-filter-bar">
      {/* Strategy Filter */}
      <div className="filter-group">
        <label>Strategy</label>
        <select 
          value={filters.strategy || 'ALL'}
          onChange={(e) => onFilterChange('strategy', e.target.value)}
        >
          <option value="ALL">All Strategies</option>
          {Object.entries(strategies).map(([id, name]) => (
            <option key={id} value={id}>{name}</option>
          ))}
        </select>
      </div>
      
      {/* Side Filter */}
      <div className="filter-group">
        <label>Side</label>
        <select 
          value={filters.side || 'ALL'}
          onChange={(e) => onFilterChange('side', e.target.value)}
        >
          <option value="ALL">All Sides</option>
          <option value="LONG">Long Only</option>
          <option value="SHORT">Short Only</option>
        </select>
      </div>
      
      {/* Result Filter */}
      <div className="filter-group">
        <label>Result</label>
        <select 
          value={filters.result || 'ALL'}
          onChange={(e) => onFilterChange('result', e.target.value)}
        >
          <option value="ALL">All Trades</option>
          <option value="WINS">Wins Only</option>
          <option value="LOSSES">Losses Only</option>
        </select>
      </div>
      
      {/* Date Range */}
      <div className="filter-group date-range">
        <label>Date Range</label>
        <div className="date-inputs">
          <input 
            type="date"
            value={filters.startDate || ''}
            onChange={(e) => onFilterChange('startDate', e.target.value)}
          />
          <span className="date-separator">to</span>
          <input 
            type="date"
            value={filters.endDate || ''}
            onChange={(e) => onFilterChange('endDate', e.target.value)}
          />
        </div>
      </div>
      
      {/* Clear Button */}
      <button className="filter-clear-btn" onClick={onClear}>
        Clear Filters
      </button>
    </div>
  );
};

// =============================================================================
// Summary Stats Component
// =============================================================================

const SummaryStats = ({ trades }) => {
  const stats = useMemo(() => {
    if (!trades || trades.length === 0) {
      return {
        total: 0,
        wins: 0,
        losses: 0,
        winRate: 0,
        netPct: 0
      };
    }
    
    const wins = trades.filter(t => (t.net_pct || 0) > 0);
    const losses = trades.filter(t => (t.net_pct || 0) <= 0);
    const netPct = trades.reduce((sum, t) => sum + (t.net_pct || 0), 0);
    
    return {
      total: trades.length,
      wins: wins.length,
      losses: losses.length,
      winRate: trades.length > 0 ? (wins.length / trades.length) * 100 : 0,
      netPct
    };
  }, [trades]);
  
  return (
    <div className="trade-summary-bar">
      <div className="summary-stat">
        <span className="stat-label">Total Trades</span>
        <span className="stat-value">{stats.total}</span>
      </div>
      <div className="summary-stat">
        <span className="stat-label">Wins</span>
        <span className="stat-value positive">{stats.wins}</span>
      </div>
      <div className="summary-stat">
        <span className="stat-label">Losses</span>
        <span className="stat-value negative">{stats.losses}</span>
      </div>
      <div className="summary-stat">
        <span className="stat-label">Win Rate</span>
        <span className="stat-value">{stats.winRate.toFixed(1)}%</span>
      </div>
      <div className="summary-stat">
        <span className="stat-label">Net P&L</span>
        <span className={`stat-value ${stats.netPct > 0 ? 'positive' : stats.netPct < 0 ? 'negative' : ''}`}>
          {formatPercent(stats.netPct)}
        </span>
      </div>
    </div>
  );
};

// =============================================================================
// Export Button Component
// =============================================================================

const ExportButton = ({ trades, disabled }) => {
  const [open, setOpen] = useState(false);
  
  const exportCSV = () => {
    if (!trades || trades.length === 0) return;
    
    const headers = ['ID', 'Strategy', 'Side', 'Entry Time', 'Entry Price', 'Exit Time', 'Exit Price', 'Duration', 'Gross %', 'Fees %', 'Net %'];
    const rows = trades.map(t => [
      t.id || '',
      t.strategy_id || '',
      t.open_side || '',
      t.open_ts || '',
      t.open_price || '',
      t.close_ts || '',
      t.close_price || '',
      formatDuration(t.open_ts, t.close_ts),
      (t.gross_pct || 0).toFixed(2),
      (t.fee_pct_total || 0).toFixed(2),
      (t.net_pct || 0).toFixed(2)
    ]);
    
    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };
  
  const exportJSON = () => {
    if (!trades || trades.length === 0) return;
    
    const blob = new Blob([JSON.stringify(trades, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trades-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    setOpen(false);
  };
  
  return (
    <div className="export-dropdown">
      <button 
        className="export-btn" 
        onClick={() => setOpen(!open)}
        disabled={disabled}
      >
        Export
        <span className="export-arrow">▾</span>
      </button>
      {open && (
        <div className="export-menu">
          <button onClick={exportCSV}>Export CSV</button>
          <button onClick={exportJSON}>Export JSON</button>
        </div>
      )}
    </div>
  );
};

// =============================================================================
// Trade Table Component
// =============================================================================

const TradeTable = ({ trades, onSelectTrade, strategies }) => {
  const [sortField, setSortField] = useState('close_ts');
  const [sortDir, setSortDir] = useState('desc');
  
  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('desc');
    }
  };
  
  const sortedTrades = useMemo(() => {
    if (!trades || trades.length === 0) return [];
    
    return [...trades].sort((a, b) => {
      let valA = a[sortField];
      let valB = b[sortField];
      
      // Handle timestamps
      if (sortField.includes('_ts')) {
        valA = valA ? new Date(valA).getTime() : 0;
        valB = valB ? new Date(valB).getTime() : 0;
      }
      
      // Handle numbers
      if (typeof valA === 'number' && typeof valB === 'number') {
        return sortDir === 'asc' ? valA - valB : valB - valA;
      }
      
      // Handle strings
      valA = String(valA || '');
      valB = String(valB || '');
      return sortDir === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
    });
  }, [trades, sortField, sortDir]);
  
  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon active">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };
  
  const getStrategyName = (strategyId) => {
    return strategies[strategyId] || strategyId || 'Unknown';
  };
  
  if (!trades || trades.length === 0) {
    return (
      <div className="trade-table-empty">
        <div className="empty-icon icon-chart"></div>
        <div className="empty-title">No trades yet</div>
        <div className="empty-message">
          Enable a strategy and wait for alternating BUY/SELL signals to generate trades.
        </div>
      </div>
    );
  }
  
  return (
    <div className="trade-table-container">
      <div className="trade-table-wrapper">
        <table className="trade-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('id')}>ID <SortIcon field="id" /></th>
              <th onClick={() => handleSort('strategy_id')}>Strategy <SortIcon field="strategy_id" /></th>
              <th onClick={() => handleSort('open_side')}>Side <SortIcon field="open_side" /></th>
              <th onClick={() => handleSort('open_ts')}>Entry Time <SortIcon field="open_ts" /></th>
              <th onClick={() => handleSort('open_price')}>Entry Price <SortIcon field="open_price" /></th>
              <th onClick={() => handleSort('close_ts')}>Exit Time <SortIcon field="close_ts" /></th>
              <th onClick={() => handleSort('close_price')}>Exit Price <SortIcon field="close_price" /></th>
              <th>Duration</th>
              <th onClick={() => handleSort('gross_pct')}>Gross % <SortIcon field="gross_pct" /></th>
              <th onClick={() => handleSort('fee_pct_total')}>Fees % <SortIcon field="fee_pct_total" /></th>
              <th onClick={() => handleSort('net_pct')}>Net % <SortIcon field="net_pct" /></th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {sortedTrades.map((trade) => (
              <tr 
                key={trade.id} 
                className={(trade.net_pct || 0) > 0 ? 'win' : 'loss'}
                onClick={() => onSelectTrade(trade)}
              >
                <td className="mono">{shortUUID(trade.id)}</td>
                <td>{getStrategyName(trade.strategy_id)}</td>
                <td>
                  <span className={`side-badge ${(trade.open_side || '').toLowerCase()}`}>
                    {trade.open_side || '--'}
                  </span>
                </td>
                <td>{formatDateTime(trade.open_ts)}</td>
                <td>{formatCurrency(trade.open_price)}</td>
                <td>{formatDateTime(trade.close_ts)}</td>
                <td>{formatCurrency(trade.close_price)}</td>
                <td>{formatDuration(trade.open_ts, trade.close_ts)}</td>
                <td className={(trade.gross_pct || 0) > 0 ? 'positive' : 'negative'}>
                  {formatPercent(trade.gross_pct)}
                </td>
                <td className="dimmed">{formatPercent(trade.fee_pct_total, false)}</td>
                <td className={`bold ${(trade.net_pct || 0) > 0 ? 'positive' : 'negative'}`}>
                  {formatPercent(trade.net_pct)}
                </td>
                <td>
                  <button 
                    className="view-btn"
                    onClick={(e) => {
                      e.stopPropagation();
                      onSelectTrade(trade);
                    }}
                  >
                    View
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

// =============================================================================
// Main Trade Logging Component
// =============================================================================

const TradeLogging = () => {
  const [trades, setTrades] = useState([]);
  const [strategies, setStrategies] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTrade, setSelectedTrade] = useState(null);
  
  // Filters
  const [filters, setFilters] = useState({
    strategy: 'ALL',
    side: 'ALL',
    result: 'ALL',
    startDate: '',
    endDate: ''
  });
  
  // Fetch trades from localStorage (no backend)
  const fetchTrades = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      // Try backend first, fallback to localStorage
      const backendTrades = await fetchTradesFromBackend({ limit: 1000 });
      
      if (backendTrades && backendTrades.length > 0) {
        // Transform backend format to expected format
        const formattedTrades = backendTrades.map(t => ({
          id: t.id,
          strategy_id: t.strategy_id,
          open_side: t.open_side,
          open_price: t.open_price,
          open_ts: t.open_ts,
          close_side: t.close_side,
          close_price: t.close_price,
          close_ts: t.close_ts,
          gross_pct: t.gross_pct,
          fee_pct_total: t.fee_pct_total,
          net_pct: t.net_pct,
          meta: t.meta
        }));
        setTrades(formattedTrades);
        console.log(`[TradeLogging] Loaded ${formattedTrades.length} trades from backend`);
      } else {
        // Fallback to localStorage
        const data = getTradesAsBackendFormat();
        setTrades(data.trades || []);
        console.log(`[TradeLogging] Loaded ${data.trades?.length || 0} trades from localStorage`);
      }
    } catch (err) {
      console.error('Error loading trades:', err);
      // Fallback to localStorage on error
      const data = getTradesAsBackendFormat();
      setTrades(data.trades || []);
      console.log(`[TradeLogging] Fallback - loaded ${data.trades?.length || 0} trades from localStorage`);
    } finally {
      setLoading(false);
    }
  }, []);
  
  // Fetch strategies for name lookup (from localStorage)
  const fetchStrategies = useCallback(async () => {
    try {
      // Get strategies from localStorage
      const raw = localStorage.getItem('flowgrid_workflow_v1::saves');
      if (raw) {
        const saved = JSON.parse(raw);
        const stratMap = {};
        Object.keys(saved).forEach(k => { stratMap[k] = k; });
        setStrategies(stratMap);
      }
    } catch (err) {
      console.error('Error loading strategies:', err);
    }
  }, []);
  
  // Initial fetch
  useEffect(() => {
    fetchTrades();
    fetchStrategies();
  }, [fetchTrades, fetchStrategies]);
  
  // Listen for new trades
  useEffect(() => {
    const handleTradeCompleted = () => {
      fetchTrades();
    };
    
    window.addEventListener('flowgrid:trade-completed', handleTradeCompleted);
    return () => window.removeEventListener('flowgrid:trade-completed', handleTradeCompleted);
  }, [fetchTrades]);
  
  // Filter trades
  const filteredTrades = useMemo(() => {
    return trades.filter(trade => {
      // Strategy filter
      if (filters.strategy !== 'ALL' && trade.strategy_id !== filters.strategy) {
        return false;
      }
      
      // Side filter
      if (filters.side !== 'ALL' && trade.open_side !== filters.side) {
        return false;
      }
      
      // Result filter
      if (filters.result === 'WINS' && (trade.net_pct || 0) <= 0) {
        return false;
      }
      if (filters.result === 'LOSSES' && (trade.net_pct || 0) > 0) {
        return false;
      }
      
      // Date filter
      if (filters.startDate && trade.close_ts) {
        const tradeDate = new Date(trade.close_ts).toISOString().split('T')[0];
        if (tradeDate < filters.startDate) return false;
      }
      if (filters.endDate && trade.close_ts) {
        const tradeDate = new Date(trade.close_ts).toISOString().split('T')[0];
        if (tradeDate > filters.endDate) return false;
      }
      
      return true;
    });
  }, [trades, filters]);
  
  const handleFilterChange = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };
  
  const handleClearFilters = () => {
    setFilters({
      strategy: 'ALL',
      side: 'ALL',
      result: 'ALL',
      startDate: '',
      endDate: ''
    });
  };
  
  if (loading) {
    return (
      <div className="trade-logging-loading">
        <div className="loading-spinner" />
        <div>Loading trades...</div>
      </div>
    );
  }
  
  if (error) {
    return (
      <div className="trade-logging-error">
        <div className="error-icon icon-alert"></div>
        <div>{error}</div>
        <button onClick={fetchTrades}>Retry</button>
      </div>
    );
  }
  
  return (
    <div className="trade-logging">
      {/* Header with export */}
      <div className="trade-logging-header">
        <h3>Trade Log ({filteredTrades.length} trades)</h3>
        <ExportButton trades={filteredTrades} disabled={filteredTrades.length === 0} />
      </div>
      
      {/* Filters */}
      <FilterBar 
        strategies={strategies}
        filters={filters}
        onFilterChange={handleFilterChange}
        onClear={handleClearFilters}
      />
      
      {/* Summary Stats */}
      <SummaryStats trades={filteredTrades} />
      
      {/* Trade Table */}
      <TradeTable 
        trades={filteredTrades}
        strategies={strategies}
        onSelectTrade={setSelectedTrade}
      />
      
      {/* Detail Modal */}
      {selectedTrade && (
        <TradeDetailModal 
          trade={selectedTrade}
          strategyName={strategies[selectedTrade.strategy_id] || selectedTrade.strategy_id}
          onClose={() => setSelectedTrade(null)}
        />
      )}
    </div>
  );
};

export default TradeLogging;
