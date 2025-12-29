/**
 * Real-Time Trade Tracker for FlowGrid Live Strategies
 * 
 * Tracks trades in real-time when strategy is ON (live running).
 * Detects signal changes (BUY/SELL/HOLD), manages positions, calculates P&L.
 * Stores trades persistently in localStorage for analytics display.
 * 
 * CRITICAL: Positions are now isolated per-strategy to prevent cross-contamination.
 * Each strategy maintains its own position state and trades are tagged with strategy_id.
 */

const STORAGE_KEY = 'flowgrid_live_trades_v1';
const POSITION_KEY = 'flowgrid_live_position_v1';
const POSITIONS_BY_STRATEGY_KEY = 'flowgrid_positions_by_strategy_v1';

// Import to check if strategy is enabled before tracking
import { getEnabledStrategies, isStrategyRunning } from './services/StrategyRunner';

/**
 * Trade object structure:
 * {
 *   id: number (timestamp),
 *   strategyId: string,
 *   strategyName: string,
 *   direction: 'LONG' | 'SHORT',
 *   symbol: string,
 *   timeframe: string,
 *   entryTime: string (ISO),
 *   entryPrice: number,
 *   entrySignal: 'BUY' | 'SELL',
 *   exitTime: string (ISO),
 *   exitPrice: number,
 *   exitSignal: 'SELL' | 'BUY' | 'HOLD',
 *   grossPnL: number,
 *   netPnL: number,
 *   fees: number,
 *   holdingDuration: number (milliseconds),
 *   shares: number
 * }
 * 
 * Position object structure:
 * {
 *   strategyId: string,
 *   type: 'LONG' | 'SHORT',
 *   entryTime: string (ISO),
 *   entryPrice: number,
 *   entrySignal: 'BUY' | 'SELL',
 *   symbol: string,
 *   timeframe: string,
 *   shares: number
 * }
 */

/**
 * Get all stored trades
 */
export function getAllTrades() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch (e) {
    console.warn('[TradeTracker] Failed to read trades', e);
    return [];
  }
}

/**
 * Get trades for a specific strategy
 */
export function getTradesForStrategy(strategyId) {
  const allTrades = getAllTrades();
  return allTrades.filter(t => t.strategyId === strategyId);
}

/**
 * Get all positions by strategy (isolated per strategy)
 */
function getAllPositionsByStrategy() {
  try {
    const stored = localStorage.getItem(POSITIONS_BY_STRATEGY_KEY);
    return stored ? JSON.parse(stored) : {};
  } catch (e) {
    console.warn('[TradeTracker] Failed to read positions by strategy', e);
    return {};
  }
}

/**
 * Save all positions by strategy
 */
function saveAllPositionsByStrategy(positions) {
  try {
    localStorage.setItem(POSITIONS_BY_STRATEGY_KEY, JSON.stringify(positions));
  } catch (e) {
    console.warn('[TradeTracker] Failed to save positions by strategy', e);
  }
}

/**
 * Get current open position for a SPECIFIC strategy (isolated)
 * @param {string} strategyId - Strategy ID to get position for
 */
export function getPositionForStrategy(strategyId) {
  if (!strategyId) return null;
  const positions = getAllPositionsByStrategy();
  return positions[strategyId] || null;
}

/**
 * Save position for a SPECIFIC strategy (isolated)
 * @param {string} strategyId - Strategy ID
 * @param {Object|null} position - Position object or null to clear
 */
function savePositionForStrategy(strategyId, position) {
  if (!strategyId) return;
  const positions = getAllPositionsByStrategy();
  if (position === null) {
    delete positions[strategyId];
  } else {
    positions[strategyId] = position;
  }
  saveAllPositionsByStrategy(positions);
}

/**
 * Clear position for a specific strategy
 */
export function clearPositionForStrategy(strategyId) {
  if (!strategyId) return;
  savePositionForStrategy(strategyId, null);
  console.log(`[TradeTracker] Cleared position for strategy: ${strategyId}`);
}

/**
 * Get current open position (LEGACY - returns first position found for backwards compatibility)
 * @deprecated Use getPositionForStrategy(strategyId) instead
 */
export function getCurrentPosition() {
  try {
    // First try legacy single position
    const stored = localStorage.getItem(POSITION_KEY);
    if (stored) return JSON.parse(stored);
    // Then try first position from strategy-isolated store
    const positions = getAllPositionsByStrategy();
    const strategyIds = Object.keys(positions);
    if (strategyIds.length > 0) {
      return positions[strategyIds[0]];
    }
    return null;
  } catch (e) {
    console.warn('[TradeTracker] Failed to read position', e);
    return null;
  }
}

/**
 * Save current position
 */
function savePosition(position) {
  try {
    if (position === null) {
      localStorage.removeItem(POSITION_KEY);
    } else {
      localStorage.setItem(POSITION_KEY, JSON.stringify(position));
    }
  } catch (e) {
    console.warn('[TradeTracker] Failed to save position', e);
  }
}

/**
 * Save trade to storage
 */
