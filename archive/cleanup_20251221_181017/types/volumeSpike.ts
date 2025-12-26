import { Block } from './types';

/**
 * Volume spike detection block.
 * Outputs a boolean series where volume > movingAverage(volume, period) * multiplier.
 * Also outputs the moving average for reference.
 */
export function createVolumeSpikeBlock(
  id: string,
  period: number = 20,
  multiplier: number = 1.5
): Block {
  return {
    id,
    type: 'indicator',
    inputPorts: [
      { name: 'volumes', type: 'series' }
    ],
    outputPorts: [
      { name: 'avg_volume', type: 'series' },
      { name: 'spike', type: 'series' }
    ],
    config: { period, multiplier },
    compute: (inputs, config) => {
      const volumes = inputs.volumes as number[];
      const p = (config?.period ?? period) as number;
      const m = (config?.multiplier ?? multiplier) as number;
      if (!volumes || volumes.length === 0) {
        return { outputs: { avg_volume: [], spike: [] } };
      }
      const avg: number[] = [];
      const spike: boolean[] = [];
      for (let i = 0; i < volumes.length; i++) {
        if (i < p - 1) {
          avg.push(NaN);
          spike.push(false);
        } else {
          const window = volumes.slice(i - p + 1, i + 1);
          const mv = window.reduce((a, b) => a + b, 0) / p;
            avg.push(mv);
          spike.push(volumes[i] > mv * m);
        }
      }
      return { outputs: { avg_volume: avg, spike } };
    }
  };
}
