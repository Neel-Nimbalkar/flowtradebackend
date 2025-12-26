import { Block, BlockResult } from './types';

/**
 * Create a threshold comparison logic block.
 * - Inputs: 'series' -> number[]
 * - Config: { operator: '>' | '<', threshold: number }
 * - Outputs: 'signal' -> boolean[] (true when comparison holds)
 */
export function createCompareBlock(
  id: string,
  operator: '>' | '<',
  threshold: number
): Block {
  return {
    id,
    type: 'logic',
    inputPorts: [{ name: 'series', type: 'series' }],
    outputPorts: [{ name: 'signal', type: 'series' }],
    config: { operator, threshold },
    compute(inputs, config) {
      const series = inputs['series'] as number[];
      if (!Array.isArray(series)) throw new Error('Compare block expected numeric series');
      const op = (config && config.operator) || operator;
      const thr = (config && config.threshold) ?? threshold;
      const out: boolean[] = series.map((v) => {
        if (v === null || v === undefined || Number.isNaN(v)) return false;
        if (op === '>') return v > thr;
        return v < thr;
      });
      return { outputs: { signal: out } } as BlockResult;
    },
  };
}
