import React, { useEffect, useRef, useState } from 'react';
import Icon from './Icon';

const drawEquityCurve = (canvas, points) => {
  if (!canvas || !points || points.length < 2) return;
  const ctx = canvas.getContext('2d');
  const w = canvas.clientWidth; const h = canvas.clientHeight;
  canvas.width = w; canvas.height = h;
  ctx.clearRect(0, 0, w, h);
  ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2; ctx.beginPath();
  const vals = points.map(p => typeof p.v !== 'undefined' ? p.v : (p.value || p.y || 0));
  if (!vals.length) return;
  const min = Math.min(...vals); const max = Math.max(...vals); const range = max - min || 1;
  vals.forEach((v,i) => { const x = (i / (vals.length - 1 || 1)) * w; const y = h - ((v - min) / range) * h; if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); });
  ctx.stroke();
};

const Sparkline = ({ series = [], width = 120, height = 26, color = '#60a5fa' }) => {
  const ref = useRef(null);
  useEffect(() => {
    const c = ref.current; if (!c || !series || series.length === 0) return; c.width = width; c.height = height; const ctx = c.getContext('2d'); ctx.clearRect(0,0,width,height);
    const min = Math.min(...series); const max = Math.max(...series); const range = max - min || 1; ctx.strokeStyle = color; ctx.lineWidth = 1.2; ctx.beginPath();
    series.forEach((v,i) => { const x = (i / (series.length-1 || 1)) * width; const y = height - ((v - min)/range)*height; if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y); }); ctx.stroke();
  }, [series, width, height, color]);
  return <canvas ref={ref} style={{ width, height }} />;
};


