/**
 * Trade Service - Hybrid Backend + localStorage trade management
 * 
 * PRIORITY: Backend API (percent_trades.json via trade engine)
 * FALLBACK: localStorage (for offline or when backend unavailable)
 * 
 * The backend trade engine handles:
 * - Signal ingestion and position state machine
 * - Percentage-based P&L calculation
 * - Strategy-independent trade tracking
 * - Analytics computation
 * 
 * All analytics/dashboard/trade-logging components read from this service.
 */

// Backend API URL
const API_BASE = (typeof import.meta !== 'undefined' && import.meta.env?.VITE_API_BASE)
  ? import.meta.env.VITE_API_BASE.replace(/\/$/, '')
  : 'http://127.0.0.1:5000';

const TRADES_KEY = 'flowgrid_live_trades_v1';
const POSITIONS_KEY = 'flowgrid_live_position_v1';

// Cache for backend data
let _backendTradesCache = null;
let _backendCacheTime = 0;
const CACHE_TTL = 2000; // 2 second cache

// ============================================================================
// BACKEND API FUNCTIONS
// ============================================================================

/**
 * Fetch trades from backend API
 * @param {Object} options - { strategyId, limit, offset }
 * @returns {Promise<Array>} Array of trade objects
 */
export async function fetchTradesFromBackend(options = {}) {
  try {
    const params = new URLSearchParams();
    if (options.strategyId) params.append('strategy_id', options.strategyId);
    if (options.limit) params.append('limit', options.limit);
    if (options.offset) params.append('offset', options.offset);
    
    const url = `${API_BASE}/api/trades${params.toString() ? '?' + params.toString() : ''}`;
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`Backend returned ${response.status}`);
    }
    
    const data = await response.json();
    _backendTradesCache = data.trades || [];
    _backendCacheTime = Date.now();
    
    return _backendTradesCache;
  } catch (e) {
    console.warn('[TradeService] Backend fetch failed, using localStorage:', e.message);
    return null; // Return null to indicate fallback needed
  }
}

/**
 * Fetch analytics from backend API
 * @returns {Promise<Object>} Analytics metrics
 */
export async function fetchAnalyticsFromBackend() {
  try {
    const response = await fetch(`${API_BASE}/api/analytics/overview`);
    if (!response.ok) throw new Error(`Backend returned ${response.status}`);
    return await response.json();
  } catch (e) {
    console.warn('[TradeService] Analytics fetch failed:', e.message);
    return null;
  }
}

/**
 * Fetch equity curve from backend API
 * @returns {Promise<Array>} Equity curve points
 */
export async function fetchEquityCurveFromBackend() {
  try {
    const response = await fetch(`${API_BASE}/api/analytics/equity-curve`);
    if (!response.ok) throw new Error(`Backend returned ${response.status}`);
    const data = await response.json();
    return data.curve || [];
  } catch (e) {
    console.warn('[TradeService] Equity curve fetch failed:', e.message);
    return null;
  }
}

/**
 * Fetch P&L heatmap from backend API
 * @returns {Promise<Object>} Heatmap data { by_day, by_hour }
 */
export async function fetchHeatmapFromBackend() {
  try {
    const response = await fetch(`${API_BASE}/api/analytics/heatmap`);
    if (!response.ok) throw new Error(`Backend returned ${response.status}`);
    return await response.json();
  } catch (e) {
    console.warn('[TradeService] Heatmap fetch failed:', e.message);
    return null;
  }
}

/**
 * Fetch P&L distribution from backend API
 * @returns {Promise<Object>} Distribution data { bins, stats }
 */
export async function fetchDistributionFromBackend() {
  try {
    const response = await fetch(`${API_BASE}/api/analytics/distributions`);
    if (!response.ok) throw new Error(`Backend returned ${response.status}`);
    return await response.json();
  } catch (e) {
    console.warn('[TradeService] Distribution fetch failed:', e.message);
    return null;
  }
}

/**
 * Get current signals/positions from backend
 * @returns {Promise<Array>} Current signals
 */
