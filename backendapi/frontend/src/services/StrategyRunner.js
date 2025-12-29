/**
 * StrategyRunner Service
 * Manages running multiple strategies in the background (max 5)
 * Stores signals in localStorage for Dashboard to display
 */

const SAVES_KEY = 'flowgrid_workflow_v1::saves';
const ENABLED_STRATEGIES_KEY = 'flowgrid_enabled_strategies';
const RUNNING_STRATEGIES_KEY = 'flowgrid_running_strategies';
const LIVE_SIGNALS_KEY = 'flowgrid_live_signals';
const MAX_STRATEGIES = 5;
const MAX_SIGNALS = 50;
const POLL_INTERVAL = 1000; // 1 second between strategy checks

// API base URL
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE)
  ? import.meta.env.VITE_API_BASE.replace(/\/$/, '')
  : 'http://127.0.0.1:5000';

// Track running strategy loops
const runningLoops = new Map(); // strategyName -> { abort: AbortController, interval: number }

// Track last signal for each strategy to avoid duplicates
const lastSignals = new Map(); // strategyName -> { direction, timestamp }

/**
 * Get all saved strategies from localStorage
 */
export function getSavedStrategies() {
  try {
    const raw = localStorage.getItem(SAVES_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error('[StrategyRunner] Error loading saved strategies:', e);
    return {};
  }
}

/**
 * Delete a strategy from localStorage
 */
export function deleteStrategy(strategyName) {
  try {
    // Get current strategies
    const strategies = getSavedStrategies();
    
    // Remove the strategy
    delete strategies[strategyName];
    
    // Save updated strategies
    localStorage.setItem(SAVES_KEY, JSON.stringify(strategies));
    
    // Also remove from enabled strategies
    const enabled = getEnabledStrategies();
    delete enabled[strategyName];
    localStorage.setItem(ENABLED_STRATEGIES_KEY, JSON.stringify(enabled));
    
    // Dispatch event
    window.dispatchEvent(new CustomEvent('flowgrid:strategy-deleted', { detail: { name: strategyName } }));
    console.log(`[StrategyRunner] 🗑️ Strategy "${strategyName}" deleted`);
    
    return true;
  } catch (e) {
    console.error('[StrategyRunner] Error deleting strategy:', e);
    return false;
  }
}

/**
 * Get enabled strategies map
 */
export function getEnabledStrategies() {
  try {
    const raw = localStorage.getItem(ENABLED_STRATEGIES_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    console.error('[StrategyRunner] Error loading enabled strategies:', e);
    return {};
  }
}

/**
 * Get running strategies map
 */
export function getRunningStrategies() {
  try {
    const raw = localStorage.getItem(RUNNING_STRATEGIES_KEY);
    if (!raw) return {};
    return JSON.parse(raw);
  } catch (e) {
    return {};
  }
}

/**
 * Save running strategies state
 */
function saveRunningState(state) {
  try {
    localStorage.setItem(RUNNING_STRATEGIES_KEY, JSON.stringify(state));
  } catch (e) {
    console.error('[StrategyRunner] Error saving running state:', e);
  }
}

/**
 * Get live signals
 */
export function getLiveSignals() {
  try {
    const raw = localStorage.getItem(LIVE_SIGNALS_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}
/**
 * Clear all signals from localStorage
 */
export function clearAllSignals() {
  try {
    localStorage.setItem(LIVE_SIGNALS_KEY, JSON.stringify([]));
    // Clear the last signal tracker so strategies will generate new signals on next change
    lastSignals.clear();
    window.dispatchEvent(new CustomEvent('flowgrid:signals-cleared'));
    console.log('[StrategyRunner] 🗑️ All signals cleared and signal tracker reset');
  } catch (e) {
    console.error('[StrategyRunner] Error clearing signals:', e);
  }
}
/**
 * Add a signal to the live signals list
 * Only keeps ONE signal per strategy - replaces existing signal instead of accumulating
 */
function addSignal(signal) {
  try {
    const signals = getLiveSignals();
    
    // Find and remove any existing signal from this strategy
    const filtered = signals.filter(s => s.strategy_name !== signal.strategy_name);
    
    // Add new signal to front
    filtered.unshift(signal);
    
    // Keep only last MAX_SIGNALS
    const trimmed = filtered.slice(0, MAX_SIGNALS);
    localStorage.setItem(LIVE_SIGNALS_KEY, JSON.stringify(trimmed));
    
    // Dispatch event for Dashboard
    window.dispatchEvent(new CustomEvent('flowgrid:new-signal', { detail: signal }));
  } catch (e) {
    console.error('[StrategyRunner] Error adding signal:', e);
  }
}

// Trades storage key
const TRADES_KEY = 'flowgrid_trades';
const MAX_TRADES = 500;

/**
 * Get all tracked trades
 */
export function getTrades() {
  try {
    const raw = localStorage.getItem(TRADES_KEY);
    if (!raw) return [];
    return JSON.parse(raw);
  } catch (e) {
    return [];
  }
}

/**
 * Track a trade for metrics calculation
 */
function trackTrade(signal) {
  try {
    const trades = getTrades();
    
    // Create trade entry
    const trade = {
      id: signal.id,
      timestamp: signal.timestamp,
      entryTime: signal.timestamp,
      exitTime: signal.type === 'exit' ? signal.timestamp : null,
      strategy_name: signal.strategy_name,
      symbol: signal.symbol,
      direction: signal.direction,
      entryPrice: signal.price,
      exitPrice: signal.type === 'exit' ? signal.price : null,
      quantity: 100, // Default position size
      pnl: 0, // Will be calculated on exit
      status: signal.type === 'exit' ? 'closed' : 'open'
    };
    
    // If this is an exit signal, try to find matching open trade and calculate P&L
    if (signal.type === 'exit') {
      const openTradeIdx = trades.findIndex(t => 
        t.strategy_name === signal.strategy_name && 
        t.symbol === signal.symbol && 
        t.status === 'open'
      );
      
      if (openTradeIdx !== -1) {
        const openTrade = trades[openTradeIdx];
        const pnl = openTrade.direction === 'BUY' 
          ? (signal.price - openTrade.entryPrice) * openTrade.quantity
          : (openTrade.entryPrice - signal.price) * openTrade.quantity;
        
        // Update the open trade
        trades[openTradeIdx] = {
          ...openTrade,
          exitTime: signal.timestamp,
          exitPrice: signal.price,
          pnl: pnl,
          status: 'closed'
        };
        
        localStorage.setItem(TRADES_KEY, JSON.stringify(trades));
        
        // Dispatch event for metrics update
        window.dispatchEvent(new CustomEvent('flowgrid:trade-closed', { 
          detail: { ...trades[openTradeIdx], pnl } 
        }));
        
        console.log(`[StrategyRunner] 💰 TRADE CLOSED: ${signal.symbol} P&L: $${pnl.toFixed(2)}`);
        return;
      }
    }
    
    // Add new trade
    trades.unshift(trade);
    const trimmed = trades.slice(0, MAX_TRADES);
    localStorage.setItem(TRADES_KEY, JSON.stringify(trimmed));
    
    // Dispatch event
    window.dispatchEvent(new CustomEvent('flowgrid:trade-opened', { detail: trade }));
    
  } catch (e) {
    console.error('[StrategyRunner] Error tracking trade:', e);
  }
}

/**
 * Calculate metrics from trades
 */
export function calculateMetrics() {
  const trades = getTrades();
  const closedTrades = trades.filter(t => t.status === 'closed');
  
  if (closedTrades.length === 0) {
    return {
      total_trades: 0,
      wins: 0,
      losses: 0,
      win_rate: 0,
      net_pnl: 0,
      gross_profit: 0,
      gross_loss: 0,
      profit_factor: 0,
      avg_win: 0,
      avg_loss: 0,
      largest_win: 0,
      largest_loss: 0,
      expectancy: 0
    };
  }
  
  const wins = closedTrades.filter(t => t.pnl > 0);
  const losses = closedTrades.filter(t => t.pnl <= 0);
  
  const grossProfit = wins.reduce((sum, t) => sum + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((sum, t) => sum + t.pnl, 0));
  const netPnl = grossProfit - grossLoss;
  
  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  
  const winRate = (wins.length / closedTrades.length) * 100;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;
  const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);
  
  return {
    total_trades: closedTrades.length,
    open_trades: trades.filter(t => t.status === 'open').length,
    wins: wins.length,
    losses: losses.length,
    win_rate: winRate,
    net_pnl: netPnl,
    gross_profit: grossProfit,
    gross_loss: grossLoss,
    profit_factor: profitFactor,
    avg_win: avgWin,
    avg_loss: avgLoss,
    largest_win: wins.length > 0 ? Math.max(...wins.map(t => t.pnl)) : 0,
    largest_loss: losses.length > 0 ? Math.min(...losses.map(t => t.pnl)) : 0,
    expectancy: expectancy
  };
}

/**
 * Get count of currently running strategies
 */
export function getRunningCount() {
  return runningLoops.size;
}

/**
 * Check if a strategy is running
 */
export function isStrategyRunning(strategyName) {
  return runningLoops.has(strategyName);
}

/**
 * Get Alpaca API credentials from localStorage
 */
function getAlpacaCredentials() {
  try {
    const keyId = localStorage.getItem('alpaca_key_id') || null;
    const secretKey = localStorage.getItem('alpaca_secret_key') || null;
    return { alpacaKeyId: keyId, alpacaSecretKey: secretKey };
  } catch (e) {
    return { alpacaKeyId: null, alpacaSecretKey: null };
  }
}

/**
 * Prepare workflow payload from strategy nodes/connections
 * CRITICAL: Must match WorkflowBuilder.preparePayload format exactly
 * UPDATED: Now includes connections for graph-based execution
 */
function preparePayload(strategy) {
  const nodes = strategy.nodes || [];
  const connections = strategy.connections || [];
  
  if (!nodes || nodes.length === 0) return null;
  
  // Sort nodes by Y position (like WorkflowBuilder does)
  const sorted = [...nodes].sort((a, b) => a.y - b.y);
  
  // Extract symbol/timeframe from input-type nodes
  const priceInputTypes = new Set(['input', 'price_history', 'volume_history', 'trigger']);
  let symbol = 'SPY', timeframe = '1Hour', days = 7;
  
  // Find the last input node with symbol/timeframe/days config
  const inputNode = sorted.slice().reverse().find(n => 
    priceInputTypes.has(n.type) && 
    n.configValues && 
    (n.configValues.symbol || n.configValues.timeframe || n.configValues.days)
  );
  
  if (inputNode && inputNode.configValues) {
    symbol = inputNode.configValues.symbol || symbol;
    timeframe = inputNode.configValues.timeframe || timeframe;
    days = inputNode.configValues.days || days;
  }
  
  // Build workflow blocks: strip symbol/timeframe from params
  const workflow_blocks = sorted.map(n => {
    let params = n.configValues || {};
    
    // Strip symbol/timeframe/days from input node params (backend gets them at top level)
    if (priceInputTypes.has(n.type) && params) {
      const { symbol: _, timeframe: __, days: ___, ...rest } = params;
      params = rest;
    }
    
    return { 
      id: n.id,        // ⚠️ Must be 'id' not 'nodeId'
      type: n.type, 
      params           // ⚠️ Must be 'params' not 'data', and use configValues
    };
  });
  
  // Get Alpaca credentials
  const { alpacaKeyId, alpacaSecretKey } = getAlpacaCredentials();
  
  // Include connections for graph-based execution (UnifiedStrategyExecutor)
  console.log(`[StrategyRunner] Preparing payload: ${workflow_blocks.length} nodes, ${connections.length} connections`);
  
  return {
    symbol,
    timeframe,
    days,
    workflow: workflow_blocks,
    connections: connections,  // ✅ Include connections for graph-based execution
    priceType: 'close',  // 🔧 Changed from 'current' to 'close' for 24/7 availability
    alpacaKeyId,
    alpacaSecretKey
  };
}

/**
 * Execute workflow once for a strategy
 */
async function executeWorkflow(strategyName, strategy, signal) {
  const payload = preparePayload(strategy);
  
  try {
    const response = await fetch(`${API_BASE}/execute_workflow_v2`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
      signal
    });
    
    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      console.warn(`[StrategyRunner] ${strategyName} HTTP ${response.status}:`, errText.slice(0, 200));
      return { error: errText };
    }
    
    const data = await response.json();
    return data;
  } catch (err) {
    if (err.name === 'AbortError') {
      // Expected when stopping
      return null;
    }
    console.error(`[StrategyRunner] ${strategyName} execution error:`, err);
    return { error: err.message };
  }
}

/**
 * Process workflow result and generate signals
 */
function processResult(strategyName, data, symbol) {
  if (!data) return;
  
  // Check for trading signal
  let direction = null;
  let signalType = null;
  let confidence = null;
  
  // PRIMARY CHECK: finalSignal field from backend v2 response
  const finalSignal = (data.finalSignal || '').toUpperCase();
  
  if (finalSignal === 'BUY') {
    direction = 'BUY';
    signalType = 'entry';
    confidence = data.confidence || 'Strategy confirmed';
  } else if (finalSignal === 'SELL') {
    direction = 'SELL';
    signalType = 'exit';
    confidence = data.confidence || 'Strategy confirmed';
  }
  // HOLD means no signal - skip creating signal entry
  
  // FALLBACK: Check legacy response formats
  if (!direction) {
    const fieldsToCheck = [
      data.final_output,
      data.decision_result,
      data.action,
      data.signal,
      data.trade_signal,
      data.result
    ];
    
    for (const field of fieldsToCheck) {
      if (!field) continue;
      const output = String(field).toUpperCase();
      
      if (output.includes('BUY') || output.includes('LONG') || output === 'TRUE' || output === 'PASSED') {
        direction = 'BUY';
        signalType = 'entry';
        break;
      } else if (output.includes('SELL') || output.includes('SHORT') || output.includes('EXIT')) {
        direction = 'SELL';
        signalType = 'exit';
        break;
      }
    }
  }
  
  // Also check for comparison/decision results
  if (!direction && data.comparison_result !== undefined) {
    if (data.comparison_result === true || data.comparison_result === 'true') {
      direction = 'BUY';
      signalType = 'entry';
    }
  }
  
  // Check indicators for overbought/oversold conditions
  if (!direction && data.indicators) {
    const rsi = data.indicators.rsi?.value || data.indicators.RSI?.value;
    if (rsi !== undefined) {
      if (rsi < 30) {
        direction = 'BUY';
        signalType = 'entry';
        confidence = 'RSI oversold';
      } else if (rsi > 70) {
        direction = 'SELL';
        signalType = 'exit';
        confidence = 'RSI overbought';
      }
    }
  }
  
  // Get price from various possible fields
  const price = data.current_price || data.latest_close || data.price || 
                data.indicators?.price?.value || data.close || 
                data.latest_data?.close || 0;
  
  // Check if signal has changed from last time
  const lastSignal = lastSignals.get(strategyName);
  const signalChanged = !lastSignal || lastSignal.direction !== direction;
  
  // If we found a signal AND it's different from the last one, record it
  if (direction && signalChanged) {
    const signalEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 8)}`,
      timestamp: new Date().toISOString(),
      strategy_name: strategyName,
      symbol: symbol || 'SPY',
      direction: direction,
      type: signalType,
      price: price,
      confidence: confidence,
      indicators: data.indicators || {},
      status: 'active'
    };
    
    // Update last signal tracker
    lastSignals.set(strategyName, { direction, timestamp: Date.now() });
    
    addSignal(signalEntry);
    
    // Send signal to backend trade engine for alternating trade tracking
    ingestSignalToBackend(strategyName, direction, price);
    
    console.log(`[StrategyRunner] SIGNAL CHANGED: ${lastSignal?.direction || 'NONE'} -> ${direction} ${symbol} @ $${price.toFixed(2)} from ${strategyName}`);
  } else if (direction && !signalChanged) {
    // Signal unchanged - don't spam
    // console.log(`[StrategyRunner] Signal unchanged: ${direction} for ${strategyName}`);
  }
}

/**
 * Send signal to backend trade engine for alternating trade tracking
 */
async function ingestSignalToBackend(strategyName, signal, price) {
  try {
    const response = await fetch(`${API_BASE}/api/signals/ingest`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        strategy_id: strategyName,
        signal: signal,
        price: price,
        ts: new Date().toISOString(),
        meta: { source: 'StrategyRunner' }
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      if (result.action === 'closed_and_opened' && result.completed_trade) {
        console.log(`[StrategyRunner] TRADE COMPLETED: ${result.completed_trade.net_pct.toFixed(2)}% from ${strategyName}`);
        // Dispatch event for completed trade
        window.dispatchEvent(new CustomEvent('flowgrid:trade-completed', { 
          detail: result.completed_trade 
        }));
      }
    }
  } catch (err) {
    console.warn('[StrategyRunner] Failed to ingest signal to backend:', err.message);
  }
}

/**
 * Start running a strategy
 */
export async function startStrategy(strategyName) {
  // Check max limit
  if (runningLoops.size >= MAX_STRATEGIES) {
    console.warn(`[StrategyRunner] Max ${MAX_STRATEGIES} strategies reached`);
    window.dispatchEvent(new CustomEvent('flowgrid:max-strategies-reached', { 
      detail: { max: MAX_STRATEGIES } 
    }));
    return false;
  }
  
  // Check if already running
  if (runningLoops.has(strategyName)) {
    console.log(`[StrategyRunner] ${strategyName} already running`);
    return true;
  }
  
  // Check for Alpaca credentials
  const { alpacaKeyId, alpacaSecretKey } = getAlpacaCredentials();
  if (!alpacaKeyId || !alpacaSecretKey) {
    console.error('[StrategyRunner] ❌ Alpaca API credentials not found in localStorage');
    window.dispatchEvent(new CustomEvent('flowgrid:credentials-missing', {
      detail: { message: 'Alpaca API credentials are required. Go to Settings to configure them.' }
    }));
    return false;
  }
  
  // Get strategy data
  const strategies = getSavedStrategies();
  const strategy = strategies[strategyName];
  
  if (!strategy) {
    console.error(`[StrategyRunner] Strategy "${strategyName}" not found`);
    return false;
  }
  
  // Check if strategy has nodes
  if (!strategy.nodes || strategy.nodes.length === 0) {
    console.error(`[StrategyRunner] Strategy "${strategyName}" has no nodes`);
    return false;
  }
  
  console.log(`[StrategyRunner] ▶️ Starting ${strategyName}...`);
  
  const abortController = new AbortController();
  
  // Extract symbol from strategy nodes - check multiple sources
  const priceInputTypes = new Set(['input', 'price_history', 'volume_history', 'trigger']);
  const nodes = strategy.nodes || [];
  
  // Find node with symbol config (check configValues and data fields)
  const nodeWithSymbol = nodes.find(n => 
    priceInputTypes.has(n.type) && 
    (n.configValues?.symbol || n.data?.symbol)
  );
  
  const symbol = nodeWithSymbol?.configValues?.symbol || 
                 nodeWithSymbol?.data?.symbol || 
                 'SPY';
  
  // Create the polling loop
  const runLoop = async () => {
    let pollCount = 0;
    while (!abortController.signal.aborted) {
      try {
        pollCount++;
        const startTime = Date.now();
        console.log(`[StrategyRunner] 🔄 [${pollCount}] Polling ${strategyName} (${runningLoops.size} total running)`);
        
        const data = await executeWorkflow(strategyName, strategy, abortController.signal);
        const elapsed = Date.now() - startTime;
        
        if (data && !data.error) {
          console.log(`[StrategyRunner] ✅ [${pollCount}] ${strategyName} completed in ${elapsed}ms`);
          processResult(strategyName, data, symbol);
        } else if (data?.error) {
          console.warn(`[StrategyRunner] ⚠️ [${pollCount}] ${strategyName} returned error: ${data.error.slice(0, 100)}`);
        }
      } catch (err) {
        if (err.name !== 'AbortError') {
          console.error(`[StrategyRunner] ❌ ${strategyName} error:`, err);
        }
      }
      
      // Wait before next poll
      await new Promise((resolve, reject) => {
        const timeout = setTimeout(resolve, POLL_INTERVAL);
        abortController.signal.addEventListener('abort', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    
    console.log(`[StrategyRunner] ⏹️ ${strategyName} stopped after ${pollCount} polls`);
  };
  
  // Store the loop reference
  runningLoops.set(strategyName, { abort: abortController });
  
  // Update state
  const running = getRunningStrategies();
  running[strategyName] = true;
  saveRunningState(running);
  
  // Dispatch event
  window.dispatchEvent(new CustomEvent('flowgrid:strategy-started', { 
    detail: { name: strategyName, running: runningLoops.size } 
  }));
  
  // Start the loop (don't await - runs in background)
  runLoop();
  
  return true;
}

/**
 * Stop a running strategy
 */
export function stopStrategy(strategyName) {
  const loop = runningLoops.get(strategyName);
  if (!loop) {
    console.log(`[StrategyRunner] ${strategyName} not running`);
    return false;
  }
  
  console.log(`[StrategyRunner] ⏹️ Stopping ${strategyName}...`);
  
  // Abort the loop
  loop.abort.abort();
  runningLoops.delete(strategyName);
  
  // Clear last signal tracker for this strategy
  lastSignals.delete(strategyName);
  
  // Update state
  const running = getRunningStrategies();
  delete running[strategyName];
  saveRunningState(running);
  
  // Dispatch event
  window.dispatchEvent(new CustomEvent('flowgrid:strategy-stopped', { 
    detail: { name: strategyName, running: runningLoops.size } 
  }));
  
  return true;
}

/**
 * Toggle a strategy on/off
 */
export async function toggleStrategy(strategyName, enabled) {
  if (enabled) {
    return await startStrategy(strategyName);
  } else {
    return stopStrategy(strategyName);
  }
}

/**
 * Stop all running strategies
 */
export function stopAll() {
  for (const name of runningLoops.keys()) {
    stopStrategy(name);
  }
}

/**
 * Get status summary
 */
export function getStatus() {
  return {
    running: Array.from(runningLoops.keys()),
    count: runningLoops.size,
    max: MAX_STRATEGIES,
    signals: getLiveSignals().length
  };
}

// ============================================================
// PERCENT-BASED ANALYTICS FROM BACKEND TRADE ENGINE
// ============================================================

/**
 * Fetch percent-based analytics overview from backend
 * @param {string} strategyId - Optional strategy ID to filter
 * @returns {Promise<Object>} Analytics overview object
 */
export async function fetchPercentAnalytics(strategyId = null) {
  try {
    let url = `${BACKEND_URL}/api/analytics/overview`;
    if (strategyId) {
      url += `?strategy_id=${encodeURIComponent(strategyId)}`;
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Analytics fetch failed: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[StrategyRunner] Error fetching percent analytics:', error);
    return {
      total_trades: 0,
      wins: 0,
      losses: 0,
      win_rate_pct: 0,
      total_gross_pct: 0,
      total_net_pct: 0,
      avg_win_pct: 0,
      avg_loss_pct: 0,
      largest_win_pct: 0,
      largest_loss_pct: 0,
      profit_factor: 0,
      expectancy_pct: 0,
      max_consecutive_wins: 0,
      max_consecutive_losses: 0,
      avg_trade_duration_sec: 0
    };
  }
}

/**
 * Fetch equity curve data (percent-based)
 * @param {string} strategyId - Optional strategy ID to filter
 * @returns {Promise<Array>} Array of equity curve points
 */
export async function fetchEquityCurve(strategyId = null) {
  try {
    let url = `${BACKEND_URL}/api/analytics/equity-curve`;
    if (strategyId) {
      url += `?strategy_id=${encodeURIComponent(strategyId)}`;
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Equity curve fetch failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data.equity_curve || [];
  } catch (error) {
    console.error('[StrategyRunner] Error fetching equity curve:', error);
    return [];
  }
}

/**
 * Fetch P&L distribution data
 * @param {string} strategyId - Optional strategy ID to filter
 * @returns {Promise<Object>} Distribution data with buckets
 */
export async function fetchPnLDistribution(strategyId = null) {
  try {
    let url = `${BACKEND_URL}/api/analytics/distributions`;
    if (strategyId) {
      url += `?strategy_id=${encodeURIComponent(strategyId)}`;
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Distribution fetch failed: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[StrategyRunner] Error fetching P&L distribution:', error);
    return { buckets: [] };
  }
}

/**
 * Fetch all percent-based trades
 * @param {string} strategyId - Optional strategy ID to filter
 * @returns {Promise<Array>} Array of completed trades
 */
export async function fetchPercentTrades(strategyId = null) {
  try {
    let url = `${BACKEND_URL}/api/trades`;
    if (strategyId) {
      url += `?strategy_id=${encodeURIComponent(strategyId)}`;
    }
    
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Trades fetch failed: ${response.status}`);
    }
    
    const data = await response.json();
    return data.trades || [];
  } catch (error) {
    console.error('[StrategyRunner] Error fetching percent trades:', error);
    return [];
  }
}

