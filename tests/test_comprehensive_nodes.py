"""
Comprehensive Node and Strategy Testing for FlowGrid Trading
Tests all nodes, logic gates, indicator configurations, and strategies
Uses Alpaca API for real market data
"""
import sys
import os
import json
from datetime import datetime, timedelta

# Add the backendapi path for imports
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backendapi', 'backendapi'))

from workflows.unified_executor import UnifiedStrategyExecutor
from integrations.alpaca_fetch import fetch_bars_full

# Alpaca credentials
ALPACA_API_KEY = "PKVBA5Y3I23EOSA4ABCAEAF4VX"
ALPACA_API_SECRET = "9GMb4EQc7RXipyqBb91P24T6p89wYL5EsCXgkrYZuubu"

# Test results tracking
test_results = {"passed": 0, "failed": 0, "errors": []}

def log_test(name: str, passed: bool, details: str = ""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"       {details}")
    if passed:
        test_results["passed"] += 1
    else:
        test_results["failed"] += 1
        test_results["errors"].append(f"{name}: {details}")

def run_executor(nodes, connections, market_data, debug=False):
    executor = UnifiedStrategyExecutor(nodes, connections, market_data, debug=debug)
    signal, debug_info = executor.execute()
    return signal, executor.node_outputs, debug_info

def fetch_real_market_data(symbol="AAPL", days=100):
    end_date = datetime.now()
    start_date = end_date - timedelta(days=days * 2)
    print(f"\n📊 Fetching {days} days of {symbol} data from Alpaca...")
    
    result = fetch_bars_full(
        symbol=symbol,
        start=start_date.strftime('%Y-%m-%d'),
        end=end_date.strftime('%Y-%m-%d'),
        timeframe='1Day',
        api_key=ALPACA_API_KEY,
        api_secret=ALPACA_API_SECRET
    )
    
    closes = result.get('close', [])
    print(f"   Retrieved {len(closes)} bars")
    
    if len(closes) < 50:
        import random
        closes = [100.0]
        for i in range(99):
            closes.append(closes[-1] * (1 + random.uniform(-0.02, 0.02)))
        result = {
            'close': closes, 'open': closes,
            'high': [c * 1.01 for c in closes],
            'low': [c * 0.99 for c in closes],
            'volume': [1000000] * len(closes),
            'timestamp': [(datetime.now() - timedelta(days=i)).isoformat() for i in range(len(closes)-1, -1, -1)]
        }
    return result

def build_market_data(bars_data, bar_index=-1):
    closes = bars_data['close']
    idx = bar_index if bar_index >= 0 else len(closes) + bar_index
    return {
        'close': closes[idx],
        'open': bars_data['open'][idx] if bars_data.get('open') else closes[idx],
        'high': bars_data['high'][idx] if bars_data.get('high') else closes[idx] * 1.01,
        'low': bars_data['low'][idx] if bars_data.get('low') else closes[idx] * 0.99,
        'volume': bars_data['volume'][idx] if bars_data.get('volume') else 1000000,
        'close_history': closes[:idx+1],
        'high_history': bars_data.get('high', closes)[:idx+1],
        'low_history': bars_data.get('low', closes)[:idx+1],
        'volume_history': bars_data.get('volume', [1000000]*len(closes))[:idx+1],
        'timestamp': bars_data['timestamp'][idx] if bars_data.get('timestamp') else datetime.now().isoformat()
    }

def test_rsi_node(bars_data):
    print("\n" + "="*60)
    print("TEST: RSI Indicator Node")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    nodes = [{'id': 1, 'type': 'rsi', 'params': {'period': 14}}]
    _, outputs, _ = run_executor(nodes, [], market_data, debug=True)
    
    rsi_value = outputs.get(1, {}).get('value')
    log_test("RSI period=14 calculates valid value", 
             rsi_value is not None and 0 <= rsi_value <= 100, 
             f"RSI={rsi_value:.2f}" if rsi_value else "No output")
    
    for period in [7, 21, 50]:
        nodes = [{'id': 1, 'type': 'rsi', 'params': {'period': period}}]
        _, outputs, _ = run_executor(nodes, [], market_data)
        rsi_value = outputs.get(1, {}).get('value')
        log_test(f"RSI period={period} respects configuration", 
                 rsi_value is not None and 0 <= rsi_value <= 100, 
                 f"RSI={rsi_value:.2f}" if rsi_value else "No output")

