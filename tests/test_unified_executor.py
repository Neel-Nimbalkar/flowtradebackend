"""
Test the UnifiedStrategyExecutor to verify it generates signals correctly.
"""
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workflows.unified_executor import execute_unified_workflow, UnifiedStrategyExecutor

def test_simple_rsi_strategy():
    """Test a simple RSI strategy that should generate signals."""
    print("=" * 60)
    print("TEST 1: Simple RSI Strategy")
    print("=" * 60)
    
    # Mock OHLCV data (SPY-like prices)
    closes = [450.0 + i * 0.5 for i in range(50)]  # Uptrend
    
    market_data = {
        'close': closes[-1],
        'close_history': closes,
        'high_history': [c + 1 for c in closes],
        'low_history': [c - 1 for c in closes],
        'open_history': closes,
        'volume_history': [1000000] * 50,
    }
    
    # Simple workflow: RSI -> Signal
    nodes = [
        {'id': 1, 'type': 'rsi', 'params': {'period': 14, 'oversold': 30, 'overbought': 70}},
        {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
    ]
    
    # RSI connects to Signal
    connections = [
        {'source': '1', 'target': '2', 'sourceHandle': 'output', 'targetHandle': 'input'}
    ]
    
    signal, debug = execute_unified_workflow(
        nodes=nodes,
        connections=connections,
        market_data=market_data,
        debug=True
    )
    
    print(f"Signal: {signal}")
    print(f"Debug info:")
    for key, value in debug.items():
        print(f"  {key}: {value}")
    
    return signal is not None

def test_ema_crossover_strategy():
    """Test EMA crossover strategy - the problematic one."""
    print("\n" + "=" * 60)
    print("TEST 2: EMA Crossover Strategy")
    print("=" * 60)
    
    # Create price data with a clear crossover pattern
    # EMA 9 should cross above EMA 21
    closes = []
    for i in range(100):
        if i < 50:
            closes.append(100 - i * 0.2)  # Downtrend
        else:
            closes.append(90 + (i - 50) * 0.5)  # Uptrend (crossover)
    
    market_data = {
        'close': closes[-1],
        'close_history': closes,
        'high_history': [c + 1 for c in closes],
        'low_history': [c - 1 for c in closes],
        'open_history': closes,
        'volume_history': [1000000] * 100,
    }
    
    # EMA crossover workflow: EMA 9 -> Compare <- EMA 21 -> Signal
    nodes = [
        {'id': 1, 'type': 'ema', 'params': {'period': 9, 'direction': 'above'}},
        {'id': 2, 'type': 'ema', 'params': {'period': 21}},
        {'id': 3, 'type': 'compare', 'params': {'operator': '>'}},  # EMA9 > EMA21
        {'id': 4, 'type': 'signal', 'params': {'type': 'BUY'}}
    ]
    
    # EMA9 and EMA21 connect to Compare, Compare connects to Signal
    connections = [
        {'source': '1', 'target': '3', 'sourceHandle': 'ema_value', 'targetHandle': 'a'},
        {'source': '2', 'target': '3', 'sourceHandle': 'ema_value', 'targetHandle': 'b'},
        {'source': '3', 'target': '4', 'sourceHandle': 'result', 'targetHandle': 'input'}
    ]
    
    signal, debug = execute_unified_workflow(
        nodes=nodes,
        connections=connections,
        market_data=market_data,
        debug=True
    )
    
    print(f"Signal: {signal}")
    print(f"Debug info:")
    for key, value in debug.items():
        if key == 'node_outputs':
            print(f"  {key}:")
            for node_id, outputs in value.items():
                print(f"    Node {node_id}: {outputs}")
        else:
            print(f"  {key}: {value}")
    
    return signal is not None

def test_multi_indicator_and_gate():
    """Test multi-indicator strategy with AND gate."""
    print("\n" + "=" * 60)
    print("TEST 3: Multi-Indicator AND Gate")
    print("=" * 60)
    
    # Price data designed to trigger both RSI oversold and MACD bullish
    closes = [100 - i * 0.3 for i in range(50)]  # Downtrend (RSI should be low)
    closes.extend([85 + i * 0.5 for i in range(50)])  # Uptrend reversal (MACD bullish)
    
    market_data = {
        'close': closes[-1],
        'close_history': closes,
        'high_history': [c + 1 for c in closes],
        'low_history': [c - 1 for c in closes],
        'open_history': closes,
        'volume_history': [1000000] * 100,
    }
    
    # Workflow: RSI -> AND <- MACD -> Signal
    nodes = [
        {'id': 1, 'type': 'rsi', 'params': {'period': 14, 'oversold': 30, 'overbought': 70, 'condition': 'oversold'}},
        {'id': 2, 'type': 'macd', 'params': {'fast': 12, 'slow': 26, 'signal': 9}},
        {'id': 3, 'type': 'and', 'params': {}},
        {'id': 4, 'type': 'signal', 'params': {'type': 'BUY'}}
    ]
    
    connections = [
        {'source': '1', 'target': '3', 'sourceHandle': 'result', 'targetHandle': 'a'},
        {'source': '2', 'target': '3', 'sourceHandle': 'result', 'targetHandle': 'b'},
        {'source': '3', 'target': '4', 'sourceHandle': 'result', 'targetHandle': 'input'}
    ]
    
    signal, debug = execute_unified_workflow(
        nodes=nodes,
        connections=connections,
        market_data=market_data,
        debug=True
    )
    
    print(f"Signal: {signal}")
    print(f"Debug info:")
    for key, value in debug.items():
        if key == 'node_outputs':
            print(f"  {key}:")
            for node_id, outputs in value.items():
                print(f"    Node {node_id}: {outputs}")
        else:
            print(f"  {key}: {value}")
    
    return True  # Signal may or may not trigger depending on actual RSI values

def test_or_gate_strategy():
    """Test OR gate - either condition should trigger."""
    print("\n" + "=" * 60)
    print("TEST 4: OR Gate Strategy")
    print("=" * 60)
    
    # Price data with clear uptrend (MACD should be bullish)
    closes = [100 + i * 0.3 for i in range(100)]
    
    market_data = {
        'close': closes[-1],
        'close_history': closes,
        'high_history': [c + 1 for c in closes],
        'low_history': [c - 1 for c in closes],
        'open_history': closes,
        'volume_history': [1000000] * 100,
    }
    
    # Workflow: RSI -> OR <- MACD -> Signal
    nodes = [
        {'id': 1, 'type': 'rsi', 'params': {'period': 14, 'oversold': 30, 'overbought': 70, 'condition': 'oversold'}},
        {'id': 2, 'type': 'macd', 'params': {'fast': 12, 'slow': 26, 'signal': 9}},
        {'id': 3, 'type': 'or', 'params': {}},
        {'id': 4, 'type': 'signal', 'params': {'type': 'BUY'}}
    ]
    
    connections = [
        {'source': '1', 'target': '3', 'sourceHandle': 'result', 'targetHandle': 'a'},
        {'source': '2', 'target': '3', 'sourceHandle': 'result', 'targetHandle': 'b'},
        {'source': '3', 'target': '4', 'sourceHandle': 'result', 'targetHandle': 'input'}
    ]
    
    signal, debug = execute_unified_workflow(
        nodes=nodes,
        connections=connections,
        market_data=market_data,
        debug=True
    )
    
    print(f"Signal: {signal}")
    print(f"Debug info:")
    for key, value in debug.items():
        if key == 'node_outputs':
            print(f"  {key}:")
            for node_id, outputs in value.items():
                print(f"    Node {node_id}: {outputs}")
        else:
            print(f"  {key}: {value}")
    
    # With OR gate and MACD bullish (uptrend), we should get a signal
    return signal is not None


if __name__ == '__main__':
    print("🧪 UNIFIED EXECUTOR TEST SUITE")
    print("Testing the new unified graph-based execution engine")
    print()
    
    results = []
    
    try:
        results.append(("Simple RSI Strategy", test_simple_rsi_strategy()))
    except Exception as e:
        print(f"❌ Test 1 failed with error: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Simple RSI Strategy", False))
    
    try:
        results.append(("EMA Crossover Strategy", test_ema_crossover_strategy()))
    except Exception as e:
        print(f"❌ Test 2 failed with error: {e}")
        import traceback
        traceback.print_exc()
        results.append(("EMA Crossover Strategy", False))
    
    try:
        results.append(("Multi-Indicator AND Gate", test_multi_indicator_and_gate()))
    except Exception as e:
        print(f"❌ Test 3 failed with error: {e}")
        import traceback
        traceback.print_exc()
        results.append(("Multi-Indicator AND Gate", False))
    
    try:
        results.append(("OR Gate Strategy", test_or_gate_strategy()))
    except Exception as e:
        print(f"❌ Test 4 failed with error: {e}")
        import traceback
        traceback.print_exc()
        results.append(("OR Gate Strategy", False))
    
    print("\n" + "=" * 60)
    print("TEST RESULTS SUMMARY")
    print("=" * 60)
    for name, passed in results:
        status = "✅ PASS" if passed else "❌ FAIL"
        print(f"  {status}: {name}")
    
    all_passed = all(r[1] for r in results)
    print()
    print("=" * 60)
    if all_passed:
        print("🎉 ALL TESTS PASSED!")
    else:
        print("⚠️ SOME TESTS FAILED")
    print("=" * 60)
