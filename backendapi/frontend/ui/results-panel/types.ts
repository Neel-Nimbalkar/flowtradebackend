export type PanelStatus = 'completed' | 'stopped' | 'failed';
export type BlockStatus = 'passed' | 'failed' | 'skipped';
export type FinalSignal = 'BUY' | 'SELL' | 'HOLD';

export interface ResultSummary {
  strategyName: string;
  startedAt: string; // ISO
  completedAt: string; // ISO
  status: PanelStatus;
  symbol: string;
  timeframe: string;
  lookbackDays: number;
  startTimestamp: string; // ISO
  endTimestamp: string; // ISO
  candlesProcessed: number;
  runtimeMs: number;
  workflowLength: number;
}

export interface BlockResultItem {
  id: number;
  type: string;
  emoji: string;
  name: string;
  status: BlockStatus;
  outputs?: Record<string, string | number | boolean | null>;
  explanation?: string;
  failReason?: string;
  executionTimeMs: number;
  raw?: unknown;
}

export interface EquityPoint {
  time: string | number; // ISO or epoch
  value: number; // equity value for plotting
}

export interface PanelData {
  summary: ResultSummary;
  blocks: BlockResultItem[];
  finalSignal: FinalSignal;
  confidence?: number;
  aiAnalysis?: string;
  equityCurve: EquityPoint[];
}
