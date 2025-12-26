"""
Comprehensive Test Suite for FlowGrid Trading Platform
Tests all indicators, logic gates, compare blocks via UnifiedStrategyExecutor
Uses direct Python calls to avoid API dependencies
"""
import sys
import os
import random
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple

# Add the backendapi path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'backendapi', 'backendapi'))

from workflows.unified_executor import UnifiedStrategyExecutor

# Track results
test_results = {
    "passed": 0,
    "failed": 0,
    "errors": []
}

def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "[PASS]" if passed else "[FAIL]"
    print(f"{status}: {name}")
    if details:
        print(f"       {details}")
    if passed:
        test_results["passed"] += 1
    else:
        test_results["failed"] += 1
        test_results["errors"].append({"name": name, "details": details})

def generate_mock_data(num_bars: int = 100) -> Tuple[List[float], List[float], List[float], List[float], List[int]]:
    """Generate realistic mock OHLCV data arrays"""
    base_price = 500.0
    base_volume = 1000000
    
    opens, highs, lows, closes, volumes = [], [], [], [], []
    
    for i in range(num_bars):
        # Random walk for price
        change_pct = random.uniform(-0.03, 0.03)
        open_price = base_price * (1 + change_pct)
        high_price = open_price * random.uniform(1.001, 1.02)
        low_price = open_price * random.uniform(0.98, 0.999)
        close_price = random.uniform(low_price, high_price)
        volume = int(base_volume * random.uniform(0.5, 2.0))
        
        opens.append(round(open_price, 2))
        highs.append(round(high_price, 2))
        lows.append(round(low_price, 2))
        closes.append(round(close_price, 2))
        volumes.append(volume)
        
        base_price = close_price
    
    return opens, highs, lows, closes, volumes

# Generate test data once
OPENS, HIGHS, LOWS, CLOSES, VOLUMES = generate_mock_data(100)
CURRENT_PRICE = CLOSES[-1]

def create_executor(nodes: List[Dict], connections: List[Dict]) -> UnifiedStrategyExecutor:
    """Create a UnifiedStrategyExecutor with given workflow"""
    # Build market_data dict
    market_data = {
        'close': CURRENT_PRICE,
        'open': OPENS[-1],
        'high': HIGHS[-1],
        'low': LOWS[-1],
        'volume': VOLUMES[-1],
        'close_history': CLOSES,
        'open_history': OPENS,
        'high_history': HIGHS,
        'low_history': LOWS,
        'volume_history': VOLUMES,
        'timestamp': datetime.now().isoformat()
    }
    
    executor = UnifiedStrategyExecutor(
        nodes=nodes,
        connections=connections,
        market_data=market_data,
        debug=False  # Set to True for verbose output
    )
    return executor

