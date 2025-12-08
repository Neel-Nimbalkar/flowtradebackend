/**
 * Backtesting Engine - TradingView Style
 * 
 * Features:
 * - Percentage-based position sizing (risk % of equity)
 * - Realistic fills (next bar open, not signal bar close)
 * - Pyramiding support (multiple entries)
 * - Intrabar price checking for TP/SL
 * - Compounding equity growth
 * - Bar-by-bar replay simulation
 */

const SAVES_KEY = 'flowgrid_workflow_v1::saves';

/**
 * Main backtest runner
 */
export async function runBacktest(config) {
  const {
    strategyName,
    symbol,
    timeframe,
    startDate,
    endDate,
    startingCapital,
    fees = 0.001, // 0.1% default
    slippage = 0.0005, // 0.05% default
    orderType = 'market',
    takeProfitPct = 0,
    stopLossPct = 0,
    sharesPerTrade = 100,
    commissionPerTrade = 0,
    usePercentOfEquity = false,  // TradingView style: use % of equity instead of fixed shares
    percentOfEquity = 10,         // Default 10% of equity per trade
    pyramiding = 1,               // Max concurrent positions in same direction (1 = no pyramiding)
    fillOnNextBar = true          // TradingView default: fill at next bar open
  } = config;

  console.log('[BacktestEngine] Starting TradingView-style backtest...', config);

  // Step 1: Load the saved strategy
  const workflow = loadStrategy(strategyName);
  if (!workflow) {
    throw new Error(`Strategy "${strategyName}" not found. Create a strategy in the Workflow Builder first.`);
  }

  // Step 2: Fetch historical market data
  const historicalData = await fetchHistoricalData(symbol, timeframe, startDate, endDate);
  if (!historicalData || historicalData.length === 0) {
    throw new Error(`No historical data available for ${symbol} (${timeframe}) from ${startDate} to ${endDate}. Try a different date range or timeframe.`);
  }

  console.log(`[BacktestEngine] Loaded ${historicalData.length} candles`);

  // Step 3: Generate signals from strategy with configuration
  const signals = await generateSignals(workflow, historicalData, symbol, timeframe, {
    takeProfitPct,
    stopLossPct,
    sharesPerTrade,
    startingCapital,
    commissionPerTrade
  });
  console.log(`[BacktestEngine] Generated ${signals.length} signals`);

  // Step 4: Convert signals to trades with TradingView-style execution (may include open position)
  const { trades, openPosition } = convertSignalsToTradesTradingViewStyle(signals, historicalData, {
    fees,
    slippage,
    takeProfitPct,
    stopLossPct,
    sharesPerTrade,
    commissionPerTrade,
    usePercentOfEquity: true, // Enable TradingView % sizing
    percentOfEquity,
    pyramiding,
    fillOnNextBar,
    startingCapital
  });
  console.log(`[BacktestEngine] Executed ${trades.length} trades${openPosition ? ' (1 open position)' : ''}`);

  // Step 5: Calculate performance metrics
  const metrics = calculateMetrics(trades, startingCapital, historicalData);

  // Step 6: Generate equity curve
  const equityCurve = generateEquityCurve(trades, startingCapital, historicalData);

  // Step 7: Generate drawdown data
  const drawdownData = calculateDrawdown(equityCurve);

  // Calculate Open P&L from unclosed position
  let openPnL = 0;
  if (openPosition) {
    const lastBar = historicalData[historicalData.length - 1];
    const lastPrice = parseFloat(lastBar.c || lastBar.close || 0);
    const entryPrice = openPosition.entryPrice;
    const shares = openPosition.shares;
    
    if (openPosition.type === 'long') {
      openPnL = (lastPrice - entryPrice) * shares;
    } else {
      openPnL = (entryPrice - lastPrice) * shares;
    }
  }
  
  // Calculate current capital (closed trades + open P&L)
  const closedEquity = equityCurve.length > 0 ? equityCurve[equityCurve.length - 1].equity : startingCapital;
  const currentCapital = closedEquity + openPnL;
  
  // Add to metrics
  metrics.currentCapital = currentCapital;
  metrics.openPnL = openPnL;
  metrics.openPosition = openPosition; // Include for reference

  return {
    config,
    trades,
    metrics,
    equityCurve,
    drawdownData,
    historicalData,
    signals
  };
}

/**
 * Load saved strategy from localStorage
 */
