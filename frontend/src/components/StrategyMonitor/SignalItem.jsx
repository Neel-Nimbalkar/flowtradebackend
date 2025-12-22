import React from 'react';

const SignalItem = ({ signal }) => {
  return (
    <div className="signal-item">
      <div className="signal-left">
        <div className={`signal-pill ${signal.type === 'BUY' ? 'buy' : signal.type === 'SELL' ? 'sell' : 'hold'}`}>{signal.type}</div>
        <div className="signal-meta">
          <div className="signal-price">{signal.symbol} @ {signal.price}</div>
          <div className="signal-time muted">{new Date(signal.time).toLocaleString()}</div>
        </div>
      </div>
      <div className="signal-reason muted">{signal.reason}</div>
    </div>
  );
};

export default SignalItem;
