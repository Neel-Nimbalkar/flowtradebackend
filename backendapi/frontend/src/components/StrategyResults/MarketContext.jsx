import React from 'react';

const MarketContext = ({ marketContext = {} }) => {
  const { volatility, trendShort, trendLong, volumeAnomaly, regime } = marketContext || {};

  return (
    <div className="sr-market-context">
      <div className="sr-section-title">Market Context</div>
      <div className="sr-mc-row"><strong>Volatility:</strong> {typeof volatility !== 'undefined' ? volatility : '—'}</div>
      <div className="sr-mc-row"><strong>Trend (short):</strong> {trendShort || '—'}</div>
      <div className="sr-mc-row"><strong>Trend (long):</strong> {trendLong || '—'}</div>
      <div className="sr-mc-row"><strong>Volume Anomaly:</strong> {volumeAnomaly ? 'Yes' : 'No'}</div>
      <div className="sr-mc-row"><strong>Regime:</strong> {regime || '—'}</div>
    </div>
  );
};

export default MarketContext;