/**
 * Clear all trades and reset analytics
 * @returns {Promise<boolean>} Success status
 */
export async function clearAllTrades() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/trades`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`Clear trades failed: ${response.status}`);
    }
    
    console.log('[StrategyRunner] All trades cleared');
    return true;
  } catch (error) {
    console.error('[StrategyRunner] Error clearing trades:', error);
    return false;
  }
}

/**
 * Clear all positions (reset state machine)
 * @returns {Promise<boolean>} Success status
 */
export async function clearAllPositions() {
  try {
    const response = await fetch(`${BACKEND_URL}/api/positions`, {
      method: 'DELETE'
    });
    
    if (!response.ok) {
      throw new Error(`Clear positions failed: ${response.status}`);
    }
    
    console.log('[StrategyRunner] All positions cleared');
    return true;
  } catch (error) {
    console.error('[StrategyRunner] Error clearing positions:', error);
    return false;
  }
}

/**
 * Get current signal state for a strategy
 * @param {string} strategyId - Strategy ID
 * @returns {Promise<Object>} Current signal state
 */
export async function getCurrentSignal(strategyId) {
  try {
    const response = await fetch(`${BACKEND_URL}/api/signals/current?strategy_id=${encodeURIComponent(strategyId)}`);
    if (!response.ok) {
      throw new Error(`Current signal fetch failed: ${response.status}`);
    }
    
    return await response.json();
  } catch (error) {
    console.error('[StrategyRunner] Error fetching current signal:', error);
    return null;
  }
}

// Export constants
export { MAX_STRATEGIES, MAX_SIGNALS };
