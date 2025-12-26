import { Block, BlockResult, ExecutionContext } from './types';

/**
 * ATR (Average True Range) indicator block factory.
 * Measures market volatility using the average of true ranges.
 * 
 * @param id - Unique block identifier
 * @param period - Wilder's smoothing period (default 14)
 * @returns Block with 'prices', 'highs', 'lows' input ports and 'atr' output port
 * 
 * Example:
 * const atrBlock = createATRBlock('atr_14');
 * // Output: { outputs: { atr: [...] } }
 */
export function createATRBlock(id: string, period: number = 14): Block {
  return {
    id,
    type: 'indicator',
    inputPorts: [
      { name: 'prices', type: 'series' },
      { name: 'highs', type: 'series' },
      { name: 'lows', type: 'series' }
    ],
    outputPorts: [{ name: 'atr', type: 'series' }],
    config: { period },
    compute: (
      inputs: Record<string, number | boolean | number[] | boolean[]>,
      config?: Record<string, any>,
      _ctx?: ExecutionContext
    ): BlockResult => {
      const prices = inputs.prices as number[];
      const highs = inputs.highs as number[];
      const lows = inputs.lows as number[];
      const cfg = config || {};
      const p = cfg.period || period;

      if (!prices || !highs || !lows || prices.length < p) {
        return { outputs: { atr: [] } };
      }

      // Calculate true ranges
      const trueRanges: number[] = [];

      for (let i = 0; i < prices.length; i++) {
        let tr = 0;

        if (i === 0) {
          tr = highs[i] - lows[i];
        } else {
          const hl = highs[i] - lows[i];
          const hc = Math.abs(highs[i] - prices[i - 1]);
          const lc = Math.abs(lows[i] - prices[i - 1]);
          tr = Math.max(hl, hc, lc);
        }

        trueRanges.push(tr);
      }

      // Calculate ATR using Wilder's smoothing
      const atr: number[] = [];
      let sum = 0;

      // Initial ATR = simple average of first 'period' true ranges
      for (let i = 0; i < p; i++) {
        sum += trueRanges[i];
      }
      let atrValue = sum / p;

      for (let i = 0; i < trueRanges.length; i++) {
        if (i < p - 1) {
          atr.push(NaN);
        } else if (i === p - 1) {
          atr.push(atrValue);
        } else {
          atrValue = (atrValue * (p - 1) + trueRanges[i]) / p;
          atr.push(atrValue);
        }
      }

      return { outputs: { atr } };
    }
  };
}