def execute_workflow(nodes: List[Dict], connections: List[Dict]) -> Dict[str, Any]:
    """Execute workflow and return results"""
    try:
        executor = create_executor(nodes, connections)
        signal, debug_info = executor.execute()
        # Return combined result
        return {
            "final_signal": signal,
            "node_outputs": debug_info.get("node_outputs", {}),
            "execution_order": debug_info.get("execution_order", []),
            "error": debug_info.get("error")
        }
    except Exception as e:
        return {"error": str(e)}

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 1: INPUT BLOCK
# ═══════════════════════════════════════════════════════════════════════════════
def test_input_block():
    """Test that input block provides price data"""
    nodes = [
        {"id": 1, "type": "input", "params": {"symbol": "NVDA", "timeframe": "1d"}}
    ]
    connections = []
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("Input Block", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("1", {})
    
    if output.get("prices") and output.get("price") is not None:
        log_test("Input Block", True, f"prices count={len(output['prices'])}, current price={output['price']}")
    else:
        log_test("Input Block", False, f"Missing prices or price in output: {list(output.keys())}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 2: RSI INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_rsi():
    """Test RSI indicator calculation"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "rsi", "params": {"period": 14, "overbought": 70, "oversold": 30}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("RSI Indicator", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("2", {})
    
    rsi_val = output.get("rsi") or output.get("value")
    
    if rsi_val is not None:
        if 0 <= rsi_val <= 100:
            log_test("RSI Indicator", True, f"RSI = {rsi_val:.2f}")
        else:
            log_test("RSI Indicator", False, f"RSI value {rsi_val} out of range [0,100]")
    else:
        log_test("RSI Indicator", False, f"No RSI value in output: {output}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 3: EMA INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_ema():
    """Test EMA indicator calculation"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "ema", "params": {"period": 20}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("EMA Indicator", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("2", {})
    
    ema_val = output.get("ema") or output.get("value")
    
    if ema_val is not None:
        log_test("EMA Indicator", True, f"EMA = {ema_val:.2f}")
    else:
        log_test("EMA Indicator", False, f"No EMA value in output: {output}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 4: SMA INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_sma():
    """Test SMA indicator calculation"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "sma", "params": {"period": 20}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("SMA Indicator", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("2", {})
    
    sma_val = output.get("sma") or output.get("value")
    
    if sma_val is not None:
        log_test("SMA Indicator", True, f"SMA = {sma_val:.2f}")
    else:
        log_test("SMA Indicator", False, f"No SMA value in output: {output}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 5: MACD INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_macd():
    """Test MACD indicator calculation"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "macd", "params": {"fastPeriod": 12, "slowPeriod": 26, "signalPeriod": 9}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("MACD Indicator", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("2", {})
    
    macd_val = output.get("macd")
    histogram = output.get("histogram")
    
    if macd_val is not None or histogram is not None:
        log_test("MACD Indicator", True, f"MACD = {macd_val}, histogram = {histogram}")
    else:
        log_test("MACD Indicator", False, f"No MACD value in output: {output}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 6: STOCHASTIC INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_stochastic():
    """Test Stochastic oscillator calculation"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "stochastic", "params": {"kPeriod": 14, "dPeriod": 3, "oversold": 20, "overbought": 80}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("Stochastic Indicator", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("2", {})
    
    # Check for stoch key (matches blockDefs.js port name)
    stoch_val = output.get("stoch") or output.get("k") or output.get("value")
    
    if stoch_val is not None:
        if 0 <= stoch_val <= 100:
            oversold = output.get("oversold", False)
            overbought = output.get("overbought", False)
            state = "oversold" if oversold else ("overbought" if overbought else "neutral")
            log_test("Stochastic Indicator", True, f"Stoch = {stoch_val:.2f} ({state})")
        else:
            log_test("Stochastic Indicator", False, f"Stochastic value {stoch_val} out of range [0,100]")
    else:
        log_test("Stochastic Indicator", False, f"No stoch value in output: {output}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 7: BOLLINGER BANDS INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_bollinger():
    """Test Bollinger Bands calculation"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "bollinger", "params": {"period": 20, "stdDev": 2}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("Bollinger Bands", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("2", {})
    
    upper = output.get("upper")
    lower = output.get("lower")
    middle = output.get("middle")
    
    if upper is not None and lower is not None:
        if upper > lower:
            log_test("Bollinger Bands", True, f"Upper = {upper:.2f}, Middle = {middle:.2f}, Lower = {lower:.2f}")
        else:
            log_test("Bollinger Bands", False, f"Invalid bands: upper {upper} <= lower {lower}")
    else:
        log_test("Bollinger Bands", False, f"Missing upper/lower in output: {output}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 8: VWAP INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_vwap():
    """Test VWAP calculation"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "vwap", "params": {}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("VWAP Indicator", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("2", {})
    
    vwap_val = output.get("vwap") or output.get("value")
    
    if vwap_val is not None:
        log_test("VWAP Indicator", True, f"VWAP = {vwap_val:.2f}")
    else:
        log_test("VWAP Indicator", False, f"No VWAP value in output: {output}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 9: OBV INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_obv():
    """Test OBV calculation"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "obv", "params": {}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("OBV Indicator", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("2", {})
    
    obv_val = output.get("obv") or output.get("value")
    
    if obv_val is not None:
        log_test("OBV Indicator", True, f"OBV = {obv_val:,.0f}")
    else:
        log_test("OBV Indicator", False, f"No OBV value in output: {output}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 10: ATR INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_atr():
    """Test ATR calculation"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "atr", "params": {"period": 14}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("ATR Indicator", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("2", {})
    
    atr_val = output.get("atr") or output.get("value")
    
    if atr_val is not None:
        log_test("ATR Indicator", True, f"ATR = {atr_val:.4f}")
    else:
        log_test("ATR Indicator", False, f"No ATR value in output: {output}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 11: VOLUME SPIKE INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_volume_spike():
    """Test Volume Spike detection"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "volume_spike", "params": {"threshold": 1.5, "period": 20}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("Volume Spike", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("2", {})
    
    spike = output.get("spike") or output.get("is_spike")
    ratio = output.get("ratio") or output.get("volume_ratio")
    
    if spike is not None:
        log_test("Volume Spike", True, f"Spike = {spike}, Ratio = {ratio}")
    else:
        log_test("Volume Spike", False, f"No spike value in output: {output}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 12: COMPARE BLOCK
# ═══════════════════════════════════════════════════════════════════════════════
def test_compare():
    """Test Compare block with RSI"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "rsi", "params": {"period": 14}},
        {"id": 3, "type": "compare", "params": {"operator": "<", "threshold": 30}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}},
        {"from": {"node": 2, "port": "rsi"}, "to": {"node": 3, "port": "a"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("Compare Block", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("3", {})
    
    compare_result = output.get("result")
    
    if compare_result is not None:
        rsi_output = node_outputs.get("2", {})
        rsi_val = rsi_output.get("rsi", "?")
        log_test("Compare Block", True, f"RSI({rsi_val}) < 30 = {compare_result}")
    else:
        log_test("Compare Block", False, f"No result in output: {output}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 13: AND GATE
# ═══════════════════════════════════════════════════════════════════════════════
def test_and_gate():
    """Test AND logic gate with two RSI conditions"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "rsi", "params": {"period": 14}},
        {"id": 3, "type": "compare", "params": {"operator": ">", "threshold": 20}},  # RSI > 20
        {"id": 4, "type": "compare", "params": {"operator": "<", "threshold": 80}},  # RSI < 80
        {"id": 5, "type": "and", "params": {}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}},
        {"from": {"node": 2, "port": "rsi"}, "to": {"node": 3, "port": "a"}},
        {"from": {"node": 2, "port": "rsi"}, "to": {"node": 4, "port": "a"}},
        {"from": {"node": 3, "port": "result"}, "to": {"node": 5, "port": "a"}},
        {"from": {"node": 4, "port": "result"}, "to": {"node": 5, "port": "b"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("AND Gate", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("5", {})
    
    and_result = output.get("result")
    
    if and_result is not None:
        cmp1 = node_outputs.get("3", {}).get("result")
        cmp2 = node_outputs.get("4", {}).get("result")
        log_test("AND Gate", True, f"AND({cmp1}, {cmp2}) = {and_result}")
    else:
        log_test("AND Gate", False, f"No result in output: {output}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 14: OR GATE
# ═══════════════════════════════════════════════════════════════════════════════
def test_or_gate():
    """Test OR logic gate"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "rsi", "params": {"period": 14}},
        {"id": 3, "type": "compare", "params": {"operator": "<", "threshold": 30}},  # RSI < 30 (oversold)
        {"id": 4, "type": "compare", "params": {"operator": ">", "threshold": 70}},  # RSI > 70 (overbought)
        {"id": 5, "type": "or", "params": {}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}},
        {"from": {"node": 2, "port": "rsi"}, "to": {"node": 3, "port": "a"}},
        {"from": {"node": 2, "port": "rsi"}, "to": {"node": 4, "port": "a"}},
        {"from": {"node": 3, "port": "result"}, "to": {"node": 5, "port": "a"}},
        {"from": {"node": 4, "port": "result"}, "to": {"node": 5, "port": "b"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("OR Gate", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("5", {})
    
    or_result = output.get("result")
    
    if or_result is not None:
        cmp1 = node_outputs.get("3", {}).get("result")
        cmp2 = node_outputs.get("4", {}).get("result")
        log_test("OR Gate", True, f"OR({cmp1}, {cmp2}) = {or_result}")
    else:
        log_test("OR Gate", False, f"No result in output: {output}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 15: NOT GATE
# ═══════════════════════════════════════════════════════════════════════════════
def test_not_gate():
    """Test NOT logic gate"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "rsi", "params": {"period": 14}},
        {"id": 3, "type": "compare", "params": {"operator": ">", "threshold": 70}},  # RSI > 70
        {"id": 4, "type": "not", "params": {}}  # NOT overbought
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}},
        {"from": {"node": 2, "port": "rsi"}, "to": {"node": 3, "port": "a"}},
        {"from": {"node": 3, "port": "result"}, "to": {"node": 4, "port": "a"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("NOT Gate", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    output = node_outputs.get("4", {})
    
    not_result = output.get("result")
    
    if not_result is not None:
        cmp_result = node_outputs.get("3", {}).get("result")
        log_test("NOT Gate", True, f"NOT({cmp_result}) = {not_result}")
    else:
        log_test("NOT Gate", False, f"No result in output: {output}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 16: COMPLETE RSI STRATEGY (Input -> RSI -> Compare -> Output)
# ═══════════════════════════════════════════════════════════════════════════════
def test_complete_rsi_strategy():
    """Test a complete RSI oversold strategy"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "rsi", "params": {"period": 14, "overbought": 70, "oversold": 30}},
        {"id": 3, "type": "compare", "params": {"operator": "<", "threshold": 30}},
        {"id": 4, "type": "output", "params": {"action": "BUY"}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}},
        {"from": {"node": 2, "port": "rsi"}, "to": {"node": 3, "port": "a"}},
        {"from": {"node": 3, "port": "result"}, "to": {"node": 4, "port": "signal"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("Complete RSI Strategy", False, f"Error: {result['error']}")
        return
    
    final_signal = result.get("final_signal")
    
    log_test("Complete RSI Strategy", True, f"Final Signal = {final_signal}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 17: RSI + EMA COMBINED STRATEGY
# ═══════════════════════════════════════════════════════════════════════════════
def test_rsi_ema_combined():
    """Test RSI + EMA combined with AND gate"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "rsi", "params": {"period": 14}},
        {"id": 3, "type": "ema", "params": {"period": 20}},
        {"id": 4, "type": "compare", "params": {"operator": "<", "threshold": 40}},  # RSI < 40
        {"id": 5, "type": "compare", "params": {"operator": ">", "threshold": 0}},   # EMA > 0
        {"id": 6, "type": "and", "params": {}},
        {"id": 7, "type": "output", "params": {"action": "BUY"}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}},
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 3, "port": "prices"}},
        {"from": {"node": 2, "port": "rsi"}, "to": {"node": 4, "port": "a"}},
        {"from": {"node": 3, "port": "ema"}, "to": {"node": 5, "port": "a"}},
        {"from": {"node": 4, "port": "result"}, "to": {"node": 6, "port": "a"}},
        {"from": {"node": 5, "port": "result"}, "to": {"node": 6, "port": "b"}},
        {"from": {"node": 6, "port": "result"}, "to": {"node": 7, "port": "signal"}}
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("RSI + EMA Combined", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    
    # Check all nodes executed
    missing_nodes = []
    for node_id in ["2", "3", "4", "5", "6"]:
        if node_id not in node_outputs:
            missing_nodes.append(node_id)
    
    if missing_nodes:
        log_test("RSI + EMA Combined", False, f"Missing node outputs: {missing_nodes}")
    else:
        final_signal = result.get("final_signal")
        log_test("RSI + EMA Combined", True, f"All nodes executed, Final Signal = {final_signal}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 18: MACD + STOCHASTIC STRATEGY
# ═══════════════════════════════════════════════════════════════════════════════
def test_macd_stochastic():
    """Test MACD + Stochastic combined strategy"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "macd", "params": {"fastPeriod": 12, "slowPeriod": 26, "signalPeriod": 9}},
        {"id": 3, "type": "stochastic", "params": {"kPeriod": 14, "dPeriod": 3}},
        {"id": 4, "type": "output", "params": {"action": "BUY"}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}},
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 3, "port": "prices"}},
        {"from": {"node": 2, "port": "macd"}, "to": {"node": 4, "port": "signal"}},
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("MACD + Stochastic", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    
    macd_output = node_outputs.get("2", {})
    stoch_output = node_outputs.get("3", {})
    
    macd_ok = macd_output.get("macd") is not None or macd_output.get("histogram") is not None
    stoch_ok = stoch_output.get("stoch") is not None or stoch_output.get("k") is not None
    
    if macd_ok and stoch_ok:
        log_test("MACD + Stochastic", True, f"MACD hist={macd_output.get('histogram')}, Stoch K={stoch_output.get('stoch')}")
    else:
        log_test("MACD + Stochastic", False, f"MACD ok={macd_ok}, Stoch ok={stoch_ok}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 19: ALL INDICATORS TOGETHER
# ═══════════════════════════════════════════════════════════════════════════════
def test_all_indicators_together():
    """Test all indicators in a single workflow"""
    nodes = [
        {"id": 1, "type": "input", "params": {}},
        {"id": 2, "type": "rsi", "params": {"period": 14}},
        {"id": 3, "type": "ema", "params": {"period": 20}},
        {"id": 4, "type": "sma", "params": {"period": 20}},
        {"id": 5, "type": "macd", "params": {}},
        {"id": 6, "type": "stochastic", "params": {}},
        {"id": 7, "type": "bollinger", "params": {}},
        {"id": 8, "type": "vwap", "params": {}},
        {"id": 9, "type": "obv", "params": {}},
        {"id": 10, "type": "atr", "params": {}},
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}},
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 3, "port": "prices"}},
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 4, "port": "prices"}},
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 5, "port": "prices"}},
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 6, "port": "prices"}},
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 7, "port": "prices"}},
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 8, "port": "prices"}},
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 9, "port": "prices"}},
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 10, "port": "prices"}},
    ]
    
    result = execute_workflow(nodes, connections)
    
    if result.get("error"):
        log_test("All Indicators Together", False, f"Error: {result['error']}")
        return
    
    node_outputs = result.get("node_outputs", {})
    
    indicator_checks = {
        "2": ("rsi", ["rsi", "value"]),
        "3": ("ema", ["ema", "value"]),
        "4": ("sma", ["sma", "value"]),
        "5": ("macd", ["macd", "histogram"]),
        "6": ("stochastic", ["stoch", "k"]),
        "7": ("bollinger", ["upper", "lower"]),
        "8": ("vwap", ["vwap", "value"]),
        "9": ("obv", ["obv", "value"]),
        "10": ("atr", ["atr", "value"]),
    }
    
    failed = []
    for node_id, (name, keys) in indicator_checks.items():
        output = node_outputs.get(node_id, {})
        has_value = any(output.get(k) is not None for k in keys)
        if not has_value:
            failed.append(f"{name} (node {node_id})")
    
    if not failed:
        log_test("All Indicators Together", True, "All 9 indicators computed successfully")
    else:
        log_test("All Indicators Together", False, f"Failed: {failed}")

# ═══════════════════════════════════════════════════════════════════════════════
# VERIFY PORT NAME CONSISTENCY
# ═══════════════════════════════════════════════════════════════════════════════
def test_port_name_consistency():
    """Verify that indicator outputs match expected port names from blockDefs.js"""
    port_expectations = {
        "rsi": ["rsi"],
        "ema": ["ema"],
        "sma": ["sma"],
        "macd": ["macd"],
        "stochastic": ["stoch"],  # blockDefs.js uses 'stoch'
        "bollinger": ["upper", "lower", "middle"],
        "vwap": ["vwap"],
        "obv": ["obv"],
        "atr": ["atr"],
    }
    
    all_passed = True
    issues = []
    
    for indicator, expected_ports in port_expectations.items():
        nodes = [
            {"id": 1, "type": "input", "params": {}},
            {"id": 2, "type": indicator, "params": {}}
        ]
        connections = [
            {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
        ]
        
        result = execute_workflow(nodes, connections)
        
        if result.get("error"):
            issues.append(f"{indicator}: {result['error']}")
            all_passed = False
            continue
        
        node_outputs = result.get("node_outputs", {})
        output = node_outputs.get("2", {})
        
        missing = [p for p in expected_ports if p not in output]
        if missing:
            issues.append(f"{indicator} missing ports: {missing}, has: {list(output.keys())}")
            all_passed = False
    
    if all_passed:
        log_test("Port Name Consistency", True, "All indicators have correct port names")
    else:
        log_test("Port Name Consistency", False, f"Issues: {issues}")

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN TEST RUNNER
# ═══════════════════════════════════════════════════════════════════════════════
def main():
    print("=" * 70)
    print("FlowGrid Trading - Unified Executor Test Suite")
    print(f"Time: {datetime.now().isoformat()}")
    print("=" * 70)
    print()
    
    # Run all tests
    print("=" * 70)
    print("SECTION 1: INDIVIDUAL BLOCK TESTS")
    print("=" * 70)
    
    test_input_block()
    test_rsi()
    test_ema()
    test_sma()
    test_macd()
    test_stochastic()
    test_bollinger()
    test_vwap()
    test_obv()
    test_atr()
    test_volume_spike()
    
    print()
    print("=" * 70)
    print("SECTION 2: LOGIC GATES & COMPARE")
    print("=" * 70)
    
    test_compare()
    test_and_gate()
    test_or_gate()
    test_not_gate()
    
    print()
    print("=" * 70)
    print("SECTION 3: COMPLETE STRATEGIES")
    print("=" * 70)
    
    test_complete_rsi_strategy()
    test_rsi_ema_combined()
    test_macd_stochastic()
    test_all_indicators_together()
    
    print()
    print("=" * 70)
    print("SECTION 4: PORT NAME CONSISTENCY")
    print("=" * 70)
    
    test_port_name_consistency()
    
    # Summary
    print()
    print("=" * 70)
    print("TEST SUMMARY")
    print("=" * 70)
    total = test_results["passed"] + test_results["failed"]
    print(f"Total Tests: {total}")
    print(f"Passed: {test_results['passed']}")
    print(f"Failed: {test_results['failed']}")
    
    if test_results["failed"] > 0:
        print()
        print("FAILED TESTS:")
        for err in test_results["errors"]:
            print(f"  - {err['name']}: {err['details']}")
    
    print()
    if test_results["failed"] == 0:
        print("ALL TESTS PASSED!")
    else:
        print(f"{test_results['failed']} test(s) need attention")
    
    return test_results["failed"]

if __name__ == "__main__":
    sys.exit(main())
