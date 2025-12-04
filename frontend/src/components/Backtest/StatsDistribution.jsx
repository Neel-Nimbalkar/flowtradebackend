import React from 'react';
import './StatsDistribution.css';

const StatsDistribution = ({ trades }) => {
  const wins = trades.filter(t => t.netProfit > 0);
  const losses = trades.filter(t => t.netProfit <= 0);

  // Create profit distribution buckets
  const createBuckets = () => {
    if (trades.length === 0) return [];
    
    const profits = trades.map(t => t.netProfit);
    const min = Math.min(...profits);
    const max = Math.max(...profits);
    const bucketCount = 10;
    const bucketSize = (max - min) / bucketCount;

    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
      min: min + i * bucketSize,
      max: min + (i + 1) * bucketSize,
      count: 0
    }));

    profits.forEach(profit => {
      const bucketIdx = Math.min(Math.floor((profit - min) / bucketSize), bucketCount - 1);
      buckets[bucketIdx].count++;
    });

    return buckets;
  };

  // Create duration distribution buckets
  const createDurationBuckets = () => {
    if (trades.length === 0) return [];

    const durations = trades.map(t => t.holdingDuration);
    const min = Math.min(...durations);
    const max = Math.max(...durations);
    const bucketCount = 8;
    const bucketSize = (max - min) / bucketCount;

    const buckets = Array.from({ length: bucketCount }, (_, i) => ({
      min: min + i * bucketSize,
      max: min + (i + 1) * bucketSize,
      count: 0,
      label: formatDuration(min + i * bucketSize)
    }));

    durations.forEach(duration => {
      const bucketIdx = Math.min(Math.floor((duration - min) / bucketSize), bucketCount - 1);
      buckets[bucketIdx].count++;
    });

    return buckets;
  };

  const formatDuration = (ms) => {
    const hours = ms / (1000 * 60 * 60);
    if (hours < 1) return `${(ms / (1000 * 60)).toFixed(0)}m`;
    if (hours < 24) return `${hours.toFixed(0)}h`;
    return `${(hours / 24).toFixed(0)}d`;
  };

  const profitBuckets = createBuckets();
  const durationBuckets = createDurationBuckets();

  const maxProfitCount = Math.max(...profitBuckets.map(b => b.count), 1);
  const maxDurationCount = Math.max(...durationBuckets.map(b => b.count), 1);

  return (
    <div className="stats-distribution">
      <div className="distribution-section">
        <h3>Win/Loss Distribution</h3>
        <div className="winloss-bars">
          <div className="bar-group">
            <div className="bar-label">Wins</div>
            <div className="bar win" style={{ width: `${(wins.length / trades.length) * 100}%` }}>
              <span className="bar-value">{wins.length}</span>
            </div>
          </div>
          <div className="bar-group">
            <div className="bar-label">Losses</div>
            <div className="bar loss" style={{ width: `${(losses.length / trades.length) * 100}%` }}>
              <span className="bar-value">{losses.length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="distribution-section">
        <h3>Profit Distribution</h3>
        <div className="histogram">
          {profitBuckets.map((bucket, idx) => (
            <div key={idx} className="histogram-bar-wrapper">
              <div
                className={`histogram-bar ${bucket.min >= 0 ? 'positive' : 'negative'}`}
                style={{ height: `${(bucket.count / maxProfitCount) * 200}px` }}
              >
                <span className="bar-count">{bucket.count}</span>
              </div>
              <div className="histogram-label">${bucket.min.toFixed(0)}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="distribution-section">
        <h3>Trade Duration Distribution</h3>
        <div className="histogram">
          {durationBuckets.map((bucket, idx) => (
            <div key={idx} className="histogram-bar-wrapper">
              <div
                className="histogram-bar duration"
                style={{ height: `${(bucket.count / maxDurationCount) * 200}px` }}
              >
                <span className="bar-count">{bucket.count}</span>
              </div>
              <div className="histogram-label">{bucket.label}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="distribution-section">
        <h3>MAE vs MFE Analysis</h3>
        <div className="mae-mfe-grid">
          {trades.slice(0, 50).map((trade, idx) => (
            <div key={idx} className="mae-mfe-point" title={`Trade ${idx + 1}: MAE $${trade.mae.toFixed(2)}, MFE $${trade.mfe.toFixed(2)}`}>
              <div className="point-mae" style={{ width: `${Math.min((trade.mae / 50) * 100, 100)}%` }}></div>
              <div className="point-mfe" style={{ width: `${Math.min((trade.mfe / 50) * 100, 100)}%` }}></div>
            </div>
          ))}
        </div>
        <div className="mae-mfe-legend">
          <span><span className="legend-box mae"></span> MAE (Max Adverse)</span>
          <span><span className="legend-box mfe"></span> MFE (Max Favorable)</span>
        </div>
      </div>
    </div>
  );
};

export default StatsDistribution;