function loadStrategy(strategyName) {
  try {
    const raw = localStorage.getItem(SAVES_KEY);
    if (!raw) return null;
    const saves = JSON.parse(raw);
    return saves[strategyName];
  } catch (e) {
    console.error('[BacktestEngine] Failed to load strategy', e);
    return null;
  }
}

/**
 * Fetch historical market data
 */
async function fetchHistoricalData(symbol, timeframe, startDate, endDate) {
  try {
    // Get Alpaca credentials
    const alpacaKeyId = localStorage.getItem('alpaca_key_id');
    const alpacaSecretKey = localStorage.getItem('alpaca_secret_key');

    // Check if credentials are configured
    if (!alpacaKeyId || !alpacaSecretKey) {
      throw new Error('Alpaca API credentials not found. Please configure them in Dashboard Settings.');
    }

    const payload = {
      symbol,
      timeframe,
      start: startDate,
      end: endDate,
      alpacaKeyId,
      alpacaSecretKey
    };

    console.log(`[BacktestEngine] Fetching data for ${symbol} (${timeframe}) from ${startDate} to ${endDate}`);

    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    const endpoints = [
      `${baseUrl}/backtest_data`,
      'http://localhost:5000/backtest_data',
      'http://127.0.0.1:5000/backtest_data',
      '/backtest_data'
    ];

    let lastError = null;
    for (const url of endpoints) {
      try {
        console.log(`[BacktestEngine] Trying endpoint: ${url}`);
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        const data = await response.json();
        if (data.error) throw new Error(data.error);
        
        // Normalize data format
        const bars = data.bars || data.data || data;
        console.log(`[BacktestEngine] Successfully fetched ${bars.length || 0} bars from ${url}`);
        return bars;
      } catch (err) {
        lastError = err;
        continue;
      }
    }

    throw lastError || new Error('Failed to fetch historical data');
  } catch (err) {
    console.error('[BacktestEngine] Historical data fetch error', err);
    throw err;
  }
}

/**
 * Generate signals by running the workflow against each historical candle
 */
async function generateSignals(workflow, historicalData, symbol, timeframe, backtestConfig = {}) {
  const signals = [];
  
  try {
    const alpacaKeyId = localStorage.getItem('alpaca_key_id');
    const alpacaSecretKey = localStorage.getItem('alpaca_secret_key');

    // Prepare workflow blocks - handle both direct array and object with nodes property
    let workflowBlocks;
    if (Array.isArray(workflow)) {
      // Workflow is already an array of nodes
      workflowBlocks = workflow.map(n => ({
        id: n.id,
        type: n.type,
        params: n.configValues || n.params || {}
      }));
    } else if (workflow.nodes && Array.isArray(workflow.nodes)) {
      // Workflow has a nodes property
      workflowBlocks = workflow.nodes.map(n => ({
        id: n.id,
        type: n.type,
        params: n.configValues || n.params || {}
      }));
    } else {
      throw new Error('Invalid workflow format - expected array or object with nodes');
    }

    console.log(`[BacktestEngine] Prepared ${workflowBlocks.length} workflow blocks`, workflowBlocks);

    const payload = {
      symbol,
      timeframe,
      workflow: workflowBlocks,
      historicalData, // Pass all historical data
      backtestMode: true,
      alpacaKeyId,
      alpacaSecretKey,
      config: {
        takeProfitPct: backtestConfig.takeProfitPct || 0,
        stopLossPct: backtestConfig.stopLossPct || 0,
        sharesPerTrade: backtestConfig.sharesPerTrade || 100,
        initialCapital: backtestConfig.startingCapital || 10000,
        commissionPerTrade: backtestConfig.commissionPerTrade || 0
      }
    };

    const baseUrl = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000';
    const endpoints = [
      `${baseUrl}/execute_backtest`,
      '/execute_backtest',
      'http://127.0.0.1:5000/execute_backtest',
      'http://localhost:5000/execute_backtest'
    ];

    let lastError = null;
    for (const url of endpoints) {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });

        if (!response.ok) {
          const text = await response.text();
          throw new Error(`HTTP ${response.status}: ${text}`);
        }

        const data = await response.json();
        if (data.error) throw new Error(data.error);

        // Extract signals from response
        return data.signals || [];
      } catch (err) {
        lastError = err;
        continue;
      }
    }

    throw lastError || new Error('Failed to generate signals');
  } catch (err) {
    console.error('[BacktestEngine] Signal generation error', err);
    throw err;
  }
}

