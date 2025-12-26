import React from 'react';

const ExecutionBreakdown = ({ workflowResults = {} }) => {
  const blocks = workflowResults.blocks || [];

  return (
    <div className="sr-execution">
      <div className="sr-section-title">Execution Breakdown</div>
      <div className="sr-exec-list">
        {blocks.length === 0 && <div className="sr-muted">No blocks executed yet</div>}
        {blocks.map((b, i) => {
          const status = (b.status || '').toLowerCase();
          const passed = status === 'passed' || status === 'true' || status === 'success';
          return (
            <div key={i} className="sr-exec-item">
              <div className="sr-exec-left">
                <div className={`sr-exec-dot ${passed ? 'pass' : (status === 'failed' ? 'fail' : 'skip')}`} />
                <div className="sr-exec-name">{b.name || b.type || b.block_type || `Block ${i+1}`}</div>
              </div>
              <div className="sr-exec-right">{b.executionTimeMs ? `${Number(b.executionTimeMs).toFixed(1)}ms` : ''}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default ExecutionBreakdown;
