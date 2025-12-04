import React, { useState } from 'react';
import './TradesTable.css';

const TradesTable = ({ trades }) => {
  const [sortField, setSortField] = useState('entryTime');
  const [sortDir, setSortDir] = useState('asc');

  const handleSort = (field) => {
    if (sortField === field) {
      setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDir('asc');
    }
  };

  const sortedTrades = [...trades].sort((a, b) => {
    let valA = a[sortField];
    let valB = b[sortField];

    if (sortField === 'entryTime' || sortField === 'exitTime') {
      valA = new Date(valA).getTime();
      valB = new Date(valB).getTime();
    }

    if (sortDir === 'asc') {
      return valA > valB ? 1 : -1;
    } else {
      return valA < valB ? 1 : -1;
    }
  });

  const formatDate = (d) => new Date(d).toLocaleString();
  const formatCurrency = (val) => `$${val.toFixed(2)}`;
  const formatPercent = (val) => `${val.toFixed(2)}%`;
  const formatDuration = (ms) => {
    const hours = ms / (1000 * 60 * 60);
    if (hours < 1) return `${(ms / (1000 * 60)).toFixed(0)}m`;
    if (hours < 24) return `${hours.toFixed(1)}h`;
    return `${(hours / 24).toFixed(1)}d`;
  };

  const SortIcon = ({ field }) => {
    if (sortField !== field) return <span className="sort-icon">⇅</span>;
    return <span className="sort-icon active">{sortDir === 'asc' ? '↑' : '↓'}</span>;
  };

  return (
    <div className="trades-table-container">
      <div className="table-header">
        <h3>Trade Log ({trades.length} trades)</h3>
      </div>
      <div className="table-wrapper">
        <table className="trades-table">
          <thead>
            <tr>
              <th onClick={() => handleSort('entryTime')}>Entry Time <SortIcon field="entryTime" /></th>
              <th onClick={() => handleSort('exitTime')}>Exit Time <SortIcon field="exitTime" /></th>
              <th onClick={() => handleSort('direction')}>Direction <SortIcon field="direction" /></th>
              <th onClick={() => handleSort('entryPrice')}>Entry Price <SortIcon field="entryPrice" /></th>
              <th onClick={() => handleSort('exitPrice')}>Exit Price <SortIcon field="exitPrice" /></th>
              <th onClick={() => handleSort('netProfit')}>Net P/L <SortIcon field="netProfit" /></th>
              <th onClick={() => handleSort('profitPercent')}>P/L % <SortIcon field="profitPercent" /></th>
              <th onClick={() => handleSort('holdingDuration')}>Duration <SortIcon field="holdingDuration" /></th>
              <th onClick={() => handleSort('mae')}>MAE <SortIcon field="mae" /></th>
              <th onClick={() => handleSort('mfe')}>MFE <SortIcon field="mfe" /></th>
            </tr>
          </thead>
          <tbody>
            {sortedTrades.map((trade, idx) => (
              <tr key={idx} className={trade.netProfit > 0 ? 'win' : 'loss'}>
                <td>{formatDate(trade.entryTime)}</td>
                <td>{formatDate(trade.exitTime)}</td>
                <td>
                  <span className={`direction-badge ${trade.direction}`}>
                    {trade.direction === 'long' ? '📈 LONG' : '📉 SHORT'}
                  </span>
                </td>
                <td>{formatCurrency(trade.entryPrice)}</td>
                <td>{formatCurrency(trade.exitPrice)}</td>
                <td className={trade.netProfit > 0 ? 'profit' : 'loss'}>
                  {formatCurrency(trade.netProfit)}
                </td>
                <td className={trade.profitPercent > 0 ? 'profit' : 'loss'}>
                  {formatPercent(trade.profitPercent)}
                </td>
                <td>{formatDuration(trade.holdingDuration)}</td>
                <td>{formatCurrency(trade.mae)}</td>
                <td>{formatCurrency(trade.mfe)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default TradesTable;
