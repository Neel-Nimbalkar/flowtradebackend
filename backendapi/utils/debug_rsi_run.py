"""
Small harness to reproduce RSI evaluation logic locally.
Run with: `python debug_rsi_run.py` from project root.
Set FLOWGRID_DEBUG=1 in environment to enable verbose logs from the engine.
"""
from backendapi.workflows.workflow_engine import WorkflowEngine

# Create a simple workflow with a single RSI block
blocks = [
    {
        'id': 1,
        'type': 'rsi',
        'params': {
            'rsi_condition': 'oversold',
            'threshold_low': 30,
            'threshold_high': 70
        }
    }
]

# Simulate latest_data where RSI = 10 (should be oversold -> pass)
latest_data = {
    'rsi': 10.0,
    'close': 100.0,
    'price': 100.0
}

engine = WorkflowEngine()
result = engine.execute_workflow(blocks, latest_data)

print('\n==== SIMULATION RESULT ====')
print('Success:', result.success)
print('Final decision:', result.final_decision)
for b in result.blocks:
    print(f"Block {b.block_id} ({b.block_type}) - {b.status} - {b.message}")
print('Total ms:', result.total_execution_time_ms)