function saveTrade(trade) {
  try {
    const trades = getAllTrades();
    trades.push(trade);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trades));
    console.log(`[TradeTracker] Saved trade: ${trade.direction} ${trade.symbol} @ ${trade.exitPrice}, P&L: $${trade.netPnL.toFixed(2)}`);
    
    // Dispatch events for dashboard/analytics to refresh
    try {
      window.dispatchEvent(new Event('flowgrid:trades-updated'));
      window.dispatchEvent(new CustomEvent('flowgrid:trade-completed', { detail: trade }));
    } catch (e) {}
  } catch (e) {
    console.warn('[TradeTracker] Failed to save trade', e);
  }
}

/**
 * Clear all trades (for testing/reset)
 */
export function clearAllTrades() {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(POSITION_KEY);
    localStorage.removeItem(POSITIONS_BY_STRATEGY_KEY);
    window.dispatchEvent(new Event('flowgrid:trades-updated'));
    console.log('[TradeTracker] Cleared all trades and positions (including per-strategy positions)');
  } catch (e) {
    console.warn('[TradeTracker] Failed to clear trades', e);
  }
}

/**
 * Calculate fees (simple model)
 */
function calculateFees(shares, price) {
  const commission = 0; // Could make configurable
  const slippage = shares * price * 0.0001; // 0.01% slippage
  return commission + slippage;
}

/**
 * Main trade tracking function - call this on each workflow execution result
 * 
 * CRITICAL: Only tracks trades when strategy is formally enabled.
 * Uses per-strategy isolated positions to prevent cross-contamination.
 * 
 * @param {Object} result - Workflow execution result from backend
 * @param {Object} config - Configuration { strategyId, strategyName, symbol, timeframe, shares }
 * @returns {Object|null} - Trade object if a trade was closed, null otherwise
 */