export async function fetchCurrentSignals() {
  try {
    const response = await fetch(`${API_BASE}/api/signals/current`);
    if (!response.ok) throw new Error(`Backend returned ${response.status}`);
    const data = await response.json();
    return data.signals || [];
  } catch (e) {
    console.warn('[TradeService] Current signals fetch failed:', e.message);
    return [];
  }
}

// ============================================================================
// CORE CRUD OPERATIONS
// ============================================================================

/**
 * Get all trades from localStorage
 * @returns {Array} Array of trade objects
 */
export function getAllTrades() {
  try {
    const stored = localStorage.getItem(TRADES_KEY);
    const trades = stored ? JSON.parse(stored) : [];
    // Sort by exit time descending (most recent first)
    return trades.sort((a, b) => {
      const dateA = new Date(a.exitTime || a.close_ts || 0);
      const dateB = new Date(b.exitTime || b.close_ts || 0);
      return dateB - dateA;
    });
  } catch (e) {
    console.error('[TradeService] Failed to read trades:', e);
    return [];
  }
}

/**
 * Get all trades - tries backend first, falls back to localStorage
 * @returns {Promise<Array>} Array of trade objects
 */
export async function getAllTradesAsync() {
  // Check cache
  if (_backendTradesCache && (Date.now() - _backendCacheTime) < CACHE_TTL) {
    return _backendTradesCache;
  }
  
  // Try backend
  const backendTrades = await fetchTradesFromBackend({ limit: 1000 });
  if (backendTrades !== null) {
    return backendTrades;
  }
  
  // Fallback to localStorage
  return getAllTrades();
}

/**
 * Save a new trade to localStorage
 * @param {Object} trade - Trade object to save
 */
export function saveTrade(trade) {
  try {
    const trades = getAllTrades();
    
    // Normalize trade format for consistency
    const normalizedTrade = normalizeTrade(trade);
    
    trades.unshift(normalizedTrade);
    localStorage.setItem(TRADES_KEY, JSON.stringify(trades));
    
    console.log(`[TradeService] Saved trade: ${normalizedTrade.direction || normalizedTrade.open_side} @ ${normalizedTrade.exitPrice || normalizedTrade.close_price}`);
    
    // Invalidate cache
    _backendTradesCache = null;
    
    // Dispatch event for UI updates
    window.dispatchEvent(new CustomEvent('flowgrid:trades-updated'));
    window.dispatchEvent(new CustomEvent('flowgrid:trade-completed', { detail: normalizedTrade }));
    
    return normalizedTrade;
  } catch (e) {
    console.error('[TradeService] Failed to save trade:', e);
    return null;
  }
}

/**
 * Clear all trades from localStorage
 */
export function clearAllTrades() {
  try {
    localStorage.removeItem(TRADES_KEY);
    localStorage.removeItem(POSITIONS_KEY);
    window.dispatchEvent(new CustomEvent('flowgrid:trades-updated'));
    console.log('[TradeService] Cleared all trades');
  } catch (e) {
    console.error('[TradeService] Failed to clear trades:', e);
  }
}

/**
 * Delete a specific trade by ID
 * @param {string|number} tradeId - Trade ID to delete
 */
export function deleteTrade(tradeId) {
  try {
    const trades = getAllTrades();
    const filtered = trades.filter(t => t.id !== tradeId);
    localStorage.setItem(TRADES_KEY, JSON.stringify(filtered));
    window.dispatchEvent(new CustomEvent('flowgrid:trades-updated'));
    console.log(`[TradeService] Deleted trade: ${tradeId}`);
  } catch (e) {
    console.error('[TradeService] Failed to delete trade:', e);
  }
}

// ============================================================================
// TRADE NORMALIZATION
// ============================================================================

/**
 * Normalize trade object to consistent format
 * Handles both tradeTracker format and backend format
 */
