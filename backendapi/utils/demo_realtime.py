"""
demo_realtime.py

Small demo harness that starts a WorkflowRunner with a synthetic PriceStream,
creates two simple indicator nodes (EMA and RSI) named with the convention
`node_name:SYMBOL` so the orchestrator will subscribe them to the stream,
and runs for a short period so the WebSocketBroadcaster can send messages
to any connected browser clients (e.g., the React WorkflowBuilder).

Run:
  python demo_realtime.py

Open the frontend (Vite) and the Strategy Monitor to see live updates.
"""
import time
import logging

from backendapi.workflows.flowgrid_nodes import EMAIndicator, RSIIndicator
from backendapi.workflows.flowgrid_orchestrator import WorkflowRunner

logging.basicConfig(level=logging.DEBUG)


def main():
    # Create nodes named with symbol: so orchestrator subscribes them
    nodes = {
        'n1': EMAIndicator('ema:NVDA', period=10),
        'n2': RSIIndicator('rsi:NVDA', period=14),
    }

    # no edges for this simple demo
    edges = []

    runner = WorkflowRunner(nodes=nodes, edges=edges)

    try:
        print('Starting demo WorkflowRunner (PriceStream + optional WS broadcaster)...')
        runner.start()
        print('Runner started. If frontend is open, it should receive node messages at ws://127.0.0.1:6789')
        # Let it run for a bit to produce messages
        runtime = 12
        for i in range(runtime):
            print(f' running... {i+1}/{runtime}')
            time.sleep(1)
        print('Demo complete; stopping runner...')
    finally:
        runner.stop()


if __name__ == '__main__':
    main()