/**
 * TRADINGVIEW-STYLE BACKTESTING ENGINE
 * 
 * Key features:
 * - Bar-by-bar replay (realistic timing)
 * - Next bar open fills (no lookahead bias)
 * - Percentage-based position sizing from equity
 * - Pyramiding support (multiple concurrent positions)
 * - Intrabar TP/SL checking (high/low simulation)
 * - Compounding equity growth
 */
function convertSignalsToTradesTradingViewStyle(signals, historicalData, config) {
  const {
    fees = 0.001,
    slippage = 0.0005,
    takeProfitPct = 0,
    stopLossPct = 0,
    sharesPerTrade = 100,
    commissionPerTrade = 0,
    usePercentOfEquity = false,
    percentOfEquity = 10,
    pyramiding = 1,
    fillOnNextBar = true,
    startingCapital = 10000
  } = config;

  const trades = [];
  let equity = startingCapital;
  let openPositions = []; // Array of { type, entryPrice, entryTime, entryBar, shares, tpPrice, slPrice }
  
  // Map signals to bar indices for quick lookup
  const signalMap = new Map();
  signals.forEach(signal => {
    const signalTime = new Date(signal.time || signal.timestamp || signal.t).getTime();
    const barIndex = historicalData.findIndex(bar => {
      const barTime = new Date(bar.t || bar.timestamp || bar.time).getTime();
      return Math.abs(barTime - signalTime) < 60000; // Within 1 minute
    });
    if (barIndex >= 0) {
      signalMap.set(barIndex, signal);
    }
  });

  console.log(`[TradingView Engine] Starting with $${equity}, ${pyramiding} max positions, ${usePercentOfEquity ? percentOfEquity + '% equity' : sharesPerTrade + ' shares'} per trade`);

  // Bar-by-bar replay
  for (let i = 0; i < historicalData.length; i++) {
    const bar = historicalData[i];
    const barTime = new Date(bar.t || bar.timestamp || bar.time);
    const open = parseFloat(bar.o || bar.open);
    const high = parseFloat(bar.h || bar.high);
    const low = parseFloat(bar.l || bar.low);
    const close = parseFloat(bar.c || bar.close);

    // Step 1: Check TP/SL for open positions on this bar (intrabar checking)
    const closedPositions = [];
    openPositions.forEach((pos, idx) => {
      let exitPrice = null;
      let exitReason = null;

      if (pos.type === 'long') {
        // Check SL first (hit low before high)
        if (pos.slPrice && low <= pos.slPrice) {
          exitPrice = pos.slPrice;
          exitReason = 'stop-loss';
        }
        // Check TP (hit high)
        else if (pos.tpPrice && high >= pos.tpPrice) {
          exitPrice = pos.tpPrice;
          exitReason = 'take-profit';
        }
      } else if (pos.type === 'short') {
        // Check SL first (hit high before low)
        if (pos.slPrice && high >= pos.slPrice) {
          exitPrice = pos.slPrice;
          exitReason = 'stop-loss';
        }
        // Check TP (hit low)
        else if (pos.tpPrice && low <= pos.tpPrice) {
          exitPrice = pos.tpPrice;
          exitReason = 'take-profit';
        }
      }

      if (exitPrice) {
        const trade = closeTrade(pos, exitPrice, barTime, i, historicalData, fees, commissionPerTrade, exitReason);
        trades.push(trade);
        equity += trade.netProfit;
        closedPositions.push(idx);
        console.log(`[Trade ${trades.length}] ${pos.type.toUpperCase()} closed via ${exitReason} at $${exitPrice.toFixed(2)}, P&L: $${trade.netProfit.toFixed(2)}, Equity: $${equity.toFixed(2)}`);
      }
    });

    // Remove closed positions
    for (let idx = closedPositions.length - 1; idx >= 0; idx--) {
      openPositions.splice(closedPositions[idx], 1);
    }

    // Step 2: Check for new signal
    const signal = signalMap.get(i);
    if (!signal) continue;

    const signalType = (signal.signal || signal.action || '').toUpperCase();
    if (signalType === 'HOLD' || signalType === 'WAIT') continue;

    // Step 3: Determine fill price (TradingView style: fill on next bar open)
    let fillPrice;
    let fillBar = i;
    if (fillOnNextBar && i + 1 < historicalData.length) {
      const nextBar = historicalData[i + 1];
      fillPrice = parseFloat(nextBar.o || nextBar.open);
      fillBar = i + 1;
    } else {
      fillPrice = close;
    }

    // Apply slippage
    if (signalType === 'BUY') {
      fillPrice *= (1 + slippage);
    } else if (signalType === 'SELL') {
      fillPrice *= (1 - slippage);
    }

    // Step 4: Check if we should open position or reverse
    const longCount = openPositions.filter(p => p.type === 'long').length;
    const shortCount = openPositions.filter(p => p.type === 'short').length;

    if (signalType === 'BUY') {
      // Close all SHORT positions first
      if (shortCount > 0) {
        openPositions.filter(p => p.type === 'short').forEach(pos => {
          const trade = closeTrade(pos, fillPrice, barTime, fillBar, historicalData, fees, commissionPerTrade, 'signal');
          trades.push(trade);
          equity += trade.netProfit;
          console.log(`[Trade ${trades.length}] SHORT reversed at $${fillPrice.toFixed(2)}, P&L: $${trade.netProfit.toFixed(2)}, Equity: $${equity.toFixed(2)}`);
        });
        openPositions = openPositions.filter(p => p.type !== 'short');
      }

      // Open LONG if under pyramiding limit
      if (longCount < pyramiding) {
        const shares = calculatePositionSize(equity, fillPrice, usePercentOfEquity, percentOfEquity, sharesPerTrade);
        const tpPrice = takeProfitPct > 0 ? fillPrice * (1 + takeProfitPct / 100) : null;
        const slPrice = stopLossPct > 0 ? fillPrice * (1 - stopLossPct / 100) : null;

        openPositions.push({
          type: 'long',
          entryPrice: fillPrice,
          entryTime: barTime,
          entryBar: fillBar,
          shares,
          tpPrice,
          slPrice
        });

        console.log(`[Position] LONG opened at $${fillPrice.toFixed(2)}, ${shares} shares (TP: ${tpPrice?.toFixed(2) || 'none'}, SL: ${slPrice?.toFixed(2) || 'none'}), Equity: $${equity.toFixed(2)}`);
      }
    } else if (signalType === 'SELL') {
      // Close all LONG positions first
      if (longCount > 0) {
        openPositions.filter(p => p.type === 'long').forEach(pos => {
          const trade = closeTrade(pos, fillPrice, barTime, fillBar, historicalData, fees, commissionPerTrade, 'signal');
          trades.push(trade);
          equity += trade.netProfit;
          console.log(`[Trade ${trades.length}] LONG reversed at $${fillPrice.toFixed(2)}, P&L: $${trade.netProfit.toFixed(2)}, Equity: $${equity.toFixed(2)}`);
        });
        openPositions = openPositions.filter(p => p.type !== 'long');
      }

      // Open SHORT if under pyramiding limit
      if (shortCount < pyramiding) {
        const shares = calculatePositionSize(equity, fillPrice, usePercentOfEquity, percentOfEquity, sharesPerTrade);
        const tpPrice = takeProfitPct > 0 ? fillPrice * (1 - takeProfitPct / 100) : null;
        const slPrice = stopLossPct > 0 ? fillPrice * (1 + stopLossPct / 100) : null;

        openPositions.push({
          type: 'short',
          entryPrice: fillPrice,
          entryTime: barTime,
          entryBar: fillBar,
          shares,
          tpPrice,
          slPrice
        });

        console.log(`[Position] SHORT opened at $${fillPrice.toFixed(2)}, ${shares} shares (TP: ${tpPrice?.toFixed(2) || 'none'}, SL: ${slPrice?.toFixed(2) || 'none'}), Equity: $${equity.toFixed(2)}`);
      }
    }
  }

  // Step 5: Keep open positions (don't auto-close) for Open P&L calculation
  const openPosition = openPositions.length > 0 ? openPositions[0] : null; // Return first open position if any
  
  if (openPosition) {
    console.log(`[TradingView Engine] Completed: ${trades.length} trades, 1 open position, Equity: $${equity.toFixed(2)}`);
  } else {
    console.log(`[TradingView Engine] Completed: ${trades.length} trades, Final Equity: $${equity.toFixed(2)} (${((equity - startingCapital) / startingCapital * 100).toFixed(2)}%)`);
  }
  
  return { trades, openPosition };
}