function normalizeTrade(trade) {
  // If already normalized, return as-is
  if (trade._normalized) return trade;
  
  const now = new Date().toISOString();
  
  return {
    _normalized: true,
    // Standard ID
    id: trade.id || `trade_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`,
    
    // Strategy info
    strategy_id: trade.strategy_id || trade.strategyId || 'unknown',
    strategyId: trade.strategyId || trade.strategy_id || 'unknown',
    strategyName: trade.strategyName || trade.strategy_id || trade.strategyId || 'Unknown',
    
    // Direction
    direction: trade.direction || trade.open_side || 'LONG',
    open_side: trade.open_side || trade.direction || 'LONG',
    
    // Symbol
    symbol: trade.symbol || 'UNKNOWN',
    timeframe: trade.timeframe || '1Hour',
    
    // Entry info
    entryTime: trade.entryTime || trade.open_ts || now,
    open_ts: trade.open_ts || trade.entryTime || now,
    entryPrice: trade.entryPrice || trade.open_price || 0,
    open_price: trade.open_price || trade.entryPrice || 0,
    entrySignal: trade.entrySignal || (trade.direction === 'LONG' ? 'BUY' : 'SELL'),
    
    // Exit info
    exitTime: trade.exitTime || trade.close_ts || now,
    close_ts: trade.close_ts || trade.exitTime || now,
    exitPrice: trade.exitPrice || trade.close_price || 0,
    close_price: trade.close_price || trade.exitPrice || 0,
    exitSignal: trade.exitSignal || (trade.direction === 'LONG' ? 'SELL' : 'BUY'),
    close_side: trade.close_side || (trade.direction === 'LONG' ? 'SHORT' : 'LONG'),
    
    // P&L - calculate if not provided
    grossPnL: trade.grossPnL ?? trade.gross_pct ?? calculateGrossPnL(trade),
    netPnL: trade.netPnL ?? trade.net_pct ?? calculateNetPnL(trade),
    gross_pct: trade.gross_pct ?? calculateGrossPct(trade),
    net_pct: trade.net_pct ?? calculateNetPct(trade),
    fee_pct_total: trade.fee_pct_total ?? trade.fees ?? 0.15,
    fees: trade.fees ?? 0,
    
    // Position info
    shares: trade.shares || 100,
    holdingDuration: trade.holdingDuration || calculateDuration(trade),
    
    // Metadata
    status: 'closed',
    meta: trade.meta || { source: 'localStorage' }
  };
}

function calculateGrossPnL(trade) {
  const entry = trade.entryPrice || trade.open_price || 0;
  const exit = trade.exitPrice || trade.close_price || 0;
  const shares = trade.shares || 100;
  const direction = trade.direction || trade.open_side || 'LONG';
  
  if (direction === 'LONG') {
    return (exit - entry) * shares;
  } else {
    return (entry - exit) * shares;
  }
}

function calculateNetPnL(trade) {
  const gross = trade.grossPnL ?? calculateGrossPnL(trade);
  const fees = trade.fees || 0;
  return gross - fees;
}

function calculateGrossPct(trade) {
  const entry = trade.entryPrice || trade.open_price || 0;
  const exit = trade.exitPrice || trade.close_price || 0;
  const direction = trade.direction || trade.open_side || 'LONG';
  
  if (entry === 0) return 0;
  
  if (direction === 'LONG') {
    return ((exit / entry) - 1) * 100;
  } else {
    return ((entry / exit) - 1) * 100;
  }
}

function calculateNetPct(trade) {
  const gross = trade.gross_pct ?? calculateGrossPct(trade);
  const feePct = trade.fee_pct_total ?? 0.15;
  return gross - feePct;
}

function calculateDuration(trade) {
  const entry = new Date(trade.entryTime || trade.open_ts || 0);
  const exit = new Date(trade.exitTime || trade.close_ts || Date.now());
  return exit.getTime() - entry.getTime();
}

// ============================================================================
// ANALYTICS CALCULATIONS (from localStorage only)
// ============================================================================

/**
 * Calculate all metrics from localStorage trades
 * @param {Object} options - { strategyFilter, dateRange }
 * @returns {Object} Computed metrics
 */
