/**
 * Backtesting Engine
 * 
 * Implements strict signal-to-trade logic:
 * - Only the FIRST signal counts as entry
 * - Exit on the FIRST opposite signal
 * - Single Entry → Single Exit → Trade closed
 * - BUY→SELL or SELL→BUY pairs only
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
    orderType = 'market'
  } = config;

  console.log('[BacktestEngine] Starting backtest...', config);

  // Step 1: Load the saved strategy
  const workflow = loadStrategy(strategyName);
  if (!workflow) {
    throw new Error(`Strategy "${strategyName}" not found`);
  }

  // Step 2: Fetch historical market data
  const historicalData = await fetchHistoricalData(symbol, timeframe, startDate, endDate);
  if (!historicalData || historicalData.length === 0) {
    throw new Error('No historical data available for the selected period');
  }

  console.log(`[BacktestEngine] Loaded ${historicalData.length} candles`);

  // Step 3: Generate signals from strategy
  const signals = await generateSignals(workflow, historicalData, symbol, timeframe);
  console.log(`[BacktestEngine] Generated ${signals.length} signals`);

  // Step 4: Convert signals to trades (STRICT LOGIC)
  const trades = convertSignalsToTrades(signals, historicalData, fees, slippage);
  console.log(`[BacktestEngine] Executed ${trades.length} trades`);

  // Step 5: Calculate performance metrics
  const metrics = calculateMetrics(trades, startingCapital, historicalData);

  // Step 6: Generate equity curve
  const equityCurve = generateEquityCurve(trades, startingCapital, historicalData);

  // Step 7: Generate drawdown data
  const drawdownData = calculateDrawdown(equityCurve);

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

    const payload = {
      symbol,
      timeframe,
      start: startDate,
      end: endDate,
      alpacaKeyId,
      alpacaSecretKey
    };

    const endpoints = [
      'http://localhost:5000/backtest_data',
      'http://127.0.0.1:5000/backtest_data',
      '/backtest_data'
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
        
        // Normalize data format
        return data.bars || data.data || data;
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
async function generateSignals(workflow, historicalData, symbol, timeframe) {
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
      alpacaSecretKey
    };

    const endpoints = [
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
 * STRICT SIGNAL-TO-TRADE CONVERSION
 * 
 * Rules:
 * 1. Only the FIRST signal is the entry
 * 2. Exit on the FIRST opposite signal
 * 3. Ignore repeated same-side signals
 * 4. Only complete BUY→SELL or SELL→BUY pairs count
 */
function convertSignalsToTrades(signals, historicalData, fees, slippage) {
  const trades = [];
  let currentPosition = null; // { type: 'long'|'short', entrySignal, entryPrice, entryTime, entryIndex }

  // Sort signals chronologically
  const sortedSignals = [...signals].sort((a, b) => {
    const tA = new Date(a.time || a.timestamp || a.t).getTime();
    const tB = new Date(b.time || b.timestamp || b.t).getTime();
    return tA - tB;
  });

  console.log(`[SignalToTrade] Processing ${sortedSignals.length} signals...`);

  for (let i = 0; i < sortedSignals.length; i++) {
    const signal = sortedSignals[i];
    const signalType = (signal.signal || signal.action || '').toUpperCase();
    const signalTime = new Date(signal.time || signal.timestamp || signal.t);
    const signalPrice = parseFloat(signal.price || signal.close || 0);

    if (!signalType || signalPrice <= 0) continue;

    // Rule: Ignore HOLD signals
    if (signalType === 'HOLD' || signalType === 'WAIT') continue;

    // NO POSITION: look for entry (first BUY or SELL)
    if (!currentPosition) {
      if (signalType === 'BUY') {
        // Enter LONG
        const entryPrice = signalPrice * (1 + slippage); // apply slippage
        currentPosition = {
          type: 'long',
          entrySignal: signal,
          entryPrice,
          entryTime: signalTime,
          entryIndex: i
        };
        console.log(`[Trade] LONG entry at ${entryPrice} (${signalTime.toISOString()})`);
      } else if (signalType === 'SELL') {
        // Enter SHORT
        const entryPrice = signalPrice * (1 - slippage);
        currentPosition = {
          type: 'short',
          entrySignal: signal,
          entryPrice,
          entryTime: signalTime,
          entryIndex: i
        };
        console.log(`[Trade] SHORT entry at ${entryPrice} (${signalTime.toISOString()})`);
      }
      continue;
    }

    // HAS POSITION: look for exit (opposite signal)
    if (currentPosition.type === 'long' && signalType === 'SELL') {
      // Exit LONG
      const exitPrice = signalPrice * (1 - slippage);
      const grossProfit = exitPrice - currentPosition.entryPrice;
      const feeAmount = (currentPosition.entryPrice + exitPrice) * fees;
      const netProfit = grossProfit - feeAmount;
      const profitPercent = (netProfit / currentPosition.entryPrice) * 100;
      const holdingDuration = signalTime.getTime() - currentPosition.entryTime.getTime();

      // Calculate MAE and MFE
      const { mae, mfe } = calculateMAEMFE(
        currentPosition.entryIndex,
        i,
        historicalData,
        currentPosition.entryPrice,
        'long'
      );

      trades.push({
        direction: 'long',
        entryTime: currentPosition.entryTime,
        exitTime: signalTime,
        entryPrice: currentPosition.entryPrice,
        exitPrice,
        grossProfit,
        netProfit,
        profitPercent,
        holdingDuration,
        fees: feeAmount,
        mae,
        mfe
      });

      console.log(`[Trade] LONG exit at ${exitPrice}, PnL: $${netProfit.toFixed(2)}`);
      currentPosition = null;
    } else if (currentPosition.type === 'short' && signalType === 'BUY') {
      // Exit SHORT
      const exitPrice = signalPrice * (1 + slippage);
      const grossProfit = currentPosition.entryPrice - exitPrice;
      const feeAmount = (currentPosition.entryPrice + exitPrice) * fees;
      const netProfit = grossProfit - feeAmount;
      const profitPercent = (netProfit / currentPosition.entryPrice) * 100;
      const holdingDuration = signalTime.getTime() - currentPosition.entryTime.getTime();

      const { mae, mfe } = calculateMAEMFE(
        currentPosition.entryIndex,
        i,
        historicalData,
        currentPosition.entryPrice,
        'short'
      );

      trades.push({
        direction: 'short',
        entryTime: currentPosition.entryTime,
        exitTime: signalTime,
        entryPrice: currentPosition.entryPrice,
        exitPrice,
        grossProfit,
        netProfit,
        profitPercent,
        holdingDuration,
        fees: feeAmount,
        mae,
        mfe
      });

      console.log(`[Trade] SHORT exit at ${exitPrice}, PnL: $${netProfit.toFixed(2)}`);
      currentPosition = null;
    }
    // Else: ignore repeated same-side signals
  }

  // Rule: Discard open position if no exit signal
  if (currentPosition) {
    console.log(`[Trade] Discarding open ${currentPosition.type} position (no exit signal)`);
  }

  return trades;
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
      tradesPerDay: 0
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
