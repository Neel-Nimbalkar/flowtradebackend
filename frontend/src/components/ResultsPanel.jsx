import React, { useRef, useState } from 'react';
import Icon from './Icon';

/**
 * ResultsPanel - Floating panel matching node-palette style
 * Clean, minimal design with rounded edges
 */
const ResultsPanel = ({ data = {}, open = true, onClose = () => {}, onRerun = () => {} }) => {
  const [collapsedSections, setCollapsedSections] = useState(new Set(['raw']));
  const [expandedBlocks, setExpandedBlocks] = useState(new Set());
  const panelRef = useRef(null);

  if (!open) return null;

  const toggleSection = (name) => {
    setCollapsedSections(prev => {
      const n = new Set(prev);
      if (n.has(name)) n.delete(name); else n.add(name);
      return n;
    });
  };

  const toggleBlock = (id) => {
    setExpandedBlocks(prev => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  // Get signal color
  const getSignalColor = (signal) => {
    const s = String(signal || '').toUpperCase();
    if (s.includes('BUY') || s.includes('LONG')) return '#10b981';
    if (s.includes('SELL') || s.includes('SHORT')) return '#ef4444';
    return '#6b7280';
  };

  // Format params for display - summarize large arrays
  const formatParams = (params) => {
    if (!params || typeof params !== 'object') return params;
    const formatted = {};
    const arrayKeys = ['prices', 'volumes', 'highs', 'lows', 'opens', 'closes', 'price_series', 'volume_history', 'close_history', 'high_history', 'low_history', 'open_history'];
    for (const [key, val] of Object.entries(params)) {
      if (Array.isArray(val) && (arrayKeys.includes(key) || val.length > 10)) {
        const last = val.length > 0 ? val[val.length - 1] : null;
        const lastVal = typeof last === 'number' ? last.toFixed(2) : last;
        formatted[key] = `[${val.length} values${last !== null ? `, last: ${lastVal}` : ''}]`;
      } else {
        formatted[key] = val;
      }
    }
    return formatted;
  };

  const signal = data?.finalSignal || data?.final_decision || '--';
  const signalColor = getSignalColor(signal);

  return (
    <div ref={panelRef} className="results-panel-floating">
      {/* Header */}
      <div className="results-panel-header">
        <div className="results-panel-title">
          <Icon name="bolt" size={16} />
          <span>Results</span>
        </div>
        <div className="results-panel-actions">
          <button className="results-btn" onClick={onRerun} title="Re-run">
            <Icon name="refresh" size={14} />
          </button>
          <button className="results-btn results-close" onClick={onClose} title="Close">
            ×
          </button>
        </div>
      </div>

      {/* Signal Badge */}
      <div className="results-signal-section">
        <div className="results-signal-badge" style={{ background: signalColor }}>
          {signal}
        </div>
        <div className="results-signal-meta">
          <span className="results-meta-item">
            {data?.summary?.symbol || data?.latest_data?.symbol || '--'}
          </span>
          <span className="results-meta-sep">•</span>
          <span className="results-meta-item">
            {new Date().toLocaleTimeString()}
          </span>
        </div>
      </div>

      {/* Scrollable Content */}
      <div className="results-panel-content">
        
        {/* Market Data Section */}
        {data?.latest_data && (
          <div className="results-section">
            <div className="results-section-header" onClick={() => toggleSection('market')}>
              <span className="results-section-title">Market Data</span>
              <span className={`results-section-chevron ${collapsedSections.has('market') ? 'collapsed' : ''}`}>▾</span>
            </div>
            {!collapsedSections.has('market') && (
              <div className="results-section-body">
                <div className="results-grid">
                  {Object.entries(data.latest_data).map(([key, val], idx) => {
                    if (Array.isArray(val)) return null;
                    let label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                    let value = val;
                    if (typeof val === 'number') {
                      if (key.toLowerCase().includes('price') || ['open', 'high', 'low', 'close'].includes(key)) {
                        value = '$' + val.toFixed(2);
                      } else if (key.toLowerCase().includes('volume')) {
                        value = val.toLocaleString();
                      } else {
                        value = val.toFixed(4);
                      }
                    }
                    return (
                      <div key={idx} className="results-grid-item">
                        <span className="results-label">{label}</span>
                        <span className="results-value">{String(value)}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Block Execution Section */}
        {data?.blocks && data.blocks.length > 0 && (
          <div className="results-section">
            <div className="results-section-header" onClick={() => toggleSection('blocks')}>
              <span className="results-section-title">Block Execution</span>
              <span className={`results-section-chevron ${collapsedSections.has('blocks') ? 'collapsed' : ''}`}>▾</span>
            </div>
            {!collapsedSections.has('blocks') && (
              <div className="results-section-body">
                {data.blocks.map((b, idx) => {
                  const expanded = expandedBlocks.has(b.id || idx);
                  const rawParams = b.params || b.inputs || {};
                  
                  // Determine pass/fail based on condition_met
                  const conditionMet = rawParams.condition_met;
                  const hasCond = conditionMet !== undefined;
                  const passed = conditionMet === true;
                  
                  // Color: green if passed, red if failed, gray if no condition
                  const statusColor = hasCond ? (passed ? '#10b981' : '#ef4444') : '#6b7280';
                  
                  // Extract key values for inline display
                  const keyVals = [];
                  if (rawParams.rsi !== undefined) keyVals.push({ k: 'RSI', v: Number(rawParams.rsi).toFixed(2) });
                  if (rawParams.ema !== undefined) keyVals.push({ k: 'EMA', v: Number(rawParams.ema).toFixed(2) });
                  if (rawParams.macd !== undefined) keyVals.push({ k: 'MACD', v: Number(rawParams.macd).toFixed(4) });
                  if (hasCond) keyVals.push({ k: 'Met', v: passed ? '✓' : '✗', color: statusColor });
                  
                  // Build log preview from message, output, or logs
                  let logPreview = '';
                  if (b.message) {
                    logPreview = b.message;
                  } else if (b.output && typeof b.output === 'string') {
                    logPreview = b.output;
                  } else if (b.logs && b.logs.length > 0) {
                    logPreview = b.logs[0];
                  } else if (rawParams.result !== undefined) {
                    logPreview = `Result: ${rawParams.result}`;
                  } else if (rawParams.signal !== undefined) {
                    logPreview = `Signal: ${rawParams.signal}`;
                  }
                  // Truncate preview
                  if (logPreview.length > 60) logPreview = logPreview.slice(0, 57) + '...';
                  
                  return (
                    <div key={idx} className={`results-block ${hasCond ? (passed ? 'passed' : 'failed') : ''}`}>
                      <div className="results-block-header" onClick={() => toggleBlock(b.id || idx)}>
                        <div className="results-block-status" style={{ background: statusColor }} />
                        <span className="results-block-name">{b.name || b.block_type || `Block ${idx + 1}`}</span>
                        <span className="results-block-time">{(b.execution_time_ms || 0).toFixed(0)}ms</span>
                        <span className="results-block-expand">{expanded ? '−' : '+'}</span>
                      </div>
                      {/* Log Preview */}
                      {logPreview && (
                        <div className="results-block-preview" style={{ color: statusColor }}>
                          {logPreview}
                        </div>
                      )}
                      {keyVals.length > 0 && (
                        <div className="results-block-keys">
                          {keyVals.map((kv, i) => (
                            <span key={i} className="results-block-key" style={kv.color ? { color: kv.color } : {}}>
                              <span className="results-block-key-label">{kv.k}:</span> {kv.v}
                            </span>
                          ))}
                        </div>
                      )}
                      {expanded && (
                        <div className="results-block-details">
                          <pre>{JSON.stringify(formatParams(rawParams), null, 2)}</pre>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Trades Section */}
        {Array.isArray(data?.trades) && data.trades.length > 0 && (
          <div className="results-section">
            <div className="results-section-header" onClick={() => toggleSection('trades')}>
              <span className="results-section-title">Trades ({data.trades.length})</span>
              <span className={`results-section-chevron ${collapsedSections.has('trades') ? 'collapsed' : ''}`}>▾</span>
            </div>
            {!collapsedSections.has('trades') && (
              <div className="results-section-body">
                {data.trades.slice(0, 10).map((t, i) => (
                  <div key={i} className="results-trade-row">
                    <span className="results-trade-side" style={{ color: t.side?.toLowerCase() === 'buy' ? '#10b981' : '#ef4444' }}>
                      {t.side || '--'}
                    </span>
                    <span className="results-trade-price">{t.price ? '$' + Number(t.price).toFixed(2) : '--'}</span>
                    <span className="results-trade-pnl" style={{ color: (t.pnl || 0) >= 0 ? '#10b981' : '#ef4444' }}>
                      {typeof t.pnl !== 'undefined' ? ((t.pnl >= 0 ? '+' : '') + Number(t.pnl).toFixed(2)) : '--'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Raw Response Section */}
        <div className="results-section">
          <div className="results-section-header" onClick={() => toggleSection('raw')}>
            <span className="results-section-title">Raw Response</span>
            <span className={`results-section-chevron ${collapsedSections.has('raw') ? 'collapsed' : ''}`}>▾</span>
          </div>
          {!collapsedSections.has('raw') && (
            <div className="results-section-body">
              <div className="results-raw-box">
                <pre>{JSON.stringify(data || {}, null, 2)}</pre>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
};

export default ResultsPanel;