export function calculateMetrics(options = {}) {
  const trades = getAllTrades();
  const { strategyFilter, startDate, endDate } = options;
  
  // Filter trades
  let filtered = trades;
  
  if (strategyFilter && strategyFilter !== 'ALL') {
    filtered = filtered.filter(t => 
      (t.strategy_id || t.strategyId) === strategyFilter
    );
  }
  
  if (startDate) {
    filtered = filtered.filter(t => {
      const date = new Date(t.exitTime || t.close_ts);
      return date >= new Date(startDate);
    });
  }
  
  if (endDate) {
    filtered = filtered.filter(t => {
      const date = new Date(t.exitTime || t.close_ts);
      return date <= new Date(endDate);
    });
  }
  
  if (filtered.length === 0) {
    return getEmptyMetrics();
  }
  
  // Calculate metrics
  const wins = filtered.filter(t => (t.netPnL || t.net_pct || 0) > 0);
  const losses = filtered.filter(t => (t.netPnL || t.net_pct || 0) <= 0);
  
  const grossProfit = wins.reduce((sum, t) => sum + Math.abs(t.netPnL || t.net_pct || 0), 0);
  const grossLoss = losses.reduce((sum, t) => sum + Math.abs(t.netPnL || t.net_pct || 0), 0);
  const netPnL = grossProfit - grossLoss;
  
  const avgWin = wins.length > 0 ? grossProfit / wins.length : 0;
  const avgLoss = losses.length > 0 ? grossLoss / losses.length : 0;
  const largestWin = wins.length > 0 ? Math.max(...wins.map(t => t.netPnL || t.net_pct || 0)) : 0;
  const largestLoss = losses.length > 0 ? Math.min(...losses.map(t => t.netPnL || t.net_pct || 0)) : 0;
  
  const winRate = (wins.length / filtered.length) * 100;
  const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : (grossProfit > 0 ? Infinity : 0);
  const expectancy = (winRate / 100 * avgWin) - ((100 - winRate) / 100 * avgLoss);
  
  // Calculate max drawdown
  const { maxDrawdown, maxDrawdownPct, equityCurve, cumulativePnl } = calculateEquityAndDrawdown(filtered);
  
  return {
    total_trades: filtered.length,
    wins: wins.length,
    losses: losses.length,
    win_rate: winRate,
    net_pnl: netPnL,
    net_pnl_percent: netPnL, // For percent-based trades
    gross_profit: grossProfit,
    gross_loss: grossLoss,
    profit_factor: profitFactor,
    expectancy: expectancy,
    avg_win: avgWin,
    avg_loss: avgLoss,
    largest_win: largestWin,
    largest_loss: largestLoss,
    max_drawdown_pct: maxDrawdownPct,
    max_drawdown_value: maxDrawdown,
    risk_reward_ratio: avgLoss > 0 ? avgWin / avgLoss : 0
  };
}

function getEmptyMetrics() {
  return {
    total_trades: 0,
    wins: 0,
    losses: 0,
    win_rate: 0,
    net_pnl: 0,
    net_pnl_percent: 0,
    gross_profit: 0,
    gross_loss: 0,
    profit_factor: 0,
    expectancy: 0,
    avg_win: 0,
    avg_loss: 0,
    largest_win: 0,
    largest_loss: 0,
    max_drawdown_pct: 0,
    max_drawdown_value: 0,
    risk_reward_ratio: 0
  };
}

/**
 * Calculate equity curve and drawdown from trades
 */
