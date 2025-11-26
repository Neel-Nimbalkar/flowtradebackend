import React, { useEffect, useState, useRef } from 'react';
import './workflow_builder.css';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import Node from './components/Node';
import blockDefs from './blockDefs';
import Connections from './components/Connections';
import ResultsPanel from './components/ResultsPanel';
import NodeSettings from './components/NodeSettings';
import PastDataViewer from './components/StrategyResults/PastDataViewer';
import StrategyMonitorDrawer from './components/StrategyMonitor/StrategyMonitorDrawer';
import BacktestModal from './components/BacktestModal';

const WorkflowBuilder = () => {
    // Zoom and pan state
    const [canvasScale, setCanvasScale] = useState(1);
    const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
    const [panning, setPanning] = useState(false);
  const [nodes, setNodes] = useState([]);
  const canvasRef = useRef(null);
  const svgRef = useRef(null);
  const [connections, setConnections] = useState([]);
  const [connecting, setConnecting] = useState(null); // { from: {nodeId, port}, x, y }
  const [selectedConnection, setSelectedConnection] = useState(null);
  const nextNodeId = useRef(1);

  // Persistence helpers
  const STORAGE_KEY = 'flowgrid_workflow_v1';
  const SAVES_KEY = `${STORAGE_KEY}::saves`;

  // Save with a user-provided name (supports multiple named saves)
  const saveWorkflow = () => {
    const name = prompt('Save workflow as (provide a name):', `workflow-${new Date().toISOString().replace(/[:.]/g,'-')}`);
    if (!name) { return; }
    const payload = { nodes, connections, savedAt: new Date().toISOString() };
    try {
      const raw = localStorage.getItem(SAVES_KEY);
      const map = raw ? JSON.parse(raw) : {};
      map[name] = payload;
      localStorage.setItem(SAVES_KEY, JSON.stringify(map));
      alert(`Workflow saved as "${name}"`);
    } catch (err) {
      console.error('save error', err);
      alert('Failed to save workflow');
    }
  };

  // Choose from named saves and load
  const loadWorkflow = () => {
    try {
      const raw = localStorage.getItem(SAVES_KEY);
      if (!raw) { alert('No saved workflows found'); return; }
      const map = JSON.parse(raw);
      const names = Object.keys(map);
      if (names.length === 0) { alert('No saved workflows found'); return; }
      const choice = prompt(`Saved workflows:\n${names.map((n,i)=>`${i+1}. ${n}`).join('\n')}\n\nEnter name or number to load:`);
      if (!choice) return;
      let pick = null;
      const idx = parseInt(choice, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= names.length) pick = names[idx - 1];
      else if (map[choice]) pick = choice;
      if (!pick) { alert('No matching saved workflow'); return; }
      const parsed = map[pick];
      const normalized = normalizeIds(parsed.nodes || [], parsed.connections || []);
      setNodes(normalized.nodes);
      setConnections(normalized.connections);
      alert(`Loaded workflow "${pick}"`);
    } catch (err) {
      console.error('load error', err);
      alert('Failed to load workflow');
    }
  };

  const listSavedWorkflows = () => {
    try {
      const raw = localStorage.getItem(SAVES_KEY) || '{}';
      const map = JSON.parse(raw);
      return Object.keys(map).map(name => ({ name, savedAt: map[name]?.savedAt || null }));
    } catch (e) { return []; }
  };

  const deleteSavedWorkflow = (name) => {
    if (!confirm(`Delete saved workflow "${name}"?`)) return;
    try {
      const raw = localStorage.getItem(SAVES_KEY) || '{}';
      const map = JSON.parse(raw);
      delete map[name];
      localStorage.setItem(SAVES_KEY, JSON.stringify(map));
      alert(`Deleted "${name}"`);
    } catch (e) { console.error(e); alert('Failed to delete'); }
  };

  const exportWorkflow = () => {
    const payload = { nodes, connections };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `workflow-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const importInputRef = useRef(null);
  const importWorkflow = () => {
    if (importInputRef.current) importInputRef.current.click();
  };

  const handleImportFile = (e) => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(ev.target.result);
        const normalized = normalizeIds(parsed.nodes || [], parsed.connections || []);
        setNodes(normalized.nodes);
        setConnections(normalized.connections);
        alert('Workflow imported');
      } catch (err) {
        console.error('import error', err);
        alert('Invalid workflow file');
      }
    };
    reader.readAsText(f);
    // reset value so same file can be re-imported if needed
    e.target.value = '';
  };

  const clearWorkflow = () => {
    if (!confirm('Clear all nodes and connections?')) return;
    setNodes([]);
    setConnections([]);
  };

  // Expose a small helper UI via window for quick access to saved workflows.
  useEffect(() => {
    window.listSavedWorkflows = listSavedWorkflows;
    window.deleteSavedWorkflow = deleteSavedWorkflow;
    // Allow other UI parts (like BacktestModal) to open the Strategy Monitor drawer
    try { window.openStrategyMonitor = () => setChartDrawerMinimized(false); } catch (e) {}
    return () => {
      try { delete window.listSavedWorkflows; } catch (e) {}
      try { delete window.deleteSavedWorkflow; } catch (e) {}
      try { delete window.openStrategyMonitor; } catch (e) {}
    };
  }, []);

  // Normalize node & connection IDs so they are numeric and unique.
  function normalizeIds(inNodes, inConns) {
    // If all node ids are numeric and unique, keep as-is and ensure nextNodeId is updated
    const ids = inNodes.map(n => Number(n.id));
    const allNumeric = ids.every(i => !Number.isNaN(i));
    const uniqueCount = new Set(ids.filter(i => !Number.isNaN(i))).size;
    if (allNumeric && uniqueCount === inNodes.length) {
      const max = ids.length ? Math.max(...ids) : 0;
      nextNodeId.current = Math.max(nextNodeId.current, max + 1);
      return { nodes: inNodes.map(n => ({ ...n, id: Number(n.id) })), connections: inConns };
    }

    // Otherwise remap ids to sequential numeric ids
    const map = new Map();
    const newNodes = [];
    inNodes.forEach((n) => {
      const newId = nextNodeId.current++;
      map.set(n.id, newId);
      newNodes.push({ ...n, id: newId });
    });

    const newConns = (inConns || []).map(c => {
      const fromNodeId = map.has(c.from?.nodeId) ? map.get(c.from.nodeId) : Number(c.from?.nodeId);
      const toNodeId = map.has(c.to?.nodeId) ? map.get(c.to.nodeId) : Number(c.to?.nodeId);
      return { ...c, from: { ...(c.from || {}), nodeId: fromNodeId }, to: { ...(c.to || {}), nodeId: toNodeId } };
    });

    return { nodes: newNodes, connections: newConns };
  }

  // Legacy runner script removed — React now owns rendering and execution flows.
  // Previously we appended `/workflow_runner.js` here for incremental migration.
  // That script is no longer used; keep compatibility helpers exposed elsewhere.

  useEffect(() => {
    const nodeCountEl = document.getElementById('nodeCount');
    if (nodeCountEl) nodeCountEl.textContent = `${nodes.length} blocks`;
  }, [nodes]);

  // Keep nextNodeId in sync with current nodes (use max id + 1)
  useEffect(() => {
    let max = 0;
    nodes.forEach(n => {
      const v = Number(n.id);
      if (!Number.isNaN(v) && v > max) max = v;
    });
    nextNodeId.current = Math.max(nextNodeId.current, max + 1);
  }, [nodes]);

  // Expose current nodes/connections to legacy scripts for a smooth migration.
  useEffect(() => {
    window.getReactNodes = () => nodes;
    window.getReactConnections = () => connections;
    return () => {
      try { delete window.getReactNodes; } catch (e) {}
      try { delete window.getReactConnections; } catch (e) {}
    };
  }, [nodes, connections]);

  // Results state (React-driven results panel)
  const [resultsData, setResultsData] = useState(null);
  const [resultsOpen, setResultsOpen] = useState(false);
  const [pastOpen, setPastOpen] = useState(false);

  // Live-run / real-time polling state
  const [liveRunning, setLiveRunning] = useState(false);
  const liveRunningRef = useRef(false);
  const liveAbortRef = useRef(null);
  const liveTimerRef = useRef(null);
  const liveLoopActiveRef = useRef(false);

  // Node settings editor state
  const [settingsNode, setSettingsNode] = useState(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  // Expose a React-backed display function for legacy calls to use
  useEffect(() => {
    window.displayWorkflowResultsV2 = (data) => {
      try { setResultsData(data); setResultsOpen(true); } catch (e) { console.warn(e); }
    };
    return () => { try { delete window.displayWorkflowResultsV2; } catch (e) {} };
  }, []);

  // Execution: run workflow and animate node states
  // Helper: prepare payload from current nodes (keeps same logic as prior single-run)
  const preparePayload = () => {
    if (!nodes || nodes.length === 0) return null;
    const sorted = [...nodes].sort((a, b) => a.y - b.y);
    const priceInputTypes = new Set(['input', 'price_history', 'volume_history']);
    const workflow_blocks = sorted.map(n => {
      let params = n.configValues || {};
      if (priceInputTypes.has(n.type) && params) {
        const { symbol, timeframe, days, ...rest } = params;
        params = rest;
      }
      return { id: n.id, type: n.type, params };
    });

    let symbol = 'SPY', timeframe = '1Hour', days = 7;
    const configNode = nodes.slice().reverse().find(n => n.type === 'alpaca_config');
    if (configNode && configNode.configValues) {
      symbol = configNode.configValues.symbol || symbol;
      timeframe = configNode.configValues.timeframe || timeframe;
      days = configNode.configValues.days || days;
    }

    return { symbol, timeframe, days, workflow: workflow_blocks, priceType: 'current' };
  };

  // Execute a single workflow request. Returns parsed JSON or throws. Accepts optional AbortSignal.
  const executeWorkflowOnce = async (payload, signal) => {
    if (!payload) throw new Error('No workflow defined');
    const jsonBody = JSON.stringify(payload);
    const endpoints = [
      '/execute_workflow_v2',
      'http://127.0.0.1:5000/execute_workflow_v2',
      'http://localhost:5000/execute_workflow_v2'
    ];
    try {
      const host = window.location.hostname;
      if (host && host !== '127.0.0.1' && host !== 'localhost') {
        endpoints.push(`http://${host}:5000/execute_workflow_v2`);
      }
    } catch (e) { /* ignore */ }

    let lastErr = null;
    for (const url of endpoints) {
      try {
        const r = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: jsonBody,
          signal
        });
        if (!r.ok) {
          const txt = await r.text().catch(() => null);
          throw new Error(`HTTP ${r.status} ${r.statusText} - ${txt || ''}`);
        }
        return await r.json();
      } catch (err) {
        lastErr = err;
        // continue to next endpoint on failure
      }
    }
    throw lastErr || new Error('No endpoints available');
  };

  // Single interactive run (keeps existing alert/health-check UX)
  const runWorkflow = async () => {
    if (!nodes || nodes.length === 0) { alert('Add blocks to create a workflow first'); return; }
    const payload = preparePayload();
    try {
      const data = await executeWorkflowOnce(payload, null);
      if (data.error) throw new Error(data.error);
      setResultsData(data);
      setResultsOpen(true);
      if (data && data.historical_bars && Object.keys(data.historical_bars).length > 0) setPastOpen(true);
      else setPastOpen(false);
    } catch (err) {
      console.error('runWorkflow error', err);
      try {
        const h = await fetch('/health');
        if (h && h.ok) {
          const info = await h.json().catch(() => null);
          const errMsg = err && err.message ? err.message : String(err);
          alert('Failed to execute workflow: backend returned error.\n\nError: ' + errMsg + '\n\nBackend health: ' + JSON.stringify(info));
        } else {
          const errMsg = err && err.message ? err.message : String(err);
          alert('Failed to execute workflow: cannot reach backend.\n\nError: ' + errMsg + '\n\nPlease ensure the backend is running on port 5000. See console for details.');
        }
      } catch (healthErr) {
        const errMsg = err && err.message ? err.message : String(err);
        alert('Failed to execute workflow: network error (could not reach backend).\n\nError: ' + errMsg + '\n\nCheck backend is running and CORS settings. See console for details.');
      }
    }
  };

  // Start/stop live polling loop (1 request per second). Uses AbortController to cancel in-flight fetches.
  const startLive = () => {
    if (liveLoopActiveRef.current) return; // already running
    setLiveRunning(true);
    liveRunningRef.current = true;
    liveLoopActiveRef.current = true;

    (async () => {
      while (liveRunningRef.current) {
        const payload = preparePayload();
        const controller = new AbortController();
        liveAbortRef.current = controller;
        try {
          const data = await executeWorkflowOnce(payload, controller.signal);
          if (data && !data.error) {
            setResultsData(data);
            setResultsOpen(true);
            if (data && data.historical_bars && Object.keys(data.historical_bars).length > 0) setPastOpen(true);
            else setPastOpen(false);
          } else {
            console.warn('Live run returned error payload', data);
          }
        } catch (err) {
          if (err.name === 'AbortError') {
            // expected during stop
          } else {
            console.warn('Live run error', err);
          }
        }

        // wait ~1s between polls, but allow stop to interrupt
        await new Promise((res) => {
          liveTimerRef.current = setTimeout(res, 1000);
        });
      }
      liveLoopActiveRef.current = false;
      liveAbortRef.current = null;
      setLiveRunning(false);
    })();
  };

  const stopLive = () => {
    liveRunningRef.current = false;
    setLiveRunning(false);
    try {
      if (liveAbortRef.current) liveAbortRef.current.abort();
    } catch (e) {}
    try { if (liveTimerRef.current) { clearTimeout(liveTimerRef.current); liveTimerRef.current = null; } } catch (e) {}
  };

  const toggleLive = () => {
    if (liveRunningRef.current) stopLive(); else startLive();
  };

  // cleanup on unmount
  useEffect(() => {
    return () => {
      try { stopLive(); } catch (e) {}
    };
  }, []);

  // Result pulse + last-update timestamp for small animations
  const [resultPulse, setResultPulse] = useState(false);
  const [lastUpdateTs, setLastUpdateTs] = useState(null);

  useEffect(() => {
    if (!resultsData) return;
    setResultPulse(true);
    setLastUpdateTs(Date.now());
    const t = setTimeout(() => setResultPulse(false), 480);
    return () => clearTimeout(t);
  }, [resultsData]);

  // Load a small sample workflow and open sample results for quick testing
  const loadSampleWorkflow = () => {
    const sampleNodes = [
      { id: 1, type: 'fetch', x: 120, y: 80, title: 'Fetch Price' },
      { id: 2, type: 'rsi', x: 360, y: 80, title: 'RSI Check' },
      { id: 3, type: 'signal', x: 600, y: 80, title: 'Signal' }
    ];
    const sampleConns = [
      { id: 'c_1', from: { nodeId: 1, port: 'out' }, to: { nodeId: 2, port: 'in' } },
      { id: 'c_2', from: { nodeId: 2, port: 'out' }, to: { nodeId: 3, port: 'in' } }
    ];
    // ensure nextNodeId is ahead
    nextNodeId.current = Math.max(nextNodeId.current, 4);
    setNodes(sampleNodes);
    setConnections(sampleConns);

    // Create sample results data with small series for sparklines
    const now = Date.now();
    const makeSeries = (base = 100, len = 20) => Array.from({ length: len }, (_, i) => +(base + Math.sin(i / 3) * (i % 3 + 1) + (Math.random() - 0.5) * 2).toFixed(2));
    const sampleData = {
      summary: { strategyName: 'Demo Strategy', status: 'completed' },
      aiAnalysis: 'Sample AI analysis: no anomalies detected. Strategy would have produced modest gains in this demo.',
      blocks: [
        { id: 1, block_type: 'fetch', status: 'passed', execution_time_ms: 12.4, message: 'Fetched price history', params: { symbol: 'NVDA' }, price_series: makeSeries(300) },
        { id: 2, block_type: 'rsi', status: 'passed', execution_time_ms: 8.9, message: 'RSI computed', params: { period: 14 }, price_series: makeSeries(305) },
        { id: 3, block_type: 'signal', status: 'passed', execution_time_ms: 3.1, message: 'Signal emitted: BUY', logs: ['Signal BUY at 345.22'] }
      ],
      signals: [
        { time: now - 1000 * 60 * 60, signal: 'BUY', price: 345.22, series: makeSeries(340, 18) },
        { time: now - 1000 * 60 * 30, signal: 'HOLD', price: 347.10, series: makeSeries(346, 18) }
      ],
      equityCurve: Array.from({ length: 30 }, (_, i) => ({ t: i, v: 10000 + i * (i % 5 === 0 ? 80 : 12) })),
      latest_data: { close: 345.22, volume: 1234500 }
    };

    try { window.lastPanelData = sampleData; } catch (e) {}
    setResultsData(sampleData);
    setResultsOpen(true);
  };

  const downloadResults = () => {
    const payload = resultsData || window.lastPanelData || null;
    if (!payload) { alert('No results available to download'); return; }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `strategy-results-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const animateExecution = async (blockResults) => {
    const total = blockResults.length;
    let processed = 0;

    for (const result of blockResults) {
      // set executing
      setNodes(prev => prev.map(n => n.id === result.block_id ? { ...n, execStatus: 'executing' } : n));
      await new Promise(r => setTimeout(r, 400));

      if (result.status === 'passed') {
        setNodes(prev => prev.map(n => n.id === result.block_id ? { ...n, execStatus: 'passed' } : n));
      } else if (result.status === 'failed') {
        setNodes(prev => prev.map(n => n.id === result.block_id ? { ...n, execStatus: 'failed' } : n));
        // stop and mark subsequent as skipped
        processed++;
        if (typeof window.partialAnalysisUpdate === 'function') window.partialAnalysisUpdate({ processed, total, lastStatus: result.status, halted: true });
        break;
      } else if (result.status === 'skipped') {
        setNodes(prev => prev.map(n => n.id === result.block_id ? { ...n, execStatus: 'skipped' } : n));
      }

      await new Promise(r => setTimeout(r, 200));
      processed++;
      if (typeof window.partialAnalysisUpdate === 'function') window.partialAnalysisUpdate({ processed, total, lastStatus: result.status, halted: false });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const blockType = e.dataTransfer.getData('blockType');
    if (!blockType) return;
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const id = nextNodeId.current++;
    const def = blockDefs[blockType] || { name: blockType, icon: '◼', inputs: [], outputs: [] };
    const newNode = { id, type: blockType, x, y, title: def.name, def };
    setNodes(prev => [...prev, newNode]);
    setSettingsNode(newNode);
    setSettingsOpen(true);
  };

  const openNodeSettings = (node) => {
    setSettingsNode(node);
    setSettingsOpen(true);
  };

  const closeNodeSettings = () => { setSettingsOpen(false); setSettingsNode(null); };

  const saveNodeSettings = (updatedNode) => {
    setNodes(prev => prev.map(n => n.id === updatedNode.id ? { ...n, ...updatedNode } : n));
  };

  const handleDragOver = (e) => { e.preventDefault(); };

  // Improved node dragging with grid snap and bounds
  const updateNodePosition = (nodeId, x, y) => {
    // Snap to grid (15px)
    const snap = v => Math.round(v / 15) * 15;
    const minX = 0, minY = 0, maxX = 5000, maxY = 5000;
    const nx = Math.max(minX, Math.min(maxX, snap(x)));
    const ny = Math.max(minY, Math.min(maxY, snap(y)));
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, x: nx, y: ny } : n));
  };
  // Mouse wheel zoom
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.1 : -0.1;
        setCanvasScale(prev => Math.max(0.3, Math.min(2.5, +(prev + delta).toFixed(2))));
      }
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  // Mouse drag panning
  const onCanvasMouseDown = (e) => {
    // Prevent drag if clicking toolbar
    const toolbarEl = document.querySelector('.workflow-builder-root .app-container > .Toolbar');
    if (toolbarEl && toolbarEl.contains(e.target)) return;
    // Allow panning with middle-button, ctrl/meta + drag, or left-button when clicking empty canvas area
    const isCanvasElement = e.target === canvasRef.current || e.target.classList.contains('canvas');
    if (!(e.button === 1 || e.ctrlKey || e.metaKey || (e.button === 0 && isCanvasElement))) return;
    setPanning(true);
    const start = { x: e.clientX, y: e.clientY };
    const orig = { ...canvasOffset };
    const onMove = (ev) => {
      setCanvasOffset({ x: orig.x + (ev.clientX - start.x), y: orig.y + (ev.clientY - start.y) });
    };
    const onUp = () => {
      setPanning(false);
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  // Touch drag panning (for touch devices)
  const onCanvasTouchStart = (e) => {
    if (!canvasRef.current) return;
    if (!e.touches || e.touches.length !== 1) return;
    // Only start if touch target is the canvas container itself
    const touchTarget = e.target;
    const isCanvasEl = touchTarget === canvasRef.current || touchTarget.classList.contains('canvas');
    if (!isCanvasEl) return;
    const t = e.touches[0];
    setPanning(true);
    const start = { x: t.clientX, y: t.clientY };
    const orig = { ...canvasOffset };

    const onMove = (ev) => {
      const t2 = ev.touches && ev.touches[0];
      if (!t2) return;
      // prevent the page from scrolling while panning
      if (ev.cancelable) ev.preventDefault();
      setCanvasOffset({ x: orig.x + (t2.clientX - start.x), y: orig.y + (t2.clientY - start.y) });
    };

    const onEnd = () => {
      setPanning(false);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };

    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);
  };

  const deleteNode = (nodeId) => {
    setNodes(prev => prev.filter(n => n.id !== nodeId));
  };

  // Connection handling
  // Click-to-connect: click output port, then show temp line to mouse
  const startConnection = (nodeId, port, portType) => {
    if (portType !== 'output') return;
    setConnecting({ from: { nodeId, port }, x: null, y: null });
    // Listen for mousemove to update temp line
    const onMove = (ev) => {
      setConnecting(prev => prev ? { ...prev, x: ev.clientX, y: ev.clientY } : null);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  };

  const endConnection = (nodeId, port, portType) => {
    // called when click on input port directly
    if (!connecting) return;
    if (portType !== 'input') return;
    const conn = { id: `c_${Date.now()}_${Math.floor(Math.random()*1000)}`, from: { ...connecting.from }, to: { nodeId, port } };
    setConnections(prev => [...prev, conn]);
    setConnecting(null);
  };

  const selectConnection = (connId) => {
    setSelectedConnection(connId);
  };

  const deleteConnection = (connId) => {
    setConnections(prev => prev.filter(c => c.id !== connId));
    if (selectedConnection === connId) setSelectedConnection(null);
  };

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedConnection) deleteConnection(selectedConnection);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selectedConnection]);

  const [chartDrawerMinimized, setChartDrawerMinimized] = useState(false);
  const [chartDrawerExpanded, setChartDrawerExpanded] = useState(false);
  const [backtestOpen, setBacktestOpen] = useState(false);

  return (
    <div className="workflow-builder-root">
      <div className="app-container">
        <Sidebar />

        {/* Remove previous zoom controls from top left */}
        {/* <div style={{ position: 'absolute', top: 16, left: 16, zIndex: 100, display: 'flex', gap: 8 }}>
          <button className="toolbar-btn" title="Zoom In" onClick={() => setCanvasScale(s => Math.min(2.5, +(s + 0.15).toFixed(2)))}>＋</button>
          <button className="toolbar-btn" title="Zoom Out" onClick={() => setCanvasScale(s => Math.max(0.3, +(s - 0.15).toFixed(2)))}>－</button>
          <button className="toolbar-btn" title="Reset Zoom" onClick={() => { setCanvasScale(1); setCanvasOffset({x:0,y:0}); }}>⦿</button>
        </div> */}

        {/* Ensure top right toolbar is always above canvas */}
        <div style={{ position: 'fixed', top: 16, right: 32, zIndex: 6000, display: 'flex', gap: 8, alignItems: 'center' }}>
          <Toolbar onSave={saveWorkflow} onLoad={loadWorkflow} onExport={exportWorkflow} onImport={importWorkflow} onClear={clearWorkflow} onOrganize={null} onRun={runWorkflow} onSample={loadSampleWorkflow} onToggleMonitor={() => setChartDrawerMinimized(m => !m)} onRunToggle={toggleLive} onBacktest={() => setBacktestOpen(true)} liveRunning={liveRunning} />
        </div>

        <div className="canvas-container">
          {/* Minimap and zoom controls together */}
          <div style={{ position: 'absolute', bottom: 24, right: 32, zIndex: 100, display: 'flex', alignItems: 'flex-end', gap: 12 }}>
            <div className="minimap" id="minimap">
              <canvas className="minimap-canvas" id="minimapCanvas"></canvas>
              <div className="minimap-viewport" id="minimapViewport"></div>
            </div>
            <div className="zoom-controls" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button className="toolbar-btn" title="Zoom In" onClick={() => setCanvasScale(s => Math.min(2.5, +(s + 0.15).toFixed(2)))}>＋</button>
              <button className="toolbar-btn" title="Zoom Out" onClick={() => setCanvasScale(s => Math.max(0.3, +(s - 0.15).toFixed(2)))}>－</button>
              <button className="toolbar-btn" title="Reset Zoom" onClick={() => { setCanvasScale(1); setCanvasOffset({x:0,y:0}); }}>⦿</button>
            </div>
          </div>

          <svg className="connection-layer" id="connectionLayer" ref={svgRef} style={{ transform: `scale(${canvasScale}) translate(${canvasOffset.x}px,${canvasOffset.y}px)` }}>
            <defs>
              <marker id="arrowhead" markerWidth="10" markerHeight="10" refX="9" refY="3" orient="auto" markerUnits="strokeWidth">
                <polygon points="0 0, 10 3, 0 6" fill="#5e8cff" />
              </marker>
            </defs>
            <Connections svgRef={svgRef} connections={connections} connecting={connecting && connecting.x !== null && connecting.y !== null ? connecting : null} nodes={nodes} canvasScale={canvasScale} canvasOffset={canvasOffset} />
          </svg>
          <div className={`canvas${panning ? ' panning' : ''}`} id="canvas" ref={canvasRef} onDrop={handleDrop} onDragOver={handleDragOver} onMouseDown={onCanvasMouseDown} style={{ transform: `scale(${canvasScale}) translate(${canvasOffset.x}px,${canvasOffset.y}px)` }}>
            {nodes.map(node => (
              <Node key={node.id} node={node} onUpdatePosition={updateNodePosition} onDelete={deleteNode} onStartConnection={startConnection} onEndConnection={endConnection} onOpenSettings={openNodeSettings} />
            ))}
          </div>

          <input ref={importInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportFile} />

          <div className="status-bar">
            <div className="status-item">
                <div className={`status-dot ${liveRunning ? 'live' : ''}`}></div>
                <span>{liveRunning ? 'Live' : 'Ready'}</span>
                {lastUpdateTs ? <span className="last-update">{new Date(lastUpdateTs).toLocaleTimeString()}</span> : null}
            </div>
            <div className="status-item">
              <span id="nodeCount">0 blocks</span>
            </div>
            <div className="status-item">
              <span id="connectionCount">0 connections</span>
            </div>
          </div>
        </div>

        <ResultsPanel data={resultsData} open={resultsOpen} onClose={() => setResultsOpen(false)} onRerun={runWorkflow} onDownload={downloadResults} />
        <NodeSettings node={settingsNode} open={settingsOpen} onClose={closeNodeSettings} onSave={saveNodeSettings} />

        {/* PastDataViewer is embedded into the chart drawer below */}

        <StrategyMonitorDrawer open={!chartDrawerMinimized} onClose={() => setChartDrawerMinimized(true)} resultsData={resultsData} />
        
        {/* Backtest modal (MVP) */}
        {backtestOpen ? <BacktestModal open={backtestOpen} onClose={() => setBacktestOpen(false)} /> : null}
        <div className="results-panel" id="resultsPanel">
          <div className="results-panel-header">
            <div className="results-panel-title">
              <div className="results-panel-icon">⚡</div>
              <div>
                Strategy Insights
                <div className="results-section-subtitle" id="resultsPanelStatus">Ready</div>
              </div>
            </div>
            <button className="results-panel-close" onClick={() => { if (window.toggleResultsPanel) window.toggleResultsPanel(); }} title="Close Panel">×</button>
          </div>
          <div className="results-panel-body">
            <div className="results-section">
              <div className="results-section-header">
                <div className="results-section-icon" style={{ background: 'linear-gradient(135deg, #1a2a2a 0%, #0f172a 100%)' }}>🚀</div>
                <div>
                  <div className="results-section-title">Latest Confirmed Signal</div>
                  <div className="results-section-subtitle">Most recent strategy decision</div>
                </div>
              </div>
              <div id="latestSignalBox" className="output-section">
                {resultsData && resultsData.latest_data ? (
                  <div className={`output-text ${resultPulse ? 'flash' : ''}`} style={{ color: '#9ca3af' }}>
                    <div style={{ fontWeight: 700, color: '#e5e7eb' }}>Price: {resultsData.latest_data.close}</div>
                    <div style={{ fontSize: 12, color: '#9ca3af' }}>{resultsData.finalSignal ? `Signal: ${resultsData.finalSignal}` : (resultsData.summary && resultsData.summary.status ? `Status: ${resultsData.summary.status}` : '')}</div>
                  </div>
                ) : (
                  <div className={`output-text ${resultPulse ? 'flash' : ''}`} style={{ color: '#9ca3af' }}>No confirmed signal yet. Run your workflow to see the latest decision here.</div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default WorkflowBuilder;
