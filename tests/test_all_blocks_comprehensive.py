"""
Comprehensive Test Suite for FlowGrid Trading Platform
Tests all indicators, logic gates, compare blocks, and strategy templates
Uses mock historical data to avoid Alpaca API dependency
"""
import requests
import json
import sys
import random
from datetime import datetime, timedelta
from typing import Dict, Any, List, Tuple

API_URL = "http://127.0.0.1:5000"
SYMBOL = "NVDA"
TIMEFRAME = "1d"

# Track results
test_results = {
    "passed": 0,
    "failed": 0,
    "errors": []
}

def generate_mock_historical_data(num_bars: int = 100) -> List[Dict]:
    """Generate realistic mock OHLCV data"""
    data = []
    base_price = 500.0
    base_volume = 1000000
    current_time = datetime.now() - timedelta(days=num_bars)
    
    for i in range(num_bars):
        # Random walk for price
        change_pct = random.uniform(-0.03, 0.03)
        open_price = base_price * (1 + change_pct)
        high_price = open_price * random.uniform(1.001, 1.02)
        low_price = open_price * random.uniform(0.98, 0.999)
        close_price = random.uniform(low_price, high_price)
        volume = int(base_volume * random.uniform(0.5, 2.0))
        
        data.append({
            "timestamp": (current_time + timedelta(days=i)).isoformat() + "Z",
            "open": round(open_price, 2),
            "high": round(high_price, 2),
            "low": round(low_price, 2),
            "close": round(close_price, 2),
            "volume": volume
        })
        
        base_price = close_price
    
    return data

def log_test(name: str, passed: bool, details: str = ""):
    """Log test result"""
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"       {details}")
    if passed:
        test_results["passed"] += 1
    else:
        test_results["failed"] += 1
        test_results["errors"].append({"name": name, "details": details})

def execute_workflow(blocks: List[Dict], connections: List[Dict] = None) -> Dict:
    """Execute a workflow using backtest endpoint with mock data"""
    # Generate mock historical data
    mock_data = generate_mock_historical_data(100)
    
    payload = {
        "symbol": SYMBOL,
        "timeframe": TIMEFRAME,
        "workflow": blocks,  # Note: backtest uses 'workflow' not 'workflow_blocks'
        "connections": connections or [],
        "historicalData": mock_data,
        "config": {
            "takeProfitPct": 0,
            "stopLossPct": 0,
            "sharesPerTrade": 100,
            "initialCapital": 10000
        }
    }
    try:
        response = requests.post(f"{API_URL}/execute_backtest", json=payload, timeout=30)
        # Debug: print response info if not JSON
        if response.status_code != 200:
            return {"error": f"HTTP {response.status_code}: {response.text[:500]}"}
        try:
            return response.json()
        except:
            return {"error": f"Invalid JSON response: {response.text[:200]}"}
    except Exception as e:
        return {"error": str(e)}