function calculateEquityAndDrawdown(trades) {
  if (!trades || trades.length === 0) {
    return {
      maxDrawdown: 0,
      maxDrawdownPct: 0,
      equityCurve: [{ t: Date.now(), v: 100, drawdown: 0 }],
      cumulativePnl: [{ t: Date.now(), v: 0 }]
    };
  }
  
  // Sort by exit time ascending for equity curve
  const sorted = [...trades].sort((a, b) => {
    const dateA = new Date(a.exitTime || a.close_ts);
    const dateB = new Date(b.exitTime || b.close_ts);
    return dateA - dateB;
  });
  
  const startingEquity = 100; // Start at 100%
  let equity = startingEquity;
  let peak = startingEquity;
  let maxDrawdown = 0;
  let maxDrawdownPct = 0;
  let cumulativePnL = 0;
  
  const equityCurve = [{ t: new Date(sorted[0].exitTime || sorted[0].close_ts).getTime() - 1000, v: startingEquity, drawdown: 0 }];
  const cumulativePnl = [{ t: new Date(sorted[0].exitTime || sorted[0].close_ts).getTime() - 1000, v: 0 }];
  
  sorted.forEach(trade => {
    const pnlPct = trade.net_pct ?? trade.netPnL ?? 0;
    const timestamp = new Date(trade.exitTime || trade.close_ts).getTime();
    
    // Update equity (compound)
    equity = equity * (1 + pnlPct / 100);
    cumulativePnL += pnlPct;
    
    // Track peak and drawdown
    if (equity > peak) {
      peak = equity;
    }
    const drawdown = peak - equity;
    const drawdownPct = peak > 0 ? (drawdown / peak) * 100 : 0;
    
    if (drawdownPct > maxDrawdownPct) {
      maxDrawdownPct = drawdownPct;
      maxDrawdown = drawdown;
    }
    
    equityCurve.push({ t: timestamp, v: equity, drawdown: drawdownPct });
    cumulativePnl.push({ t: timestamp, v: cumulativePnL });
  });
  
  return { maxDrawdown, maxDrawdownPct, equityCurve, cumulativePnl };
}

/**
 * Get equity curve from localStorage trades
 */
export function getEquityCurve() {
  const trades = getAllTrades();
  const { equityCurve } = calculateEquityAndDrawdown(trades);
  return equityCurve;
}

/**
 * Get cumulative P&L curve from localStorage trades
 */
export function getCumulativePnLCurve() {
  const trades = getAllTrades();
  const { cumulativePnl } = calculateEquityAndDrawdown(trades);
  return cumulativePnl;
}

/**
 * Get time-based P&L breakdown
 */
export function getTimePnL() {
  const trades = getAllTrades();
  
  // By day of week
  const byDay = [
    { label: 'Mon', pnl: 0 },
    { label: 'Tue', pnl: 0 },
    { label: 'Wed', pnl: 0 },
    { label: 'Thu', pnl: 0 },
    { label: 'Fri', pnl: 0 }
  ];
  
  // By hour
  const byHour = [];
  for (let i = 9; i <= 16; i++) {
    byHour.push({ label: `${i > 12 ? i - 12 : i}${i >= 12 ? 'PM' : 'AM'}`, pnl: 0 });
  }
  
  trades.forEach(trade => {
    const date = new Date(trade.exitTime || trade.close_ts);
    const dayOfWeek = date.getDay(); // 0=Sun, 1=Mon, ...
    const hour = date.getHours();
    const pnl = trade.net_pct ?? trade.netPnL ?? 0;
    
    // Day of week (skip weekends)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      byDay[dayOfWeek - 1].pnl += pnl;
    }
    
    // Hour (market hours 9-16)
    if (hour >= 9 && hour <= 16) {
      byHour[hour - 9].pnl += pnl;
    }
  });
  
  return { byDay, byHour };
}

/**
 * Get strategy attribution from localStorage trades
 */
export function getStrategyAttribution() {
  const trades = getAllTrades();
  const strategyMap = new Map();
  
  trades.forEach(trade => {
    const strategyId = trade.strategy_id || trade.strategyId || 'unknown';
    const pnl = trade.net_pct ?? trade.netPnL ?? 0;
    
    if (!strategyMap.has(strategyId)) {
      strategyMap.set(strategyId, {
        name: trade.strategyName || strategyId,
        total_pnl: 0,
        trade_count: 0,
        wins: 0,
        losses: 0
      });
    }
    
    const data = strategyMap.get(strategyId);
    data.total_pnl += pnl;
    data.trade_count += 1;
    if (pnl > 0) data.wins += 1;
    else data.losses += 1;
  });
  
  return Array.from(strategyMap.values());
}

/**
 * Get P&L distribution for histogram
 */
