// Map block types to their parent category used in the Sidebar grouping.
const blockCategoryMap = {
  // Templates (not all templates are here; these are example template keys)
  'template-golden-cross': 'Templates',
  'template-rsi-volume': 'Templates',

  // Configuration
  alpaca_config: 'Configuration',
  input: 'Configuration',
  price_history: 'Configuration',
  volume_history: 'Configuration',

  // Indicators
  rsi: 'Indicators',
  ema: 'Indicators',
  macd: 'Indicators',
  atr: 'Indicators',
  obv: 'Indicators',
  bollinger: 'Indicators',
  stochastic: 'Indicators',
  vwap: 'Indicators',
  volume_spike: 'Indicators',

  // Logic
  and: 'Logic',
  or: 'Logic',
  not: 'Logic',
  compare: 'Logic',

  // AI & Output
  ai_agent: 'AI & Output',
  output: 'AI & Output',

  // Utility
  note: 'Utility'
};

export default blockCategoryMap;