def check_block_result(result: Dict, block_id: int, expected_status: str = "passed", 
                       expected_keys: List[str] = None) -> Tuple[bool, str]:
    """Check if a block executed correctly"""
    blocks = result.get("blocks_v2", [])
    
    for block in blocks:
        if block.get("block_id") == block_id:
            status = block.get("status", "").lower()
            data = block.get("data", {})
            message = block.get("message", "")
            unified_output = data.get("unified_output", {})
            
            # Check status
            if status != expected_status:
                return False, f"Status={status}, expected={expected_status}, message='{message}'"
            
            # Check for expected keys in unified_output
            if expected_keys:
                missing = [k for k in expected_keys if k not in unified_output and k not in data]
                if missing:
                    return False, f"Missing keys: {missing}, got: {list(unified_output.keys())}"
            
            # Check for None values on important keys
            if expected_keys:
                null_keys = [k for k in expected_keys if unified_output.get(k) is None and data.get(k) is None]
                if null_keys:
                    return False, f"Null values for: {null_keys}"
            
            return True, f"OK - {message}"
    
    return False, f"Block {block_id} not found in results"

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 1: INPUT BLOCK
# ═══════════════════════════════════════════════════════════════════════════════
def test_input_block():
    """Test that input block provides price data"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}}
    ]
    result = execute_workflow(blocks)
    
    if "error" in result:
        log_test("Input Block", False, f"Error: {result['error']}")
        return
    
    passed, details = check_block_result(result, 1, "passed", ["prices", "price"])
    log_test("Input Block", passed, details)

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 2: RSI INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_rsi():
    """Test RSI indicator calculation"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "rsi", "params": {"period": 14, "overbought": 70, "oversold": 30}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("RSI Indicator", False, f"Error: {result['error']}")
        return
    
    passed, details = check_block_result(result, 2, "passed", ["rsi", "value"])
    
    # Also verify RSI is in valid range
    if passed:
        blocks_v2 = result.get("blocks_v2", [])
        for b in blocks_v2:
            if b.get("block_id") == 2:
                rsi_val = b.get("data", {}).get("unified_output", {}).get("rsi")
                if rsi_val is not None and (rsi_val < 0 or rsi_val > 100):
                    passed = False
                    details = f"RSI value {rsi_val} out of range [0,100]"
    
    log_test("RSI Indicator", passed, details)

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 3: EMA INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_ema():
    """Test EMA indicator calculation"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "ema", "params": {"period": 20}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("EMA Indicator", False, f"Error: {result['error']}")
        return
    
    passed, details = check_block_result(result, 2, "passed", ["ema", "value"])
    log_test("EMA Indicator", passed, details)

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 4: SMA INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_sma():
    """Test SMA indicator calculation"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "sma", "params": {"period": 20}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("SMA Indicator", False, f"Error: {result['error']}")
        return
    
    passed, details = check_block_result(result, 2, "passed", ["sma", "value"])
    log_test("SMA Indicator", passed, details)

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 5: MACD INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_macd():
    """Test MACD indicator calculation"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "macd", "params": {"fastPeriod": 12, "slowPeriod": 26, "signalPeriod": 9}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("MACD Indicator", False, f"Error: {result['error']}")
        return
    
    passed, details = check_block_result(result, 2, "passed", ["macd", "histogram"])
    log_test("MACD Indicator", passed, details)

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 6: STOCHASTIC INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_stochastic():
    """Test Stochastic oscillator calculation"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "stochastic", "params": {"kPeriod": 14, "dPeriod": 3, "oversold": 20, "overbought": 80}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("Stochastic Indicator", False, f"Error: {result['error']}")
        return
    
    # Check for stoch key (matches blockDefs.js port name)
    passed, details = check_block_result(result, 2, "passed", ["stoch", "k"])
    
    # Verify stochastic is in valid range
    if passed:
        blocks_v2 = result.get("blocks_v2", [])
        for b in blocks_v2:
            if b.get("block_id") == 2:
                stoch_val = b.get("data", {}).get("unified_output", {}).get("stoch")
                if stoch_val is not None and (stoch_val < 0 or stoch_val > 100):
                    passed = False
                    details = f"Stochastic value {stoch_val} out of range [0,100]"
    
    log_test("Stochastic Indicator", passed, details)

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 7: BOLLINGER BANDS INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_bollinger():
    """Test Bollinger Bands calculation"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "bollinger", "params": {"period": 20, "stdDev": 2}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("Bollinger Bands", False, f"Error: {result['error']}")
        return
    
    passed, details = check_block_result(result, 2, "passed", ["upper", "lower", "middle"])
    log_test("Bollinger Bands", passed, details)

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 8: VWAP INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_vwap():
    """Test VWAP calculation"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "vwap", "params": {}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("VWAP Indicator", False, f"Error: {result['error']}")
        return
    
    passed, details = check_block_result(result, 2, "passed", ["vwap"])
    log_test("VWAP Indicator", passed, details)

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 9: OBV INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_obv():
    """Test OBV calculation"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "obv", "params": {}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("OBV Indicator", False, f"Error: {result['error']}")
        return
    
    passed, details = check_block_result(result, 2, "passed", ["obv"])
    log_test("OBV Indicator", passed, details)

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 10: ATR INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_atr():
    """Test ATR calculation"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "atr", "params": {"period": 14}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("ATR Indicator", False, f"Error: {result['error']}")
        return
    
    passed, details = check_block_result(result, 2, "passed", ["atr"])
    log_test("ATR Indicator", passed, details)

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 11: VOLUME SPIKE INDICATOR
# ═══════════════════════════════════════════════════════════════════════════════
def test_volume_spike():
    """Test Volume Spike detection"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "volume_spike", "params": {"threshold": 1.5, "period": 20}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("Volume Spike", False, f"Error: {result['error']}")
        return
    
    passed, details = check_block_result(result, 2, "passed", ["spike"])
    log_test("Volume Spike", passed, details)

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 12: COMPARE BLOCK
# ═══════════════════════════════════════════════════════════════════════════════
def test_compare():
    """Test Compare block with RSI"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "rsi", "params": {"period": 14}},
        {"id": 3, "type": "compare", "params": {"operator": "<", "threshold": 30}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}},
        {"from": {"node": 2, "port": "rsi"}, "to": {"node": 3, "port": "a"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("Compare Block", False, f"Error: {result['error']}")
        return
    
    # Compare should pass/fail based on condition, not error
    blocks_v2 = result.get("blocks_v2", [])
    found = False
    for b in blocks_v2:
        if b.get("block_id") == 3:
            found = True
            status = b.get("status", "").lower()
            message = b.get("message", "")
            # Compare should return passed or failed, not skipped/error
            if status in ["passed", "failed"]:
                log_test("Compare Block", True, f"Status={status}, {message}")
            else:
                log_test("Compare Block", False, f"Unexpected status={status}, message={message}")
    
    if not found:
        log_test("Compare Block", False, "Block 3 not found in results")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 13: AND GATE
# ═══════════════════════════════════════════════════════════════════════════════
def test_and_gate():
    """Test AND logic gate with two RSI conditions"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
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
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("AND Gate", False, f"Error: {result['error']}")
        return
    
    blocks_v2 = result.get("blocks_v2", [])
    for b in blocks_v2:
        if b.get("block_id") == 5:
            status = b.get("status", "").lower()
            message = b.get("message", "")
            if status in ["passed", "failed"]:
                log_test("AND Gate", True, f"Status={status}, {message}")
            else:
                log_test("AND Gate", False, f"Unexpected status={status}, message={message}")
            return
    
    log_test("AND Gate", False, "AND gate block not found")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 14: OR GATE
# ═══════════════════════════════════════════════════════════════════════════════
def test_or_gate():
    """Test OR logic gate"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
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
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("OR Gate", False, f"Error: {result['error']}")
        return
    
    blocks_v2 = result.get("blocks_v2", [])
    for b in blocks_v2:
        if b.get("block_id") == 5:
            status = b.get("status", "").lower()
            message = b.get("message", "")
            if status in ["passed", "failed"]:
                log_test("OR Gate", True, f"Status={status}, {message}")
            else:
                log_test("OR Gate", False, f"Unexpected status={status}, message={message}")
            return
    
    log_test("OR Gate", False, "OR gate block not found")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 15: NOT GATE
# ═══════════════════════════════════════════════════════════════════════════════
def test_not_gate():
    """Test NOT logic gate"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "rsi", "params": {"period": 14}},
        {"id": 3, "type": "compare", "params": {"operator": ">", "threshold": 70}},  # RSI > 70
        {"id": 4, "type": "not", "params": {}}  # NOT overbought = not overbought
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}},
        {"from": {"node": 2, "port": "rsi"}, "to": {"node": 3, "port": "a"}},
        {"from": {"node": 3, "port": "result"}, "to": {"node": 4, "port": "a"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("NOT Gate", False, f"Error: {result['error']}")
        return
    
    blocks_v2 = result.get("blocks_v2", [])
    for b in blocks_v2:
        if b.get("block_id") == 4:
            status = b.get("status", "").lower()
            message = b.get("message", "")
            if status in ["passed", "failed"]:
                log_test("NOT Gate", True, f"Status={status}, {message}")
            else:
                log_test("NOT Gate", False, f"Unexpected status={status}, message={message}")
            return
    
    log_test("NOT Gate", False, "NOT gate block not found")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 16: COMPLETE RSI STRATEGY (Input -> RSI -> Compare -> Output)
# ═══════════════════════════════════════════════════════════════════════════════
def test_complete_rsi_strategy():
    """Test a complete RSI oversold strategy"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "rsi", "params": {"period": 14, "overbought": 70, "oversold": 30}},
        {"id": 3, "type": "compare", "params": {"operator": "<", "threshold": 30}},
        {"id": 4, "type": "output", "params": {"action": "BUY"}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}},
        {"from": {"node": 2, "port": "rsi"}, "to": {"node": 3, "port": "a"}},
        {"from": {"node": 3, "port": "result"}, "to": {"node": 4, "port": "signal"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("Complete RSI Strategy", False, f"Error: {result['error']}")
        return
    
    final_signal = result.get("finalSignal")
    final_decision = result.get("final_decision")
    
    if final_signal in ["BUY", "SELL", "HOLD", None] and final_decision in ["CONFIRMED", "REJECTED", None]:
        log_test("Complete RSI Strategy", True, f"Signal={final_signal}, Decision={final_decision}")
    else:
        log_test("Complete RSI Strategy", False, f"Unexpected result: signal={final_signal}, decision={final_decision}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 17: RSI + EMA COMBINED STRATEGY
# ═══════════════════════════════════════════════════════════════════════════════
def test_rsi_ema_combined():
    """Test RSI + EMA combined with AND gate"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "rsi", "params": {"period": 14}},
        {"id": 3, "type": "ema", "params": {"period": 20}},
        {"id": 4, "type": "compare", "params": {"operator": "<", "threshold": 40}},  # RSI < 40
        {"id": 5, "type": "compare", "params": {"operator": ">", "threshold": 0}},   # Price > EMA (will compare price vs 0 as placeholder)
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
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("RSI + EMA Combined", False, f"Error: {result['error']}")
        return
    
    # Check all blocks executed without "skipped due to previous failure"
    blocks_v2 = result.get("blocks_v2", [])
    all_ok = True
    problem_blocks = []
    for b in blocks_v2:
        msg = b.get("message", "").lower()
        status = b.get("status", "").lower()
        if "skipped" in msg or "error" in status:
            all_ok = False
            problem_blocks.append(f"Block {b.get('block_id')} ({b.get('block_type')}): {msg}")
    
    if all_ok:
        log_test("RSI + EMA Combined", True, f"All blocks executed, final={result.get('finalSignal')}")
    else:
        log_test("RSI + EMA Combined", False, f"Problem blocks: {problem_blocks}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 18: MACD + STOCHASTIC STRATEGY
# ═══════════════════════════════════════════════════════════════════════════════
def test_macd_stochastic():
    """Test MACD + Stochastic combined strategy"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "macd", "params": {"fastPeriod": 12, "slowPeriod": 26, "signalPeriod": 9}},
        {"id": 3, "type": "stochastic", "params": {"kPeriod": 14, "dPeriod": 3}},
        {"id": 4, "type": "and", "params": {}},
        {"id": 5, "type": "output", "params": {"action": "BUY"}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}},
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 3, "port": "prices"}},
        {"from": {"node": 2, "port": "macd"}, "to": {"node": 4, "port": "a"}},
        {"from": {"node": 3, "port": "stoch"}, "to": {"node": 4, "port": "b"}},
        {"from": {"node": 4, "port": "result"}, "to": {"node": 5, "port": "signal"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("MACD + Stochastic", False, f"Error: {result['error']}")
        return
    
    # Check stochastic block specifically for proper message
    blocks_v2 = result.get("blocks_v2", [])
    stoch_ok = False
    macd_ok = False
    for b in blocks_v2:
        if b.get("block_type") == "stochastic":
            msg = b.get("message", "")
            if "Stochastic" in msg and "skipped" not in msg.lower():
                stoch_ok = True
            else:
                log_test("MACD + Stochastic", False, f"Stochastic message wrong: {msg}")
                return
        if b.get("block_type") == "macd":
            msg = b.get("message", "")
            if "MACD" in msg and "skipped" not in msg.lower():
                macd_ok = True
    
    if stoch_ok and macd_ok:
        log_test("MACD + Stochastic", True, f"Both indicators computed correctly")
    else:
        log_test("MACD + Stochastic", False, f"MACD ok={macd_ok}, Stoch ok={stoch_ok}")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 19: VWAP REVERSION STRATEGY
# ═══════════════════════════════════════════════════════════════════════════════
def test_vwap_strategy():
    """Test VWAP reversion strategy"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "vwap", "params": {}},
        {"id": 3, "type": "output", "params": {"action": "BUY"}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}},
        {"from": {"node": 2, "port": "vwap"}, "to": {"node": 3, "port": "signal"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("VWAP Strategy", False, f"Error: {result['error']}")
        return
    
    blocks_v2 = result.get("blocks_v2", [])
    for b in blocks_v2:
        if b.get("block_type") == "vwap":
            msg = b.get("message", "")
            status = b.get("status", "")
            if status == "passed" and "VWAP" in msg:
                log_test("VWAP Strategy", True, f"{msg}")
            else:
                log_test("VWAP Strategy", False, f"Status={status}, Message={msg}")
            return
    
    log_test("VWAP Strategy", False, "VWAP block not found")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 20: BOLLINGER BANDS STRATEGY
# ═══════════════════════════════════════════════════════════════════════════════
def test_bollinger_strategy():
    """Test Bollinger Bands breakout strategy"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
        {"id": 2, "type": "bollinger", "params": {"period": 20, "stdDev": 2}},
        {"id": 3, "type": "output", "params": {"action": "BUY"}}
    ]
    connections = [
        {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}},
        {"from": {"node": 2, "port": "signal"}, "to": {"node": 3, "port": "signal"}}
    ]
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("Bollinger Strategy", False, f"Error: {result['error']}")
        return
    
    blocks_v2 = result.get("blocks_v2", [])
    for b in blocks_v2:
        if b.get("block_type") == "bollinger":
            msg = b.get("message", "")
            status = b.get("status", "")
            data = b.get("data", {})
            unified = data.get("unified_output", {})
            if status == "passed" and unified.get("upper") is not None:
                log_test("Bollinger Strategy", True, f"Upper={unified.get('upper'):.2f}, Lower={unified.get('lower'):.2f}")
            else:
                log_test("Bollinger Strategy", False, f"Status={status}, unified={unified}")
            return
    
    log_test("Bollinger Strategy", False, "Bollinger block not found")

# ═══════════════════════════════════════════════════════════════════════════════
# TEST 21: MULTIPLE INDICATORS ALL AT ONCE
# ═══════════════════════════════════════════════════════════════════════════════
def test_all_indicators_together():
    """Test all indicators in a single workflow"""
    blocks = [
        {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
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
    result = execute_workflow(blocks, connections)
    
    if "error" in result:
        log_test("All Indicators Together", False, f"Error: {result['error']}")
        return
    
    blocks_v2 = result.get("blocks_v2", [])
    failed_indicators = []
    for b in blocks_v2:
        block_type = b.get("block_type")
        if block_type in ["rsi", "ema", "sma", "macd", "stochastic", "bollinger", "vwap", "obv", "atr"]:
            status = b.get("status", "")
            msg = b.get("message", "")
            if status != "passed" or "skipped" in msg.lower():
                failed_indicators.append(f"{block_type}: {msg}")
    
    if not failed_indicators:
        log_test("All Indicators Together", True, "All 9 indicators computed successfully")
    else:
        log_test("All Indicators Together", False, f"Failed: {failed_indicators}")

# ═══════════════════════════════════════════════════════════════════════════════
# VERIFY PORT NAME CONSISTENCY
# ═══════════════════════════════════════════════════════════════════════════════
def test_port_name_consistency():
    """Verify that indicator outputs match expected port names"""
    port_expectations = {
        "rsi": ["rsi", "value"],
        "ema": ["ema", "value"],
        "sma": ["sma", "value"],
        "macd": ["macd", "histogram", "signal_line"],
        "stochastic": ["stoch", "k", "d"],
        "bollinger": ["upper", "lower", "middle"],
        "vwap": ["vwap"],
        "obv": ["obv"],
        "atr": ["atr"],
    }
    
    all_passed = True
    issues = []
    
    for indicator, expected_ports in port_expectations.items():
        blocks = [
            {"id": 1, "type": "input", "params": {"symbol": SYMBOL, "timeframe": TIMEFRAME}},
            {"id": 2, "type": indicator, "params": {}}
        ]
        connections = [
            {"from": {"node": 1, "port": "prices"}, "to": {"node": 2, "port": "prices"}}
        ]
        result = execute_workflow(blocks, connections)
        
        if "error" in result:
            issues.append(f"{indicator}: API error")
            all_passed = False
            continue
        
        blocks_v2 = result.get("blocks_v2", [])
        for b in blocks_v2:
            if b.get("block_id") == 2:
                unified = b.get("data", {}).get("unified_output", {})
                missing = [p for p in expected_ports if p not in unified]
                if missing:
                    issues.append(f"{indicator} missing ports: {missing}")
                    all_passed = False
                break
    
    if all_passed:
        log_test("Port Name Consistency", True, "All indicators have correct port names")
    else:
        log_test("Port Name Consistency", False, f"Issues: {issues}")

# ═══════════════════════════════════════════════════════════════════════════════
# MAIN TEST RUNNER
# ═══════════════════════════════════════════════════════════════════════════════
def main():
    print("=" * 70)
    print("FlowGrid Trading - Comprehensive Block Test Suite")
    print(f"Testing against: {API_URL}")
    print(f"Symbol: {SYMBOL}, Timeframe: {TIMEFRAME}")
    print(f"Time: {datetime.now().isoformat()}")
    print("=" * 70)
    print()
    
    # Check API is available
    try:
        response = requests.get(f"{API_URL}/", timeout=5)
        print(f"✅ API is available (status: {response.status_code})")
    except Exception as e:
        print("❌ Cannot connect to API at", API_URL)
        print(f"   Error: {e}")
        print("   Make sure the backend is running!")
        return
    
    print("✅ API is available")
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
    test_vwap_strategy()
    test_bollinger_strategy()
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
    print(f"Passed: {test_results['passed']} ✅")
    print(f"Failed: {test_results['failed']} ❌")
    
    if test_results["failed"] > 0:
        print()
        print("FAILED TESTS:")
        for err in test_results["errors"]:
            print(f"  • {err['name']}: {err['details']}")
    
    print()
    if test_results["failed"] == 0:
        print("🎉 ALL TESTS PASSED!")
    else:
        print(f"⚠️  {test_results['failed']} test(s) need attention")
    
    return test_results["failed"]

if __name__ == "__main__":
    sys.exit(main())