/**
 * Calculate position size based on equity or fixed shares
 */
function calculatePositionSize(equity, price, usePercentOfEquity, percentOfEquity, sharesPerTrade) {
  if (usePercentOfEquity) {
    const capitalToRisk = equity * (percentOfEquity / 100);
    const shares = Math.floor(capitalToRisk / price);
    return Math.max(1, shares); // At least 1 share
  }
  return sharesPerTrade;
}

/**
 * Close a position and create trade record
 */
function closeTrade(position, exitPrice, exitTime, exitBar, historicalData, fees, commission, exitReason) {
  const shares = position.shares;
  const grossProfitPerShare = position.type === 'long'
    ? exitPrice - position.entryPrice
    : position.entryPrice - exitPrice;
  
  const grossProfit = grossProfitPerShare * shares;
  const entryValue = position.entryPrice * shares;
  const exitValue = exitPrice * shares;
  const feeAmount = (entryValue + exitValue) * fees;
  const totalCosts = feeAmount + (commission * 2);
  const netProfit = grossProfit - totalCosts;
  const profitPercent = (netProfit / entryValue) * 100;
  const holdingDuration = exitTime.getTime() - position.entryTime.getTime();

  // Calculate MAE and MFE
  const { mae, mfe } = calculateMAEMFE(
    position.entryBar,
    exitBar,
    historicalData,
    position.entryPrice,
    position.type
  );

  return {
    direction: position.type,
    entryTime: position.entryTime,
    exitTime,
    entryPrice: position.entryPrice,
    exitPrice,
    shares,
    grossProfit,
    netProfit,
    profitPercent,
    holdingDuration,
    fees: feeAmount,
    commission: commission * 2,
    mae: mae * shares,
    mfe: mfe * shares,
    exitReason,
    isAutoExit: exitReason === 'auto-exit'
  };
}

