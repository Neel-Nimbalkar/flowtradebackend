// Lightweight block definitions used by React components during migration.
const blockDefs = {
  // Data & Input
  alpaca_config: {
    name: 'Alpaca Data', icon: 'key', color: 'color-config', inputs: [], outputs: ['symbol','timeframe','days'],
    config: [
      { key: 'symbol', label: 'Symbol', type: 'text', value: 'SPY' },
      { key: 'timeframe', label: 'Timeframe', type: 'select', options: ['1Min','5Min','15Min','1Hour','1Day'], value: '1Hour' },
      { key: 'days', label: 'Days', type: 'number', value: 7 },
      { key: 'keyId', label: 'Alpaca Key ID', type: 'text', value: '' },
      { key: 'secretKey', label: 'Alpaca Secret Key', type: 'text', value: '' }
    ]
  },
  input: {
    name: 'Price Input', icon: 'inbox', color: 'color-input', inputs: ['symbol','timeframe','days'], outputs: ['prices','volumes'],
    config: [
      { key: 'symbol', label: 'Symbol', type: 'text', value: 'SPY' },
      { key: 'timeframe', label: 'Timeframe', type: 'select', options: ['1Min','5Min','15Min','1Hour','1Day'], value: '1Hour' },
      { key: 'days', label: 'Days', type: 'number', value: 7 }
    ]
  },
  price_history: {
    name: 'Price History', icon: 'chart', color: 'color-input', inputs: ['symbol','timeframe','days'], outputs: ['prices'],
    // Use global Alpaca config for symbol/timeframe/days
    config: []
  },
  volume_history: {
    name: 'Volume History', icon: 'chart', color: 'color-volume', inputs: ['symbol','timeframe','days'], outputs: ['volumes'],
    // Use global Alpaca config for symbol/timeframe/days
    config: []
  },
  // Indicators
  rsi: {
    name: 'RSI', icon: 'bolt', color: 'color-indicator', inputs: ['prices'], outputs: ['rsi'],
    config: [
      { key: 'period', label: 'Period', type: 'number', value: 14 },
      { key: 'source', label: 'Source', type: 'select', options: ['current','close','open','high','low','hl2','hlc3','ohlc4'], value: 'close' },
      { key: 'overbought', label: 'Overbought Level', type: 'number', value: 70 },
      { key: 'oversold', label: 'Oversold Level', type: 'number', value: 30 }
    ]
  },
  ema: {
    name: 'EMA', icon: 'bolt', color: 'color-indicator', inputs: ['prices'], outputs: ['ema'],
    config: [
      { key: 'period', label: 'Period', type: 'number', value: 20 },
      { key: 'source', label: 'Source', type: 'select', options: ['current','close','open','high','low','hl2','hlc3','ohlc4'], value: 'close' },
      { key: 'output', label: 'Output', type: 'select', options: ['value','signal'], value: 'value' }
    ]
  },
  sma: {
    name: 'SMA', icon: 'bolt', color: 'color-indicator', inputs: ['prices'], outputs: ['sma'],
    config: [
      { key: 'period', label: 'Period', type: 'number', value: 20 },
      { key: 'source', label: 'Source', type: 'select', options: ['current','close','open','high','low','hl2','hlc3','ohlc4'], value: 'close' },
      { key: 'output', label: 'Output', type: 'select', options: ['value','signal'], value: 'value' }
    ]
  },
  macd: {
    name: 'MACD', icon: 'bolt', color: 'color-indicator', inputs: ['prices'], outputs: ['macd'],
    config: [
      { key: 'fast', label: 'Fast EMA', type: 'number', value: 12 },
      { key: 'slow', label: 'Slow EMA', type: 'number', value: 26 },
      { key: 'signal', label: 'Signal', type: 'number', value: 9 },
      { key: 'source', label: 'Source', type: 'select', options: ['current','close','open','high','low','hl2','hlc3','ohlc4'], value: 'close' },
      { key: 'output', label: 'Output', type: 'select', options: ['macd','signal','histogram'], value: 'macd' }
    ]
  },
  atr: {
    name: 'ATR', icon: 'bolt', color: 'color-indicator', inputs: ['prices'], outputs: ['atr'],
    config: [
      { key: 'period', label: 'Period', type: 'number', value: 14 },
      { key: 'source', label: 'Source', type: 'select', options: ['current','close','open','high','low','hl2','hlc3','ohlc4'], value: 'close' }
    ]
  },
  obv: {
    name: 'OBV', icon: 'drop', color: 'color-volume', inputs: ['prices','volumes'], outputs: ['obv'],
    config: []
  },
  bollinger: {
    name: 'Bollinger Bands', icon: 'chart-up', color: 'color-indicator', inputs: ['prices'], outputs: ['upper','lower','middle'],
    config: [
      { key: 'period', label: 'Period', type: 'number', value: 20 },
      { key: 'num_std', label: 'Std Dev', type: 'number', value: 2 },
      { key: 'source', label: 'Source', type: 'select', options: ['current','close','open','high','low','hl2','hlc3','ohlc4'], value: 'close' },
      { key: 'output', label: 'Output', type: 'select', options: ['upper','lower','middle','signal'], value: 'upper' }
    ]
  },
  stochastic: {
    name: 'Stochastic', icon: 'bolt', color: 'color-indicator', inputs: ['prices'], outputs: ['stoch'],
    config: [
      { key: 'period', label: 'Period', type: 'number', value: 14 },
      { key: 'smooth_k', label: 'Smooth K', type: 'number', value: 3 },
      { key: 'smooth_d', label: 'Smooth D', type: 'number', value: 3 },
      { key: 'source', label: 'Source', type: 'select', options: ['close','open','high','low','hl2','hlc3','ohlc4'], value: 'close' },
      { key: 'overbought', label: 'Overbought Level', type: 'number', value: 80 },
      { key: 'oversold', label: 'Oversold Level', type: 'number', value: 20 }
    ]
  },
  vwap: {
    name: 'VWAP', icon: 'bolt', color: 'color-indicator', inputs: ['prices','volumes'], outputs: ['vwap'],
    config: [
      { key: 'output', label: 'Output', type: 'select', options: ['value','signal'], value: 'value' }
    ]
  },
  volume_spike: {
    name: 'Volume Spike', icon: 'chart-up', color: 'color-volume', inputs: ['volumes'], outputs: ['spike'],
    config: [ { key: 'period', label: 'Period', type: 'number', value: 20 }, { key: 'multiplier', label: 'Multiplier', type: 'number', value: 1.5 } ]
  },
  // Price Action & Levels
  price_levels: {
    name: 'Price Levels', icon: 'chart-up', color: 'color-indicator', inputs: ['prices'], outputs: ['high','low','open','close'],
    desc: 'Get high/low of day, open, close levels',
    config: [
      { key: 'lookback', label: 'Lookback Bars', type: 'number', value: 1 },
      { key: 'output', label: 'Output', type: 'select', options: ['high','low','open','close','range'], value: 'high' }
    ]
  },
  support_resistance: {
    name: 'Support/Resistance', icon: 'chart', color: 'color-indicator', inputs: ['prices'], outputs: ['support','resistance'],
    desc: 'Calculate dynamic support and resistance levels',
    config: [
      { key: 'period', label: 'Period', type: 'number', value: 20 },
      { key: 'strength', label: 'Strength', type: 'number', value: 2 },
      { key: 'output', label: 'Output', type: 'select', options: ['support','resistance','both'], value: 'support' }
    ]
  },
  // Filters
  time_filter: {
    name: 'Time Filter', icon: 'clock', color: 'color-logic', inputs: ['signal'], outputs: ['filtered'],
    desc: 'Filter signals by market hours',
    config: [
      { key: 'start_hour', label: 'Start Hour (ET)', type: 'number', value: 9 },
      { key: 'start_minute', label: 'Start Minute', type: 'number', value: 30 },
      { key: 'end_hour', label: 'End Hour (ET)', type: 'number', value: 16 },
      { key: 'end_minute', label: 'End Minute', type: 'number', value: 0 },
      { key: 'exclude_first_mins', label: 'Exclude First N Mins', type: 'number', value: 0 },
      { key: 'exclude_last_mins', label: 'Exclude Last N Mins', type: 'number', value: 0 }
    ]
  },
  trend_filter: {
    name: 'Trend Filter', icon: 'trending-up', color: 'color-logic', inputs: ['prices'], outputs: ['trend'],
    desc: 'Filter by overall trend direction',
    config: [
      { key: 'fast_period', label: 'Fast EMA', type: 'number', value: 20 },
      { key: 'slow_period', label: 'Slow EMA', type: 'number', value: 50 },
      { key: 'output', label: 'Output', type: 'select', options: ['bullish','bearish','neutral','signal'], value: 'signal' }
    ]
  },
  volume_filter: {
    name: 'Volume Filter', icon: 'chart-up', color: 'color-volume', inputs: ['volumes'], outputs: ['filtered'],
    desc: 'Filter by relative volume threshold',
    config: [
      { key: 'period', label: 'Avg Period', type: 'number', value: 20 },
      { key: 'threshold', label: 'Min Rel. Volume', type: 'number', value: 1.0 }
    ]
  },
  // Logic
  and: {
    name: 'AND Gate', icon: 'plus', color: 'color-logic', inputs: ['a','b'], outputs: ['result'],
    config: []
  },
  or: {
    name: 'OR Gate', icon: 'plus', color: 'color-logic', inputs: ['a','b'], outputs: ['result'],
    config: []
  },
  not: {
    name: 'NOT Gate', icon: 'plus', color: 'color-logic', inputs: ['a'], outputs: ['result'],
    config: []
  },
  compare: {
    name: 'Compare', icon: 'search', color: 'color-logic', inputs: ['a','b'], outputs: ['result'],
    config: [ { key: 'operator', label: 'Operator', type: 'select', options: ['>','<','=','>=','<='], value: '>' } ]
  },
  crossover: {
    name: 'Crossover', icon: 'git-merge', color: 'color-logic', inputs: ['a','b'], outputs: ['cross_up','cross_down'],
    desc: 'Detect when line A crosses line B',
    config: [
      { key: 'output', label: 'Output', type: 'select', options: ['cross_up','cross_down','any'], value: 'cross_up' }
    ]
  },
  threshold: {
    name: 'Threshold', icon: 'target', color: 'color-logic', inputs: ['value'], outputs: ['above','below'],
    desc: 'Check if value is above or below threshold',
    config: [
      { key: 'level', label: 'Level', type: 'number', value: 50 },
      { key: 'output', label: 'Output', type: 'select', options: ['above','below','signal'], value: 'signal' }
    ]
  },
  // AI & Output
  ai_agent: {
    name: 'AI Agent', icon: 'ai', color: 'color-output', inputs: ['analyse'], outputs: ['signal'],
    config: [ { key: 'script', label: 'Base Script', type: 'textarea', value: '' } ]
  },
  output: {
    name: 'Output', icon: 'target', color: 'color-output', inputs: ['signal'], outputs: [],
    config: []
  },
  // Utility
  note: {
    name: 'Text Note', icon: 'note', color: 'color-note', inputs: [], outputs: [],
    isTextBox: true,
    config: [ { key: 'content', label: 'Note', type: 'textarea', value: '' } ]
  }
};

export default blockDefs;