const ResultsPanel = ({ data = {}, open = true, onClose = () => {}, onRerun = () => {}, onDownload = () => {} }) => {

  const canvasRef = useRef(null);
  const [collapsedSections, setCollapsedSections] = useState(new Set());
  const [expandedBlocks, setExpandedBlocks] = useState(new Set());
  const [width, setWidth] = useState(() => {
    try { const v = localStorage.getItem('resultsPanelWidth'); return v ? Number(v) : 420; } catch (e) { return 420; }
  });
  const resizingRef = useRef(false);
  const panelRef = useRef(null);
  const lastWidthRef = useRef(width);
  const rafRef = useRef(null);
  useEffect(() => { if (data?.equityCurve && canvasRef.current) drawEquityCurve(canvasRef.current, data.equityCurve); }, [data]);
  // Persist width to localStorage when React state changes (debounced)
  useEffect(() => {
    try { localStorage.setItem('resultsPanelWidth', String(width)); } catch (e) {}
  }, [width]);

  useEffect(() => {
    const onMove = (e) => {
      if (!resizingRef.current) return;
      const clientX = (e.touches && e.touches[0]) ? e.touches[0].clientX : e.clientX;
      const newWidth = Math.max(300, Math.min(window.innerWidth - 80, window.innerWidth - clientX));
      lastWidthRef.current = newWidth;
      // schedule DOM update via rAF for smoother updates
      if (!rafRef.current) {
        rafRef.current = window.requestAnimationFrame(() => {
          rafRef.current = null;
          try {
            if (panelRef.current) panelRef.current.style.width = `${lastWidthRef.current}px`;
          } catch (e) {}
        });
      }
      // prevent scrolling while touch-dragging
      if (e.cancelable) e.preventDefault();
    };

    const onUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      // cancel any pending rAF
      if (rafRef.current) { window.cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      // commit final width into React state (this also persists via effect)
      setWidth(lastWidthRef.current);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: false });
    window.addEventListener('touchend', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
      if (rafRef.current) { window.cancelAnimationFrame(rafRef.current); rafRef.current = null; }
    };
  }, []);
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

  // Helper: summary stats
  // Dynamically render all available market/indicator data
  const summaryStats = [
    { label: 'Final Signal', value: data?.finalSignal || '--', color: '#2962ff', bold: true },
    { label: 'Confidence', value: data?.confidence !== null && data?.confidence !== undefined ? (data.confidence * 100).toFixed(1) + '%' : '--' },
    ...(
      data?.latest_data
        ? Object.entries(data.latest_data).map(([key, val]) => {
            let label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
            let value = val;
            if (typeof val === 'number') {
              if (key.toLowerCase().includes('price') || key === 'open' || key === 'high' || key === 'low' || key === 'close') value = '$' + val.toFixed(2);
              else if (key.toLowerCase().includes('volume')) value = val.toLocaleString();
              else value = val.toFixed(2);
            }
            return { label, value };
          })
        : []
    )
  ];

  const startResize = (e) => {
    e.preventDefault();
    resizingRef.current = true;
    // faster rendering: add dragging class to disable heavy transitions/styles
    try { panelRef.current && panelRef.current.classList.add('dragging'); } catch (e) {}
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  };

  return (

    <div ref={panelRef} className="output-panel open" id="outputPanel" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start', minHeight: '100vh', background: '#1e222d', boxShadow: '-4px 0 24px rgba(0,0,0,0.3)', width: width }}>
      <div className="output-panel-resize-handle" id="resizeHandle" onMouseDown={startResize} onTouchStart={startResize} />
      <div className="output-header" style={{ width: '100%', maxWidth: 600, margin: '0 auto', padding: '0 0 12px 0' }}>
        <div className="output-header-top" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
          <div className="output-header-title-group" style={{ textAlign: 'center' }}>
            <h3 id="outputHeaderTitle" style={{ fontSize: 22, fontWeight: 700, color: '#f8f9fa', marginBottom: 2 }}>{data?.summary?.strategyName || 'Strategy Results'}</h3>
            <div className="output-header-meta" style={{ display: 'flex', justifyContent: 'center', gap: 16, marginBottom: 4 }}>
              <span id="outputTimestamp" style={{ color: '#787b86', fontSize: 13 }}>{new Date().toLocaleTimeString()}</span>
              <span id="outputHeaderBadge" className={`output-status-badge ${data?.summary?.status || 'completed'}`}>{data?.summary?.status || ''}</span>
            </div>
          </div>
          <div className="output-header-actions" style={{ display: 'flex', gap: 12, justifyContent: 'center', marginTop: 8 }}>
            <button className="output-action-btn" id="rerunBtn" onClick={onRerun}>↻ Re-run</button>
            <button className="output-action-btn" id="downloadBtn" onClick={onDownload}>⬇ Download</button>
            <button className="output-action-btn" id="exportChartBtn" onClick={() => {
              try { const c = canvasRef.current; if (!c) return; const url = c.toDataURL('image/png'); const a = document.createElement('a'); a.href = url; a.download = `equity-chart-${Date.now()}.png`; a.click(); } catch (e) { console.warn(e); }
            }}><Icon name="bolt" size={14} style={{ marginRight: 6 }} />Export Chart</button>
            <button className="output-close" id="closeOutput" onClick={onClose}>×</button>
          </div>
        </div>
        {/* Centered summary stats row */}
        <div style={{ display: 'flex', gap: 32, margin: '24px auto 12px auto', flexWrap: 'wrap', justifyContent: 'center', borderBottom: '1px solid #232634', paddingBottom: 12, width: '100%' }}>
          {summaryStats.map((stat, i) => (
            <div key={i} style={{ minWidth: 90, textAlign: 'center' }}>
              <div className="output-label" style={{ color: '#787b86', fontSize: 12 }}>{stat.label}</div>
              <div className="output-value" style={{ fontWeight: stat.bold ? 700 : 500, fontSize: stat.bold ? 20 : 15, color: stat.color || '#d1d4dc', marginTop: 2 }}>{stat.value}</div>
            </div>
          ))}
        </div>
      </div>

      {Array.isArray(data?.trades) && (
        <div className="output-section">
          <div className="output-section-header" onClick={() => toggleSection('trades')}>
            <div className="output-section-title"><Icon name="puzzle" size={16} style={{ marginRight: 8 }} />Trades</div>
            <div className={`output-section-toggle ${collapsedSections.has('trades') ? 'collapsed' : ''}`}>▾</div>
          </div>
          <div className="output-section-body" style={{ display: collapsedSections.has('trades') ? 'none' : undefined }}>
            <div style={{ overflowX: 'auto' }}>
              <table className="results-table trades-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Side</th>
                    <th>Price</th>
                    <th>Size</th>
                    <th>Profit</th>
                  </tr>
                </thead>
                <tbody>
                  {data.trades.map((t,i) => (
                    <tr key={i} className="trade-row">
                      <td className="trade-time">{t.time ? new Date(t.time).toLocaleString() : '--'}</td>
                      <td className="trade-side">{t.side || '--'}</td>
                      <td className="trade-price">{t.price ? '$' + Number(t.price).toFixed(2) : '--'}</td>
                      <td className="trade-size">{t.size || '--'}</td>
                      <td className="trade-profit" style={{ color: typeof t.pnl !== 'undefined' ? (t.pnl >= 0 ? '#089981' : '#f23645') : '#787b86' }}>{typeof t.pnl !== 'undefined' ? (t.pnl >= 0 ? '+' : '') + Number(t.pnl).toFixed(2) : '--'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {data.trades && data.trades.length > 0 && (
                <button
                  className="download-csv-btn"
                  style={{ marginTop: '10px', float: 'right', background: '#232634', color: '#d1d4dc', border: 'none', borderRadius: '4px', padding: '6px 14px', fontSize: '11px', cursor: 'pointer' }}
                  onClick={() => {
                    const csvRows = [
                      ['Time', 'Side', 'Price', 'Size', 'Profit'],
                      ...data.trades.map(t => [
                        t.time ? new Date(t.time).toLocaleString() : '',
                        t.side || '',
                        t.price || '',
                        t.size || '',
                        typeof t.pnl !== 'undefined' ? t.pnl : ''
                      ])
                    ];
                    const csvContent = csvRows.map(r => r.map(x => `"${String(x).replace(/"/g, '""')}` ).join(',')).join('\n');
                    const blob = new Blob([csvContent], { type: 'text/csv' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'trades.csv';
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);
                  }}
                >Download CSV</button>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="output-content" id="outputContent">
        <div className="output-section">
          <div className="output-section-header" onClick={() => toggleSection('ai')}>
            <div className="output-section-title"><Icon name="ai" size={16} style={{ marginRight: 8 }} />AI Summary</div>
            <div className={`output-section-toggle ${collapsedSections.has('ai') ? 'collapsed' : ''}`}>▾</div>
          </div>
          <div className="output-section-body" style={{ display: collapsedSections.has('ai') ? 'none' : undefined }}>
            <div className="ai-summary-box">{data?.aiAnalysis || 'No AI analysis available.'}</div>
          </div>
        </div>

        <div className="output-section">
          <div className="output-section-header" onClick={() => toggleSection('blocks')}>
            <div className="output-section-title"><Icon name="puzzle" size={16} style={{ marginRight: 8 }} />Block Execution Details</div>
            <div className={`output-section-toggle ${collapsedSections.has('blocks') ? 'collapsed' : ''}`}>▾</div>
          </div>
          <div className="output-section-body" style={{ display: collapsedSections.has('blocks') ? 'none' : undefined }}>
            {(data?.blocks || []).map((b, idx) => {
              const expanded = expandedBlocks.has(b.id);
              const status = b.status || 'skipped';
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
              const displayParams = formatParams(b.params || b.inputs || {});
              // Extract key values to show inline
              const keyValues = [];
              const rawParams = b.params || b.inputs || {};
              if (rawParams.price !== undefined) keyValues.push({ label: 'Price', value: '$' + Number(rawParams.price).toFixed(2) });
              else if (rawParams.close !== undefined) keyValues.push({ label: 'Close', value: '$' + Number(rawParams.close).toFixed(2) });
              if (rawParams.rsi !== undefined) keyValues.push({ label: 'RSI', value: Number(rawParams.rsi).toFixed(2) });
              if (rawParams.ema !== undefined) keyValues.push({ label: 'EMA', value: Number(rawParams.ema).toFixed(2) });
              if (rawParams.macd !== undefined) keyValues.push({ label: 'MACD', value: Number(rawParams.macd).toFixed(4) });
              if (rawParams.vwap !== undefined) keyValues.push({ label: 'VWAP', value: rawParams.vwap !== null ? '$' + Number(rawParams.vwap).toFixed(2) : 'null' });
              if (rawParams.condition_met !== undefined) keyValues.push({ label: 'Met', value: rawParams.condition_met ? '✓' : '✗' });
              return (
                <div key={idx} className={`block-details ${status}`}> 
                  <div className="block-header" onClick={() => toggleBlock(b.id)}>
                    <span className="block-title">Block {idx + 1}: {b.name || b.block_type}</span>
                    <span className="block-type">{b.type || b.block_type || ''}</span>
                    <span className="block-time">{(b.execution_time_ms || 0).toFixed(1)}ms</span>
                    <button className="block-expand">{expanded ? '▾' : '▸'}</button>
                  </div>
                  <div className="block-message">{b.message}</div>
                  {/* Key values shown inline for quick scanning */}
                  {keyValues.length > 0 && (
                    <div className="block-key-values" style={{ display: 'flex', gap: 16, flexWrap: 'wrap', padding: '6px 0', borderBottom: '1px solid #2a2e39' }}>
                      {keyValues.map((kv, i) => (
                        <span key={i} style={{ fontSize: 12 }}>
                          <span style={{ color: '#787b86' }}>{kv.label}: </span>
                          <span style={{ color: '#d1d4dc', fontWeight: 500 }}>{kv.value}</span>
                        </span>
                      ))}
                    </div>
                  )}
                  {/* Collapsible full params - only show when expanded */}
                  {expanded && (
                    <div className="block-params" style={{ maxHeight: 200, overflow: 'auto' }}>
                      <strong>Params</strong>
                      <pre style={{ fontSize: 11 }}>{JSON.stringify(displayParams, null, 2)}</pre>
                    </div>
                  )}
                  <div className="block-logs"><strong>Logs</strong><div>{(b.logs && b.logs.join('\n')) || b.output || 'No logs available'}</div></div>
                  {b.price_series && <div className="block-sparkline"><strong>Price Sparkline</strong><Sparkline series={b.price_series} width={200} height={36} /></div>}
                </div>
              );
            })}
          </div>
        </div>

        <div className="output-section">
          <div className="output-section-header" onClick={() => toggleSection('signals')}>
            <div className="output-section-title"><Icon name="bolt" size={16} style={{ marginRight: 8 }} />Last Signals</div>
            <div className={`output-section-toggle ${collapsedSections.has('signals') ? 'collapsed' : ''}`}>▾</div>
          </div>
          <div className="output-section-body" style={{ display: collapsedSections.has('signals') ? 'none' : undefined }}>
            <table className="signals-table"><tbody>{(data?.signals || []).map((s,i) => (<tr key={i}><td>{s.time}</td><td>{s.signal}</td><td>{s.price}</td></tr>))}</tbody></table>
          </div>
        </div>

        <div className="output-section">
          <div className="output-section-header" onClick={() => toggleSection('performance')}>
            <div className="output-section-title"><Icon name="bolt" size={16} style={{ marginRight: 8 }} />Strategy Performance</div>
            <div className={`output-section-toggle ${collapsedSections.has('performance') ? 'collapsed' : ''}`}>▾</div>
          </div>
          <div className="output-section-body" style={{ display: collapsedSections.has('performance') ? 'none' : undefined }}>
            <canvas ref={canvasRef} style={{ width: '100%', height: 200 }} />
          </div>
        </div>

        <div className="output-section">
          <div className="output-section-header" onClick={() => toggleSection('market')}>
            <div className="output-section-title"><Icon name="bolt" size={16} style={{ marginRight: 8 }} />Market Data</div>
            <div className={`output-section-toggle ${collapsedSections.has('market') ? 'collapsed' : ''}`}>▾</div>
          </div>
          <div className="output-section-body" style={{ display: collapsedSections.has('market') ? 'none' : undefined }}>
            <div className="output-label">Final Signal</div>
            <div className="output-value" style={{ fontWeight: 700, fontSize: 18, color: '#2962ff' }}>{data?.finalSignal || '--'}</div>
            <div className="output-label">Confidence</div>
            <div className="output-value">{data?.confidence !== null && data?.confidence !== undefined ? (data.confidence * 100).toFixed(1) + '%' : '--'}</div>
            {data?.latest_data && (
              <>
                {Object.entries(data.latest_data).map(([key, val], idx) => {
                  let label = key.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
                  let value = val;
                  if (typeof val === 'number') {
                    if (key.toLowerCase().includes('price') || key === 'open' || key === 'high' || key === 'low' || key === 'close') value = '$' + val.toFixed(2);
                    else if (key.toLowerCase().includes('volume')) value = val.toLocaleString();
                    else value = val.toFixed(2);
                  }
                  return (
                    <React.Fragment key={idx}>
                      <div className="output-label">{label}</div>
                      <div className="output-value">{value}</div>
                    </React.Fragment>
                  );
                })}
              </>
            )}
          </div>
        </div>
        <div className="output-section">
          <div className="output-section-header" onClick={() => toggleSection('raw')}>
            <div className="output-section-title">🧾 Raw Response</div>
            <div className={`output-section-toggle ${collapsedSections.has('raw') ? 'collapsed' : ''}`}>▾</div>
          </div>
          <div className="output-section-body" style={{ display: collapsedSections.has('raw') ? 'none' : undefined }}>
            <div style={{ maxHeight: 240, overflow: 'auto', background: '#0b0f14', padding: 12, borderRadius: 6, border: '1px solid #1f2937' }}>
              <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', color: '#cbd5e1', fontSize: 12 }}>{JSON.stringify(data || {}, null, 2)}</pre>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultsPanel;
