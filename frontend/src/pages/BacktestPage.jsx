import React, { useState, useEffect, useRef } from 'react';
import PastDataViewer from '../components/StrategyResults/PastDataViewer';
import '../components/StrategyResults/strategy-results.css';
import './backtest.css';

const SAVES_KEY = 'flowgrid_backtest_saves_v1';

const BacktestPage = () => {
  const [fileData, setFileData] = useState(null);
  const [runs, setRuns] = useState([]);
  const [results, setResults] = useState(null);
  const [symbol, setSymbol] = useState('SPY');
  const [timeframe, setTimeframe] = useState('1Hour');
  const [days, setDays] = useState(7);
  const inputRef = useRef(null);

  useEffect(() => {
    try { const raw = localStorage.getItem(SAVES_KEY) || '[]'; setRuns(JSON.parse(raw)); } catch (e) { setRuns([]); }
  }, []);

  const saveRun = (name, payload) => {
    const map = runs.slice();
    map.unshift({ id: Date.now(), name: name || `run-${new Date().toLocaleString()}`, payload });
    localStorage.setItem(SAVES_KEY, JSON.stringify(map));
    setRuns(map);
  };

  const onFile = (f) => {
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try { const parsed = JSON.parse(ev.target.result); setFileData(parsed); setResults(parsed); } catch (e) { alert('Invalid JSON'); }
    };
    reader.readAsText(f);
  };

  const onUploadClick = () => inputRef.current && inputRef.current.click();

  const runBackend = async () => {
    if (!fileData || !fileData.blocks) {
      alert('Load a workflow JSON or provide workflow blocks first');
      return;
    }
    const workflow = (fileData.blocks || []).map(b => ({ id: b.id || b.block_id || 0, type: b.type || b.block_type || b.name, params: (b.outputs && b.outputs.params) || {} }));
    try {
      const resp = await fetch('http://localhost:5000/execute_workflow_v2', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ symbol, timeframe, days, workflow }) });
      const data = await resp.json();
      if (data.error) throw new Error(data.error);
      setResults(data);
      saveRun(`Backtest ${symbol} ${timeframe} ${new Date().toLocaleString()}`, data);
    } catch (err) {
      console.error(err);
      alert('Backtest failed: ' + (err.message || err));
    }
  };

  const loadSaved = (r) => { setResults(r.payload || r); };

  return (
    <div className="backtest-root">
      <div className="backtest-controls">
        <h2>Backtest Workspace</h2>
        <div className="control-row">
          <div>
            <button onClick={onUploadClick} className="toolbar-btn">Load JSON</button>
            <input ref={inputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={(e) => onFile(e.target.files && e.target.files[0])} />
            <button className="toolbar-btn" onClick={() => { if (results) saveRun(`Saved ${new Date().toLocaleString()}`, results); }}>Save Result</button>
          </div>
          <div className="control-row-right">
            <label>Symbol <input value={symbol} onChange={e => setSymbol(e.target.value)} /></label>
            <label>Timeframe <select value={timeframe} onChange={e => setTimeframe(e.target.value)}><option>1Hour</option><option>30Min</option><option>15Min</option></select></label>
            <label>Days <input type="number" value={days} onChange={e => setDays(Number(e.target.value))} style={{ width: 80 }} /></label>
            <button className="toolbar-btn" onClick={runBackend}>Run Backtest</button>
          </div>
        </div>

        <div className="backtest-saves">
          <h3>Previous Runs</h3>
          <div className="saves-list">
            {runs.length === 0 && <div className="sr-muted">No saved runs</div>}
            {runs.map(r => (
              <div key={r.id} className="save-item">
                <div className="save-name">{r.name}</div>
                <div className="save-actions">
                  <button className="chart-drawer-btn" onClick={() => loadSaved(r)}>Load</button>
                  <button className="chart-drawer-btn" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(JSON.stringify(r.payload || r)); }}>Copy JSON</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="backtest-viewer">
        {results ? (
          <PastDataViewer
            historicalBars={results.historical_bars}
            signals={results.signals || []}
            indicatorData={results.indicator_data || results.latest_data || {}}
            workflowResults={results}
            aiAnalysis={results.aiAnalysis || results.ai_analysis}
            marketContext={results.marketContext || {}}
            latency={results.latency}
            apiStatus={results.apiStatus}
          />
        ) : (
          <div className="sr-muted" style={{ padding: 24 }}>No results loaded. Load a saved JSON or run a backtest to view results.</div>
        )}
      </div>
    </div>
  );
};

export default BacktestPage;