export function getPnLDistribution() {
  const trades = getAllTrades();
  if (trades.length === 0) return { bins: [], counts: [] };
  
  const pnls = trades.map(t => t.net_pct ?? t.netPnL ?? 0);
  const min = Math.min(...pnls);
  const max = Math.max(...pnls);
  const range = max - min || 1;
  const binCount = 10;
  const binSize = range / binCount;
  
  const bins = [];
  const counts = [];
  
  for (let i = 0; i < binCount; i++) {
    const binStart = min + (i * binSize);
    const binEnd = min + ((i + 1) * binSize);
    bins.push(`${binStart.toFixed(1)} to ${binEnd.toFixed(1)}`);
    counts.push(0);
  }
  
  pnls.forEach(pnl => {
    const binIndex = Math.min(Math.floor((pnl - min) / binSize), binCount - 1);
    counts[binIndex]++;
  });
  
  return { bins, counts };
}

/**
 * Get trades for a specific date (for calendar view)
 */
export function getTradesForDate(dateStr) {
  const trades = getAllTrades();
  return trades.filter(trade => {
    const tradeDate = new Date(trade.exitTime || trade.close_ts).toISOString().split('T')[0];
    return tradeDate === dateStr;
  });
}

/**
 * Get heatmap data for calendar
 */
export function getCalendarHeatmap(year, month) {
  const trades = getAllTrades();
  const heatmap = new Map();
  
  trades.forEach(trade => {
    const date = new Date(trade.exitTime || trade.close_ts);
    if (date.getFullYear() === year && date.getMonth() === month) {
      const day = date.getDate();
      const pnl = trade.net_pct ?? trade.netPnL ?? 0;
      
      if (!heatmap.has(day)) {
        heatmap.set(day, { pnl: 0, count: 0, wins: 0, losses: 0 });
      }
      const data = heatmap.get(day);
      data.pnl += pnl;
      data.count += 1;
      if (pnl > 0) data.wins += 1;
      else data.losses += 1;
    }
  });
  
  return heatmap;
}

/**
 * Get recent trades (for dashboard)
 */
export function getRecentTrades(limit = 10) {
  const trades = getAllTrades();
  return trades.slice(0, limit);
}

// ============================================================================
// EXPORT FOR BACKEND COMPATIBILITY
// ============================================================================

/**
 * Format trades for backend-compatible API response
 * This allows existing components to work without changes
 */
export function getTradesAsBackendFormat() {
  const trades = getAllTrades();
  return {
    trades: trades.map(t => ({
      id: t.id,
      strategy_id: t.strategy_id || t.strategyId,
      open_side: t.open_side || t.direction,
      open_price: t.open_price || t.entryPrice,
      open_ts: t.open_ts || t.entryTime,
      close_side: t.close_side,
      close_price: t.close_price || t.exitPrice,
      close_ts: t.close_ts || t.exitTime,
      gross_pct: t.gross_pct,
      fee_pct_total: t.fee_pct_total,
      net_pct: t.net_pct,
      meta: t.meta
    }))
  };
}

/**
 * Get full dashboard data from localStorage
 */
export function getDashboardData() {
  const metrics = calculateMetrics();
  const { equityCurve, cumulativePnl } = calculateEquityAndDrawdown(getAllTrades());
  const { byDay, byHour } = getTimePnL();
  const recentTrades = getRecentTrades(15);
  const strategyAttribution = getStrategyAttribution();
  
  return {
    account: {
      starting_capital: 100,
      current_equity: equityCurve[equityCurve.length - 1]?.v || 100,
      cash: 100
    },
    metrics: metrics,
    risk: {
      avg_win: metrics.avg_win,
      avg_loss: metrics.avg_loss,
      largest_win: metrics.largest_win,
      largest_loss: metrics.largest_loss,
      profit_factor: metrics.profit_factor,
      risk_reward_ratio: metrics.risk_reward_ratio
    },
    strategies: strategyAttribution,
    equity_curve: equityCurve,
    cumulative_pnl_curve: cumulativePnl,
    time_pnl_by_day: byDay,
    time_pnl_by_hour: byHour,
    recent_trades: recentTrades,
    computed_at: new Date().toISOString()
  };
}

/**
 * Get full dashboard data from backend API (async)
 * Falls back to localStorage if backend unavailable
 */
