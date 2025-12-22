import React from 'react';

const RecentSignals = ({ signals = [] }) => {
  const list = signals.slice(0, 10);
  return (
    <div className="sr-recent-signals">
      <div className="sr-section-title">Recent Signals</div>
      <div className="sr-recent-list">
        {list.length === 0 && <div className="sr-muted">No recent signals</div>}
        {list.map((s, i) => (
          <div key={i} className="sr-recent-item">
            <div className="rs-left">
              <div className={`rs-badge ${((s.signal||'').toLowerCase().includes('buy')) ? 'buy' : ((s.signal||'').toLowerCase().includes('sell')) ? 'sell' : 'hold'}`}>{s.signal || '--'}</div>
              <div className="rs-meta">{new Date(s.time || s.timestamp || Date.now()).toLocaleTimeString()} • {s.price ? `$${Number(s.price).toFixed(2)}` : '--'}</div>
            </div>
            <div className="rs-reason">{s.reason || s.message || s.note || ''}</div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default RecentSignals;