/**
 * POSITION REVERSAL TRADE CONVERSION WITH TP/SL
 * (Legacy function - kept for backward compatibility)
 * 
 * Rules:
 * 1. Every signal change REVERSES the position
 * 2. BUY signal closes any SHORT and opens LONG
 * 3. SELL signal closes any LONG and opens SHORT
 * 4. TP/SL checked on every bar between entry and exit
 * 5. Position sizing based on sharesPerTrade
 * 6. Commission added to trade costs
 */
function convertSignalsToTrades(signals, historicalData, fees, slippage, tradeConfig = {}) {
  const trades = [];
  const {
    takeProfitPct = 0,
    stopLossPct = 0,
    sharesPerTrade = 100,
    commissionPerTrade = 0
  } = tradeConfig;

  let currentPosition = null; // { type, entrySignal, entryPrice, entryTime, entryIndex, shares, tpPrice, slPrice }

  // Sort signals chronologically
  const sortedSignals = [...signals].sort((a, b) => {
    const tA = new Date(a.time || a.timestamp || a.t).getTime();
    const tB = new Date(b.time || b.timestamp || b.t).getTime();
    return tA - tB;
  });

  console.log(`[SignalToTrade] Processing ${sortedSignals.length} signals with POSITION REVERSAL, TP=${takeProfitPct}%, SL=${stopLossPct}%, Shares=${sharesPerTrade}`);

  for (let i = 0; i < sortedSignals.length; i++) {
    const signal = sortedSignals[i];
    const signalType = (signal.signal || signal.action || '').toUpperCase();
    const signalTime = new Date(signal.time || signal.timestamp || signal.t);
    const signalPrice = parseFloat(signal.price || signal.close || 0);

    if (!signalType || signalPrice <= 0) continue;

    // Rule: Ignore HOLD signals
    if (signalType === 'HOLD' || signalType === 'WAIT') continue;

    // Check if current position hit TP/SL before processing this signal
    if (currentPosition) {
      const tpslExit = checkTPSLExit(currentPosition, historicalData, currentPosition.entryIndex, i);
      if (tpslExit) {
        // Close position due to TP/SL
        const trade = createTrade(
          currentPosition,
          tpslExit.exitPrice,
          tpslExit.exitTime,
          tpslExit.exitIndex,
          historicalData,
          fees,
          commissionPerTrade,
          tpslExit.exitReason
        );
        trades.push(trade);
        console.log(`[Trade] ${currentPosition.type.toUpperCase()} closed via ${tpslExit.exitReason} at ${tpslExit.exitPrice.toFixed(2)}, PnL: $${trade.netProfit.toFixed(2)}`);
        currentPosition = null;
      }
    }

    // NO POSITION: open initial position
    if (!currentPosition) {
      if (signalType === 'BUY') {
        // Enter LONG
        const entryPrice = signalPrice * (1 + slippage);
        const tpPrice = takeProfitPct > 0 ? entryPrice * (1 + takeProfitPct / 100) : null;
        const slPrice = stopLossPct > 0 ? entryPrice * (1 - stopLossPct / 100) : null;
        
        currentPosition = {
          type: 'long',
          entrySignal: signal,
          entryPrice,
          entryTime: signalTime,
          entryIndex: i,
          shares: sharesPerTrade,
          tpPrice,
          slPrice
        };
        console.log(`[Trade] Initial LONG entry at ${entryPrice.toFixed(2)}, ${sharesPerTrade} shares (TP: ${tpPrice?.toFixed(2) || 'none'}, SL: ${slPrice?.toFixed(2) || 'none'})`);
      } else if (signalType === 'SELL') {
        // Enter SHORT
        const entryPrice = signalPrice * (1 - slippage);
        const tpPrice = takeProfitPct > 0 ? entryPrice * (1 - takeProfitPct / 100) : null;
        const slPrice = stopLossPct > 0 ? entryPrice * (1 + stopLossPct / 100) : null;
        
        currentPosition = {
          type: 'short',
          entrySignal: signal,
          entryPrice,
          entryTime: signalTime,
          entryIndex: i,
          shares: sharesPerTrade,
          tpPrice,
          slPrice
        };
        console.log(`[Trade] Initial SHORT entry at ${entryPrice.toFixed(2)}, ${sharesPerTrade} shares (TP: ${tpPrice?.toFixed(2) || 'none'}, SL: ${slPrice?.toFixed(2) || 'none'})`);
      }
      continue;
    }

    // HAS POSITION: check for signal change (reversal)
    if (currentPosition.type === 'long' && signalType === 'SELL') {
      // REVERSE: Close LONG, Open SHORT
      const exitPrice = signalPrice * (1 - slippage);
      const trade = createTrade(
        currentPosition,
        exitPrice,
        signalTime,
        i,
        historicalData,
        fees,
        commissionPerTrade,
        'signal'
      );
      trades.push(trade);
      console.log(`[Trade] LONG closed at ${exitPrice.toFixed(2)}, PnL: $${trade.netProfit.toFixed(2)} (${trade.profitPercent.toFixed(2)}%)`);
      
      // Immediately open new SHORT position
      const newEntryPrice = signalPrice * (1 - slippage);
      const tpPrice = takeProfitPct > 0 ? newEntryPrice * (1 - takeProfitPct / 100) : null;
      const slPrice = stopLossPct > 0 ? newEntryPrice * (1 + stopLossPct / 100) : null;
      
      currentPosition = {
        type: 'short',
        entrySignal: signal,
        entryPrice: newEntryPrice,
        entryTime: signalTime,
        entryIndex: i,
        shares: sharesPerTrade,
        tpPrice,
        slPrice
      };
      console.log(`[Trade] REVERSED to SHORT entry at ${newEntryPrice.toFixed(2)}`);

    } else if (currentPosition.type === 'short' && signalType === 'BUY') {
      // REVERSE: Close SHORT, Open LONG
      const exitPrice = signalPrice * (1 + slippage);
      const trade = createTrade(
        currentPosition,
        exitPrice,
        signalTime,
        i,
        historicalData,
        fees,
        commissionPerTrade,
        'signal'
      );
      trades.push(trade);
      console.log(`[Trade] SHORT closed at ${exitPrice.toFixed(2)}, PnL: $${trade.netProfit.toFixed(2)} (${trade.profitPercent.toFixed(2)}%)`);
      
      // Immediately open new LONG position
      const newEntryPrice = signalPrice * (1 + slippage);
      const tpPrice = takeProfitPct > 0 ? newEntryPrice * (1 + takeProfitPct / 100) : null;
      const slPrice = stopLossPct > 0 ? newEntryPrice * (1 - stopLossPct / 100) : null;
      
      currentPosition = {
        type: 'long',
        entrySignal: signal,
        entryPrice: newEntryPrice,
        entryTime: signalTime,
        entryIndex: i,
        shares: sharesPerTrade,
        tpPrice,
        slPrice
      };
      console.log(`[Trade] REVERSED to LONG entry at ${newEntryPrice.toFixed(2)}`);
    }
    // Else: same signal as current position, no action needed
  }

  // Return trades and open position (don't auto-close)
  return { trades, openPosition: currentPosition };
}