export function trackTrade(result, config) {
  try {
    const strategyId = config.strategyId;
    
    // CRITICAL CHECK: Only track trades for enabled strategies
    if (!strategyId) {
      console.warn('[TradeTracker] No strategyId provided - trade not tracked');
      return null;
    }
    
    // Check if this strategy is enabled/running
    try {
      const enabledStrategies = getEnabledStrategies();
      const running = isStrategyRunning(strategyId);
      const enabled = enabledStrategies[strategyId];
      
      if (!enabled && !running) {
        console.log(`[TradeTracker] Strategy "${strategyId}" is not enabled - trade not tracked`);
        return null;
      }
    } catch (e) {
      // If we can't check, proceed cautiously but log warning
      console.warn('[TradeTracker] Could not verify strategy enabled state:', e);
    }
    
    // Extract signal from result
    const signal = normalizeSignal(
      result.finalSignal || 
      result.final_decision || 
      result.summary?.status || 
      'HOLD'
    );

    // Extract current price
    const currentPrice = result.latest_data?.close || 
                        result.latest_data?.price || 
                        null;

    if (currentPrice === null || currentPrice === undefined) {
      console.warn('[TradeTracker] No price data in result');
      return null;
    }

    const now = new Date().toISOString();
    
    // Use strategy-isolated position (not global)
    const openPosition = getPositionForStrategy(strategyId);

    // Default shares if not provided
    const shares = config.shares || 100;

    // No position open for THIS strategy
    if (!openPosition) {
      if (signal === 'BUY') {
        // Open LONG position
        const newPosition = {
          strategyId: strategyId,
          type: 'LONG',
          entryTime: now,
          entryPrice: currentPrice,
          entrySignal: 'BUY',
          symbol: config.symbol,
          timeframe: config.timeframe,
          shares: shares
        };
        savePositionForStrategy(strategyId, newPosition);
        console.log(`[TradeTracker] Opened LONG position for ${strategyId}: ${config.symbol} @ ${currentPrice}`);
        return null; // No trade closed yet
      } else if (signal === 'SELL') {
        // Open SHORT position
        const newPosition = {
          strategyId: strategyId,
          type: 'SHORT',
          entryTime: now,
          entryPrice: currentPrice,
          entrySignal: 'SELL',
          symbol: config.symbol,
          timeframe: config.timeframe,
          shares: shares
        };
        savePositionForStrategy(strategyId, newPosition);
        console.log(`[TradeTracker] Opened SHORT position for ${strategyId}: ${config.symbol} @ ${currentPrice}`);
        return null; // No trade closed yet
      }
      // HOLD signal with no position - do nothing
      return null;
    }
    
    // CRITICAL: Verify open position belongs to THIS strategy
    if (openPosition.strategyId !== strategyId) {
      console.warn(`[TradeTracker] Position belongs to different strategy (${openPosition.strategyId}), not ${strategyId}`);
      return null;
    }

    // Position is open for THIS strategy - check for exit
    if (openPosition.type === 'LONG') {
      if (signal === 'SELL' || signal === 'HOLD') {
        // Close LONG position
        const entryTime = new Date(openPosition.entryTime);
        const exitTime = new Date(now);
        const holdingDuration = exitTime.getTime() - entryTime.getTime();
        
        const grossPnL = (currentPrice - openPosition.entryPrice) * openPosition.shares;
        const fees = calculateFees(openPosition.shares, openPosition.entryPrice) + 
                    calculateFees(openPosition.shares, currentPrice);
        const netPnL = grossPnL - fees;

        const trade = {
          id: Date.now(),
          strategyId: openPosition.strategyId,
          strategyName: config.strategyName || openPosition.strategyId,
          direction: 'LONG',
          symbol: openPosition.symbol,
          timeframe: openPosition.timeframe,
          entryTime: openPosition.entryTime,
          entryPrice: openPosition.entryPrice,
          entrySignal: openPosition.entrySignal,
          exitTime: now,
          exitPrice: currentPrice,
          exitSignal: signal,
          grossPnL: grossPnL,
          netPnL: netPnL,
          fees: fees,
          holdingDuration: holdingDuration,
          shares: openPosition.shares
        };

        saveTrade(trade);
        
        // If signal is SELL, open opposite SHORT position for THIS strategy
        if (signal === 'SELL') {
          const newPosition = {
            strategyId: strategyId,
            type: 'SHORT',
            entryTime: now,
            entryPrice: currentPrice,
            entrySignal: 'SELL',
            symbol: config.symbol,
            timeframe: config.timeframe,
            shares: shares
          };
          savePositionForStrategy(strategyId, newPosition);
          console.log(`[TradeTracker] ${strategyId}: Reversed LONG → SHORT @ ${currentPrice}`);
        } else {
          // HOLD - just close position for THIS strategy
          savePositionForStrategy(strategyId, null);
          console.log(`[TradeTracker] ${strategyId}: Closed LONG position @ ${currentPrice}`);
        }

        return trade;
      }
    } else if (openPosition.type === 'SHORT') {
      if (signal === 'BUY' || signal === 'HOLD') {
        // Close SHORT position
        const entryTime = new Date(openPosition.entryTime);
        const exitTime = new Date(now);
        const holdingDuration = exitTime.getTime() - entryTime.getTime();
        
        const grossPnL = (openPosition.entryPrice - currentPrice) * openPosition.shares;
        const fees = calculateFees(openPosition.shares, openPosition.entryPrice) + 
                    calculateFees(openPosition.shares, currentPrice);
        const netPnL = grossPnL - fees;

        const trade = {
          id: Date.now(),
          strategyId: openPosition.strategyId,
          strategyName: config.strategyName || openPosition.strategyId,
          direction: 'SHORT',
          symbol: openPosition.symbol,
          timeframe: openPosition.timeframe,
          entryTime: openPosition.entryTime,
          entryPrice: openPosition.entryPrice,
          entrySignal: openPosition.entrySignal,
          exitTime: now,
          exitPrice: currentPrice,
          exitSignal: signal,
          grossPnL: grossPnL,
          netPnL: netPnL,
          fees: fees,
          holdingDuration: holdingDuration,
          shares: openPosition.shares
        };

        saveTrade(trade);

        // If signal is BUY, open opposite LONG position for THIS strategy
        if (signal === 'BUY') {
          const newPosition = {
            strategyId: strategyId,
            type: 'LONG',
            entryTime: now,
            entryPrice: currentPrice,
            entrySignal: 'BUY',
            symbol: config.symbol,
            timeframe: config.timeframe,
            shares: shares
          };
          savePositionForStrategy(strategyId, newPosition);
          console.log(`[TradeTracker] ${strategyId}: Reversed SHORT → LONG @ ${currentPrice}`);
        } else {
          // HOLD - just close position for THIS strategy
          savePositionForStrategy(strategyId, null);
          console.log(`[TradeTracker] ${strategyId}: Closed SHORT position @ ${currentPrice}`);
        }

        return trade;
      }
    }

    return null; // No trade action taken
  } catch (e) {
    console.error('[TradeTracker] Error tracking trade', e);
    return null;
  }
}

/**
 * Normalize signal to BUY/SELL/HOLD
 */
function normalizeSignal(signal) {
  if (!signal) return 'HOLD';
  const s = String(signal).toUpperCase().trim();
  if (s === 'BUY' || s === 'LONG') return 'BUY';
  if (s === 'SELL' || s === 'SHORT') return 'SELL';
  return 'HOLD';
}

/**
 * Get trade statistics
 */
export function getTradeStats() {
  const trades = getAllTrades();
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winningTrades: 0,
      losingTrades: 0,
      winRate: 0,
      totalPnL: 0,
      avgPnL: 0,
      bestTrade: 0,
      worstTrade: 0
    };
  }

  const winningTrades = trades.filter(t => t.netPnL > 0);
  const losingTrades = trades.filter(t => t.netPnL <= 0);
  const totalPnL = trades.reduce((sum, t) => sum + t.netPnL, 0);
  const avgPnL = totalPnL / trades.length;
  const bestTrade = Math.max(...trades.map(t => t.netPnL));
  const worstTrade = Math.min(...trades.map(t => t.netPnL));

  return {
    totalTrades: trades.length,
    winningTrades: winningTrades.length,
    losingTrades: losingTrades.length,
    winRate: (winningTrades.length / trades.length) * 100,
    totalPnL: totalPnL,
    avgPnL: avgPnL,
    bestTrade: bestTrade,
    worstTrade: worstTrade
  };
}
