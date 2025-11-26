import React, { useState, useEffect } from 'react';
import LineChart from './StrategyMonitor/LineChart';

// API base: prefer Vite env var `VITE_API_BASE`, otherwise default to local backend
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.VITE_API_BASE) ? import.meta.env.VITE_API_BASE.replace(/\/$/, '') : 'http://127.0.0.1:5000';

const BacktestModal = ({ open, onClose }) => {
  const [symbol, setSymbol] = useState('SPY');
  const [timeframe, setTimeframe] = useState('1Hour');
  const [days, setDays] = useState(90);
  const [positionSize, setPositionSize] = useState('');
  const [positionSizePct, setPositionSizePct] = useState('');
  const [commissionFixed, setCommissionFixed] = useState('');
  const [commissionPct, setCommissionPct] = useState('');
  const [slippagePct, setSlippagePct] = useState('');
  const [workflowText, setWorkflowText] = useState('[]');
  const [jobId, setJobId] = useState(null);
  const [status, setStatus] = useState(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [jobError, setJobError] = useState(null);
  const [polling, setPolling] = useState(false);

  useEffect(() => {
    if (!open) {
      // reset on close
      setJobId(null); setStatus(null); setProgress(0); setResult(null); setPolling(false);
    }
  }, [open]);

  // On open, attempt to restore last job id from localStorage and fetch status/results
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        if (!jobId) {
          const last = localStorage.getItem('lastBacktestJob');
          if (last) {
            setJobId(last);
            // check status
            const s = await fetch(`${API_BASE}/api/backtest/status/${last}`);
              if (s.ok) {
              const js = await s.json();
              setStatus(js.status);
              setProgress(js.progress || 0);
              setJobError(js.error || null);
              if (js.status === 'completed' || js.status === 'failed') {
                // fetch results immediately
                const res = await fetch(`${API_BASE}/api/backtest/results/${last}`);
                if (res.ok) {
                  const data = await res.json();
                  const r = data.result || null;
                  const nr = normalizeBacktestResult(r);
                  setResult(nr);
                  setJobError(data.error || null);
                  try { if (typeof window.displayWorkflowResultsV2 === 'function') window.displayWorkflowResultsV2(r); } catch (e) {}
                  try { if (typeof window.openStrategyMonitor === 'function') window.openStrategyMonitor(); } catch (e) {}
                  try { if (typeof window.setMonitorTab === 'function') window.setMonitorTab('backtest'); } catch (e) {}
                }
              } else {
                // start polling for in-flight jobs
                setPolling(true);
              }
            }
          }
        }
      } catch (e) {
        console.warn('restore last job error', e);
      }
              // restore execution defaults if present
              try {
                const exec = localStorage.getItem('backtestExecutionDefaults');
                if (exec) {
                  const obj = JSON.parse(exec);
                  if (obj.position_size) setPositionSize(String(obj.position_size));
                  if (obj.position_size_pct) setPositionSizePct(String(obj.position_size_pct));
                  if (obj.commission_fixed) setCommissionFixed(String(obj.commission_fixed));
                  if (obj.commission_pct) setCommissionPct(String(obj.commission_pct));
                  if (obj.slippage_pct) setSlippagePct(String(obj.slippage_pct));
                }
              } catch (e) { /* ignore */ }

      // If the user has a workflow open in the grid, auto-populate the workflow JSON
      try {
        // Only auto-load if user hasn't already typed/pasted something
        const cur = workflowText && workflowText.trim();
        if ((!cur || cur === '[]') && typeof window.getReactNodes === 'function') {
          const rn = window.getReactNodes() || [];
          const rc = (typeof window.getReactConnections === 'function') ? (window.getReactConnections() || []) : [];
          // Normalize similar to WorkflowBuilder.preparePayload: map nodes -> { id, type, params }
          const sorted = [...rn].sort((a, b) => (a.y || 0) - (b.y || 0));
          const priceInputTypes = new Set(['input', 'price_history', 'volume_history']);
          const workflow_blocks = sorted.map(n => {
            let params = n.configValues || {};
            if (priceInputTypes.has(n.type) && params) {
              const { symbol, timeframe, days, ...rest } = params;
              params = rest;
            }
            return { id: n.id, type: n.type, params };
          });
          // derive symbol/timeframe/days from any alpaca_config node
          let symbol = 'SPY', timeframe = '1Hour', daysVal = 7;
          for (let i = rn.length - 1; i >= 0; i--) {
            const node = rn[i];
            if (node && node.type === 'alpaca_config' && node.configValues) {
              symbol = node.configValues.symbol || symbol;
              timeframe = node.configValues.timeframe || timeframe;
              daysVal = node.configValues.days || daysVal;
              break;
            }
          }
          const payload = { symbol, timeframe, days: daysVal, workflow: workflow_blocks, priceType: 'current' };
          setWorkflowText(JSON.stringify(workflow_blocks, null, 2));
        }
      } catch (e) {
        console.warn('auto-load workflow failed', e);
      }
    })();
  }, [open]);

  useEffect(() => {
    let t;
    if (jobId && polling) {
      t = setInterval(async () => {
        try {
          const r = await fetch(`${API_BASE}/api/backtest/status/${jobId}`);
            if (r.ok) {
            const j = await r.json();
            setStatus(j.status);
            setProgress(j.progress || 0);
            setJobError(j.error || null);
            if (j.status === 'completed' || j.status === 'failed') {
              setPolling(false);
              // fetch results
              const res = await fetch(`${API_BASE}/api/backtest/results/${jobId}`);
                if (res.ok) {
                const data = await res.json();
                const nr = normalizeBacktestResult(data.result || null);
                setResult(nr);
                setJobError(data.error || null);
              }
            }
          }
        } catch (e) {
          console.warn('poll error', e);
        }
      }, 1000);
    }
    return () => { if (t) clearInterval(t); };
  }, [jobId, polling]);

  const startBacktest = async () => {
    try {
      const workflow = JSON.parse(workflowText || '[]');
      // validation: position size units and pct are mutually exclusive
      if (positionSize && positionSizePct) {
        alert('Please specify either Position Size (units) OR Position Size (%), not both.');
        return;
      }
      const execution = {};
      if (positionSize) execution.position_size = Number(positionSize);
      if (positionSizePct) execution.position_size_pct = Number(positionSizePct);
      if (commissionFixed) execution.commission_fixed = Number(commissionFixed);
      if (commissionPct) execution.commission_pct = Number(commissionPct);
      if (slippagePct) execution.slippage_pct = Number(slippagePct);
      const body = { symbol, timeframe, days, workflow, execution };
      // persist defaults
      try {
        const save = { position_size: execution.position_size, position_size_pct: execution.position_size_pct, commission_fixed: execution.commission_fixed, commission_pct: execution.commission_pct, slippage_pct: execution.slippage_pct };
        localStorage.setItem('backtestExecutionDefaults', JSON.stringify(save));
      } catch (e) {}
      const r = await fetch(`${API_BASE}/api/backtest/start`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) {
        const txt = await r.text();
        alert('Failed to start backtest: ' + txt);
        return;
      }
      const j = await r.json();
      setJobId(j.job_id);
      try { localStorage.setItem('lastBacktestJob', j.job_id); } catch (e) {}
      setStatus('queued');
      setProgress(0);
      setPolling(true);
    } catch (e) {
      alert('Invalid workflow JSON or network error');
      console.error(e);
    }
  };

  const fetchResultsNow = async () => {
    if (!jobId) return;
    try {
      const res = await fetch(`${API_BASE}/api/backtest/results/${jobId}`);
        if (res.ok) {
          const data = await res.json();
          const nr = normalizeBacktestResult(data.result || null);
          setResult(nr);
          setStatus(data.status || status);
          setJobError(data.error || null);
          try { if (typeof window.displayWorkflowResultsV2 === 'function') window.displayWorkflowResultsV2(r); } catch (e) {}
          try { if (typeof window.openStrategyMonitor === 'function') window.openStrategyMonitor(); } catch (e) {}
          try { if (typeof window.setMonitorTab === 'function') window.setMonitorTab('backtest'); } catch (e) {}
      } else {
        const txt = await res.text().catch(()=>null);
        alert('Failed to fetch results: ' + (txt || res.status));
      }
    } catch (e) { console.warn('fetch results error', e); }
  };

  // Normalize backend backtest result shapes so UI components get a consistent `equityCurve` array
  const normalizeBacktestResult = (r) => {
    if (!r) return null;
    const out = { ...r };
    // If backend returned `equity_curve` (array of {time, equity}), convert to `equityCurve` [{t,v}]
    try {
      const hasGoodEquityCurve = Array.isArray(out.equityCurve) && out.equityCurve.length > 1;
      if (!hasGoodEquityCurve) {
        if (Array.isArray(out.equity_curve) && out.equity_curve.length) {
          out.equityCurve = out.equity_curve.map(p => ({ t: Date.parse(p.time), v: Number(p.equity) }));
        } else if (Array.isArray(out.equityCurve) && out.equityCurve.length === 1 && out.equityCurve[0].t && out.equityCurve[0].v) {
          // keep as-is (single point)
        } else {
          out.equityCurve = out.equityCurve || [];
        }
      }
    } catch (e) {
      out.equityCurve = out.equityCurve || [];
    }
    return out;
  };

  const downloadResult = () => {
    const payload = result || null;
    if (!payload) { alert('No result to download'); return; }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `backtest-${jobId || Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const fmt = (v) => (typeof v === 'number' ? new Intl.NumberFormat(undefined, { maximumFractionDigits: 2 }).format(v) : v);
  const pct = (v) => (typeof v === 'number' ? `${(v*100).toFixed(2)}%` : v);

  return (!open) ? null : (
    <div style={{ position: 'fixed', left:0, right:0, top:0, bottom:0, background:'rgba(0,0,0,0.5)', zIndex:2000, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ width: 900, maxHeight: '90vh', overflow: 'auto', background:'#0f1724', padding: 18, borderRadius: 8, border: '1px solid #1f2937' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
          <div style={{ fontSize:16, fontWeight:700 }}>Backtest Runner (MVP)</div>
          <div>
            <button onClick={onClose} style={{ background:'transparent', color:'#9ca3af', border:'none', fontSize:18 }}>✕</button>
          </div>
        </div>

        <div style={{ display:'flex', gap:12, marginBottom:12 }}>
          <div style={{ flex:1 }}>
            <label style={{ display:'block', color:'#9ca3af', fontSize:12 }}>Symbol</label>
            <input value={symbol} onChange={e=>setSymbol(e.target.value.toUpperCase())} style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid #263141', background:'#071025', color:'#e5e7eb' }} />
          </div>
          <div style={{ width:160 }}>
            <label style={{ display:'block', color:'#9ca3af', fontSize:12 }}>Timeframe</label>
            <select value={timeframe} onChange={e=>setTimeframe(e.target.value)} style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid #263141', background:'#071025', color:'#e5e7eb' }}>
              <option value="1Min">1m</option>
              <option value="5Min">5m</option>
              <option value="15Min">15m</option>
              <option value="1Hour">1h</option>
              <option value="1Day">1d</option>
            </select>
          </div>
          <div style={{ width:120 }}>
            <label style={{ display:'block', color:'#9ca3af', fontSize:12 }}>Days</label>
            <input type="number" value={days} onChange={e=>setDays(Number(e.target.value))} style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid #263141', background:'#071025', color:'#e5e7eb' }} />
          </div>
          <div style={{ width:180 }}>
            <label style={{ display:'block', color:'#9ca3af', fontSize:12 }}>Position Size (units)</label>
            <input placeholder="e.g. 1" value={positionSize} onChange={e=>setPositionSize(e.target.value)} style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid #263141', background:'#071025', color:'#e5e7eb' }} />
          </div>
          <div style={{ width:180 }}>
            <label style={{ display:'block', color:'#9ca3af', fontSize:12 }}>Position Size (% of equity)</label>
            <input placeholder="0.1 for 10%" value={positionSizePct} onChange={e=>setPositionSizePct(e.target.value)} style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid #263141', background:'#071025', color:'#e5e7eb' }} />
          </div>
          <div style={{ width:140 }}>
            <label style={{ display:'block', color:'#9ca3af', fontSize:12 }}>Commission (fixed)</label>
            <input placeholder="e.g. 1.0" value={commissionFixed} onChange={e=>setCommissionFixed(e.target.value)} style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid #263141', background:'#071025', color:'#e5e7eb' }} />
          </div>
          <div style={{ width:140 }}>
            <label style={{ display:'block', color:'#9ca3af', fontSize:12 }}>Commission (%)</label>
            <input placeholder="0.001" value={commissionPct} onChange={e=>setCommissionPct(e.target.value)} style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid #263141', background:'#071025', color:'#e5e7eb' }} />
          </div>
          <div style={{ width:140 }}>
            <label style={{ display:'block', color:'#9ca3af', fontSize:12 }}>Slippage (%)</label>
            <input placeholder="0.001" value={slippagePct} onChange={e=>setSlippagePct(e.target.value)} style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid #263141', background:'#071025', color:'#e5e7eb' }} />
          </div>
        </div>

        <div style={{ marginBottom:12 }}>
          <label style={{ color:'#9ca3af', fontSize:12 }}>Workflow JSON (array of blocks)</label>
          <textarea value={workflowText} onChange={e=>setWorkflowText(e.target.value)} rows={6} style={{ width:'100%', padding:8, borderRadius:6, border:'1px solid #263141', background:'#071025', color:'#e5e7eb' }} />
        </div>

        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <button onClick={startBacktest} style={{ padding:'8px 12px', background:'#2563eb', color:'#fff', borderRadius:6, border:'none' }}>Start Backtest</button>
          <button onClick={()=>{ setWorkflowText('[]'); setResult(null); setJobId(null); setStatus(null); setProgress(0); }} style={{ padding:'8px 12px', background:'#111827', color:'#9ca3af', borderRadius:6, border:'1px solid #263141' }}>Reset</button>
          <button onClick={fetchResultsNow} disabled={!jobId} style={{ padding:'8px 12px', background:'#0b1220', color:'#9ca3af', borderRadius:6, border:'1px solid #263141' }}>Fetch Results</button>
          <button onClick={downloadResult} disabled={!result} style={{ padding:'8px 12px', background:'#062e2f', color:'#9ca3af', borderRadius:6, border:'1px solid #174a49' }}>Download JSON</button>
          {jobId && <div style={{ marginLeft: 'auto', color:'#9ca3af' }}>Job: {jobId}</div>}
        </div>

        <div style={{ display:'flex', gap:12 }}>
          <div style={{ flex: 1, padding: 12, background:'#071025', borderRadius:8, border:'1px solid #1f2937' }}>
            <div style={{ color:'#9ca3af', fontSize:12, marginBottom:8 }}>Status</div>
            <div style={{ fontWeight:700, fontSize:14 }}>{status || 'idle'}</div>
            <div style={{ height:8, background:'#08101a', borderRadius:4, marginTop:8 }}>
              <div style={{ width: `${progress}%`, height:8, background:'#2563eb', borderRadius:4 }} />
            </div>
            {result && (
              <div style={{ marginTop:12 }}>
                  <div style={{ color:'#9ca3af', fontSize:12 }}>Metrics</div>
                <div>Final Equity: <strong>{fmt(result.metrics?.final_equity)}</strong></div>
                <div>Total Return: <strong>{pct(result.metrics?.total_return)}</strong></div>
                <div>Max Drawdown: <strong>{pct(result.metrics?.max_drawdown)}</strong></div>
                <div>Win Rate: <strong>{pct(result.metrics?.win_rate)}</strong></div>
                  <div>Signals: <strong>{result.signals ? result.signals.length : 0}</strong></div>
                  {jobError && (
                    <div style={{ marginTop:8, color:'#fca5a5', fontSize:12 }}>
                      Error: {jobError}
                    </div>
                  )}
              </div>
            )}
          </div>

          <div style={{ width:420, padding:12, background:'#071025', borderRadius:8, border:'1px solid #1f2937' }}>
            <div style={{ color:'#9ca3af', fontSize:12, marginBottom:8 }}>Equity Curve</div>
            {result && result.equityCurve && result.equityCurve.length ? (
              <LineChart data={result.equityCurve.map(p=>({ t: p.t, v: p.v }))} height={200} stroke="#22c55e" showXAxis={true} highlightNew={true} />
            ) : (
              <div style={{ height:200, display:'flex', alignItems:'center', justifyContent:'center', color:'#6b7280' }}>No equity data yet</div>
            )}
          </div>
        </div>

        <div style={{ marginTop:12 }}>
          <div style={{ color:'#9ca3af', fontSize:12, marginBottom:8 }}>Trades</div>
          <div style={{ maxHeight:200, overflow:'auto', borderRadius:6, border:'1px solid #16202a', padding:8 }}>
            {result && result.trades && result.trades.length ? result.trades.map((t,i)=> (
              <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'6px 4px', borderBottom:'1px dashed #0f1724' }}>
                <div>{t.type} @ {t.price}</div>
                <div>{t.pnl ? `P&L: ${t.pnl}` : ''}</div>
              </div>
            )) : (<div style={{ color:'#6b7280' }}>No trades yet</div>)}
          </div>
        </div>

      </div>
    </div>
  );
};

export default BacktestModal;