/**
 * Check if position hit TP or SL between bars
 */
function checkTPSLExit(position, historicalData, startIdx, endIdx) {
  if (!position.tpPrice && !position.slPrice) return null;

  for (let i = startIdx + 1; i < endIdx && i < historicalData.length; i++) {
    const bar = historicalData[i];
    const high = parseFloat(bar.h || bar.high || 0);
    const low = parseFloat(bar.l || bar.low || 0);
    const barTime = new Date(bar.t || bar.timestamp || bar.time);

    if (position.type === 'long') {
      // Check SL first (more conservative)
      if (position.slPrice && low <= position.slPrice) {
        return {
          exitPrice: position.slPrice,
          exitTime: barTime,
          exitIndex: i,
          exitReason: 'stop-loss'
        };
      }
      // Check TP
      if (position.tpPrice && high >= position.tpPrice) {
        return {
          exitPrice: position.tpPrice,
          exitTime: barTime,
          exitIndex: i,
          exitReason: 'take-profit'
        };
      }
    } else if (position.type === 'short') {
      // Check SL first
      if (position.slPrice && high >= position.slPrice) {
        return {
          exitPrice: position.slPrice,
          exitTime: barTime,
          exitIndex: i,
          exitReason: 'stop-loss'
        };
      }
      // Check TP
      if (position.tpPrice && low <= position.tpPrice) {
        return {
          exitPrice: position.tpPrice,
          exitTime: barTime,
          exitIndex: i,
          exitReason: 'take-profit'
        };
      }
    }
  }

  return null;
}

