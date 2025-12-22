import React from 'react';
import StaticChartPlaceholder from './StaticChartPlaceholder';
import LineChart from './LineChart';

const BacktestTab = ({ data = null }) => {
  // derive simple stats if equityCurve present
  const eq = data?.equityCurve || [];
  const first = eq && eq.length ? eq[0].v || eq[0].value || null : null;
  const last = eq && eq.length ? eq[eq.length - 1].v || eq[eq.length - 1].value || null : null;
  const pnl = (first !== null && last !== null) ? (last - first) : null;

  return (
    <div className="backtest-tab">
      <div className="grid-2">
        <div className="card">
          <div className="card-header">Backtest Summary</div>
          <div className="card-body">
            <div>Profit / Loss: <strong>{pnl !== null ? `$${pnl.toFixed(2)}` : '—'}</strong></div>
            <div>Win Rate: <strong>{data?.summary?.winRate ?? '—'}</strong></div>
            <div>Max Drawdown: <strong>{data?.summary?.maxDrawdown ?? '—'}</strong></div>
            <div>Sharpe: <strong>{data?.summary?.sharpe ?? '—'}</strong></div>
            <div>Total Trades: <strong>{data?.trades?.length ?? '—'}</strong></div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">Parameters</div>
          <div className="card-body">
            <div>Symbol: <strong>{data?.summary?.symbol ?? (data?.symbol ?? 'SPY')}</strong></div>
            <div>Timeframe: <strong>{data?.summary?.timeframe ?? (data?.timeframe ?? '1Hour')}</strong></div>
            <div>Date Range: <strong>{data?.summary?.startTimestamp ?? '—'} → {data?.summary?.endTimestamp ?? '—'}</strong></div>
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">Backtest Price Chart</div>
        <div className="card-body chart-area">
          {data && data.historical_bars && data.historical_bars.close ? (
            <LineChart data={data.historical_bars.close} height={220} stroke="#ff8a00" showXAxis={true} />
          ) : (
            <StaticChartPlaceholder height={220} />
          )}
        </div>
      </div>

      <div className="card">
        <div className="card-header">Trades</div>
        <div className="card-body">
          <table className="table">
            <thead><tr><th>Time</th><th>Type</th><th>Price</th><th>Size</th><th>PnL</th></tr></thead>
            <tbody>
              <tr><td>2025-11-20 10:01</td><td>BUY</td><td>430.12</td><td>10</td><td>+120</td></tr>
              <tr><td>2025-11-21 13:22</td><td>SELL</td><td>435.00</td><td>10</td><td>+488</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default BacktestTab;