def test_ema_node(bars_data):
    print("\n" + "="*60)
    print("TEST: EMA Indicator Node")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    current_price = market_data['close']
    data_len = len(bars_data['close'])
    
    for period in [9, 21, 50, 200]:
        nodes = [{'id': 1, 'type': 'ema', 'params': {'period': period}}]
        _, outputs, _ = run_executor(nodes, [], market_data)
        ema_value = outputs.get(1, {}).get('value')
        
        # Skip test if we don't have enough data for this period
        if period > data_len:
            print(f"⏭️  SKIP: EMA period={period} (need {period} bars, have {data_len})")
            continue
            
        passed = ema_value is not None and abs(ema_value - current_price) / current_price < 0.5
        log_test(f"EMA period={period} calculates valid value", passed, 
                f"EMA={ema_value:.2f}, Price={current_price:.2f}" if ema_value else "No output")

def test_macd_node(bars_data):
    print("\n" + "="*60)
    print("TEST: MACD Indicator Node")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    nodes = [{'id': 1, 'type': 'macd', 'params': {'fast': 12, 'slow': 26, 'signal': 9}}]
    _, outputs, _ = run_executor(nodes, [], market_data, debug=True)
    
    macd_out = outputs.get(1, {})
    macd_line = macd_out.get('macd') or macd_out.get('value')
    signal_line = macd_out.get('signal')
    histogram = macd_out.get('histogram')
    
    log_test("MACD line calculated", macd_line is not None, f"MACD={macd_line:.4f}" if macd_line else "No output")
    log_test("MACD signal line calculated", signal_line is not None, f"Signal={signal_line:.4f}" if signal_line else "No output")
    log_test("MACD histogram calculated", histogram is not None, f"Histogram={histogram:.4f}" if histogram else "No output")

def test_bollinger_bands(bars_data):
    print("\n" + "="*60)
    print("TEST: Bollinger Bands Node")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    nodes = [{'id': 1, 'type': 'bollinger', 'params': {'period': 20, 'stddev': 2.0}}]
    _, outputs, _ = run_executor(nodes, [], market_data, debug=True)
    
    bb_out = outputs.get(1, {})
    upper = bb_out.get('upper')
    middle = bb_out.get('middle') or bb_out.get('value')
    lower = bb_out.get('lower')
    
    passed = upper is not None and middle is not None and lower is not None
    log_test("Bollinger Bands calculated all bands", passed,
            f"Upper={upper:.2f}, Middle={middle:.2f}, Lower={lower:.2f}" if passed else "Missing bands")
    
    if upper and middle and lower:
        log_test("Bollinger Bands order correct (upper > middle > lower)", upper > middle > lower)

def test_vwap_node(bars_data):
    print("\n" + "="*60)
    print("TEST: VWAP Indicator Node")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    nodes = [{'id': 1, 'type': 'vwap', 'params': {}}]
    _, outputs, _ = run_executor(nodes, [], market_data, debug=True)
    
    vwap_value = outputs.get(1, {}).get('value')
    log_test("VWAP calculated valid value", vwap_value is not None and vwap_value > 0, 
            f"VWAP={vwap_value:.2f}" if vwap_value else "No output")

def test_sma_node(bars_data):
    print("\n" + "="*60)
    print("TEST: SMA Indicator Node")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    
    for period in [10, 20, 50]:
        nodes = [{'id': 1, 'type': 'sma', 'params': {'period': period}}]
        _, outputs, _ = run_executor(nodes, [], market_data)
        sma_value = outputs.get(1, {}).get('value')
        log_test(f"SMA period={period} calculates valid value", sma_value is not None and sma_value > 0, 
                f"SMA={sma_value:.2f}" if sma_value else "No output")

