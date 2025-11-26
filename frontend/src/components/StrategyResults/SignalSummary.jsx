import React from 'react';

const SignalSummary = ({ latestSignal = null, latestData = {} }) => {
  const label = latestSignal ? (latestSignal.signal || latestSignal) : 'No Signal';
  const time = latestSignal ? new Date(latestSignal.time || latestSignal.timestamp || Date.now()).toLocaleString() : '--';
  const price = latestSignal ? (latestSignal.price || latestData.price || '--') : (latestData.price ? `$${Number(latestData.price).toFixed(2)}` : '--');
  const confidence = latestSignal && typeof latestSignal.confidence !== 'undefined' ? (Number(latestSignal.confidence) * 100).toFixed(1) + '%' : (latestData.confidence ? (Number(latestData.confidence) * 100).toFixed(1) + '%' : '--');

  const color = (label || '').toString().toLowerCase().includes('buy') ? '#10b981' : (label || '').toString().toLowerCase().includes('sell') ? '#ef4444' : '#9ca3af';

  return (
    <div className="sr-signal-summary">
      <div className="sr-signal-row">
        <div className="sr-signal-badge" style={{ background: color }}>{label}</div>
        <div className="sr-signal-meta">
          <div className="sr-signal-price">{typeof price === 'number' ? `$${price.toFixed(2)}` : price}</div>
          <div className="sr-signal-time">{time}</div>
        </div>
      </div>
      <div className="sr-signal-confidence">Confidence: {confidence}</div>
    </div>
  );
};

export default SignalSummary;
