import { Block, BlockResult, ExecutionContext } from './types';

/**
 * Stochastic Oscillator indicator block factory.
 * Measures where price closes relative to the high-low range.
 * 
 * @param id - Unique block identifier
 * @param period - Lookback period (default 14)
 * @param smoothK - Period for K smoothing (default 3)
 * @param smoothD - Period for D smoothing (default 3)
 * @returns Block with 'prices', 'highs', 'lows' input ports and '%K', '%D' output ports
 * 
 * Example:
 * const stochBlock = createStochasticBlock('stoch_14_3_3');
 * // Output: { outputs: { '%K': [...], '%D': [...] } }
 */
export function createStochasticBlock(
  id: string,
  period: number = 14,
  smoothK: number = 3,
  smoothD: number = 3
): Block {
  return {
    id,
    type: 'indicator',
    inputPorts: [
      { name: 'prices', type: 'series' },
      { name: 'highs', type: 'series' },
      { name: 'lows', type: 'series' }
    ],
    outputPorts: [
      { name: '%K', type: 'series' },
      { name: '%D', type: 'series' }
    ],
    config: { period, smoothK, smoothD },
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
      const kSmooth = cfg.smoothK || smoothK;
      const dSmooth = cfg.smoothD || smoothD;

      if (!prices || !highs || !lows || prices.length < p) {
        return {
          outputs: {
            '%K': [],
            '%D': []
          }
        };
      }

      const rawK: number[] = [];

      // Calculate raw %K
      for (let i = 0; i < prices.length; i++) {
        if (i < p - 1) {
          rawK.push(NaN);
        } else {
          const window = { highs: highs.slice(i - p + 1, i + 1), lows: lows.slice(i - p + 1, i + 1) };
          const high = Math.max(...window.highs);
          const low = Math.min(...window.lows);
          const k = high === low ? 0 : ((prices[i] - low) / (high - low)) * 100;
          rawK.push(k);
        }
      }

      // Smooth %K with SMA
      const percentK = smoothSeries(rawK, kSmooth);

      // %D = SMA of %K
      const percentD = smoothSeries(percentK, dSmooth);

      return {
        outputs: {
          '%K': percentK,
          '%D': percentD
        }
      };
    }
  };
}

function smoothSeries(series: number[], period: number): number[] {
  const smoothed: number[] = [];

  for (let i = 0; i < series.length; i++) {
    if (i < period - 1) {
      smoothed.push(NaN);
    } else {
      const window = series.slice(i - period + 1, i + 1).filter(v => !isNaN(v));
      const avg = window.length > 0 ? window.reduce((a, b) => a + b, 0) / window.length : NaN;
      smoothed.push(avg);
    }
  }

  return smoothed;
}