/**
 * Create trade object with all calculations
 */
function createTrade(position, exitPrice, exitTime, exitIndex, historicalData, fees, commission, exitReason) {
  const shares = position.shares || 100;
  
  // Calculate P&L based on shares
  const grossProfitPerShare = position.type === 'long'
    ? exitPrice - position.entryPrice
    : position.entryPrice - exitPrice;
  
  const grossProfit = grossProfitPerShare * shares;
  
  // Calculate fees (percentage-based on total value)
  const entryValue = position.entryPrice * shares;
  const exitValue = exitPrice * shares;
  const feeAmount = (entryValue + exitValue) * fees;
  
  // Add fixed commission
  const totalCosts = feeAmount + (commission * 2); // Entry + Exit commission
  
  const netProfit = grossProfit - totalCosts;
  const profitPercent = (netProfit / entryValue) * 100;
  const holdingDuration = exitTime.getTime() - position.entryTime.getTime();

  // Calculate MAE and MFE
  const { mae, mfe } = calculateMAEMFE(
    position.entryIndex,
    exitIndex,
    historicalData,
    position.entryPrice,
    position.type
  );

  return {
    direction: position.type,
    entryTime: position.entryTime,
    exitTime,
    entryPrice: position.entryPrice,
    exitPrice,
    shares,
    grossProfit,
    netProfit,
    profitPercent,
    holdingDuration,
    fees: feeAmount,
    commission: commission * 2,
    mae: mae * shares,
    mfe: mfe * shares,
    exitReason,
    isAutoExit: exitReason === 'auto-exit'
  };
}

/**
 * Calculate MAE (Max Adverse Excursion) and MFE (Max Favorable Excursion)
 */
function calculateMAEMFE(entryIndex, exitIndex, historicalData, entryPrice, direction) {
  let mae = 0;
  let mfe = 0;

  for (let i = entryIndex; i <= exitIndex && i < historicalData.length; i++) {
    const bar = historicalData[i];
    const low = parseFloat(bar.l || bar.low || 0);
    const high = parseFloat(bar.h || bar.high || 0);

    if (direction === 'long') {
      const adverse = entryPrice - low;
      const favorable = high - entryPrice;
      if (adverse > mae) mae = adverse;
      if (favorable > mfe) mfe = favorable;
    } else {
      const adverse = high - entryPrice;
      const favorable = entryPrice - low;
      if (adverse > mae) mae = adverse;
      if (favorable > mfe) mfe = favorable;
    }
  }

  return { mae, mfe };
}

