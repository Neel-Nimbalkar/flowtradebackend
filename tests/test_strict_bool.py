"""
Test strict boolean conversion to prevent false signals.

CRITICAL: Raw indicator values (RSI=52, EMA=150) should NOT trigger signals.
Only True/False/1/0 should be treated as boolean values.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workflows.unified_executor import execute_unified_workflow


def test_numeric_rsi_should_not_trigger_signal():
    """
    When RSI numeric value (e.g., 52.28) is passed directly to output,
    it should NOT trigger a signal (strict bool converts 52 to False).
    """
    nodes = [
        {'id': 10, 'type': 'input', 'params': {'symbol': 'LCID'}},
        {'id': 11, 'type': 'rsi', 'params': {'period': 14, 'overbought': 70, 'oversold': 30}},
        {'id': 12, 'type': 'output', 'params': {}}
    ]
    
    # Bug scenario: RSI numeric value passed to output (wrong port)
    connections = [
        {'from': {'nodeId': 10, 'port': 'prices'}, 'to': {'nodeId': 11, 'port': 'prices'}},
        {'from': {'nodeId': 11, 'port': 'rsi'}, 'to': {'nodeId': 12, 'port': 'signal'}}  # numeric!
    ]
    
    # Oscillating prices = neutral RSI ~50
    market_data = {
        'close': 11.8,
        'close_history': [11.8, 11.9, 11.8, 11.9] * 25,
        'volume_history': [1000] * 100
    }
    
    signal, debug = execute_unified_workflow(nodes, connections, market_data, debug=False)
    rsi_val = debug.get('node_outputs', {}).get('11', {}).get('rsi')
    
    print(f"RSI value: {rsi_val:.2f}")
    print(f"Signal: {signal}")
    assert signal is None, f"Numeric RSI {rsi_val} should NOT trigger signal"


def test_boolean_rsi_signal_when_overbought():
    """
    When RSI boolean signal port is used and RSI is overbought,
    it should trigger a SELL signal.
    """
    nodes = [
        {'id': 10, 'type': 'input', 'params': {'symbol': 'LCID'}},
        {'id': 11, 'type': 'rsi', 'params': {'period': 14, 'overbought': 70, 'oversold': 30}},
        {'id': 12, 'type': 'output', 'params': {}}
    ]
    
    # Correct: RSI signal (boolean) passed to output
    connections = [
        {'from': {'nodeId': 10, 'port': 'prices'}, 'to': {'nodeId': 11, 'port': 'prices'}},
        {'from': {'nodeId': 11, 'port': 'signal'}, 'to': {'nodeId': 12, 'port': 'signal'}}  # boolean
    ]
    
    # Pure uptrend = RSI 100 (overbought)
    market_data = {
        'close': 12.8,
        'close_history': [11.8 + i*0.01 for i in range(100)],
        'volume_history': [1000] * 100
    }
    
    signal, debug = execute_unified_workflow(nodes, connections, market_data, debug=False)
    rsi_out = debug.get('node_outputs', {}).get('11', {})
    
    print(f"RSI value: {rsi_out.get('rsi')}")
    print(f"RSI signal (boolean): {rsi_out.get('signal')}")
    print(f"Signal: {signal}")
    assert signal == 'SELL', f"RSI overbought should trigger SELL, got {signal}"


def test_boolean_rsi_neutral_no_signal():
    """
    When RSI is neutral (30-70), even boolean signal port should be False,
    resulting in no signal.
    """
    nodes = [
        {'id': 10, 'type': 'input', 'params': {'symbol': 'LCID'}},
        {'id': 11, 'type': 'rsi', 'params': {'period': 14, 'overbought': 70, 'oversold': 30}},
        {'id': 12, 'type': 'output', 'params': {}}
    ]
    
    connections = [
        {'from': {'nodeId': 10, 'port': 'prices'}, 'to': {'nodeId': 11, 'port': 'prices'}},
        {'from': {'nodeId': 11, 'port': 'signal'}, 'to': {'nodeId': 12, 'port': 'signal'}}
    ]
    
    # Oscillating prices = neutral RSI ~50
    market_data = {
        'close': 11.85,
        'close_history': [11.8, 11.9, 11.8, 11.9] * 25,
        'volume_history': [1000] * 100
    }
    
    signal, debug = execute_unified_workflow(nodes, connections, market_data, debug=False)
    rsi_out = debug.get('node_outputs', {}).get('11', {})
    
    print(f"RSI value: {rsi_out.get('rsi')}")
    print(f"RSI signal (boolean): {rsi_out.get('signal')}")
    print(f"Signal: {signal}")
    assert signal is None, f"RSI neutral should NOT trigger signal, got {signal}"


def test_and_gate_with_numeric_values():
    """
    AND gate with numeric values (e.g., RSI=52) should return False.
    Only True/1 should be treated as True.
    """
    nodes = [
        {'id': 1, 'type': 'input', 'params': {}},
        {'id': 2, 'type': 'rsi', 'params': {'period': 14}},
        {'id': 3, 'type': 'ema', 'params': {'period': 9}},
        {'id': 4, 'type': 'and', 'params': {}},
        {'id': 5, 'type': 'output', 'params': {}}
    ]
    
    # Bug: numeric values passed to AND gate
    connections = [
        {'from': {'nodeId': 1, 'port': 'prices'}, 'to': {'nodeId': 2, 'port': 'prices'}},
        {'from': {'nodeId': 1, 'port': 'prices'}, 'to': {'nodeId': 3, 'port': 'prices'}},
        {'from': {'nodeId': 2, 'port': 'rsi'}, 'to': {'nodeId': 4, 'port': 'a'}},  # numeric
        {'from': {'nodeId': 3, 'port': 'ema'}, 'to': {'nodeId': 4, 'port': 'b'}},  # numeric
        {'from': {'nodeId': 4, 'port': 'result'}, 'to': {'nodeId': 5, 'port': 'signal'}}
    ]
    
    market_data = {
        'close': 100,
        'close_history': [99, 101] * 25,  # Neutral RSI
        'volume_history': [1000] * 50
    }
    
    signal, debug = execute_unified_workflow(nodes, connections, market_data, debug=False)
    and_result = debug.get('node_outputs', {}).get('4', {}).get('result')
    
    print(f"AND gate result: {and_result}")
    print(f"Signal: {signal}")
    assert signal is None, f"Numeric values to AND gate should NOT trigger signal"


if __name__ == '__main__':
    print("=" * 60)
    print("TEST 1: Numeric RSI should not trigger signal")
    print("=" * 60)
    test_numeric_rsi_should_not_trigger_signal()
    print("PASS\n")
    
    print("=" * 60)
    print("TEST 2: Boolean RSI signal when overbought")
    print("=" * 60)
    test_boolean_rsi_signal_when_overbought()
    print("PASS\n")
    
    print("=" * 60)
    print("TEST 3: Boolean RSI neutral - no signal")
    print("=" * 60)
    test_boolean_rsi_neutral_no_signal()
    print("PASS\n")
    
    print("=" * 60)
    print("TEST 4: AND gate with numeric values")
    print("=" * 60)
    test_and_gate_with_numeric_values()
    print("PASS\n")
    
    print("=" * 60)
    print("ALL TESTS PASSED!")
    print("=" * 60)