def test_atr_node(bars_data):
    print("\n" + "="*60)
    print("TEST: ATR Indicator Node")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    nodes = [{'id': 1, 'type': 'atr', 'params': {'period': 14}}]
    _, outputs, _ = run_executor(nodes, [], market_data, debug=True)
    
    atr_value = outputs.get(1, {}).get('value')
    log_test("ATR calculated valid value", atr_value is not None and atr_value >= 0, 
            f"ATR={atr_value:.4f}" if atr_value else "No output")

def test_compare_node(bars_data):
    print("\n" + "="*60)
    print("TEST: Compare Node")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    
    # RSI > 50 comparison
    nodes = [
        {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
        {'id': 2, 'type': 'compare', 'params': {'operator': '>', 'value': 50}}
    ]
    connections = [{'from': {'nodeId': 1, 'port': 'value'}, 'to': {'nodeId': 2, 'port': 'a'}}]
    
    _, outputs, _ = run_executor(nodes, connections, market_data, debug=True)
    
    rsi_value = outputs.get(1, {}).get('value')
    compare_result = outputs.get(2, {}).get('result')
    
    expected = rsi_value > 50 if rsi_value is not None else None
    log_test(f"Compare RSI > 50", compare_result == expected, 
            f"RSI={rsi_value:.2f}, Expected {expected}, Got {compare_result}" if rsi_value else "No RSI")
    
    # Test all operators
    for op, val, test_val in [('<', 70, 30), ('>=', 30, 50), ('<=', 80, 50), ('==', 50, 50)]:
        nodes = [
            {'id': 1, 'type': 'constant', 'params': {'value': test_val}},
            {'id': 2, 'type': 'compare', 'params': {'operator': op, 'value': val}}
        ]
        connections = [{'from': {'nodeId': 1, 'port': 'value'}, 'to': {'nodeId': 2, 'port': 'a'}}]
        
        _, outputs, _ = run_executor(nodes, connections, market_data)
        compare_result = outputs.get(2, {}).get('result')
        
        if op == '<': expected = test_val < val
        elif op == '>': expected = test_val > val
        elif op == '>=': expected = test_val >= val
        elif op == '<=': expected = test_val <= val
        elif op == '==': expected = test_val == val
        else: expected = None
        
        log_test(f"Compare {test_val} {op} {val}", compare_result == expected, f"Expected {expected}, Got {compare_result}")

def test_and_gate_basic(bars_data):
    print("\n" + "="*60)
    print("TEST: AND Gate - Basic Boolean Logic")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    
    test_cases = [(True, True, True), (True, False, False), (False, True, False), (False, False, False)]
    
    for a, b, expected in test_cases:
        # Use boolean node type which outputs true boolean values
        nodes = [
            {'id': 1, 'type': 'boolean', 'params': {'value': a}},
            {'id': 2, 'type': 'boolean', 'params': {'value': b}},
            {'id': 3, 'type': 'and', 'params': {'mode': 'truthy'}}  # Use truthy mode for basic boolean tests
        ]
        connections = [
            {'from': {'nodeId': 1, 'port': 'value'}, 'to': {'nodeId': 3, 'port': 'a'}},
            {'from': {'nodeId': 2, 'port': 'value'}, 'to': {'nodeId': 3, 'port': 'b'}}
        ]
        
        _, outputs, _ = run_executor(nodes, connections, market_data, debug=True)
        and_result = outputs.get(3, {}).get('result')
        log_test(f"AND gate: {a} AND {b} = {expected}", and_result == expected, f"Got {and_result}")

def test_and_gate_with_indicators_issue(bars_data):
    print("\n" + "="*60)
    print("TEST: AND Gate - RAW INDICATOR VALUES (BUG CHECK)")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    
    # ISSUE: Plugging raw RSI directly into AND gate
    nodes = [
        {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
        {'id': 2, 'type': 'ema', 'params': {'period': 20}},
        {'id': 3, 'type': 'and', 'params': {}}
    ]
    connections = [
        {'from': {'nodeId': 1, 'port': 'value'}, 'to': {'nodeId': 3, 'port': 'a'}},
        {'from': {'nodeId': 2, 'port': 'value'}, 'to': {'nodeId': 3, 'port': 'b'}}
    ]
    
    _, outputs, _ = run_executor(nodes, connections, market_data, debug=True)
    
    rsi_value = outputs.get(1, {}).get('value')
    ema_value = outputs.get(2, {}).get('value')
    and_result = outputs.get(3, {}).get('result')
    
    print(f"\n   ⚠️  INDICATOR VALUES DIRECTLY TO AND GATE:")
    print(f"       RSI value: {rsi_value}")
    print(f"       EMA value: {ema_value}")
    print(f"       AND result: {and_result}")
    
    log_test("AND gate rejects raw indicator values (RSI, EMA)", and_result == False,
            f"RSI={rsi_value:.2f}, EMA={ema_value:.2f} -> AND should be False, got {and_result}")
    
    # CORRECT approach: Use Compare nodes first
    print("\n   ✅ CORRECT APPROACH: Use Compare nodes first")
    nodes = [
        {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
        {'id': 2, 'type': 'ema', 'params': {'period': 20}},
        {'id': 3, 'type': 'compare', 'params': {'operator': '>', 'value': 30}},
        {'id': 4, 'type': 'compare', 'params': {'operator': '>', 'value': 0}},
        {'id': 5, 'type': 'and', 'params': {}}
    ]
    connections = [
        {'from': {'nodeId': 1, 'port': 'value'}, 'to': {'nodeId': 3, 'port': 'a'}},
        {'from': {'nodeId': 2, 'port': 'value'}, 'to': {'nodeId': 4, 'port': 'a'}},
        {'from': {'nodeId': 3, 'port': 'result'}, 'to': {'nodeId': 5, 'port': 'a'}},
        {'from': {'nodeId': 4, 'port': 'result'}, 'to': {'nodeId': 5, 'port': 'b'}}
    ]
    
    _, outputs, _ = run_executor(nodes, connections, market_data, debug=True)
    
    rsi_compare = outputs.get(3, {}).get('result')
    ema_compare = outputs.get(4, {}).get('result')
    and_result = outputs.get(5, {}).get('result')
    
    print(f"       RSI > 30: {rsi_compare}")
    print(f"       EMA > 0: {ema_compare}")
    print(f"       AND result: {and_result}")
    
    expected = rsi_compare and ema_compare
    log_test("AND gate with Compare nodes works correctly", and_result == expected,
            f"({rsi_compare} AND {ema_compare}) = {expected}, got {and_result}")

def test_or_gate(bars_data):
    print("\n" + "="*60)
    print("TEST: OR Gate")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    
    test_cases = [(True, True, True), (True, False, True), (False, True, True), (False, False, False)]
    
    for a, b, expected in test_cases:
        # Use boolean node type which outputs true boolean values
        nodes = [
            {'id': 1, 'type': 'boolean', 'params': {'value': a}},
            {'id': 2, 'type': 'boolean', 'params': {'value': b}},
            {'id': 3, 'type': 'or', 'params': {'mode': 'truthy'}}  # Use truthy mode for basic boolean tests
        ]
        connections = [
            {'from': {'nodeId': 1, 'port': 'value'}, 'to': {'nodeId': 3, 'port': 'a'}},
            {'from': {'nodeId': 2, 'port': 'value'}, 'to': {'nodeId': 3, 'port': 'b'}}
        ]
        
        _, outputs, _ = run_executor(nodes, connections, market_data)
        or_result = outputs.get(3, {}).get('result')
        log_test(f"OR gate: {a} OR {b} = {expected}", or_result == expected, f"Got {or_result}")

def test_not_gate(bars_data):
    print("\n" + "="*60)
    print("TEST: NOT Gate")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    
    for input_val, expected in [(True, False), (False, True)]:
        # Use boolean node type and truthy mode for proper boolean handling
        nodes = [
            {'id': 1, 'type': 'boolean', 'params': {'value': input_val}},
            {'id': 2, 'type': 'not', 'params': {'mode': 'truthy'}}
        ]
        connections = [{'from': {'nodeId': 1, 'port': 'value'}, 'to': {'nodeId': 2, 'port': 'input'}}]
        
        _, outputs, _ = run_executor(nodes, connections, market_data)
        not_result = outputs.get(2, {}).get('result')
        log_test(f"NOT gate: NOT {input_val} = {expected}", not_result == expected, f"Got {not_result}")

def test_rsi_strategy(bars_data):
    print("\n" + "="*60)
    print("TEST: RSI Oversold/Overbought Strategy")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    
    nodes = [
        {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
        {'id': 2, 'type': 'compare', 'params': {'operator': '<', 'value': 30}},
        {'id': 3, 'type': 'compare', 'params': {'operator': '>', 'value': 70}},
        {'id': 4, 'type': 'output', 'params': {'signal': 'BUY'}},
        {'id': 5, 'type': 'output', 'params': {'signal': 'SELL'}}
    ]
    connections = [
        {'from': {'nodeId': 1, 'port': 'value'}, 'to': {'nodeId': 2, 'port': 'a'}},
        {'from': {'nodeId': 1, 'port': 'value'}, 'to': {'nodeId': 3, 'port': 'a'}},
        {'from': {'nodeId': 2, 'port': 'result'}, 'to': {'nodeId': 4, 'port': 'trigger'}},
        {'from': {'nodeId': 3, 'port': 'result'}, 'to': {'nodeId': 5, 'port': 'trigger'}}
    ]
    
    signal, outputs, _ = run_executor(nodes, connections, market_data, debug=True)
    
    rsi_value = outputs.get(1, {}).get('value')
    
    print(f"\n   RSI = {rsi_value:.2f}")
    print(f"   Signal: {signal}")
    
    if rsi_value < 30:
        expected_signal = 'BUY'
    elif rsi_value > 70:
        expected_signal = 'SELL'
    else:
        expected_signal = None
    
    log_test("RSI strategy signal matches logic", signal == expected_signal, 
            f"RSI={rsi_value:.2f}, Expected {expected_signal}, Got {signal}")

def test_ema_crossover_strategy(bars_data):
    print("\n" + "="*60)
    print("TEST: EMA Crossover Strategy")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    
    nodes = [
        {'id': 1, 'type': 'ema', 'params': {'period': 9}},
        {'id': 2, 'type': 'ema', 'params': {'period': 21}},
        {'id': 3, 'type': 'crossover', 'params': {'direction': 'above'}},
        {'id': 4, 'type': 'crossover', 'params': {'direction': 'below'}},
        {'id': 5, 'type': 'output', 'params': {'signal': 'BUY'}},
        {'id': 6, 'type': 'output', 'params': {'signal': 'SELL'}}
    ]
    connections = [
        {'from': {'nodeId': 1, 'port': 'value'}, 'to': {'nodeId': 3, 'port': 'fast'}},
        {'from': {'nodeId': 2, 'port': 'value'}, 'to': {'nodeId': 3, 'port': 'slow'}},
        {'from': {'nodeId': 1, 'port': 'value'}, 'to': {'nodeId': 4, 'port': 'fast'}},
        {'from': {'nodeId': 2, 'port': 'value'}, 'to': {'nodeId': 4, 'port': 'slow'}},
        {'from': {'nodeId': 3, 'port': 'result'}, 'to': {'nodeId': 5, 'port': 'trigger'}},
        {'from': {'nodeId': 4, 'port': 'result'}, 'to': {'nodeId': 6, 'port': 'trigger'}}
    ]
    
    signal, outputs, _ = run_executor(nodes, connections, market_data, debug=True)
    
    ema9 = outputs.get(1, {}).get('value')
    ema21 = outputs.get(2, {}).get('value')
    
    print(f"\n   EMA9 = {ema9:.2f}" if ema9 else "\n   EMA9 = None")
    print(f"   EMA21 = {ema21:.2f}" if ema21 else "   EMA21 = None")
    print(f"   Signal: {signal}")
    
    log_test("EMA Crossover strategy calculates both EMAs", ema9 is not None and ema21 is not None)

def test_node_configs_respected(bars_data):
    print("\n" + "="*60)
    print("TEST: Node Configurations Are Respected")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    
    # Different RSI periods should give different results
    rsi_results = {}
    for period in [7, 14, 21]:
        nodes = [{'id': 1, 'type': 'rsi', 'params': {'period': period}}]
        _, outputs, _ = run_executor(nodes, [], market_data)
        rsi_results[period] = outputs.get(1, {}).get('value')
    
    values = list(rsi_results.values())
    passed = len(set([round(v, 2) if v else 0 for v in values])) >= 2
    log_test("RSI with different periods gives different values", passed,
            f"Period 7: {rsi_results[7]:.2f}, Period 14: {rsi_results[14]:.2f}, Period 21: {rsi_results[21]:.2f}" if all(rsi_results.values()) else "Some values missing")
    
    # Different EMA periods
    ema_results = {}
    for period in [9, 21, 50]:
        nodes = [{'id': 1, 'type': 'ema', 'params': {'period': period}}]
        _, outputs, _ = run_executor(nodes, [], market_data)
        ema_results[period] = outputs.get(1, {}).get('value')
    
    values = list(ema_results.values())
    passed = len(set([round(v, 2) if v else 0 for v in values])) >= 2
    log_test("EMA with different periods gives different values", passed,
            f"Period 9: {ema_results[9]:.2f}, Period 21: {ema_results[21]:.2f}, Period 50: {ema_results[50]:.2f}" if all(ema_results.values()) else "Some values missing")

def test_logic_gate_modes(bars_data):
    """Test the new configurable modes for logic gates (threshold, truthy, nonzero, strict)."""
    print("\n" + "="*60)
    print("TEST: Logic Gate Configurable Modes")
    print("="*60)
    
    market_data = build_market_data(bars_data)
    
    # TEST 1: AND gate with 'threshold' mode
    # AND should be True if BOTH inputs are > 30
    print("\n--- AND Gate: threshold mode (both > 30) ---")
    nodes = [
        {'id': 1, 'type': 'constant', 'params': {'value': 50}},
        {'id': 2, 'type': 'constant', 'params': {'value': 40}},
        {'id': 3, 'type': 'and', 'params': {'mode': 'threshold', 'threshold': 30}}
    ]
    connections = [
        {'from': {'nodeId': 1, 'port': 'value'}, 'to': {'nodeId': 3, 'port': 'a'}},
        {'from': {'nodeId': 2, 'port': 'value'}, 'to': {'nodeId': 3, 'port': 'b'}}
    ]
    _, outputs, _ = run_executor(nodes, connections, market_data)
    result = outputs.get(3, {}).get('result')
    log_test("AND threshold mode: 50>30 AND 40>30", result == True, f"Got {result}")
    
    # TEST 2: AND threshold mode where one value fails
    nodes_test2 = [
        {'id': 1, 'type': 'constant', 'params': {'value': 50}},
        {'id': 2, 'type': 'constant', 'params': {'value': 20}},  # 20 < 30
        {'id': 3, 'type': 'and', 'params': {'mode': 'threshold', 'threshold': 30}}
    ]
    _, outputs, _ = run_executor(nodes_test2, connections, market_data)
    result = outputs.get(3, {}).get('result')
    log_test("AND threshold mode: 50>30 AND 20>30", result == False, f"Got {result}")
    
    # TEST 3: OR gate with 'nonzero' mode
    print("\n--- OR Gate: nonzero mode ---")
    nodes = [
        {'id': 1, 'type': 'constant', 'params': {'value': 0}},
        {'id': 2, 'type': 'constant', 'params': {'value': 5}},
        {'id': 3, 'type': 'or', 'params': {'mode': 'nonzero'}}
    ]
    _, outputs, _ = run_executor(nodes, connections, market_data)
    result = outputs.get(3, {}).get('result')
    log_test("OR nonzero mode: 0 OR 5", result == True, f"Got {result}")
    
    # TEST 4: NOT gate with threshold mode
    print("\n--- NOT Gate: threshold mode ---")
    nodes = [
        {'id': 1, 'type': 'constant', 'params': {'value': 25}},
        {'id': 2, 'type': 'not', 'params': {'mode': 'threshold', 'threshold': 30}}
    ]
    connections = [{'from': {'nodeId': 1, 'port': 'value'}, 'to': {'nodeId': 2, 'port': 'input'}}]
    _, outputs, _ = run_executor(nodes, connections, market_data)
    result = outputs.get(2, {}).get('result')
    log_test("NOT threshold mode: NOT(25>30) = NOT(False) = True", result == True, f"Got {result}")
    
    # TEST 5: Use threshold mode for RSI-like logic without Compare node
    print("\n--- RSI directly to AND with threshold mode ---")
    nodes = [
        {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
        {'id': 2, 'type': 'and', 'params': {'mode': 'threshold', 'threshold': 30}}  # RSI > 30 is True
    ]
    connections = [{'from': {'nodeId': 1, 'port': 'value'}, 'to': {'nodeId': 2, 'port': 'a'}}]
    _, outputs, _ = run_executor(nodes, connections, market_data)
    rsi_val = outputs.get(1, {}).get('value')
    result = outputs.get(2, {}).get('result')
    expected = rsi_val > 30 if rsi_val else False
    log_test(f"RSI({rsi_val:.2f}) to AND with threshold=30", result == expected, f"Expected {expected}, Got {result}")

def run_all_tests():
    print("\n" + "="*70)
    print("🚀 FLOWGRID TRADING - COMPREHENSIVE NODE & STRATEGY TESTING")
    print("="*70)
    
    bars_data = fetch_real_market_data("AAPL", days=100)
    
    print("\n\n" + "▓"*70)
    print("CATEGORY 1: INDICATOR NODES")
    print("▓"*70)
    test_rsi_node(bars_data)
    test_ema_node(bars_data)
    test_sma_node(bars_data)
    test_macd_node(bars_data)
    test_bollinger_bands(bars_data)
    test_vwap_node(bars_data)
    test_atr_node(bars_data)
    
    print("\n\n" + "▓"*70)
    print("CATEGORY 2: COMPARE NODES")
    print("▓"*70)
    test_compare_node(bars_data)
    
    print("\n\n" + "▓"*70)
    print("CATEGORY 3: LOGIC GATES")
    print("▓"*70)
    test_and_gate_basic(bars_data)
    test_and_gate_with_indicators_issue(bars_data)
    test_or_gate(bars_data)
    test_not_gate(bars_data)
    test_logic_gate_modes(bars_data)  # NEW: Test configurable modes
    
    print("\n\n" + "▓"*70)
    print("CATEGORY 4: FULL STRATEGIES")
    print("▓"*70)
    test_rsi_strategy(bars_data)
    test_ema_crossover_strategy(bars_data)
    
    print("\n\n" + "▓"*70)
    print("CATEGORY 5: CONFIGURATION VERIFICATION")
    print("▓"*70)
    test_node_configs_respected(bars_data)
    
    print("\n\n" + "="*70)
    print("📊 TEST SUMMARY")
    print("="*70)
    print(f"✅ Passed: {test_results['passed']}")
    print(f"❌ Failed: {test_results['failed']}")
    print(f"Total: {test_results['passed'] + test_results['failed']}")
    
    if test_results['errors']:
        print("\n❌ FAILED TESTS:")
        for error in test_results['errors']:
            print(f"   - {error}")
    
    return test_results

if __name__ == '__main__':
    results = run_all_tests()
    sys.exit(0 if results['failed'] == 0 else 1)
