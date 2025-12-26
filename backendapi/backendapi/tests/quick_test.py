"""Quick test for connection scenarios"""
import sys
sys.path.insert(0, 'c:/Users/nimba/OneDrive/Desktop/FlowGrid Trading/backendapi')
from workflows.unified_executor import execute_unified_workflow

nodes = [
    {'id': 10, 'type': 'input', 'params': {}},
    {'id': 11, 'type': 'rsi', 'params': {'period': 14, 'oversold': 30, 'overbought': 70}},
    {'id': 12, 'type': 'output', 'params': {}}
]

market_data = {
    'close': 11.8,
    'close_history': [11.8, 11.9, 11.8, 11.9] * 25,
    'volume_history': [1000] * 100
}

print("=" * 60)
print("TEST 1: No connection from RSI to Output")
print("=" * 60)
connections1 = [
    {'from': {'nodeId': 10, 'port': 'prices'}, 'to': {'nodeId': 11, 'port': 'prices'}}
]
signal1, debug1 = execute_unified_workflow(nodes, connections1, market_data, debug=True)
print(f"final_condition: {debug1.get('final_condition')}")
print(f"Signal: {signal1}")
print("Node outputs:")
for nid, out in debug1.get('node_outputs', {}).items():
    print(f"  {nid}: {out}")

print()
print("=" * 60)
print("TEST 2: RSI numeric value -> Output")
print("=" * 60)
connections2 = [
    {'from': {'nodeId': 10, 'port': 'prices'}, 'to': {'nodeId': 11, 'port': 'prices'}},
    {'from': {'nodeId': 11, 'port': 'rsi'}, 'to': {'nodeId': 12, 'port': 'signal'}}
]
signal2, debug2 = execute_unified_workflow(nodes, connections2, market_data, debug=True)
print(f"final_condition: {debug2.get('final_condition')}")
print(f"Signal: {signal2}")

print()
print("=" * 60)
print("TEST 3: RSI boolean signal -> Output")
print("=" * 60)
connections3 = [
    {'from': {'nodeId': 10, 'port': 'prices'}, 'to': {'nodeId': 11, 'port': 'prices'}},
    {'from': {'nodeId': 11, 'port': 'signal'}, 'to': {'nodeId': 12, 'port': 'signal'}}
]
signal3, debug3 = execute_unified_workflow(nodes, connections3, market_data, debug=True)
print(f"final_condition: {debug3.get('final_condition')}")
print(f"Signal: {signal3}")
