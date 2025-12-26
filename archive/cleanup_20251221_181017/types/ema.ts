import { Block, BlockResult, ExecutionContext } from './types';

/**
 * EMA (Exponential Moving Average) indicator block factory.
 * Computes exponential moving average with adjustable period.
 * 
 * @param id - Unique block identifier
 * @param period - EMA period (default 20)
 * @returns Block with 'prices' input port and 'ema' output port
 * 
 * Example:
 * const emaBlock = createEMABlock('ema_20');
 * // Output: { outputs: { ema: [...] } }
 */
export function createEMABlock(id: string, period: number = 20): Block {
  return {
    id,
    type: 'indicator',
    inputPorts: [{ name: 'prices', type: 'series' }],
    outputPorts: [{ name: 'ema', type: 'series' }],
    config: { period },
    compute: (
      inputs: Record<string, number | boolean | number[] | boolean[]>,
      config?: Record<string, any>,
      _ctx?: ExecutionContext
    ): BlockResult => {
      const prices = inputs.prices as number[];
      const cfg = config || {};
      const p = cfg.period || period;

      if (!prices || prices.length < p) {
        return { outputs: { ema: [] } };
      }

      const ema: number[] = [];
      const multiplier = 2 / (p + 1);

      // Calculate simple moving average for first period
      let sum = 0;
      for (let i = 0; i < p; i++) {
        sum += prices[i];
      }
      let emaValue = sum / p;
      ema[p - 1] = emaValue;

      // Calculate EMA for remaining prices
      for (let i = p; i < prices.length; i++) {
        emaValue = prices[i] * multiplier + emaValue * (1 - multiplier);
        ema.push(emaValue);
      }

      // Pad the beginning with NaNs
      return {
        outputs: {
          ema: Array(p - 1)
            .fill(NaN)
            .concat([ema[p - 1], ...ema.slice(p)])
        }
      };
    }
  };
}
