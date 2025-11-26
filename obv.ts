import { Block, BlockResult, ExecutionContext } from './types';

/**
 * OBV (On-Balance Volume) indicator block factory.
 * Accumulates volume based on price direction.
 * 
 * @param id - Unique block identifier
 * @returns Block with 'prices' and 'volumes' input ports and 'obv' output port
 * 
 * Example:
 * const obvBlock = createOBVBlock('obv_main');
 * // Output: { outputs: { obv: [...] } }
 */
export function createOBVBlock(id: string): Block {
  return {
    id,
    type: 'indicator',
    inputPorts: [
      { name: 'prices', type: 'series' },
      { name: 'volumes', type: 'series' }
    ],
    outputPorts: [{ name: 'obv', type: 'series' }],
    config: {},
    compute: (
      inputs: Record<string, number | boolean | number[] | boolean[]>,
      _config?: Record<string, any>,
      _ctx?: ExecutionContext
    ): BlockResult => {
      const prices = inputs.prices as number[];
      const volumes = inputs.volumes as number[];

      if (!prices || !volumes || prices.length === 0) {
        return { outputs: { obv: [] } };
      }

      const obv: number[] = [];
      let runningObv = 0;

      for (let i = 0; i < prices.length; i++) {
        let change = 0;
        if (i === 0) {
          change = 0;
        } else if (prices[i] > prices[i - 1]) {
          change = volumes[i];
        } else if (prices[i] < prices[i - 1]) {
          change = -volumes[i];
        }

        runningObv += change;
        obv.push(runningObv);
      }

      return { outputs: { obv } };
    }
  };
}