/**
 * Calculate performance metrics
 */
function calculateMetrics(trades, startingCapital, historicalData) {
  if (trades.length === 0) {
    return {
      totalTrades: 0,
      winRate: 0,
      lossRate: 0,
      netProfit: 0,
      netProfitPercent: 0,
      avgWin: 0,
      avgLoss: 0,
      bestTrade: 0,
      worstTrade: 0,
      profitFactor: 0,
      maxDrawdown: 0,
      maxRunUp: 0,
      expectancy: 0,
      sharpeRatio: 0,
      avgHoldingTime: 0,
      tradesPerDay: 0,
      currentCapital: startingCapital,
      openPnL: 0
    };
  }

  const wins = trades.filter(t => t.netProfit > 0);
  const losses = trades.filter(t => t.netProfit <= 0);

  const totalWin = wins.reduce((sum, t) => sum + t.netProfit, 0);
  const totalLoss = Math.abs(losses.reduce((sum, t) => sum + t.netProfit, 0));

  const netProfit = trades.reduce((sum, t) => sum + t.netProfit, 0);
  const netProfitPercent = (netProfit / startingCapital) * 100;

  const avgWin = wins.length > 0 ? totalWin / wins.length : 0;
  const avgLoss = losses.length > 0 ? totalLoss / losses.length : 0;

  const bestTrade = Math.max(...trades.map(t => t.netProfit));
  const worstTrade = Math.min(...trades.map(t => t.netProfit));

  const profitFactor = totalLoss > 0 ? totalWin / totalLoss : totalWin > 0 ? Infinity : 0;

  const winRate = (wins.length / trades.length) * 100;
  const lossRate = 100 - winRate;

  const expectancy = (winRate / 100) * avgWin - (lossRate / 100) * avgLoss;

  // Calculate Sharpe-like ratio
  const returns = trades.map(t => t.profitPercent);
  const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
  const variance = returns.reduce((sum, r) => sum + Math.pow(r - avgReturn, 2), 0) / returns.length;
  const stdDev = Math.sqrt(variance);
  const sharpeRatio = stdDev > 0 ? avgReturn / stdDev : 0;

  // Avg holding time
  const avgHoldingTime = trades.reduce((sum, t) => sum + t.holdingDuration, 0) / trades.length;

  // Trades per day
  const firstTrade = new Date(trades[0].entryTime).getTime();
  const lastTrade = new Date(trades[trades.length - 1].exitTime).getTime();
  const daysSpan = (lastTrade - firstTrade) / (1000 * 60 * 60 * 24);
  const tradesPerDay = daysSpan > 0 ? trades.length / daysSpan : 0;

  return {
    totalTrades: trades.length,
    winningTrades: wins.length,
    losingTrades: losses.length,
    winRate,
    lossRate,
    netProfit,
    netProfitPercent,
    avgWin,
    avgLoss,
    bestTrade,
    worstTrade,
    profitFactor,
    expectancy,
    sharpeRatio,
    avgHoldingTime,
    tradesPerDay,
    maxDrawdown: 0, // computed separately
    maxRunUp: 0
  };
}

/**
 * Generate equity curve
 */
function generateEquityCurve(trades, startingCapital, historicalData) {
  const curve = [{ time: new Date(historicalData[0].t).getTime(), equity: startingCapital }];
  let runningCapital = startingCapital;

  trades.forEach(trade => {
    runningCapital += trade.netProfit;
    curve.push({
      time: new Date(trade.exitTime).getTime(),
      equity: runningCapital
    });
  });

  return curve;
}

/**
 * Calculate drawdown
 */
function calculateDrawdown(equityCurve) {
  const drawdown = [];
  let peak = equityCurve[0].equity;
  let maxDD = 0;

  equityCurve.forEach(point => {
    if (point.equity > peak) peak = point.equity;
    const dd = peak - point.equity;
    const ddPercent = peak > 0 ? (dd / peak) * 100 : 0;
    drawdown.push({ time: point.time, drawdown: dd, drawdownPercent: ddPercent });
    if (dd > maxDD) maxDD = dd;
  });

  return { data: drawdown, maxDrawdown: maxDD, maxDrawdownPercent: (maxDD / equityCurve[0].equity) * 100 };
}
