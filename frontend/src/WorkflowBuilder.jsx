import React, { useEffect, useState, useRef, useCallback } from 'react';
import './workflow_builder.css';
import BackButton from './components/BackButton';
import DashboardSidebar from './components/DashboardSidebar';
import Sidebar from './components/Sidebar';
import Toolbar from './components/Toolbar';
import Node from './components/Node';
import blockDefs from './blockDefs';
import Connections from './components/Connections';
import ResultsPanel from './components/ResultsPanel';
import NodeSettings from './components/NodeSettings';
import PastDataViewer from './components/StrategyResults/PastDataViewer';
import BacktestModal from './components/BacktestModal';
import Icon from './components/Icon';
import { trackTrade, getCurrentPosition } from './tradeTracker';
import { loadTemplate } from './strategyTemplates';

const WorkflowBuilder = ({ onNavigate }) => {
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
  const ALERTS_KEY = 'flowgrid_alerts_v1';
  const lastAlertSignatureRef = useRef(null);

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
      try { localStorage.setItem('workflow_active_id', name); } catch (e) {}
      // Dispatch event so Dashboard can update strategies panel
      window.dispatchEvent(new CustomEvent('flowgrid:strategy-saved', { detail: { name, payload } }));
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
      try { localStorage.setItem('workflow_active_id', pick); } catch (e) {}
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

  const normalizeSignalLabel = useCallback((raw) => {
    if (!raw) return 'HOLD';
    const text = String(raw).toUpperCase();
    if (text.includes('BUY') || text.includes('LONG')) return 'BUY';
    if (text.includes('SELL') || text.includes('SHORT')) return 'SELL';
    if (text.includes('HOLD')) return 'HOLD';
    return 'HOLD';
  }, []);

  const persistAlertEntry = useCallback((data, contextLabel = 'manual-run') => {
    if (!data) return;
    try {
      const signal = normalizeSignalLabel(data.finalSignal || data.final_decision || data.summary?.status || '');
      const latest = data.latest_data || {};
      const priceVal = latest.price ?? latest.close ?? latest.last ?? latest.current_price ?? null;
      const priceNum = priceVal != null && !Number.isNaN(Number(priceVal)) ? Number(priceVal) : null;
      const activeId = (() => {
        try { return localStorage.getItem('workflow_active_id'); } catch (e) { return null; }
      })();
      const strategyName = activeId || 'Builder Session';
      const symbol = data.summary?.symbol || latest.symbol || '';
      const timeframe = data.summary?.timeframe || '';
      const entry = {
        id: `${Date.now()}`,
        strategyId: activeId,
        strategyName,
        signal,
        price: priceNum,
        symbol,
        timeframe,
        timestamp: new Date().toISOString(),
        source: contextLabel
      };
      const priceSig = priceNum != null ? priceNum.toFixed(4) : 'na';
      const signature = `${entry.strategyId || 'adhoc'}|${signal}|${priceSig}|${symbol}|${timeframe}`;
      const prevSignature = lastAlertSignatureRef.current;
      lastAlertSignatureRef.current = signature;

      const raw = localStorage.getItem(ALERTS_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      let updated = Array.isArray(parsed) ? [...parsed] : [];
      if (prevSignature === signature && updated.length) {
        updated[0] = { ...updated[0], ...entry, signature };
      } else if (updated.length && updated[0]?.strategyId === entry.strategyId && updated[0]?.signal === entry.signal && updated[0]?.symbol === entry.symbol) {
        updated[0] = { ...updated[0], ...entry, signature };
      } else {
        updated.unshift({ ...entry, signature });
      }
      if (updated.length > 15) updated = updated.slice(0, 15);
      localStorage.setItem(ALERTS_KEY, JSON.stringify(updated));
      window.dispatchEvent(new Event('flowgrid:alerts-updated'));
    } catch (err) {
      console.warn('[Builder] Failed to persist alert entry', err);
    }
  }, [normalizeSignalLabel]);

  const loadWorkflowById = useCallback((workflowId, options = {}) => {
    if (!workflowId) return false;
    try {
      const raw = localStorage.getItem(SAVES_KEY) || '{}';
      const map = JSON.parse(raw);
      const saved = map[workflowId];
      if (!saved || !Array.isArray(saved.nodes) || saved.nodes.length === 0) return false;
      const normalized = normalizeIds(saved.nodes || [], saved.connections || []);
      setNodes(normalized.nodes);
      setConnections(normalized.connections);
      if (options.setActive !== false) {
        try { localStorage.setItem('workflow_active_id', workflowId); } catch (e) {}
      }
      const shouldEmit = options.emitLoadRequest !== false;
      if (shouldEmit) {
        try { localStorage.setItem('flowgrid_workflow_v1::load_request', workflowId); } catch (e) {}
      }
      if (options.autoStart) {
        try { localStorage.setItem('flowgrid_pending_live_start', '1'); } catch (e) {}
        try { localStorage.setItem('workflow_live', '1'); } catch (e) {}
      }
      return true;
    } catch (err) {
      console.error('[Builder] loadWorkflowById error', err);
      return false;
    }
  }, [setNodes, setConnections]);

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
    try { localStorage.removeItem('workflow_active_id'); } catch (e) {}
    try { localStorage.removeItem('flowgrid_workflow_v1::load_request'); } catch (e) {}
  };

  const newWorkflow = () => {
    // Clear without confirmation - user clicked "New" intentionally
    setNodes([]);
    setConnections([]);
    stopLive(); // Stop any running workflow
    try { 
      localStorage.setItem('workflow_live', '0');
      localStorage.removeItem('workflow_active_id');
      localStorage.removeItem('flowgrid_workflow_v1::load_request');
    } catch (e) {}
    console.log('[Builder] Started new workflow (cleared canvas)');
  };

  // Expose a small helper UI via window for quick access to saved workflows.
  useEffect(() => {
    window.listSavedWorkflows = listSavedWorkflows;
    window.deleteSavedWorkflow = deleteSavedWorkflow;
    // Allow other UI parts to access saved workflows utilities
    return () => {
      try { delete window.listSavedWorkflows; } catch (e) {}
      try { delete window.deleteSavedWorkflow; } catch (e) {}
      // cleanup
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
    // Expose toggle/open/close helpers for the legacy insights panel
    try {
      // Toggle the React-driven results panel instead of manipulating DOM directly
      window.toggleResultsPanel = (force) => {
        try {
          if (typeof force === 'boolean') setResultsOpen(!!force);
          else setResultsOpen(prev => !prev);
        } catch (e) { console.warn('toggleResultsPanel error', e); }
      };
    } catch (e) {}
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
    // Prefer symbol/timeframe/days from the last price-input node's config (input/price_history/volume_history)
    const inputNode = nodes.slice().reverse().find(n => priceInputTypes.has(n.type) && n.configValues && (n.configValues.symbol || n.configValues.timeframe || n.configValues.days));
    if (inputNode && inputNode.configValues) {
      symbol = inputNode.configValues.symbol || symbol;
      timeframe = inputNode.configValues.timeframe || timeframe;
      days = inputNode.configValues.days || days;
    }

    // Include Alpaca API keys from localStorage so backend can fetch price data server-side
    let alpacaKeyId = null; let alpacaSecretKey = null;
    try { alpacaKeyId = localStorage.getItem('alpaca_key_id') || null; alpacaSecretKey = localStorage.getItem('alpaca_secret_key') || null; } catch (e) {}

    // Get strategy name from localStorage
    let strategy_name = null;
    try { strategy_name = localStorage.getItem('workflow_active_id') || null; } catch (e) {}

    // Include connections for graph-based execution
    const connectionsPayload = (connections || []).map(c => ({
      id: c.id,
      from: { nodeId: c.from?.nodeId || c.fromNodeId, port: c.from?.port || c.fromPort },
      to: { nodeId: c.to?.nodeId || c.toNodeId, port: c.to?.port || c.toPort }
    }));

    return { symbol, timeframe, days, workflow: workflow_blocks, connections: connectionsPayload, priceType: 'current', alpacaKeyId, alpacaSecretKey, strategy_name };
  };

  // Execute a single workflow request. Returns parsed JSON or throws. Accepts optional AbortSignal.
  const executeWorkflowOnce = async (payload, signal) => {
    if (!payload) throw new Error('No workflow defined');
    const jsonBody = JSON.stringify(payload);
    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    const endpoints = [
      `${baseUrl}/execute_workflow_v2`,
      '/execute_workflow_v2',
      `${(typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE) ? import.meta.env.VITE_API_BASE.replace(/\/$/, '') : 'http://127.0.0.1:5000'}/execute_workflow_v2`,
      'http://localhost:5000/execute_workflow_v2'
    ];

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
    
    // Clear any previous execution status
    setNodes(prev => prev.map(n => ({ ...n, execStatus: null })));
    
    try {
      const data = await executeWorkflowOnce(payload, null);
      if (data.error) throw new Error(data.error);
      
      // Animate node execution based on unified_debug results
      const nodeOutputs = data.unified_debug?.node_outputs || {};
      const executionOrder = data.unified_debug?.execution_order || [];
      const blocks = data.blocks || [];
      
      console.log('[WorkflowBuilder] Animation data:', { executionOrder, nodeOutputs: Object.keys(nodeOutputs), blocks: blocks.length, nodeIds: nodes.map(n => n.id) });
      
      // Helper to determine node pass/fail status
      const getNodeStatus = (nodeIdStr) => {
        // Check unified_debug outputs first
        const outputs = nodeOutputs[nodeIdStr] || {};
        
        // Check if indicator computed a value successfully
        const hasIndicatorValue = outputs.rsi !== undefined || outputs.ema !== undefined || 
          outputs.sma !== undefined || outputs.macd !== undefined || outputs.vwap !== undefined || 
          outputs.stochastic_k !== undefined || outputs.atr !== undefined || outputs.upper !== undefined || 
          outputs.histogram !== undefined || outputs.obv !== undefined || outputs.value !== undefined;
        
        // Check explicit signal/result flags
        const hasPassSignal = outputs.result === true || outputs.signal === true || outputs.condition_met === true;
        const hasFailSignal = outputs.result === false || outputs.signal === false || outputs.condition_met === false;
        
        // If indicator produced a value, it passed (unless signal explicitly false)
        if (hasIndicatorValue && !hasFailSignal) return 'passed';
        if (hasPassSignal) return 'passed';
        if (hasFailSignal) return 'failed';
        
        // Check blocks array fallback
        const block = blocks.find(b => String(b.block_id) === nodeIdStr);
        if (block) {
          if (block.status === 'passed') return 'passed';
          if (block.status === 'failed') return 'failed';
        }
        
        // Default: if node was executed, consider it passed
        return 'passed';
      };
      
      // Determine animation order - prefer execution_order, fall back to nodes array
      let animationOrder = executionOrder.length > 0 
        ? executionOrder.map(id => String(id))
        : nodes.map(n => String(n.id));
      
      // Animate each node in sequence
      for (const nodeIdStr of animationOrder) {
        // Skip if node doesn't exist
        if (!nodes.find(n => String(n.id) === nodeIdStr)) continue;
        
        // Mark as executing
        setNodes(prev => prev.map(n => String(n.id) === nodeIdStr ? { ...n, execStatus: 'executing' } : n));
        await new Promise(r => setTimeout(r, 200)); // Visual delay
        
        // Determine and set final status
        const status = getNodeStatus(nodeIdStr);
        setNodes(prev => prev.map(n => String(n.id) === nodeIdStr ? { ...n, execStatus: status } : n));
        await new Promise(r => setTimeout(r, 150)); // Brief delay between nodes
      }
      
      setResultsData(data);
      try { window.__monitor_resultsData = data; } catch (e) {}
      try { localStorage.setItem('monitor_results', JSON.stringify(data)); } catch (e) {}
      // Auto-save current workflow before opening analytics in a new tab so user stays in builder
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, connections })); } catch (e) {}
      // Do not auto-open the Analytics page; user can open Analytics manually.
      // Ensure the insights panel is visible in the builder (legacy panel)
      try { if (window.toggleResultsPanel) window.toggleResultsPanel(true); } catch (e) {}
      setResultsOpen(true);
      if (data && data.historical_bars && Object.keys(data.historical_bars).length > 0) setPastOpen(true);
      else setPastOpen(false);
      persistAlertEntry(data, 'manual-run');
    } catch (err) {
      console.error('runWorkflow error', err);
      // Mark all nodes as failed on error
      setNodes(prev => prev.map(n => ({ ...n, execStatus: 'failed' })));
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
            try { window.__monitor_resultsData = data; } catch (e) {}
            try { localStorage.setItem('monitor_results', JSON.stringify(data)); } catch (e) {}
            // Auto-save current workflow before opening analytics in a new tab so user stays in builder
            try { localStorage.setItem(STORAGE_KEY, JSON.stringify({ nodes, connections })); } catch (e) {}
              // Do not auto-open Analytics on live polling; keep updates local to the builder.
              // Ensure the insights panel is visible in the builder (legacy panel)
              try { if (window.toggleResultsPanel) window.toggleResultsPanel(true); } catch (e) {}
            setResultsOpen(true);
            if (data && data.historical_bars && Object.keys(data.historical_bars).length > 0) setPastOpen(true);
            else setPastOpen(false);
            persistAlertEntry(data, 'live-tick');

            // Track live trades when strategy is running
            try {
              const strategyName = localStorage.getItem('workflow_active_id') || 'Unnamed Strategy';
              const symbol = payload.symbol || 'SPY';
              const timeframe = payload.timeframe || '1Hour';
              trackTrade(data, {
                strategyId: strategyName,
                strategyName: strategyName,
                symbol: symbol,
                timeframe: timeframe,
                shares: 100 // Could make configurable
              });
            } catch (err) {
              console.warn('[WorkflowBuilder] Trade tracking error', err);
            }
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
    if (liveRunningRef.current) {
      stopLive();
      try { localStorage.setItem('workflow_live', '0'); } catch (e) {}
    } else {
      startLive();
      try { localStorage.setItem('workflow_live', '1'); } catch (e) {}
    }
  };

  useEffect(() => {
    const bridge = {
      loadWorkflowById,
      startLive: () => {
        if (!liveRunningRef.current) {
          try { localStorage.setItem('workflow_live', '1'); } catch (e) {}
          startLive();
        }
      },
      stopLive: () => {
        if (liveRunningRef.current) {
          stopLive();
          try { localStorage.setItem('workflow_live', '0'); } catch (e) {}
        }
      },
      isLiveRunning: () => !!liveRunningRef.current,
      resetWorkflow: (options = {}) => {
        // Clear canvas for new workflow
        setNodes([]);
        setConnections([]);
        stopLive();
        try {
          localStorage.setItem('workflow_live', '0');
          localStorage.removeItem('workflow_active_id');
          localStorage.removeItem('flowgrid_workflow_v1::load_request');
        } catch (e) {}
        console.log('[Builder] Reset workflow via bridge');
      }
    };
    window.flowgridLiveBridge = bridge;
    return () => {
      if (window.flowgridLiveBridge === bridge) delete window.flowgridLiveBridge;
    };
  }, [loadWorkflowById, startLive, stopLive]);

  // cleanup on unmount
  useEffect(() => {
    return () => {
      try { stopLive(); } catch (e) {}
    };
  }, []);

  // Start live run when nodes are populated and pending flag is set
  useEffect(() => {
    if (nodes.length > 0) {
      try {
        const pending = localStorage.getItem('flowgrid_pending_live_start');
        if (pending === '1') {
          console.log(`[Builder] Nodes ready (${nodes.length} nodes), starting pending live run...`);
          localStorage.removeItem('flowgrid_pending_live_start');
          if (!liveRunningRef.current) {
            startLive();
          }
        }
      } catch (e) { console.error('[Builder] pending live start check error', e); }
    }
  }, [nodes]);

  // Persisted live-run: start/stop based on localStorage so the run state survives navigation/refresh.
  useEffect(() => {
    // On mount, read desired live state
    console.log('[Builder] Checking workflow_live on mount...');
    try {
      const val = localStorage.getItem('workflow_live');
      console.log(`[Builder] workflow_live = "${val}", liveRunning = ${liveRunningRef.current}`);
      if (val === '1' && !liveRunningRef.current) {
        console.log('[Builder] Starting live run from mount...');
        startLive();
      }
    } catch (e) { console.error('[Builder] mount check error', e); }

    const handler = (e) => {
      try {
        if (!e) return;
        console.log(`[Builder] storage event: key="${e.key}", newValue="${e.newValue}"`);
        if (e.key === 'workflow_live') {
          const v = e.newValue;
          if (v === '1') {
            console.log('[Builder] workflow_live changed to 1, starting...');
            if (!liveRunningRef.current) startLive();
          } else {
            console.log('[Builder] workflow_live changed to 0, stopping...');
            if (liveRunningRef.current) stopLive();
          }
        }
      } catch (err) { console.error('[Builder] storage handler error', err); }
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Listen for dashboard load requests: when user clicks a saved strategy, dashboard writes
  // `flowgrid_workflow_v1::load_request` with the saved name. Load it into the builder.
  useEffect(() => {
    const tryLoadRequest = () => {
      try {
        // Check if this is a new workflow request - if so, skip loading
        const newWorkflowRequest = localStorage.getItem('flowgrid_new_workflow_request');
        if (newWorkflowRequest) {
          console.log('[Builder] New workflow request detected, skipping load request');
          try { localStorage.removeItem('flowgrid_new_workflow_request'); } catch (e) {}
          try { localStorage.removeItem('flowgrid_workflow_v1::load_request'); } catch (e) {}
          return;
        }
        
        const req = localStorage.getItem('flowgrid_workflow_v1::load_request');
        console.log('[Builder] tryLoadRequest - load_request value:', req);
        if (!req) return;
        const raw = localStorage.getItem(SAVES_KEY) || '{}';
        const map = JSON.parse(raw);
        if (!map[req]) {
          console.warn('[Builder] load_request for unknown save:', req);
          try { localStorage.removeItem('flowgrid_workflow_v1::load_request'); } catch (e) {}
          return;
        }
        const parsed = map[req];
        if (!parsed || !parsed.nodes) {
          console.warn('[Builder] Saved workflow has no nodes:', req);
          try { localStorage.removeItem('flowgrid_workflow_v1::load_request'); } catch (e) {}
          return;
        }
        const normalized = normalizeIds(parsed.nodes || [], parsed.connections || []);
        console.log(`[Builder] Loading workflow "${req}" with ${normalized.nodes.length} nodes`);
        setNodes(normalized.nodes);
        setConnections(normalized.connections);
        try { localStorage.setItem('workflow_active_id', req); } catch (e) {}
        console.log(`[Builder] Loaded workflow from load_request: "${req}" with ${normalized.nodes.length} nodes`);
        // remove the request so it doesn't reload repeatedly
        try { localStorage.removeItem('flowgrid_workflow_v1::load_request'); } catch (e) {}
        
        // Mark that we should start live after nodes are set
        if (normalized.nodes.length > 0) {
          try {
            const liveFlag = localStorage.getItem('workflow_live');
            if (liveFlag === '1') {
              console.log('[Builder] workflow_live is 1, will start after nodes render');
              // Set a flag so the nodes effect can start live run
              localStorage.setItem('flowgrid_pending_live_start', '1');
            }
          } catch (e) { console.error('[Builder] failed to check workflow_live', e); }
        }
      } catch (e) { console.error('[Builder] failed to process load_request', e); }
    };

    // process any pending request on mount
    tryLoadRequest();

    // watch for future requests (cross-tab)
    const onStorage = (e) => {
      if (!e || !e.key) return;
      if (e.key === 'flowgrid_workflow_v1::load_request') {
        console.log('[Builder] Storage event for load_request');
        tryLoadRequest();
      }
    };
    const onCustomLoad = (e) => {
      console.log('[Builder] Custom load-request event:', e.detail);
      setTimeout(tryLoadRequest, 10); // Small delay to ensure localStorage is updated
    };
    window.addEventListener('storage', onStorage);
    window.addEventListener('flowgrid:load-request', onCustomLoad);
    return () => {
      window.removeEventListener('storage', onStorage);
      window.removeEventListener('flowgrid:load-request', onCustomLoad);
    };
  }, []);

  // Listen for cross-tab stop signal from Analytics/Monitor
  useEffect(() => {
    const handler = (e) => {
      try {
        if (!e) return;
        if (e.key === 'monitor_stop') {
          try { stopLive(); } catch (ee) {}
        }
      } catch (err) {}
    };
    window.addEventListener('storage', handler);
    return () => window.removeEventListener('storage', handler);
  }, []);

  // Listen for clear-builder event from Dashboard
  useEffect(() => {
    const handleClear = () => {
      console.log('[Builder] Received clear-builder event, clearing canvas');
      setNodes([]);
      setConnections([]);
      try { 
        localStorage.removeItem('workflow_active_id');
        localStorage.removeItem('flowgrid_workflow_v1::load_request');
      } catch (e) {}
    };
    window.addEventListener('flowgrid:clear-builder', handleClear);
    return () => window.removeEventListener('flowgrid:clear-builder', handleClear);
  }, []);

  // Listen for new-workflow event from Dashboard (Start New Strategy button)
  useEffect(() => {
    const handleNewWorkflow = () => {
      console.log('[Builder] Received new-workflow event, resetting canvas');
      setNodes([]);
      setConnections([]);
      stopLive();
      try { 
        localStorage.setItem('workflow_live', '0');
        localStorage.removeItem('workflow_active_id');
        localStorage.removeItem('flowgrid_workflow_v1::load_request');
        // Clear any saved enabled states that might auto-load
        const saves = localStorage.getItem(SAVES_KEY);
        if (saves) {
          const map = JSON.parse(saves);
          Object.keys(map).forEach(id => {
            try { localStorage.setItem(`flowgrid_saved_enabled::${id}`, '0'); } catch (e) {}
          });
        }
      } catch (e) {}
    };
    window.addEventListener('flowgrid:new-workflow', handleNewWorkflow);
    return () => window.removeEventListener('flowgrid:new-workflow', handleNewWorkflow);
  }, []);

  // WebSocket client to receive node-emitted messages from backend broadcaster
  // Maintain small per-node sliding buffers for time-series overlays
  const [wsNodeBuffers, setWsNodeBuffers] = useState({}); // node_id -> { name, buf: [{t, v}], last }
  // keep a global reference so monitor in other pages can read live updates
  useEffect(() => {
    try { window.__monitor_nodeBuffers = wsNodeBuffers; } catch (e) {}
    try {
      const simple = {};
      Object.entries(wsNodeBuffers || {}).forEach(([k, v]) => { simple[k] = (v && v.last != null) ? v.last : null; });
      localStorage.setItem('monitor_node_buffers', JSON.stringify(simple));
    } catch (e) {}
  }, [wsNodeBuffers]);
  useEffect(() => {
    let ws = null;
    let closed = false;
    let backoff = 500;
    let shouldReconnect = true;
    const MAX_SERIES = 240;

    const connect = () => {
      try {
        ws = new WebSocket('ws://127.0.0.1:6789');
      } catch (e) {
        // Silently handle WebSocket connection failure (backend not running)
        scheduleReconnect();
        return;
      }

      ws.onopen = () => {
        console.debug('[WS] connected');
        backoff = 500;
        try { window.__wsConnected = true; } catch (e) {}
      };

      ws.onmessage = (evt) => {
        try {
          const msg = JSON.parse(evt.data);
          // expected shape: { node_id, node_name, value, tick }
          if (!msg || !msg.node_id) return;
          // normalize timestamp (expect tick.ts in seconds)
          const ts = msg.tick && (msg.tick.ts || msg.tick.t || msg.tick.time) ? Number(msg.tick.ts || msg.tick.t || msg.tick.time) : null;
          const tms = ts ? (ts > 1e12 ? ts : ts * 1000) : Date.now();
          // determine numeric value for overlay: if value is number, use it; if object, try common fields
          let v = msg.value;
          if (v && typeof v === 'object') {
            // try typical indicator fields
            if (typeof v.v !== 'undefined') v = v.v;
            else if (typeof v.value !== 'undefined') v = v.value;
            else if (typeof v.macd !== 'undefined') v = v.macd; // fallback
            else v = null;
          }
          const valueNum = (v == null) ? null : Number(v);
          setWsNodeBuffers(prev => {
            const next = { ...(prev || {}) };
            const cur = next[msg.node_id] || { name: msg.node_name || msg.node_id, buf: [], last: null };
            if (Number.isFinite(valueNum)) {
              cur.buf = [...cur.buf.slice(-MAX_SERIES + 1), { t: tms, v: valueNum }];
              cur.last = valueNum;
            } else {
              cur.last = (msg.value != null ? msg.value : cur.last);
            }
            cur.name = msg.node_name || cur.name;
            next[msg.node_id] = cur;
            try { window.__nodeBuffers = next; } catch (e) {}
            return next;
          });
        } catch (e) { console.warn('Failed to parse WS message', e); }
      };

      ws.onclose = () => {
        console.debug('[WS] closed');
        try { window.__wsConnected = false; } catch (e) {}
        if (!closed && shouldReconnect) scheduleReconnect();
      };

      ws.onerror = (err) => {
        // Silently handle WebSocket error (backend not running)
        try { ws.close(); } catch (e) {}
      };
    };

    const scheduleReconnect = () => {
      setTimeout(() => {
        if (closed || !shouldReconnect) return;
        backoff = Math.min(10000, backoff * 1.5);
        connect();
      }, backoff);
    };

    connect();

    return () => {
      closed = true;
      shouldReconnect = false;
      try { if (ws) ws.close(); } catch (e) {}
      try { window.__wsConnected = false; } catch (e) {}
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
    
    // Check if this is a template drop
    if (blockType.startsWith('template-')) {
      const template = loadTemplate(blockType);
      if (template) {
        // Clear existing nodes and load template
        const canvas = canvasRef.current;
        const rect = canvas.getBoundingClientRect();
        const dropX = e.clientX - rect.left;
        const dropY = e.clientY - rect.top;
        
        // Offset template nodes based on drop position
        const offsetX = dropX - 80; // First node is typically at x=80
        const offsetY = dropY - 120; // First node is typically at y=120
        
        const adjustedNodes = template.nodes.map(node => ({
          ...node,
          x: node.x + offsetX,
          y: node.y + offsetY,
          def: blockDefs[node.type] || { name: node.title || node.type, icon: '◼', inputs: [], outputs: [] }
        }));
        
        // Update nextNodeId to be higher than any template node id
        const maxId = Math.max(...template.nodes.map(n => n.id));
        nextNodeId.current = Math.max(nextNodeId.current, maxId + 1);
        
        // If canvas is empty, replace; otherwise, add to existing
        if (nodes.length === 0) {
          setNodes(adjustedNodes);
          setConnections(template.connections);
        } else {
          // Add template nodes with new IDs to avoid conflicts
          const idOffset = nextNodeId.current;
          const remappedNodes = template.nodes.map(node => ({
            ...node,
            id: node.id + idOffset,
            x: node.x + offsetX,
            y: node.y + offsetY,
            def: blockDefs[node.type] || { name: node.title || node.type, icon: '◼', inputs: [], outputs: [] }
          }));
          const remappedConnections = template.connections.map(conn => ({
            ...conn,
            id: `${conn.id}_${idOffset}`,
            from: { ...conn.from, nodeId: conn.from.nodeId + idOffset },
            to: { ...conn.to, nodeId: conn.to.nodeId + idOffset }
          }));
          nextNodeId.current = idOffset + maxId + 1;
          setNodes(prev => [...prev, ...remappedNodes]);
          setConnections(prev => [...prev, ...remappedConnections]);
        }
        return;
      }
    }
    
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

  // Update node config directly (used for inline text editing in note nodes)
  const updateNodeConfig = (nodeId, newConfig) => {
    setNodes(prev => prev.map(n => n.id === nodeId ? { ...n, config: newConfig } : n));
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
        {/* Main navigation sidebar - always visible */}
        <DashboardSidebar onNavigate={onNavigate} activeRoute="builder" />
        
        {/* Strategy Builder Top Bar */}
        <div className="builder-topbar">
          <div className="topbar-left">
            <span className="topbar-title">Strategy Builder</span>
          </div>
          <div className="topbar-right">
            <button className="topbar-btn" title="Auto-arrange blocks" onClick={null}>Organize</button>
            <button className="topbar-btn" title="Clear canvas" onClick={clearWorkflow}>Clear</button>
            <span className="topbar-divider" />
            <button className="topbar-btn" title="Save workflow" onClick={saveWorkflow}>Save</button>
            <button className="topbar-btn" title="Load workflow from file" onClick={importWorkflow}>Import</button>
            <button className="topbar-btn" title="Export workflow" onClick={exportWorkflow}>Export</button>
            <span className="topbar-divider" />
            <div className="topbar-run">
              <span>Run Strategy</span>
              <label className={`run-switch ${liveRunning ? 'on' : 'off'}`} title="Toggle continuous run">
                <input aria-label="Run Strategy" type="checkbox" checked={liveRunning} onChange={toggleLive} />
                <span className="slider"></span>
              </label>
            </div>
          </div>
        </div>
        
        {/* Drag-drop blocks sidebar */}
        <Sidebar />

        <div className="canvas-container">
          {/* Zoom controls in bottom right */}
          <div style={{ position: 'absolute', bottom: 24, right: 32, zIndex: 100, display: 'flex', alignItems: 'flex-end', gap: 12 }}>
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
              <Node key={node.id} node={node} onUpdatePosition={updateNodePosition} onDelete={deleteNode} onStartConnection={startConnection} onEndConnection={endConnection} onOpenSettings={openNodeSettings} onUpdateConfig={updateNodeConfig} />
            ))}
          </div>

          <input ref={importInputRef} type="file" accept="application/json" style={{ display: 'none' }} onChange={handleImportFile} />
        </div>

        {/* IDE-style status bar spanning full width */}
        <div className="builder-statusbar">
          <span className="statusbar-item">{liveRunning ? 'Live' : 'Ready'}</span>
          <span className="statusbar-sep">·</span>
          <span className="statusbar-item">{nodes.length} blocks</span>
          <span className="statusbar-sep">·</span>
          <span className="statusbar-item">{connections.length} connections</span>
        </div>

        {/* Merge any websocket node messages into resultsData.latest_data for live overlays */}
        {(() => {
          const merged = resultsData ? { ...resultsData } : {};
          merged.latest_data = { ...(resultsData && resultsData.latest_data ? resultsData.latest_data : {}) };
          try {
            Object.values(wsNodeBuffers || {}).forEach(m => {
              const key = (m.name || '').replace(/\s+/g, '_').toLowerCase() || null;
              if (key) merged.latest_data[key] = m.last;
            });
          } catch (e) {}
          return <ResultsPanel data={merged} open={resultsOpen} onClose={() => setResultsOpen(false)} onRerun={runWorkflow} onDownload={downloadResults} />;
          })()}
          <NodeSettings node={settingsNode} open={settingsOpen} onClose={closeNodeSettings} onSave={saveNodeSettings} />

          {/* PastDataViewer is embedded into the chart drawer below */}

          {/* Strategy monitor moved to Dashboard Analytics page */}
        
          {/* Backtest modal (MVP) */}
          {backtestOpen ? <BacktestModal open={backtestOpen} onClose={() => setBacktestOpen(false)} /> : null}
        </div>
      </div>
  );
};

export default WorkflowBuilder;
