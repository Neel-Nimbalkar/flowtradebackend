import { Block, BlockResult } from './types';

/**
 * Create an RSI indicator block.
 * - Inputs: 'prices' -> number[] (closing prices)
 * - Config: { period?: number }
 * - Outputs: 'rsi' -> number[] (same length as prices; leading values may be NaN)
 */
export function createRsiBlock(id: string, period = 14): Block {
  return {
    id,
    type: 'indicator',
    inputPorts: [{ name: 'prices', type: 'series' }],
    outputPorts: [{ name: 'rsi', type: 'series' }],
    config: { period },
    compute(inputs) {
      const prices = inputs['prices'] as number[];
      const p = (this.config && this.config.period) || period;
      if (!Array.isArray(prices)) {
        throw new Error('RSI block expected prices array');
      }

      const rsi: number[] = new Array(prices.length).fill(NaN);
      if (prices.length <= p) return { outputs: { rsi } };

      // Wilder's smoothing RSI implementation
      const deltas: number[] = new Array(prices.length).fill(0);
      for (let i = 1; i < prices.length; i++) deltas[i] = prices[i] - prices[i - 1];

      let gain = 0;
      let loss = 0;
      // First average gain/loss
      for (let i = 1; i <= p; i++) {
        const d = deltas[i];
        if (d > 0) gain += d;
        else loss += Math.abs(d);
      }
      gain /= p;
      loss /= p;

      const rs = (g: number, l: number) => (l === 0 ? 100 : g / l);
      rsi[p] = 100 - 100 / (1 + rs(gain, loss));

      for (let i = p + 1; i < prices.length; i++) {
        const d = deltas[i];
        const g = d > 0 ? d : 0;
        const l = d < 0 ? Math.abs(d) : 0;
        gain = (gain * (p - 1) + g) / p;
        loss = (loss * (p - 1) + l) / p;
        const r = rs(gain, loss);
        rsi[i] = 100 - 100 / (1 + r);
      }

      return { outputs: { rsi } } as BlockResult;
    },
  };
}
