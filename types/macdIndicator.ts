import { Block, BlockResult, ExecutionContext } from './types';

/**
 * MACD (Moving Average Convergence Divergence) indicator block factory.
 * Computes fast EMA, slow EMA, MACD line, signal line, and histogram.
 * 
 * @param id - Unique block identifier
 * @param fastPeriod - Period for fast EMA (default 12)
 * @param slowPeriod - Period for slow EMA (default 26)
 * @param signalPeriod - Period for signal line EMA (default 9)
 * @returns Block with 'prices' input port and 'macd', 'signal', 'histogram' output ports
 * 
 * Example:
 * const macdBlock = createMacdBlock('macd_12_26_9');
 * // Output: { outputs: { macd: [...], signal: [...], histogram: [...] } }
 */
export function createMacdBlock(
  id: string,
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): Block {
  return {
    id,
    type: 'indicator',
    inputPorts: [{ name: 'prices', type: 'series' }],
    outputPorts: [
      { name: 'macd', type: 'series' },
      { name: 'signal', type: 'series' },
      { name: 'histogram', type: 'series' }
    ],
    config: { fastPeriod, slowPeriod, signalPeriod },
    compute: (
      inputs: Record<string, number | boolean | number[] | boolean[]>,
      config?: Record<string, any>,
      _ctx?: ExecutionContext
    ): BlockResult => {
      const prices = inputs.prices as number[];
      const cfg = config || {};

      if (!prices || prices.length < slowPeriod) {
        return {
          outputs: {
            macd: [],
            signal: [],
            histogram: []
          }
        };
      }

      // Compute fast and slow EMAs
      const fastEma = computeEma(prices, cfg.fastPeriod || fastPeriod);
      const slowEma = computeEma(prices, cfg.slowPeriod || slowPeriod);

      // MACD line = fast EMA - slow EMA
      const macd = fastEma.map((f, i) => (i < slowPeriod - 1 ? NaN : f - slowEma[i]));

      // Signal line = EMA of MACD
      const validMacd = macd.filter(m => !isNaN(m));
      const signal = computeEma(validMacd, cfg.signalPeriod || signalPeriod);

      // Pad signal to match MACD length
      const paddedSignal = Array(slowPeriod - 1)
        .fill(NaN)
        .concat(signal);

      // Histogram = MACD - Signal
      const histogram = macd.map((m, i) => (isNaN(m) || isNaN(paddedSignal[i]) ? NaN : m - paddedSignal[i]));

      return {
        outputs: {
          macd,
          signal: paddedSignal,
          histogram
        }
      };
    }
  };
}

function computeEma(prices: number[], period: number): number[] {
  const ema: number[] = [];
  const multiplier = 2 / (period + 1);

  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += prices[i];
  }
  ema[period - 1] = sum / period;

  for (let i = period; i < prices.length; i++) {
    const nextEma = prices[i] * multiplier + ema[i - 1] * (1 - multiplier);
    ema.push(nextEma);
  }

  // Pad the beginning with NaNs
  return Array(period - 1)
    .fill(NaN)
    .concat([ema[period - 1], ...ema.slice(period)]);
}
