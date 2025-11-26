import { Block, BlockResult, ExecutionContext } from './types';

/**
 * Bollinger Bands indicator block factory.
 * Computes middle band (SMA), upper band (middle + 2*stddev), lower band (middle - 2*stddev).
 * 
 * @param id - Unique block identifier
 * @param period - Period for SMA (default 20)
 * @param stddevMultiplier - Multiplier for standard deviation (default 2)
 * @returns Block with 'prices' input port and 'upper', 'middle', 'lower' output ports
 * 
 * Example:
 * const bbBlock = createBollingerBandsBlock('bb_20_2');
 * // Output: { outputs: { upper: [...], middle: [...], lower: [...] } }
 */
export function createBollingerBandsBlock(
  id: string,
  period: number = 20,
  stddevMultiplier: number = 2
): Block {
  return {
    id,
    type: 'indicator',
    inputPorts: [{ name: 'prices', type: 'series' }],
    outputPorts: [
      { name: 'upper', type: 'series' },
      { name: 'middle', type: 'series' },
      { name: 'lower', type: 'series' }
    ],
    config: { period, stddevMultiplier },
    compute: (
      inputs: Record<string, number | boolean | number[] | boolean[]>,
      config?: Record<string, any>,
      _ctx?: ExecutionContext
    ): BlockResult => {
      const prices = inputs.prices as number[];
      const cfg = config || {};
      const p = cfg.period || period;
      const m = cfg.stddevMultiplier || stddevMultiplier;

      if (!prices || prices.length < p) {
        return {
          outputs: {
            upper: [],
            middle: [],
            lower: []
          }
        };
      }

      const middle: number[] = [];
      const upper: number[] = [];
      const lower: number[] = [];

      for (let i = 0; i < prices.length; i++) {
        if (i < p - 1) {
          middle.push(NaN);
          upper.push(NaN);
          lower.push(NaN);
        } else {
          const window = prices.slice(i - p + 1, i + 1);
          const sma = window.reduce((a, b) => a + b, 0) / p;
          const variance = window.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / p;
          const stddev = Math.sqrt(variance);

          middle.push(sma);
          upper.push(sma + m * stddev);
          lower.push(sma - m * stddev);
        }
      }

      return {
        outputs: {
          upper,
          middle,
          lower
        }
      };
    }
  };
}
