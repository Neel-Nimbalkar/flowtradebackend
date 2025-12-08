import { Block, BlockGraph, BlockResult, Connection, ExecutionContext } from './types';
import { renderFlowchart } from './visualize';

/**
 * Execute a block graph and print a flowchart visualization.
 * After execution, prints the workflow diagram for developer preview.
 * UI team can replace this with a React canvas in the future.
 */
export async function executeGraph(
  graph: BlockGraph,
  seedInputs: Record<string, any> = {},
  ctx: ExecutionContext = {}
): Promise<Record<string, any>> {
  const blocksById: Record<string, Block> = {};
  for (const b of graph.blocks) blocksById[b.id] = b;

  // map of target -> source
  const incoming: Record<string, { fromBlock: string; fromPort: string }[]> = {};
  for (const conn of graph.connections || []) {
    const key = `${conn.to.blockId}.${conn.to.port}`;
    incoming[key] = incoming[key] || [];
    incoming[key].push({ fromBlock: conn.from.blockId, fromPort: conn.from.port });
  }

  // value cache (blockId.port -> value)
  const cache: Record<string, any> = {};
  // seed inputs
  for (const k of Object.keys(seedInputs)) {
    cache[k] = seedInputs[k];
  }

  const executed = new Set<string>();
  let progress = true;
  while (progress) {
    progress = false;

    for (const block of graph.blocks) {
      if (executed.has(block.id)) continue;

      // gather inputs for this block
      const inputsAvailable: Record<string, any> = {};
      let allReady = true;
      for (const port of block.inputPorts) {
        const key = `${block.id}.${port.name}`;
        const sources = incoming[key];
        if (!sources || sources.length === 0) {
          // no wire into this port; check for seeded external input
          const seeded = cache[key];
          if (seeded !== undefined) inputsAvailable[port.name] = seeded;
          else {
            allReady = false;
            break;
          }
        } else {
          // If multiple sources, take first (you can expand semantics later)
          const src = sources[0];
          const srcKey = `${src.fromBlock}.${src.fromPort}`;
          if (cache.hasOwnProperty(srcKey)) inputsAvailable[port.name] = cache[srcKey];
          else {
            allReady = false;
            break;
          }
        }
      }

      if (!allReady) continue;

      // execute block
      let result: BlockResult;
      try {
        result = await Promise.resolve(block.compute(inputsAvailable, block.config, ctx));
      } catch (err) {
        throw new Error(`Block ${block.id} execution failed: ${String(err)}`);
      }

      // store outputs into cache
      for (const out of block.outputPorts) {
        const key = `${block.id}.${out.name}`;
        if (!result || result.outputs[out.name] === undefined) {
          // skip if block didn't produce this output
          continue;
        }
        cache[key] = result.outputs[out.name];
      }

      executed.add(block.id);
      progress = true;
    }
  }

  // If some blocks remain unevaluated, raise an error with helpful info
  const remaining = graph.blocks.filter((b) => !executed.has(b.id));
  if (remaining.length > 0) {
    const ids = remaining.map((r) => r.id).join(', ');
    throw new Error(`Could not resolve inputs for blocks: ${ids}`);
  }

  // Visualize the workflow after execution
  const diagram = renderFlowchart(graph);
  console.log('\nWorkflow Diagram:\n' + diagram + '\n');

  return cache;
}
