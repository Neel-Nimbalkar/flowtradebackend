import React, { useState, useEffect } from 'react';
import SignalList from './SignalList';
import StaticChartPlaceholder from './StaticChartPlaceholder';
import LineChart from './LineChart';

const mockSignals = [
  { id: 1, type: 'BUY', price: 420.12, symbol: 'SPY', time: '2025-11-01T10:00:00Z', reason: 'RSI below 30' },
  { id: 2, type: 'SELL', price: 435.55, symbol: 'SPY', time: '2025-11-05T13:30:00Z', reason: 'Profit target' },
  { id: 3, type: 'HOLD', price: 428.00, symbol: 'SPY', time: '2025-11-10T09:15:00Z', reason: 'Neutral' }
];

const PastSignalsTab = ({ data = null }) => {
  const [signals, setSignals] = useState([]);
  const [filter, setFilter] = useState('ALL');

  useEffect(() => {
    // prefer live data from resultsData.signals, fallback to localStorage/mock
    try {
      if (data && data.signals && data.signals.length) {
        setSignals(data.signals);
        return;
      }
      const raw = localStorage.getItem('flowgrid_signals');
      if (raw) setSignals(JSON.parse(raw));
      else setSignals(mockSignals);
    } catch (e) { setSignals(mockSignals); }
  }, []);

  const filtered = signals.filter(s => filter === 'ALL' ? true : s.type === filter);

  return (
    <div className="past-signals-tab">
      <div className="controls-row">
        <div>
          <select value={filter} onChange={e => setFilter(e.target.value)}>
            <option value="ALL">All</option>
            <option value="BUY">BUY</option>
            <option value="SELL">SELL</option>
            <option value="HOLD">HOLD</option>
          </select>
        </div>
        <div style={{ marginLeft: 'auto' }}>
          <button className="md-btn">Export</button>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">Signals</div>
          <div className="card-body">
            <SignalList signals={filtered} />
          </div>
        </div>

          <div className="card">
            <div className="card-header">Signal Trend</div>
            <div className="card-body chart-area">
              {signals && signals.length ? (
                <LineChart data={signals.map(s => s.price)} height={180} stroke="#7ef08f" />
              ) : (
                <StaticChartPlaceholder height={180} />
              )}
            </div>
          </div>
      </div>

      <div className="card">
        <div className="card-header">Historical Price Chart (with signals)</div>
        <div className="card-body chart-area">
          <StaticChartPlaceholder height={160} />
        </div>
      </div>
    </div>
  );
};

export default PastSignalsTab;
