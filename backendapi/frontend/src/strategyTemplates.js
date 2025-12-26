/**
 * Pre-made Day Trading Strategy Templates for FlowTrade
 * 
 * Each template contains:
 * - name: Display name
 * - desc: Short description
 * - timeframes: Recommended timeframes
 * - nodes: Array of node configurations
 * - connections: Array of connections between nodes
 * 
 * All parameters are user-adjustable through the node settings panel.
 */

const strategyTemplates = {
  // ═══════════════════════════════════════════════════════════════════════════
  // MOMENTUM TRADING
  // ═══════════════════════════════════════════════════════════════════════════
  'momentum-trading': {
    name: 'Momentum Trading',
    desc: 'EMA crossover with volume confirmation for trending moves',
    icon: 'trending-up',
    timeframes: ['1m', '5m'],
    tags: ['trend', 'momentum', 'ema'],
    nodes: [
      { id: 1, type: 'input', x: 80, y: 120, title: 'Price Input', configValues: { symbol: 'SPY', timeframe: '5Min', days: 1 } },
      { id: 2, type: 'volume_history', x: 80, y: 280, title: 'Volume Data', configValues: {} },
      { id: 3, type: 'volume_spike', x: 280, y: 280, title: 'Volume Filter', configValues: { period: 20, multiplier: 1.5 } },
      { id: 4, type: 'ema', x: 280, y: 80, title: 'Fast EMA (9)', configValues: { period: 9, source: 'close', output: 'value' } },
      { id: 5, type: 'ema', x: 280, y: 160, title: 'Slow EMA (20)', configValues: { period: 20, source: 'close', output: 'value' } },
      { id: 6, type: 'compare', x: 480, y: 120, title: 'EMA Cross Up', configValues: { operator: '>' } },
      { id: 7, type: 'and', x: 680, y: 180, title: 'Confirm Signal', configValues: {} },
      { id: 8, type: 'output', x: 880, y: 180, title: 'Signal Output', configValues: {} },
      { id: 9, type: 'note', x: 80, y: 400, title: 'Strategy Notes', configValues: { content: 'MOMENTUM TRADING\n\nEntry: Fast EMA crosses above Slow EMA with volume spike\nExit: Fast EMA crosses below Slow EMA or momentum loss\nRisk: Stop below recent pullback low\n\nBest for: Trending markets, high relative volume' } }
    ],
    connections: [
      { id: 'c1', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 4, port: 'prices' } },
      { id: 'c2', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 5, port: 'prices' } },
      { id: 'c3', from: { nodeId: 2, port: 'volumes' }, to: { nodeId: 3, port: 'volumes' } },
      { id: 'c4', from: { nodeId: 4, port: 'ema' }, to: { nodeId: 6, port: 'a' } },
      { id: 'c5', from: { nodeId: 5, port: 'ema' }, to: { nodeId: 6, port: 'b' } },
      { id: 'c6', from: { nodeId: 6, port: 'result' }, to: { nodeId: 7, port: 'a' } },
      { id: 'c7', from: { nodeId: 3, port: 'spike' }, to: { nodeId: 7, port: 'b' } },
      { id: 'c8', from: { nodeId: 7, port: 'result' }, to: { nodeId: 8, port: 'signal' } }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // SCALPING (VWAP-based)
  // ═══════════════════════════════════════════════════════════════════════════
  'scalping': {
    name: 'VWAP Scalping',
    desc: 'Quick trades on VWAP reactions during liquid hours',
    icon: 'zap',
    timeframes: ['30s', '1m'],
    tags: ['scalp', 'vwap', 'quick'],
    nodes: [
      { id: 1, type: 'input', x: 80, y: 120, title: 'Price Input', configValues: { symbol: 'SPY', timeframe: '1Min', days: 1 } },
      { id: 2, type: 'volume_history', x: 80, y: 260, title: 'Volume Data', configValues: {} },
      { id: 3, type: 'vwap', x: 280, y: 180, title: 'VWAP', configValues: { output: 'signal', condition: 'near' } },
      { id: 4, type: 'rsi', x: 280, y: 300, title: 'RSI Momentum', configValues: { period: 7, source: 'close', overbought: 70, oversold: 30 } },
      { id: 5, type: 'and', x: 480, y: 220, title: 'Confirm Entry', configValues: {} },
      { id: 6, type: 'output', x: 680, y: 220, title: 'Signal Output', configValues: {} },
      { id: 7, type: 'note', x: 80, y: 420, title: 'Strategy Notes', configValues: { content: 'VWAP SCALPING\n\nEntry: Price reacts at VWAP with RSI confirmation\nExit: Quick profit target (2-5 ticks) or VWAP failure\nRisk: Tight stop (1-2 ticks)\n\nBest for: High liquidity stocks, market open hours\nTiming: First 90 min and last 60 min of session' } }
    ],
    connections: [
      { id: 'c1', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 3, port: 'prices' } },
      { id: 'c2', from: { nodeId: 2, port: 'volumes' }, to: { nodeId: 3, port: 'volumes' } },
      { id: 'c3', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 4, port: 'prices' } },
      { id: 'c4', from: { nodeId: 3, port: 'signal' }, to: { nodeId: 5, port: 'a' } },
      { id: 'c5', from: { nodeId: 4, port: 'signal' }, to: { nodeId: 5, port: 'b' } },
      { id: 'c6', from: { nodeId: 5, port: 'result' }, to: { nodeId: 6, port: 'signal' } }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // BREAKOUT TRADING
  // ═══════════════════════════════════════════════════════════════════════════
  'breakout': {
    name: 'Breakout Trading',
    desc: 'Bollinger Band breakout with volume confirmation (entry + exit)',
    icon: 'arrow-up-right',
    timeframes: ['1m', '5m'],
    tags: ['breakout', 'bollinger', 'volume'],
    nodes: [
      { id: 1, type: 'input', x: 80, y: 150, title: 'Price Input', configValues: { symbol: 'SPY', timeframe: '5Min', days: 1 } },
      { id: 2, type: 'volume_history', x: 80, y: 300, title: 'Volume Data', configValues: {} },
      { id: 3, type: 'bollinger', x: 280, y: 80, title: 'BB Upper', configValues: { period: 20, num_std: 2, source: 'close', output: 'upper' } },
      { id: 4, type: 'bollinger', x: 280, y: 180, title: 'BB Lower', configValues: { period: 20, num_std: 2, source: 'close', output: 'lower' } },
      { id: 5, type: 'volume_spike', x: 280, y: 300, title: 'Volume Spike', configValues: { period: 20, multiplier: 1.5 } },
      { id: 6, type: 'compare', x: 480, y: 80, title: 'Price > Upper BB', configValues: { operator: '>' } },
      { id: 7, type: 'compare', x: 480, y: 180, title: 'Price < Lower BB', configValues: { operator: '<' } },
      { id: 8, type: 'and', x: 680, y: 100, title: 'Breakout UP', configValues: {} },
      { id: 9, type: 'signal', x: 880, y: 100, title: 'BUY Signal', configValues: { type: 'BUY' } },
      { id: 10, type: 'signal', x: 880, y: 200, title: 'SELL Signal', configValues: { type: 'SELL' } },
      { id: 11, type: 'note', x: 80, y: 450, title: 'Strategy Notes', configValues: { content: 'BREAKOUT TRADING\n\nBUY: Price closes above upper BB with volume spike (1.5x avg)\nSELL: Price closes below lower BB (exit/reversal)\n\nRisk: Use stop-loss below entry candle low\nKey: Wait for candle CLOSE above resistance, not just a wick' } }
    ],
    connections: [
      { id: 'c1', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 3, port: 'prices' } },
      { id: 'c2', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 4, port: 'prices' } },
      { id: 'c3', from: { nodeId: 2, port: 'volumes' }, to: { nodeId: 5, port: 'volumes' } },
      { id: 'c4', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 6, port: 'a' } },
      { id: 'c5', from: { nodeId: 3, port: 'upper' }, to: { nodeId: 6, port: 'b' } },
      { id: 'c6', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 7, port: 'a' } },
      { id: 'c7', from: { nodeId: 4, port: 'lower' }, to: { nodeId: 7, port: 'b' } },
      { id: 'c8', from: { nodeId: 6, port: 'result' }, to: { nodeId: 8, port: 'a' } },
      { id: 'c9', from: { nodeId: 5, port: 'spike' }, to: { nodeId: 8, port: 'b' } },
      { id: 'c10', from: { nodeId: 8, port: 'result' }, to: { nodeId: 9, port: 'signal' } },
      { id: 'c11', from: { nodeId: 7, port: 'result' }, to: { nodeId: 10, port: 'signal' } }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RANGE TRADING
  // ═══════════════════════════════════════════════════════════════════════════
  'range-trading': {
    name: 'Range Trading',
    desc: 'Fade moves at support/resistance with RSI extremes',
    icon: 'git-merge',
    timeframes: ['5m', '15m'],
    tags: ['range', 'rsi', 'mean-reversion'],
    nodes: [
      { id: 1, type: 'input', x: 80, y: 150, title: 'Price Input', configValues: { symbol: 'SPY', timeframe: '5Min', days: 2 } },
      { id: 2, type: 'bollinger', x: 280, y: 80, title: 'BB Upper (Resistance)', configValues: { period: 20, num_std: 2, source: 'close', output: 'upper' } },
      { id: 3, type: 'bollinger', x: 280, y: 180, title: 'BB Lower (Support)', configValues: { period: 20, num_std: 2, source: 'close', output: 'lower' } },
      { id: 4, type: 'rsi', x: 280, y: 300, title: 'RSI', configValues: { period: 14, source: 'close', overbought: 70, oversold: 30 } },
      { id: 5, type: 'compare', x: 480, y: 120, title: 'At Resistance', configValues: { operator: '>=' } },
      { id: 6, type: 'compare', x: 480, y: 260, title: 'RSI Overbought', configValues: { operator: '>=' } },
      { id: 7, type: 'and', x: 680, y: 180, title: 'Sell Signal', configValues: {} },
      { id: 8, type: 'output', x: 880, y: 180, title: 'Signal Output', configValues: {} },
      { id: 9, type: 'note', x: 80, y: 450, title: 'Strategy Notes', configValues: { content: 'RANGE TRADING\n\nEntry: Price at BB boundary + RSI extreme\n- At upper band + RSI overbought = SELL\n- At lower band + RSI oversold = BUY\n\nExit: Middle of range (BB middle) or opposite boundary\nRisk: Stop outside the range boundary\n\nBest for: Choppy, non-trending markets' } }
    ],
    connections: [
      { id: 'c1', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 2, port: 'prices' } },
      { id: 'c2', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 3, port: 'prices' } },
      { id: 'c3', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 4, port: 'prices' } },
      { id: 'c4', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 5, port: 'a' } },
      { id: 'c5', from: { nodeId: 2, port: 'upper' }, to: { nodeId: 5, port: 'b' } },
      { id: 'c6', from: { nodeId: 4, port: 'rsi' }, to: { nodeId: 6, port: 'a' } },
      { id: 'c7', from: { nodeId: 5, port: 'result' }, to: { nodeId: 7, port: 'a' } },
      { id: 'c8', from: { nodeId: 6, port: 'result' }, to: { nodeId: 7, port: 'b' } },
      { id: 'c9', from: { nodeId: 7, port: 'result' }, to: { nodeId: 8, port: 'signal' } }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // PULLBACK TRADING
  // ═══════════════════════════════════════════════════════════════════════════
  'pullback': {
    name: 'Pullback Trading',
    desc: 'Enter on pullbacks to EMAs in trending markets',
    icon: 'corner-down-right',
    timeframes: ['3m', '5m'],
    tags: ['trend', 'pullback', 'ema'],
    nodes: [
      { id: 1, type: 'input', x: 80, y: 150, title: 'Price Input', configValues: { symbol: 'SPY', timeframe: '5Min', days: 1 } },
      { id: 2, type: 'ema', x: 280, y: 80, title: 'Fast EMA (9)', configValues: { period: 9, source: 'close', output: 'value' } },
      { id: 3, type: 'ema', x: 280, y: 180, title: 'Slow EMA (20)', configValues: { period: 20, source: 'close', output: 'value' } },
      { id: 4, type: 'ema', x: 280, y: 280, title: 'Trend EMA (50)', configValues: { period: 50, source: 'close', output: 'value' } },
      { id: 5, type: 'compare', x: 480, y: 80, title: 'Trend Up (9>20)', configValues: { operator: '>' } },
      { id: 6, type: 'compare', x: 480, y: 180, title: 'Trend Up (20>50)', configValues: { operator: '>' } },
      { id: 7, type: 'compare', x: 480, y: 280, title: 'Price at EMA Zone', configValues: { operator: '<=' } },
      { id: 8, type: 'and', x: 680, y: 130, title: 'Trend Confirmed', configValues: {} },
      { id: 9, type: 'and', x: 880, y: 180, title: 'Pullback Entry', configValues: {} },
      { id: 10, type: 'output', x: 1080, y: 180, title: 'Signal Output', configValues: {} },
      { id: 11, type: 'note', x: 80, y: 420, title: 'Strategy Notes', configValues: { content: 'PULLBACK TRADING\n\nSetup: EMAs stacked (9 > 20 > 50) = uptrend\nEntry: Price pulls back to the 9-20 EMA zone\nExit: Trend continuation target or structure break\nRisk: Stop below pullback low\n\nKey: Only trade in direction of the larger trend' } }
    ],
    connections: [
      { id: 'c1', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 2, port: 'prices' } },
      { id: 'c2', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 3, port: 'prices' } },
      { id: 'c3', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 4, port: 'prices' } },
      { id: 'c4', from: { nodeId: 2, port: 'ema' }, to: { nodeId: 5, port: 'a' } },
      { id: 'c5', from: { nodeId: 3, port: 'ema' }, to: { nodeId: 5, port: 'b' } },
      { id: 'c6', from: { nodeId: 3, port: 'ema' }, to: { nodeId: 6, port: 'a' } },
      { id: 'c7', from: { nodeId: 4, port: 'ema' }, to: { nodeId: 6, port: 'b' } },
      { id: 'c8', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 7, port: 'a' } },
      { id: 'c9', from: { nodeId: 2, port: 'ema' }, to: { nodeId: 7, port: 'b' } },
      { id: 'c10', from: { nodeId: 5, port: 'result' }, to: { nodeId: 8, port: 'a' } },
      { id: 'c11', from: { nodeId: 6, port: 'result' }, to: { nodeId: 8, port: 'b' } },
      { id: 'c12', from: { nodeId: 8, port: 'result' }, to: { nodeId: 9, port: 'a' } },
      { id: 'c13', from: { nodeId: 7, port: 'result' }, to: { nodeId: 9, port: 'b' } },
      { id: 'c14', from: { nodeId: 9, port: 'result' }, to: { nodeId: 10, port: 'signal' } }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // VWAP REVERSION
  // ═══════════════════════════════════════════════════════════════════════════
  'vwap-reversion': {
    name: 'VWAP Mean Reversion',
    desc: 'Trade mean reversion when price extends from VWAP',
    icon: 'refresh-cw',
    timeframes: ['1m', '5m'],
    tags: ['vwap', 'mean-reversion', 'fade'],
    nodes: [
      { id: 1, type: 'input', x: 80, y: 150, title: 'Price Input', configValues: { symbol: 'SPY', timeframe: '1Min', days: 1 } },
      { id: 2, type: 'volume_history', x: 80, y: 300, title: 'Volume Data', configValues: {} },
      { id: 3, type: 'vwap', x: 280, y: 200, title: 'VWAP', configValues: { output: 'value' } },
      { id: 4, type: 'atr', x: 280, y: 320, title: 'ATR (Extension)', configValues: { period: 14, source: 'close' } },
      { id: 5, type: 'rsi', x: 480, y: 100, title: 'RSI Extreme', configValues: { period: 7, source: 'close', overbought: 80, oversold: 20 } },
      { id: 6, type: 'compare', x: 480, y: 240, title: 'Extended from VWAP', configValues: { operator: '>' } },
      { id: 7, type: 'and', x: 680, y: 180, title: 'Reversion Setup', configValues: {} },
      { id: 8, type: 'output', x: 880, y: 180, title: 'Signal Output', configValues: {} },
      { id: 9, type: 'note', x: 80, y: 460, title: 'Strategy Notes', configValues: { content: 'VWAP MEAN REVERSION\n\nSetup: Price extended > 1 ATR from VWAP\nEntry: RSI extreme + extension from VWAP\nExit: Return to VWAP\nRisk: Stop beyond the extension high/low\n\nKey: Best in ranging/choppy conditions, avoid strong trends' } }
    ],
    connections: [
      { id: 'c1', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 3, port: 'prices' } },
      { id: 'c2', from: { nodeId: 2, port: 'volumes' }, to: { nodeId: 3, port: 'volumes' } },
      { id: 'c3', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 4, port: 'prices' } },
      { id: 'c4', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 5, port: 'prices' } },
      { id: 'c5', from: { nodeId: 4, port: 'atr' }, to: { nodeId: 6, port: 'b' } },
      { id: 'c6', from: { nodeId: 5, port: 'signal' }, to: { nodeId: 7, port: 'a' } },
      { id: 'c7', from: { nodeId: 6, port: 'result' }, to: { nodeId: 7, port: 'b' } },
      { id: 'c8', from: { nodeId: 7, port: 'result' }, to: { nodeId: 8, port: 'signal' } }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // REVERSAL TRADING
  // ═══════════════════════════════════════════════════════════════════════════
  'reversal': {
    name: 'Reversal Trading',
    desc: 'Counter-trend entries on exhaustion signals',
    icon: 'rotate-ccw',
    timeframes: ['1m', '5m'],
    tags: ['reversal', 'rsi', 'counter-trend'],
    nodes: [
      { id: 1, type: 'input', x: 80, y: 150, title: 'Price Input', configValues: { symbol: 'SPY', timeframe: '5Min', days: 1 } },
      { id: 2, type: 'volume_history', x: 80, y: 300, title: 'Volume Data', configValues: {} },
      { id: 3, type: 'rsi', x: 280, y: 100, title: 'RSI Extreme', configValues: { period: 14, source: 'close', overbought: 80, oversold: 20 } },
      { id: 4, type: 'volume_spike', x: 280, y: 300, title: 'Exhaustion Volume', configValues: { period: 20, multiplier: 2.5 } },
      { id: 5, type: 'stochastic', x: 280, y: 420, title: 'Stochastic Cross', configValues: { period: 14, smooth_k: 3, smooth_d: 3, source: 'close', overbought: 80, oversold: 20 } },
      { id: 6, type: 'and', x: 480, y: 180, title: 'RSI + Volume', configValues: {} },
      { id: 7, type: 'and', x: 680, y: 250, title: 'Reversal Confirm', configValues: {} },
      { id: 8, type: 'output', x: 880, y: 250, title: 'Signal Output', configValues: {} },
      { id: 9, type: 'note', x: 80, y: 550, title: 'Strategy Notes', configValues: { content: 'REVERSAL TRADING\n\nSetup: RSI extreme + exhaustion volume spike\nConfirmation: Stochastic cross in overbought/oversold\nEntry: Counter to prevailing move\nExit: VWAP or prior structure level\nRisk: Tight stop beyond the extreme\n\nCaution: High risk strategy, use smaller size' } }
    ],
    connections: [
      { id: 'c1', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 3, port: 'prices' } },
      { id: 'c2', from: { nodeId: 2, port: 'volumes' }, to: { nodeId: 4, port: 'volumes' } },
      { id: 'c3', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 5, port: 'prices' } },
      { id: 'c4', from: { nodeId: 3, port: 'signal' }, to: { nodeId: 6, port: 'a' } },
      { id: 'c5', from: { nodeId: 4, port: 'spike' }, to: { nodeId: 6, port: 'b' } },
      { id: 'c6', from: { nodeId: 6, port: 'result' }, to: { nodeId: 7, port: 'a' } },
      { id: 'c7', from: { nodeId: 5, port: 'signal' }, to: { nodeId: 7, port: 'b' } },
      { id: 'c8', from: { nodeId: 7, port: 'result' }, to: { nodeId: 8, port: 'signal' } }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // GAP AND GO
  // ═══════════════════════════════════════════════════════════════════════════
  'gap-and-go': {
    name: 'Gap and Go',
    desc: 'Trade gap continuation at market open',
    icon: 'sunrise',
    timeframes: ['1m', '5m'],
    tags: ['gap', 'open', 'momentum'],
    nodes: [
      { id: 1, type: 'input', x: 80, y: 150, title: 'Price Input', configValues: { symbol: 'SPY', timeframe: '1Min', days: 1 } },
      { id: 2, type: 'volume_history', x: 80, y: 300, title: 'Volume Data', configValues: {} },
      { id: 3, type: 'volume_spike', x: 280, y: 300, title: 'High Volume', configValues: { period: 20, multiplier: 2.0 } },
      { id: 4, type: 'vwap', x: 280, y: 150, title: 'VWAP', configValues: { output: 'signal' } },
      { id: 5, type: 'ema', x: 480, y: 80, title: 'Fast EMA (9)', configValues: { period: 9, source: 'close', output: 'value' } },
      { id: 6, type: 'compare', x: 480, y: 200, title: 'Above VWAP', configValues: { operator: '>' } },
      { id: 7, type: 'and', x: 680, y: 180, title: 'Gap Continuation', configValues: {} },
      { id: 11, type: 'compare', x: 680, y: 80, title: 'Price > EMA', configValues: { operator: '>' } },
      { id: 8, type: 'and', x: 880, y: 240, title: 'Final Signal', configValues: {} },
      { id: 9, type: 'output', x: 1080, y: 240, title: 'Signal Output', configValues: {} },
      { id: 10, type: 'note', x: 80, y: 460, title: 'Strategy Notes', configValues: { content: 'GAP AND GO\n\nTiming: First 30-60 minutes of market open\nSetup: Gap up + high pre-market volume\nEntry: Break and hold above pre-market high / VWAP\nExit: Momentum stall or target hit\nRisk: Stop below VWAP or opening range low\n\nKey: Focus on stocks with catalyst (news, earnings)' } }
    ],
    connections: [
      { id: 'c1', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 4, port: 'prices' } },
      { id: 'c2', from: { nodeId: 2, port: 'volumes' }, to: { nodeId: 4, port: 'volumes' } },
      { id: 'c3', from: { nodeId: 2, port: 'volumes' }, to: { nodeId: 3, port: 'volumes' } },
      { id: 'c4', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 5, port: 'prices' } },
      { id: 'c5', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 6, port: 'a' } },
      { id: 'c6', from: { nodeId: 4, port: 'vwap' }, to: { nodeId: 6, port: 'b' } },
      { id: 'c7', from: { nodeId: 6, port: 'result' }, to: { nodeId: 7, port: 'a' } },
      { id: 'c8', from: { nodeId: 3, port: 'spike' }, to: { nodeId: 7, port: 'b' } },
      { id: 'c9', from: { nodeId: 7, port: 'result' }, to: { nodeId: 8, port: 'a' } },
      { id: 'c12', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 11, port: 'a' } },
      { id: 'c13', from: { nodeId: 5, port: 'ema' }, to: { nodeId: 11, port: 'b' } },
      { id: 'c10', from: { nodeId: 11, port: 'result' }, to: { nodeId: 8, port: 'b' } },
      { id: 'c11', from: { nodeId: 8, port: 'result' }, to: { nodeId: 9, port: 'signal' } }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // NEWS MOMENTUM
  // ═══════════════════════════════════════════════════════════════════════════
  'news-momentum': {
    name: 'News Momentum',
    desc: 'Ride strong directional moves after news events',
    icon: 'radio',
    timeframes: ['1m'],
    tags: ['news', 'momentum', 'volume'],
    nodes: [
      { id: 1, type: 'input', x: 80, y: 150, title: 'Price Input', configValues: { symbol: 'SPY', timeframe: '1Min', days: 1 } },
      { id: 2, type: 'volume_history', x: 80, y: 300, title: 'Volume Data', configValues: {} },
      { id: 3, type: 'volume_spike', x: 280, y: 300, title: 'Volume Surge', configValues: { period: 20, multiplier: 3.0 } },
      { id: 4, type: 'macd', x: 280, y: 150, title: 'MACD Momentum', configValues: { fast: 12, slow: 26, signal: 9, source: 'close', output: 'histogram' } },
      { id: 8, type: 'compare', x: 380, y: 150, title: 'MACD > 0', configValues: { operator: '>', threshold: 0 } },
      { id: 5, type: 'and', x: 480, y: 220, title: 'News Signal', configValues: {} },
      { id: 6, type: 'output', x: 680, y: 220, title: 'Signal Output', configValues: {} },
      { id: 7, type: 'note', x: 80, y: 460, title: 'Strategy Notes', configValues: { content: 'NEWS MOMENTUM\n\nTrigger: Relative volume surge (3x+ normal)\nEntry: Direction of strong candles post-news (MACD bullish)\nExit: Momentum stall (MACD histogram shrinking)\n\nKey: Quick reaction required, use hotkeys\nCaution: Wide spreads during news events' } }
    ],
    connections: [
      { id: 'c1', from: { nodeId: 2, port: 'volumes' }, to: { nodeId: 3, port: 'volumes' } },
      { id: 'c2', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 4, port: 'prices' } },
      { id: 'c3', from: { nodeId: 3, port: 'spike' }, to: { nodeId: 5, port: 'a' } },
      { id: 'c6', from: { nodeId: 4, port: 'macd' }, to: { nodeId: 8, port: 'a' } },
      { id: 'c4', from: { nodeId: 8, port: 'result' }, to: { nodeId: 5, port: 'b' } },
      { id: 'c5', from: { nodeId: 5, port: 'result' }, to: { nodeId: 6, port: 'signal' } }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // INTRADAY TREND FOLLOWING
  // ═══════════════════════════════════════════════════════════════════════════
  'intraday-trend': {
    name: 'Intraday Trend Following',
    desc: 'Follow the intraday trend with EMA alignment',
    icon: 'trending-up',
    timeframes: ['5m', '15m'],
    tags: ['trend', 'ema', 'follow'],
    nodes: [
      { id: 1, type: 'input', x: 80, y: 180, title: 'Price Input', configValues: { symbol: 'SPY', timeframe: '5Min', days: 2 } },
      { id: 2, type: 'ema', x: 280, y: 80, title: 'EMA 20', configValues: { period: 20, source: 'close', output: 'value' } },
      { id: 3, type: 'ema', x: 280, y: 180, title: 'EMA 50', configValues: { period: 50, source: 'close', output: 'value' } },
      { id: 4, type: 'macd', x: 280, y: 300, title: 'MACD', configValues: { fast: 12, slow: 26, signal: 9, source: 'close', output: 'histogram' } },
      { id: 5, type: 'compare', x: 480, y: 130, title: 'EMA 20 > EMA 50', configValues: { operator: '>' } },
      { id: 6, type: 'compare', x: 480, y: 250, title: 'MACD Positive', configValues: { operator: '>' } },
      { id: 7, type: 'compare', x: 480, y: 360, title: 'Price > EMA 20', configValues: { operator: '>' } },
      { id: 8, type: 'and', x: 680, y: 180, title: 'Trend Aligned', configValues: {} },
      { id: 9, type: 'and', x: 880, y: 240, title: 'Final Confirm', configValues: {} },
      { id: 10, type: 'output', x: 1080, y: 240, title: 'Signal Output', configValues: {} },
      { id: 11, type: 'note', x: 80, y: 480, title: 'Strategy Notes', configValues: { content: 'INTRADAY TREND FOLLOWING\n\nSetup: 20 EMA above 50 EMA + MACD positive\nEntry: Price above 20 EMA (trend continuation)\nExit: Trend break (price closes below 20 EMA)\nRisk: Trailing stop using structure or ATR\n\nKey: Let winners run, cut losers quickly' } }
    ],
    connections: [
      { id: 'c1', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 2, port: 'prices' } },
      { id: 'c2', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 3, port: 'prices' } },
      { id: 'c3', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 4, port: 'prices' } },
      { id: 'c4', from: { nodeId: 2, port: 'ema' }, to: { nodeId: 5, port: 'a' } },
      { id: 'c5', from: { nodeId: 3, port: 'ema' }, to: { nodeId: 5, port: 'b' } },
      { id: 'c6', from: { nodeId: 4, port: 'macd' }, to: { nodeId: 6, port: 'a' } },
      { id: 'c7', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 7, port: 'a' } },
      { id: 'c8', from: { nodeId: 2, port: 'ema' }, to: { nodeId: 7, port: 'b' } },
      { id: 'c9', from: { nodeId: 5, port: 'result' }, to: { nodeId: 8, port: 'a' } },
      { id: 'c10', from: { nodeId: 6, port: 'result' }, to: { nodeId: 8, port: 'b' } },
      { id: 'c11', from: { nodeId: 8, port: 'result' }, to: { nodeId: 9, port: 'a' } },
      { id: 'c12', from: { nodeId: 7, port: 'result' }, to: { nodeId: 9, port: 'b' } },
      { id: 'c13', from: { nodeId: 9, port: 'result' }, to: { nodeId: 10, port: 'signal' } }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // RSI DIVERGENCE
  // ═══════════════════════════════════════════════════════════════════════════
  'rsi-divergence': {
    name: 'RSI Divergence',
    desc: 'Spot divergence between price and RSI for reversals',
    icon: 'git-branch',
    timeframes: ['5m', '15m'],
    tags: ['divergence', 'rsi', 'reversal'],
    nodes: [
      { id: 1, type: 'input', x: 80, y: 150, title: 'Price Input', configValues: { symbol: 'SPY', timeframe: '5Min', days: 2 } },
      { id: 2, type: 'rsi', x: 280, y: 120, title: 'RSI', configValues: { period: 14, source: 'close', overbought: 70, oversold: 30 } },
      { id: 3, type: 'stochastic', x: 280, y: 260, title: 'Stochastic', configValues: { period: 14, smooth_k: 3, smooth_d: 3, source: 'close', overbought: 80, oversold: 20 } },
      { id: 4, type: 'macd', x: 480, y: 80, title: 'MACD Confirm', configValues: { fast: 12, slow: 26, signal: 9, source: 'close', output: 'histogram' } },
      { id: 9, type: 'compare', x: 580, y: 80, title: 'MACD > 0', configValues: { operator: '>', threshold: 0 } },
      { id: 5, type: 'and', x: 480, y: 200, title: 'RSI + Stoch', configValues: {} },
      { id: 6, type: 'and', x: 680, y: 150, title: 'Divergence Signal', configValues: {} },
      { id: 7, type: 'output', x: 880, y: 150, title: 'Signal Output', configValues: {} },
      { id: 8, type: 'note', x: 80, y: 400, title: 'Strategy Notes', configValues: { content: 'RSI DIVERGENCE\n\nBullish Divergence: Price makes lower low, RSI makes higher low\nBearish Divergence: Price makes higher high, RSI makes lower high\n\nEntry: After divergence confirmed + MACD cross\nExit: Prior swing high/low or trend structure\nRisk: Stop beyond the divergence extreme\n\nKey: Higher timeframe divergence is more reliable' } }
    ],
    connections: [
      { id: 'c1', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 2, port: 'prices' } },
      { id: 'c2', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 3, port: 'prices' } },
      { id: 'c3', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 4, port: 'prices' } },
      { id: 'c4', from: { nodeId: 2, port: 'signal' }, to: { nodeId: 5, port: 'a' } },
      { id: 'c5', from: { nodeId: 3, port: 'signal' }, to: { nodeId: 5, port: 'b' } },
      { id: 'c6', from: { nodeId: 5, port: 'result' }, to: { nodeId: 6, port: 'a' } },
      { id: 'c9', from: { nodeId: 4, port: 'macd' }, to: { nodeId: 9, port: 'a' } },
      { id: 'c7', from: { nodeId: 9, port: 'result' }, to: { nodeId: 6, port: 'b' } },
      { id: 'c8', from: { nodeId: 6, port: 'result' }, to: { nodeId: 7, port: 'signal' } }
    ]
  },

  // ═══════════════════════════════════════════════════════════════════════════
  // MACD CROSSOVER
  // ═══════════════════════════════════════════════════════════════════════════
  'macd-crossover': {
    name: 'MACD Crossover',
    desc: 'Classic MACD signal line crossover strategy',
    icon: 'activity',
    timeframes: ['5m', '15m'],
    tags: ['macd', 'crossover', 'trend'],
    nodes: [
      { id: 1, type: 'input', x: 80, y: 150, title: 'Price Input', configValues: { symbol: 'SPY', timeframe: '5Min', days: 2 } },
      { id: 2, type: 'macd', x: 280, y: 100, title: 'MACD Line', configValues: { fast: 12, slow: 26, signal: 9, source: 'close', output: 'macd' } },
      { id: 3, type: 'macd', x: 280, y: 220, title: 'Signal Line', configValues: { fast: 12, slow: 26, signal: 9, source: 'close', output: 'signal' } },
      { id: 4, type: 'ema', x: 280, y: 340, title: 'Trend Filter (EMA 50)', configValues: { period: 50, source: 'close', output: 'value' } },
      { id: 5, type: 'compare', x: 480, y: 160, title: 'MACD Cross Up', configValues: { operator: '>' } },
      { id: 6, type: 'compare', x: 480, y: 300, title: 'Above Trend EMA', configValues: { operator: '>' } },
      { id: 7, type: 'and', x: 680, y: 220, title: 'Buy Signal', configValues: {} },
      { id: 8, type: 'output', x: 880, y: 220, title: 'Signal Output', configValues: {} },
      { id: 9, type: 'note', x: 80, y: 480, title: 'Strategy Notes', configValues: { content: 'MACD CROSSOVER\n\nBuy: MACD line crosses above signal line (while above zero preferred)\nSell: MACD line crosses below signal line\n\nFilter: Only take signals in direction of EMA 50 trend\nExit: Opposite crossover or histogram shrinking\nRisk: Stop below recent swing low\n\nKey: Works best in trending markets' } }
    ],
    connections: [
      { id: 'c1', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 2, port: 'prices' } },
      { id: 'c2', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 3, port: 'prices' } },
      { id: 'c3', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 4, port: 'prices' } },
      { id: 'c4', from: { nodeId: 2, port: 'macd' }, to: { nodeId: 5, port: 'a' } },
      { id: 'c5', from: { nodeId: 3, port: 'macd' }, to: { nodeId: 5, port: 'b' } },
      { id: 'c6', from: { nodeId: 1, port: 'prices' }, to: { nodeId: 6, port: 'a' } },
      { id: 'c7', from: { nodeId: 4, port: 'ema' }, to: { nodeId: 6, port: 'b' } },
      { id: 'c8', from: { nodeId: 5, port: 'result' }, to: { nodeId: 7, port: 'a' } },
      { id: 'c9', from: { nodeId: 6, port: 'result' }, to: { nodeId: 7, port: 'b' } },
      { id: 'c10', from: { nodeId: 7, port: 'result' }, to: { nodeId: 8, port: 'signal' } }
    ]
  }
};

// Helper to get template list for sidebar
export const getTemplateList = () => {
  return Object.entries(strategyTemplates).map(([key, template]) => ({
    type: `template-${key}`,
    name: template.name,
    desc: template.desc,
    icon: template.icon || 'puzzle',
    timeframes: template.timeframes,
    tags: template.tags
  }));
};

// Helper to load a template by key
export const loadTemplate = (templateKey) => {
  const key = templateKey.replace('template-', '');
  const template = strategyTemplates[key];
  if (!template) return null;
  
  // Deep clone to avoid mutations
  return {
    name: template.name,
    nodes: JSON.parse(JSON.stringify(template.nodes)),
    connections: JSON.parse(JSON.stringify(template.connections))
  };
};

export default strategyTemplates;