export async function getDashboardDataAsync() {
  try {
    // Fetch all data in parallel from backend
    const [analyticsRes, tradesRes, equityRes, heatmapRes] = await Promise.all([
      fetchAnalyticsFromBackend(),
      fetchTradesFromBackend({ limit: 100 }),
      fetchEquityCurveFromBackend(),
      fetchHeatmapFromBackend()
    ]);
    
    // If backend is available and returned data
    if (analyticsRes && !analyticsRes.empty) {
      const metrics = analyticsRes.metrics || {};
      const byStrategy = analyticsRes.by_strategy || {};
      
      // Build strategy attribution from backend data
      const strategyAttribution = Object.entries(byStrategy).map(([stratId, data]) => ({
        name: stratId,
        total_pnl: data.net_return_pct || 0,
        trade_count: data.trade_count || 0,
        wins: data.wins || 0,
        losses: data.losses || 0,
        win_rate: data.win_rate || 0
      }));
      
      // Transform equity curve to expected format
      const equityCurve = (equityRes || []).map(pt => ({
        t: new Date(pt.ts).getTime(),
        v: 100 + (pt.equity_pct || 0),
        drawdown: pt.drawdown_pct || 0
      }));
      
      // Cumulative P&L curve
      const cumulativePnl = (equityRes || []).map(pt => ({
        t: new Date(pt.ts).getTime(),
        v: pt.equity_pct || 0
      }));
      
      // Time P&L from heatmap
      const byDay = heatmapRes?.by_day || [];
      const byHour = heatmapRes?.by_hour || [];
      
      // Recent trades
      const recentTrades = (tradesRes || []).slice(0, 15);
      
      return {
        source: 'backend',
        account: {
          starting_capital: 100,
          current_equity: equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].v : 100,
          cash: 100
        },
        metrics: {
          total_trades: metrics.trade_count || 0,
          wins: metrics.wins || 0,
          losses: metrics.losses || 0,
          win_rate: metrics.win_rate || 0,
          net_pnl: metrics.net_return_pct || 0,
          net_pnl_percent: metrics.net_return_pct || 0,
          gross_profit: 0,
          gross_loss: 0,
          profit_factor: typeof metrics.profit_factor === 'string' ? Infinity : (metrics.profit_factor || 0),
          expectancy: metrics.expectancy || 0,
          avg_win: metrics.avg_win_pct || 0,
          avg_loss: metrics.avg_loss_pct || 0,
          largest_win: metrics.largest_win_pct || 0,
          largest_loss: metrics.largest_loss_pct || 0,
          max_drawdown_pct: metrics.max_drawdown_pct || 0,
          max_drawdown_value: metrics.max_drawdown_pct || 0,
          risk_reward_ratio: metrics.avg_loss_pct ? (metrics.avg_win_pct / Math.abs(metrics.avg_loss_pct)) : 0
        },
        risk: {
          avg_win: metrics.avg_win_pct || 0,
          avg_loss: metrics.avg_loss_pct || 0,
          largest_win: metrics.largest_win_pct || 0,
          largest_loss: metrics.largest_loss_pct || 0,
          profit_factor: typeof metrics.profit_factor === 'string' ? Infinity : (metrics.profit_factor || 0),
          risk_reward_ratio: metrics.avg_loss_pct ? (metrics.avg_win_pct / Math.abs(metrics.avg_loss_pct)) : 0
        },
        strategies: strategyAttribution,
        equity_curve: equityCurve.length > 0 ? equityCurve : [{ t: Date.now(), v: 100, drawdown: 0 }],
        cumulative_pnl_curve: cumulativePnl.length > 0 ? cumulativePnl : [{ t: Date.now(), v: 0 }],
        time_pnl_by_day: byDay,
        time_pnl_by_hour: byHour,
        recent_trades: recentTrades,
        computed_at: analyticsRes.computed_at || new Date().toISOString()
      };
    }
    
    // If analytics says empty, but we got trades, compute locally
    if (tradesRes && tradesRes.length > 0) {
      console.log('[TradeService] Backend has trades but no analytics, computing locally');
    }
    
  } catch (e) {
    console.warn('[TradeService] Backend dashboard fetch failed:', e.message);
  }
  
  // Fallback to localStorage
  console.log('[TradeService] Using localStorage for dashboard data');
  return { ...getDashboardData(), source: 'localStorage' };
}
