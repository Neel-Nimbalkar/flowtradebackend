import { Block } from './types';

/**
 * Create a VWAP (Volume Weighted Average Price) indicator block.
 * VWAP(i) = cumulative(sum(price[i] * volume[i])) / cumulative(sum(volume[i]))
 * Inputs: prices (series), volumes (series)
 * Outputs: vwap (series)
 */
export function createVwapBlock(id: string): Block {
  return {
    id,
    type: 'indicator',
    inputPorts: [
      { name: 'prices', type: 'series' },
      { name: 'volumes', type: 'series' }
    ],
    outputPorts: [
      { name: 'vwap', type: 'series' }
    ],
    compute: (inputs) => {
      const prices = inputs.prices as number[];
      const volumes = inputs.volumes as number[];
      if (!prices || !volumes || prices.length !== volumes.length || prices.length === 0) {
        return { outputs: { vwap: [] } };
      }
      const vwap: number[] = [];
      let cumPV = 0;
      let cumV = 0;
      for (let i = 0; i < prices.length; i++) {
        const p = prices[i];
        const v = volumes[i];
        cumPV += p * v;
        cumV += v;
        vwap.push(cumV === 0 ? NaN : cumPV / cumV);
      }
      return { outputs: { vwap } };
    }
  };
}
