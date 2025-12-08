import React from 'react';
import './AdvancedMetrics.css';

const AdvancedMetrics = ({ results }) => {
  const { trades, metrics, config } = results;

  if (!trades || trades.length === 0) {
    return <div className="advanced-metrics-empty">No trades to analyze</div>;
  }

  // Calculate advanced metrics
  const advancedStats = calculateAdvancedMetrics(trades, config.startingCapital);

  const formatCurrency = (val) => `$${val?.toFixed(2) || '0.00'}`;
  const formatPercent = (val) => `${val?.toFixed(2) || '0.00'}%`;
  const formatNumber = (val) => val?.toFixed(2) || '0.00';
  const formatRatio = (val) => {
    if (val === Infinity) return '∞';
    if (val === -Infinity) return '-∞';
    return val?.toFixed(3) || '0.000';
  };

  // Calculate performance score
  const calculateScore = () => {
    let score = 0;
    const checks = [
      { name: 'Sharpe > 1', pass: advancedStats.sharpeRatio > 1 },
      { name: 'Sortino > 1', pass: advancedStats.sortinoRatio > 1 },
      { name: 'Win Rate > 50%', pass: (metrics?.winRate || 0) > 50 },
      { name: 'Profit Factor > 1.5', pass: advancedStats.payoffRatio > 1.5 },
      { name: 'Positive R-Multiple', pass: advancedStats.avgRMultiple > 0 },
      { name: 'Good Exit Efficiency', pass: advancedStats.exitEfficiency > 50 },
      { name: 'Low MAE/MFE', pass: advancedStats.maeMfeRatio < 1 },
      { name: 'Recovery Factor > 2', pass: advancedStats.recoveryFactor > 2 }
    ];
    checks.forEach(c => { if (c.pass) score++; });
    return { score, total: checks.length, checks };
  };

  const scoreInfo = calculateScore();

  return (
    <div className="advanced-metrics-enhanced">
      {/* Performance Score Card */}
      <div className="score-card-section">
        <div className="score-card">
          <div className="score-visual">
            <svg viewBox="0 0 100 100">
              <circle cx="50" cy="50" r="45" fill="none" stroke="rgba(42, 46, 57, 0.5)" strokeWidth="8" />
              <circle 
                cx="50" cy="50" r="45" fill="none" 
                stroke={scoreInfo.score >= 6 ? '#10b981' : scoreInfo.score >= 4 ? '#f59e0b' : '#ef4444'} 
                strokeWidth="8"
                strokeDasharray={`${(scoreInfo.score / scoreInfo.total) * 283} 283`}
                strokeLinecap="round"
                transform="rotate(-90 50 50)"
              />
            </svg>
            <div className="score-text">
              <span className="score-num">{scoreInfo.score}</span>
              <span className="score-denom">/{scoreInfo.total}</span>
            </div>
          </div>
          <div className="score-details">
            <h4>Strategy Health Score</h4>
            <div className="score-checks">
              {scoreInfo.checks.map((check, idx) => (
                <div key={idx} className={`check-item ${check.pass ? 'pass' : 'fail'}`}>
                  <span className="check-icon">{check.pass ? '✓' : '✗'}</span>
                  <span className="check-name">{check.name}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Risk-Adjusted Returns */}
      <div className="metrics-section-enhanced">
        <div className="section-header">
          <h3>Risk-Adjusted Performance</h3>
          <span className="section-badge">Professional Ratios</span>
        </div>
        <div className="metrics-grid-3">
          <div className="metric-card-enhanced">
            <div className="metric-icon sharpe">SR</div>
            <div className="metric-content">
              <div className="metric-label">Sharpe Ratio</div>
              <div className="metric-value" style={{ color: advancedStats.sharpeRatio > 1 ? '#10b981' : advancedStats.sharpeRatio > 0 ? '#f59e0b' : '#ef4444' }}>
                {formatRatio(advancedStats.sharpeRatio)}
              </div>
              <div className="metric-bar">
                <div className="metric-bar-fill" style={{ width: `${Math.min(100, Math.max(0, advancedStats.sharpeRatio * 33))}%`, background: advancedStats.sharpeRatio > 1 ? '#10b981' : '#f59e0b' }}></div>
              </div>
              <div className="metric-hint">{advancedStats.sharpeRatio > 2 ? 'Excellent' : advancedStats.sharpeRatio > 1 ? 'Good' : 'Needs Improvement'}</div>
            </div>
          </div>
          <div className="metric-card-enhanced">
            <div className="metric-icon sortino">SO</div>
            <div className="metric-content">
              <div className="metric-label">Sortino Ratio</div>
              <div className="metric-value" style={{ color: advancedStats.sortinoRatio > 1 ? '#10b981' : advancedStats.sortinoRatio > 0 ? '#f59e0b' : '#ef4444' }}>
                {formatRatio(advancedStats.sortinoRatio)}
              </div>
              <div className="metric-bar">
                <div className="metric-bar-fill" style={{ width: `${Math.min(100, Math.max(0, advancedStats.sortinoRatio * 33))}%`, background: advancedStats.sortinoRatio > 1 ? '#10b981' : '#f59e0b' }}></div>
              </div>
              <div className="metric-hint">Downside risk adjusted</div>
            </div>
          </div>
          <div className="metric-card-enhanced">
            <div className="metric-icon calmar">CR</div>
            <div className="metric-content">
              <div className="metric-label">Calmar Ratio</div>
              <div className="metric-value" style={{ color: advancedStats.calmarRatio > 1 ? '#10b981' : advancedStats.calmarRatio > 0 ? '#f59e0b' : '#ef4444' }}>
                {formatRatio(advancedStats.calmarRatio)}
              </div>
              <div className="metric-bar">
                <div className="metric-bar-fill" style={{ width: `${Math.min(100, Math.max(0, advancedStats.calmarRatio * 33))}%`, background: advancedStats.calmarRatio > 1 ? '#10b981' : '#f59e0b' }}></div>
              </div>
              <div className="metric-hint">Return / Max Drawdown</div>
            </div>
          </div>
        </div>
      </div>

      {/* Trade Quality */}
      <div className="metrics-section-enhanced">
        <div className="section-header">
          <h3>Trade Quality Metrics</h3>
        </div>
        <div className="metrics-grid-4">
          <div className="metric-card-compact">
            <div className="metric-label">Average R-Multiple</div>
            <div className="metric-value" style={{ color: advancedStats.avgRMultiple > 1 ? '#10b981' : advancedStats.avgRMultiple > 0 ? '#f59e0b' : '#ef4444' }}>
              {formatRatio(advancedStats.avgRMultiple)}R
            </div>
            <div className="metric-sub">Risk-reward efficiency</div>
          </div>
          <div className="metric-card-compact">
            <div className="metric-label">Win/Loss Ratio</div>
            <div className="metric-value" style={{ color: advancedStats.winLossRatio > 1 ? '#10b981' : '#ef4444' }}>
              {formatRatio(advancedStats.winLossRatio)}
            </div>
            <div className="metric-sub">Avg win / avg loss</div>
          </div>
          <div className="metric-card-compact">
            <div className="metric-label">Recovery Factor</div>
            <div className="metric-value" style={{ color: advancedStats.recoveryFactor > 2 ? '#10b981' : advancedStats.recoveryFactor > 1 ? '#f59e0b' : '#ef4444' }}>
              {formatRatio(advancedStats.recoveryFactor)}
            </div>
            <div className="metric-sub">Net profit / max DD</div>
          </div>
          <div className="metric-card-compact">
            <div className="metric-label">Payoff Ratio</div>
            <div className="metric-value" style={{ color: advancedStats.payoffRatio > 1.5 ? '#10b981' : advancedStats.payoffRatio > 1 ? '#f59e0b' : '#ef4444' }}>
              {formatRatio(advancedStats.payoffRatio)}
            </div>
            <div className="metric-sub">Target &gt; 1.5</div>
          </div>
        </div>
      </div>

      {/* Streak Analysis */}
      <div className="metrics-section-enhanced">
        <div className="section-header">
          <h3>Streak Analysis</h3>
          <span className="section-badge">Consistency</span>
        </div>
        <div className="streak-grid">
          <div className="streak-card win">
            <div className="streak-header">
              <span className="streak-icon">🔥</span>
              <span>Win Streaks</span>
            </div>
            <div className="streak-stats">
              <div className="streak-main">
                <span className="streak-label">Max</span>
                <span className="streak-value">{advancedStats.maxConsecutiveWins}</span>
              </div>
              <div className="streak-secondary">
                <span className="streak-label">Avg</span>
                <span className="streak-value">{formatNumber(advancedStats.avgWinStreak)}</span>
              </div>
            </div>
          </div>
          <div className="streak-card loss">
            <div className="streak-header">
              <span className="streak-icon">❄️</span>
              <span>Loss Streaks</span>
            </div>
            <div className="streak-stats">
              <div className="streak-main">
                <span className="streak-label">Max</span>
                <span className="streak-value">{advancedStats.maxConsecutiveLosses}</span>
              </div>
              <div className="streak-secondary">
                <span className="streak-label">Avg</span>
                <span className="streak-value">{formatNumber(advancedStats.avgLossStreak)}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Duration Analysis */}
      <div className="metrics-section-enhanced">
        <div className="section-header">
          <h3>Duration Analysis</h3>
        </div>
        <div className="duration-comparison">
          <div className="duration-item win">
            <span className="duration-label">Avg Win Duration</span>
            <span className="duration-value">{formatDuration(advancedStats.avgWinDuration)}</span>
          </div>
          <div className="duration-vs">
            <div className="duration-efficiency" style={{ color: advancedStats.durationEfficiency > 1 ? '#10b981' : '#ef4444' }}>
              {formatNumber(advancedStats.durationEfficiency)}x
            </div>
            <span className="duration-efficiency-label">Efficiency</span>
          </div>
          <div className="duration-item loss">
            <span className="duration-label">Avg Loss Duration</span>
            <span className="duration-value">{formatDuration(advancedStats.avgLossDuration)}</span>
          </div>
        </div>
      </div>

      {/* Profitability Distribution */}
      <div className="metrics-section-enhanced">
        <div className="section-header">
          <h3>Profit Distribution</h3>
        </div>
        <div className="profit-distribution-enhanced">
          {advancedStats.profitBuckets.map((bucket, idx) => (
            <div key={idx} className="profit-bucket-enhanced">
              <div className="bucket-info">
                <span className="bucket-label">{bucket.label}</span>
                <span className="bucket-count">{bucket.count} trades</span>
              </div>
              <div className="bucket-bar-container">
                <div 
                  className="bucket-bar-fill" 
                  style={{ 
                    width: `${Math.max(bucket.percentage, 2)}%`, 
                    backgroundColor: bucket.color 
                  }}
                >
                </div>
              </div>
              <span className="bucket-percentage">{formatPercent(bucket.percentage)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Direction Performance */}
      <div className="metrics-section-enhanced">
        <div className="section-header">
          <h3>Direction Performance</h3>
        </div>
        <div className="direction-grid-enhanced">
          <div className="direction-card-enhanced long">
            <div className="direction-icon">↗</div>
            <div className="direction-content">
              <div className="direction-title">
                <h4>Long Trades</h4>
                <span className="direction-count">{advancedStats.longTrades.count}</span>
              </div>
              <div className="direction-metrics">
                <div className="dir-metric">
                  <span className="dir-label">Win Rate</span>
                  <span className="dir-value">{formatPercent(advancedStats.longTrades.winRate)}</span>
                </div>
                <div className="dir-metric">
                  <span className="dir-label">Net P&L</span>
                  <span className="dir-value" style={{ color: advancedStats.longTrades.netProfit >= 0 ? '#10b981' : '#ef4444' }}>
                    {formatCurrency(advancedStats.longTrades.netProfit)}
                  </span>
                </div>
                <div className="dir-metric">
                  <span className="dir-label">Profit Factor</span>
                  <span className="dir-value">{formatRatio(advancedStats.longTrades.profitFactor)}</span>
                </div>
              </div>
            </div>
          </div>
          <div className="direction-card-enhanced short">
            <div className="direction-icon">↘</div>
            <div className="direction-content">
              <div className="direction-title">
                <h4>Short Trades</h4>
                <span className="direction-count">{advancedStats.shortTrades.count}</span>
              </div>
              <div className="direction-metrics">
                <div className="dir-metric">
                  <span className="dir-label">Win Rate</span>
                  <span className="dir-value">{formatPercent(advancedStats.shortTrades.winRate)}</span>
                </div>
                <div className="dir-metric">
                  <span className="dir-label">Net P&L</span>
                  <span className="dir-value" style={{ color: advancedStats.shortTrades.netProfit >= 0 ? '#10b981' : '#ef4444' }}>
                    {formatCurrency(advancedStats.shortTrades.netProfit)}
                  </span>
                </div>
                <div className="dir-metric">
                  <span className="dir-label">Profit Factor</span>
                  <span className="dir-value">{formatRatio(advancedStats.shortTrades.profitFactor)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* MAE/MFE Analysis */}
      <div className="metrics-section-enhanced">
        <div className="section-header">
          <h3>MAE/MFE Analysis</h3>
          <span className="section-badge">Trade Management</span>
        </div>
        <div className="mae-mfe-grid">
          <div className="mae-mfe-card mae">
            <div className="mae-mfe-header">
              <span className="mae-mfe-icon">📉</span>
              <span>MAE</span>
            </div>
            <div className="mae-mfe-value">{formatCurrency(advancedStats.avgMAE)}</div>
            <div className="mae-mfe-label">Max Adverse Excursion</div>
          </div>
          <div className="mae-mfe-card mfe">
            <div className="mae-mfe-header">
              <span className="mae-mfe-icon">📈</span>
              <span>MFE</span>
            </div>
            <div className="mae-mfe-value">{formatCurrency(advancedStats.avgMFE)}</div>
            <div className="mae-mfe-label">Max Favorable Excursion</div>
          </div>
          <div className="mae-mfe-card ratio">
            <div className="mae-mfe-header">
              <span className="mae-mfe-icon">⚖️</span>
              <span>Ratio</span>
            </div>
            <div className="mae-mfe-value" style={{ color: advancedStats.maeMfeRatio < 1 ? '#10b981' : '#ef4444' }}>
              {formatRatio(advancedStats.maeMfeRatio)}
            </div>
            <div className="mae-mfe-label">{advancedStats.maeMfeRatio < 1 ? 'Good (Lower is better)' : 'Needs work'}</div>
          </div>
          <div className="mae-mfe-card efficiency">
            <div className="mae-mfe-header">
              <span className="mae-mfe-icon">🎯</span>
              <span>Exit Efficiency</span>
            </div>
            <div className="mae-mfe-value" style={{ color: advancedStats.exitEfficiency > 50 ? '#10b981' : '#f59e0b' }}>
              {formatPercent(advancedStats.exitEfficiency)}
            </div>
            <div className="mae-mfe-label">Profit capture rate</div>
          </div>
        </div>
      </div>
    </div>
  );
};

// Helper function to format duration
function formatDuration(ms) {
  if (!ms) return '0m';
  const hours = ms / (1000 * 60 * 60);
  if (hours < 1) return `${(ms / (1000 * 60)).toFixed(0)}m`;
  if (hours < 24) return `${hours.toFixed(1)}h`;
  const days = hours / 24;
  return `${days.toFixed(1)}d`;
}

// Calculate advanced metrics
function calculateAdvancedMetrics(trades, startingCapital) {
  const wins = trades.filter(t => t.netProfit > 0);
  const losses = trades.filter(t => t.netProfit <= 0);
  
  // Sortino Ratio (uses only downside deviation)
  const returns = trades.map(t => t.profitPercent);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const negativeReturns = returns.filter(r => r < 0);
  const downsideDeviation = negativeReturns.length > 0 
    ? Math.sqrt(negativeReturns.reduce((sum, r) => sum + Math.pow(r, 2), 0) / negativeReturns.length)
    : 0;
  const sortinoRatio = downsideDeviation > 0 ? avgReturn / downsideDeviation : 0;

  // Sharpe Ratio
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

  // Calmar Ratio (Annual Return / Max Drawdown)
  const netProfit = trades.reduce((sum, t) => sum + t.netProfit, 0);
  const returnPercent = (netProfit / startingCapital) * 100;
  const maxDrawdownPercent = calculateMaxDrawdownPercent(trades, startingCapital);
  const calmarRatio = maxDrawdownPercent > 0 ? returnPercent / maxDrawdownPercent : 0;

  // R-Multiple (profit / risk ratio)
  const rMultiples = trades.map(t => {
    const risk = Math.abs(t.mae || t.entryPrice * 0.02); // Use MAE or 2% as risk
    return risk > 0 ? t.netProfit / risk : 0;
  });
  const avgRMultiple = rMultiples.reduce((a, b) => a + b, 0) / rMultiples.length;

  // Win/Loss Ratio
  const totalWin = wins.reduce((sum, t) => sum + t.netProfit, 0);
  const totalLoss = Math.abs(losses.reduce((sum, t) => sum + t.netProfit, 0));
  const avgWin = wins.length > 0 ? totalWin / wins.length : 0;
  const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;
  const winLossRatio = avgLoss > 0 ? avgWin / avgLoss : avgWin > 0 ? Infinity : 0;
  const payoffRatio = winLossRatio;

  // Recovery Factor
  const recoveryFactor = maxDrawdownPercent > 0 ? returnPercent / maxDrawdownPercent : 0;

  // Consecutive Wins/Losses
  let currentStreak = 0;
  let streakType = null;
  let maxWinStreak = 0;
  let maxLossStreak = 0;
  let winStreaks = [];
  let lossStreaks = [];

  trades.forEach(trade => {
    const isWin = trade.netProfit > 0;
    if (streakType === null || (isWin && streakType === 'win') || (!isWin && streakType === 'loss')) {
      currentStreak++;
      streakType = isWin ? 'win' : 'loss';
    } else {
      if (streakType === 'win') {
        winStreaks.push(currentStreak);
        maxWinStreak = Math.max(maxWinStreak, currentStreak);
      } else {
        lossStreaks.push(currentStreak);
        maxLossStreak = Math.max(maxLossStreak, currentStreak);
      }
      currentStreak = 1;
      streakType = isWin ? 'win' : 'loss';
    }
  });
  
  // Final streak
  if (streakType === 'win') {
    winStreaks.push(currentStreak);
    maxWinStreak = Math.max(maxWinStreak, currentStreak);
  } else if (streakType === 'loss') {
    lossStreaks.push(currentStreak);
    maxLossStreak = Math.max(maxLossStreak, currentStreak);
  }

  const avgWinStreak = winStreaks.length > 0 ? winStreaks.reduce((a, b) => a + b, 0) / winStreaks.length : 0;
  const avgLossStreak = lossStreaks.length > 0 ? lossStreaks.reduce((a, b) => a + b, 0) / lossStreaks.length : 0;

  // Duration Analysis
  const avgWinDuration = wins.length > 0 ? wins.reduce((sum, t) => sum + t.holdingDuration, 0) / wins.length : 0;
  const avgLossDuration = losses.length > 0 ? losses.reduce((sum, t) => sum + t.holdingDuration, 0) / losses.length : 0;
  const durationEfficiency = avgLossDuration > 0 ? avgWinDuration / avgLossDuration : 0;

  // Profitability Buckets
  const profitBuckets = [
    { label: 'Big Loss (< -5%)', count: 0, color: '#dc2626' },
    { label: 'Loss (-5% to -2%)', count: 0, color: '#ef4444' },
    { label: 'Small Loss (-2% to 0%)', count: 0, color: '#f87171' },
    { label: 'Small Win (0% to 2%)', count: 0, color: '#86efac' },
    { label: 'Win (2% to 5%)', count: 0, color: '#10b981' },
    { label: 'Big Win (> 5%)', count: 0, color: '#059669' }
  ];

  trades.forEach(t => {
    const pp = t.profitPercent;
    if (pp < -5) profitBuckets[0].count++;
    else if (pp < -2) profitBuckets[1].count++;
    else if (pp < 0) profitBuckets[2].count++;
    else if (pp < 2) profitBuckets[3].count++;
    else if (pp < 5) profitBuckets[4].count++;
    else profitBuckets[5].count++;
  });

  profitBuckets.forEach(bucket => {
    bucket.percentage = (bucket.count / trades.length) * 100;
  });

  // Direction Performance
  const longTrades = trades.filter(t => t.direction === 'long');
  const shortTrades = trades.filter(t => t.direction === 'short');

  const analyzeTrades = (tradeList) => {
    if (tradeList.length === 0) return { count: 0, winRate: 0, netProfit: 0, profitFactor: 0 };
    const w = tradeList.filter(t => t.netProfit > 0);
    const l = tradeList.filter(t => t.netProfit <= 0);
    const winTotal = w.reduce((sum, t) => sum + t.netProfit, 0);
    const lossTotal = Math.abs(l.reduce((sum, t) => sum + t.netProfit, 0));
    return {
      count: tradeList.length,
      winRate: (w.length / tradeList.length) * 100,
      netProfit: tradeList.reduce((sum, t) => sum + t.netProfit, 0),
      profitFactor: lossTotal > 0 ? winTotal / lossTotal : winTotal > 0 ? Infinity : 0
    };
  };

  const longStats = analyzeTrades(longTrades);
  const shortStats = analyzeTrades(shortTrades);

  // MAE/MFE Analysis
  const avgMAE = trades.reduce((sum, t) => sum + Math.abs(t.mae || 0), 0) / trades.length;
  const avgMFE = trades.reduce((sum, t) => sum + Math.abs(t.mfe || 0), 0) / trades.length;
  const maeMfeRatio = avgMFE > 0 ? avgMAE / avgMFE : 0;
  
  // Exit Efficiency (how much of MFE was captured)
  const exitEfficiency = wins.length > 0 
    ? (wins.reduce((sum, t) => sum + (t.mfe > 0 ? (t.netProfit / t.mfe) * 100 : 0), 0) / wins.length)
    : 0;

  return {
    sharpeRatio,
    sortinoRatio,
    calmarRatio,
    avgRMultiple,
    winLossRatio,
    payoffRatio,
    recoveryFactor,
    maxConsecutiveWins: maxWinStreak,
    maxConsecutiveLosses: maxLossStreak,
    avgWinStreak,
    avgLossStreak,
    avgWinDuration,
    avgLossDuration,
    durationEfficiency,
    profitBuckets,
    longTrades: longStats,
    shortTrades: shortStats,
    avgMAE,
    avgMFE,
    maeMfeRatio,
    exitEfficiency
  };
}

function calculateMaxDrawdownPercent(trades, startingCapital) {
  let runningCapital = startingCapital;
  let peak = startingCapital;
  let maxDD = 0;

  trades.forEach(trade => {
    runningCapital += trade.netProfit;
    if (runningCapital > peak) peak = runningCapital;
    const dd = ((peak - runningCapital) / peak) * 100;
    if (dd > maxDD) maxDD = dd;
  });

  return maxDD;
}

export default AdvancedMetrics;
