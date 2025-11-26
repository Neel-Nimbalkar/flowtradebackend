/**
 * Minimal block and execution types for the trading automation platform.
 */

/** Port data types */
export type PortType = 'number' | 'boolean' | 'series';

/**
 * Input port description
 */
export interface InputPort {
  /** port name */
  name: string;
  /** expected type */
  type: PortType;
}

/**
 * Output port description
 */
export interface OutputPort {
  name: string;
  type: PortType;
}

/**
 * Generic block config bag
 */
export type BlockConfig = Record<string, any>;

/**
 * Result produced by a block after execution
 */
export interface BlockResult {
  outputs: Record<string, number | boolean | number[] | boolean[]>;
}

/**
 * Execution context passed to blocks (lightweight, extensible)
 */
export interface ExecutionContext {
  /** arbitrary values useful to blocks */
  env?: Record<string, any>;
}

/**
 * Minimal block interface. compute may be async or sync.
 */
export interface Block {
  id: string;
  type: 'indicator' | 'logic' | 'input' | 'output' | string;
  inputPorts: InputPort[];
  outputPorts: OutputPort[];
  config?: BlockConfig;
  /**
   * Compute the outputs based on input values. Inputs are keyed by input port name.
   */
  compute: (
    inputs: Record<string, number | boolean | number[] | boolean[]>,
    config?: BlockConfig,
    ctx?: ExecutionContext
  ) => Promise<BlockResult> | BlockResult;
}

/**
 * Connection between block ports
 */
export interface Connection {
  from: { blockId: string; port: string };
  to: { blockId: string; port: string };
}

/**
 * Graph passed to the engine
 */
export interface BlockGraph {
  blocks: Block[];
  connections: Connection[];
}
