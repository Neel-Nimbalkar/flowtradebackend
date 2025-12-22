import React from 'react';
import StaticChartPlaceholder from './StaticChartPlaceholder';

const InsightsTab = ({ data = null }) => {
  const blocks = data?.blocks || [];
  const aiText = data?.aiAnalysis || data?.ai_analysis || '(no AI analysis available)';
  return (
    <div className="insights-tab">
      <div className="grid-2">
        <div className="card">
          <div className="card-header">AI Strategy Commentary</div>
          <div className="card-body">
            <div className="muted">{aiText}</div>
          </div>
        </div>
        <div className="card">
          <div className="card-header">Block-by-Block Diagnostics</div>
          <div className="card-body">
            {blocks.length === 0 && <div className="muted">No block diagnostics available.</div>}
            {blocks.map(b => (
              <div key={b.id}>{b.block_type || b.type || b.blockType}: <span className={`pill ${b.status === 'passed' || b.status === 'ok' ? 'true' : b.status === 'failed' ? 'false' : 'skipped'}`}>{String(b.status || b.result || '').toUpperCase() || 'N/A'}</span></div>
            ))}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-header">Price + Signal Chart</div>
        <div className="card-body chart-area">
          {data && data.historical_bars && data.historical_bars.close ? (
            <LineChart data={data.historical_bars.close} height={200} stroke="#ffd36b" />
          ) : (
            <StaticChartPlaceholder height={200} />
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-header">Workflow Execution Summary</div>
          <div className="card-body muted">Decision path: Fetch → RSI → Signal Gate → AI Agent (if enabled)</div>
        </div>
        <div className="card">
          <div className="card-header">Signal Strength</div>
          <div className="card-body">
            <div className="signal-meter"><div className="meter-fill" style={{ width: '35%' }} /></div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default InsightsTab;
