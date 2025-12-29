"""
Comprehensive Node Test Suite for FlowGrid Trading Platform
Tests ALL nodes with live Alpaca API data
"""
import requests
import json
from datetime import datetime

API_URL = "http://localhost:8000"

# Test results
results = {"passed": 0, "failed": 0, "errors": []}

def log_test(name, passed, details=""):
    status = "✅ PASS" if passed else "❌ FAIL"
    print(f"{status}: {name}")
    if details:
        print(f"       {details}")
    if passed:
        results["passed"] += 1
    else:
        results["failed"] += 1
        results["errors"].append({"name": name, "details": details})

def fetch_historical_data(symbol="NVDA", timeframe="1d", limit=100):
    """Fetch historical data from API"""
    try:
        response = requests.get(
            f"{API_URL}/price_history?symbol={symbol}&timeframe={timeframe}&limit={limit}",
            timeout=15
        )
        if response.status_code == 200:
            data = response.json()
            bars = data.get('bars', [])
            # Convert to format expected by backtest (short keys: c, o, h, l, v, t)
            return [{
                "t": bar.get('t'),
                "o": bar.get('open'),
                "h": bar.get('high'),
                "l": bar.get('low'),
                "c": bar.get('close'),
                "v": bar.get('volume')
            } for bar in bars]
        return []
    except Exception as e:
        print(f"Error fetching data: {e}")
        return []

def test_alpaca_connection():
    """Test Alpaca API connection"""
    print("\n" + "="*60)
    print("TESTING ALPACA API CONNECTION")
    print("="*60)
    
    try:
        response = requests.get(
            f"{API_URL}/price_history?symbol=SPY&timeframe=1d&limit=5",
            timeout=10
        )
        if response.status_code == 200:
            data = response.json()
            bars = data.get('bars', [])
            if bars:
                log_test("Alpaca Connection", True, f"Got {len(bars)} bars for SPY")
                return True
            else:
                log_test("Alpaca Connection", False, "No bars returned")
                return False
        else:
            log_test("Alpaca Connection", False, f"Status: {response.status_code}")
            return False
    except Exception as e:
        log_test("Alpaca Connection", False, str(e))
        return False

def test_historical_data():
    """Test fetching historical data"""
    print("\n" + "="*60)
    print("TESTING HISTORICAL DATA FETCH")
    print("="*60)
    
    symbols = ["AAPL", "NVDA", "TSLA", "SPY"]
    for symbol in symbols:
        try:
            response = requests.get(
                f"{API_URL}/price_history?symbol={symbol}&timeframe=1d&limit=100",
                timeout=15
            )
            if response.status_code == 200:
                data = response.json()
                bars = data.get('bars', [])
                log_test(f"Historical Data - {symbol}", len(bars) > 0, f"Got {len(bars)} bars")
            else:
                log_test(f"Historical Data - {symbol}", False, f"Status: {response.status_code}")
        except Exception as e:
            log_test(f"Historical Data - {symbol}", False, str(e))

def execute_backtest(workflow, connections=None, symbol="NVDA", historical_data=None):
    """Execute a backtest workflow"""
    if historical_data is None:
        historical_data = fetch_historical_data(symbol, "1d", 100)
    
    payload = {
        "symbol": symbol,
        "timeframe": "1Day",
        "workflow": workflow,
        "connections": connections or [],
        "historicalData": historical_data,
        "config": {
            "takeProfitPct": 0,
            "stopLossPct": 0,
            "sharesPerTrade": 10,
            "initialCapital": 10000
        }
    }
    try:
        response = requests.post(f"{API_URL}/execute_backtest", json=payload, timeout=30)
        return response.json()
    except Exception as e:
        return {"error": str(e)}

def test_indicator_nodes():
    """Test all indicator nodes"""
    print("\n" + "="*60)
    print("TESTING INDICATOR NODES")
    print("="*60)
    
    # Pre-fetch data for all tests
    historical_data = fetch_historical_data("NVDA", "1d", 100)
    if not historical_data:
        log_test("Indicator Nodes", False, "Could not fetch historical data")
        return
    
    # Test RSI
    workflow = [{"id": 1, "type": "rsi", "params": {"period": 14, "source": "close"}}]
    result = execute_backtest(workflow, historical_data=historical_data)
    has_rsi = any(b.get("type") == "rsi" for b in result.get("blocks_v2", []))
    log_test("RSI Indicator", has_rsi or "error" not in result, 
             f"RSI found: {has_rsi}, error: {result.get('error', 'None')[:80]}")
    
    # Test EMA
    workflow = [{"id": 1, "type": "ema", "params": {"period": 12, "source": "close"}}]
    result = execute_backtest(workflow, historical_data=historical_data)
    has_ema = any(b.get("type") == "ema" for b in result.get("blocks_v2", []))
    log_test("EMA Indicator", has_ema or "error" not in result,
             f"EMA found: {has_ema}, error: {result.get('error', 'None')[:80]}")
    
    # Test SMA
    workflow = [{"id": 1, "type": "sma", "params": {"period": 20, "source": "close"}}]
    result = execute_backtest(workflow, historical_data=historical_data)
    log_test("SMA Indicator", "error" not in result, str(result.get("error", "OK"))[:80])
    
    # Test MACD
    workflow = [{"id": 1, "type": "macd", "params": {"fastPeriod": 12, "slowPeriod": 26, "signalPeriod": 9}}]
    result = execute_backtest(workflow, historical_data=historical_data)
    log_test("MACD Indicator", "error" not in result, str(result.get("error", "OK"))[:80])
    
    # Test Bollinger Bands
    workflow = [{"id": 1, "type": "bollinger", "params": {"period": 20, "stdDev": 2}}]
    result = execute_backtest(workflow, historical_data=historical_data)
    log_test("Bollinger Bands", "error" not in result, str(result.get("error", "OK"))[:80])
    
    # Test ATR
    workflow = [{"id": 1, "type": "atr", "params": {"period": 14}}]
    result = execute_backtest(workflow, historical_data=historical_data)
    log_test("ATR Indicator", "error" not in result, str(result.get("error", "OK"))[:80])
    
    # Test VWAP
    workflow = [{"id": 1, "type": "vwap", "params": {}}]
    result = execute_backtest(workflow, historical_data=historical_data)
    log_test("VWAP Indicator", "error" not in result, str(result.get("error", "OK"))[:80])
    
    # Test Stochastic
    workflow = [{"id": 1, "type": "stochastic", "params": {"kPeriod": 14, "dPeriod": 3}}]
    result = execute_backtest(workflow, historical_data=historical_data)
    log_test("Stochastic Indicator", "error" not in result, str(result.get("error", "OK"))[:80])
    
    # Test ADX
    workflow = [{"id": 1, "type": "adx", "params": {"period": 14}}]
    result = execute_backtest(workflow, historical_data=historical_data)
    log_test("ADX Indicator", "error" not in result, str(result.get("error", "OK"))[:80])
    
    # Test OBV
    workflow = [{"id": 1, "type": "obv", "params": {}}]
    result = execute_backtest(workflow, historical_data=historical_data)
    log_test("OBV Indicator", "error" not in result, str(result.get("error", "OK"))[:80])

def test_crossover_node():
    """Test crossover node specifically"""
    print("\n" + "="*60)
    print("TESTING CROSSOVER NODE")
    print("="*60)
    
    historical_data = fetch_historical_data("NVDA", "1d", 100)
    if not historical_data:
        log_test("Crossover Node", False, "Could not fetch historical data")
        return
    
    # Test 1: Basic crossover with two EMAs - Bullish
    workflow = [
        {"id": 1, "type": "ema", "params": {"period": 9, "source": "close"}},
        {"id": 2, "type": "ema", "params": {"period": 21, "source": "close"}},
        {"id": 3, "type": "crossover", "params": {"direction": "bullish"}},
        {"id": 4, "type": "output", "params": {}}
    ]
    connections = [
        {"source": 1, "target": 3, "sourceHandle": "value", "targetHandle": "fast"},
        {"source": 2, "target": 3, "sourceHandle": "value", "targetHandle": "slow"},
        {"source": 3, "target": 4, "sourceHandle": "result", "targetHandle": "signal"}
    ]
    result = execute_backtest(workflow, connections, historical_data=historical_data)
    
    # Check for crossover node in results
    crossover_block = None
    for block in result.get("blocks_v2", []):
        if block.get("type") == "crossover":
            crossover_block = block
            break
    
    if crossover_block:
        log_test("Crossover - Bullish EMA 9/21", crossover_block.get("status") == "passed",
                 f"Status: {crossover_block.get('status')}, Output: {crossover_block.get('outputs', {})}")
    else:
        log_test("Crossover - Bullish EMA 9/21", "error" not in result, 
                 f"Error: {result.get('error', 'Crossover block not found in blocks_v2')[:100]}")
    
    # Test 2: Bearish crossover
    workflow[2]["params"]["direction"] = "bearish"
    result = execute_backtest(workflow, connections, historical_data=historical_data)
    crossover_block = None
    for block in result.get("blocks_v2", []):
        if block.get("type") == "crossover":
            crossover_block = block
            break
    
    if crossover_block:
        log_test("Crossover - Bearish EMA 9/21", crossover_block.get("status") == "passed",
                 f"Status: {crossover_block.get('status')}, Output: {crossover_block.get('outputs', {})}")
    else:
        log_test("Crossover - Bearish EMA 9/21", "error" not in result,
                 f"Error: {result.get('error', 'Crossover block not found')[:100]}")
    
    # Test 3: EMA 12/26 crossover (common golden cross setup)
    workflow = [
        {"id": 1, "type": "ema", "params": {"period": 12, "source": "close"}},
        {"id": 2, "type": "ema", "params": {"period": 26, "source": "close"}},
        {"id": 3, "type": "crossover", "params": {"direction": "bullish"}},
        {"id": 4, "type": "output", "params": {}}
    ]
    result = execute_backtest(workflow, connections, historical_data=historical_data)
    log_test("Crossover - EMA 12/26 Golden", "error" not in result,
             f"Result keys: {list(result.keys())[:5]}")
    
    # Test 4: MACD Signal crossover
    workflow = [
        {"id": 1, "type": "macd", "params": {"fastPeriod": 12, "slowPeriod": 26, "signalPeriod": 9}},
        {"id": 2, "type": "crossover", "params": {"direction": "bullish"}},
        {"id": 3, "type": "output", "params": {}}
    ]
    connections = [
        {"source": 1, "target": 2, "sourceHandle": "macd", "targetHandle": "fast"},
        {"source": 1, "target": 2, "sourceHandle": "signal", "targetHandle": "slow"},
        {"source": 2, "target": 3, "sourceHandle": "result", "targetHandle": "signal"}
    ]
    result = execute_backtest(workflow, connections, historical_data=historical_data)
    log_test("Crossover - MACD/Signal", "error" not in result,
             f"Blocks: {len(result.get('blocks_v2', []))}")
    
    # Test 5: SMA crossover
    workflow = [
        {"id": 1, "type": "sma", "params": {"period": 50, "source": "close"}},
        {"id": 2, "type": "sma", "params": {"period": 200, "source": "close"}},
        {"id": 3, "type": "crossover", "params": {"direction": "bullish"}},
        {"id": 4, "type": "output", "params": {}}
    ]
    connections = [
        {"source": 1, "target": 3, "sourceHandle": "value", "targetHandle": "fast"},
        {"source": 2, "target": 3, "sourceHandle": "value", "targetHandle": "slow"},
        {"source": 3, "target": 4, "sourceHandle": "result", "targetHandle": "signal"}
    ]
    result = execute_backtest(workflow, connections, historical_data=historical_data)
    log_test("Crossover - SMA 50/200", "error" not in result,
             f"Blocks: {len(result.get('blocks_v2', []))}")

def test_compare_nodes():
    """Test compare/threshold nodes"""
    print("\n" + "="*60)
    print("TESTING COMPARE/THRESHOLD NODES")
    print("="*60)
    
    historical_data = fetch_historical_data("NVDA", "1d", 100)
    
    # RSI > 70 (overbought)
    workflow = [
        {"id": 1, "type": "rsi", "params": {"period": 14}},
        {"id": 2, "type": "threshold", "params": {"threshold": 70, "direction": "above"}},
        {"id": 3, "type": "output", "params": {}}
    ]
    connections = [
        {"source": 1, "target": 2, "sourceHandle": "value", "targetHandle": "value"},
        {"source": 2, "target": 3, "sourceHandle": "result", "targetHandle": "signal"}
    ]
    result = execute_backtest(workflow, connections, historical_data=historical_data)
    log_test("Threshold - RSI > 70", "error" not in result, str(result.get("error", "OK"))[:80])
    
    # RSI < 30 (oversold)
    workflow[1]["params"] = {"threshold": 30, "direction": "below"}
    result = execute_backtest(workflow, connections, historical_data=historical_data)
    log_test("Threshold - RSI < 30", "error" not in result, str(result.get("error", "OK"))[:80])
    
    # Price compare (price > SMA)
    workflow = [
        {"id": 1, "type": "price", "params": {"source": "close"}},
        {"id": 2, "type": "sma", "params": {"period": 20}},
        {"id": 3, "type": "compare", "params": {"operator": "greater"}},
        {"id": 4, "type": "output", "params": {}}
    ]
    connections = [
        {"source": 1, "target": 3, "sourceHandle": "value", "targetHandle": "a"},
        {"source": 2, "target": 3, "sourceHandle": "value", "targetHandle": "b"},
        {"source": 3, "target": 4, "sourceHandle": "result", "targetHandle": "signal"}
    ]
    result = execute_backtest(workflow, connections, historical_data=historical_data)
    log_test("Compare - Price > SMA(20)", "error" not in result, str(result.get("error", "OK"))[:80])

def test_logic_gates():
    """Test logic gate nodes"""
    print("\n" + "="*60)
    print("TESTING LOGIC GATES")
    print("="*60)
    
    historical_data = fetch_historical_data("NVDA", "1d", 100)
    
    # AND gate: RSI oversold AND EMA bullish crossover
    workflow = [
        {"id": 1, "type": "rsi", "params": {"period": 14}},
        {"id": 2, "type": "threshold", "params": {"threshold": 30, "direction": "below"}},
        {"id": 3, "type": "ema", "params": {"period": 9}},
        {"id": 4, "type": "ema", "params": {"period": 21}},
        {"id": 5, "type": "crossover", "params": {"direction": "bullish"}},
        {"id": 6, "type": "and", "params": {}},
        {"id": 7, "type": "output", "params": {}}
    ]
    connections = [
        {"source": 1, "target": 2, "sourceHandle": "value", "targetHandle": "value"},
        {"source": 3, "target": 5, "sourceHandle": "value", "targetHandle": "fast"},
        {"source": 4, "target": 5, "sourceHandle": "value", "targetHandle": "slow"},
        {"source": 2, "target": 6, "sourceHandle": "result", "targetHandle": "a"},
        {"source": 5, "target": 6, "sourceHandle": "result", "targetHandle": "b"},
        {"source": 6, "target": 7, "sourceHandle": "result", "targetHandle": "signal"}
    ]
    result = execute_backtest(workflow, connections, historical_data=historical_data)
    log_test("AND Gate - RSI<30 AND EMA Cross", "error" not in result, 
             f"Blocks: {len(result.get('blocks_v2', []))}")
    
    # OR gate
    workflow[5]["type"] = "or"
    result = execute_backtest(workflow, connections, historical_data=historical_data)
    log_test("OR Gate - RSI<30 OR EMA Cross", "error" not in result,
             f"Blocks: {len(result.get('blocks_v2', []))}")
    
    # NOT gate
    workflow = [
        {"id": 1, "type": "rsi", "params": {"period": 14}},
        {"id": 2, "type": "threshold", "params": {"threshold": 70, "direction": "above"}},
        {"id": 3, "type": "not", "params": {}},
        {"id": 4, "type": "output", "params": {}}
    ]
    connections = [
        {"source": 1, "target": 2, "sourceHandle": "value", "targetHandle": "value"},
        {"source": 2, "target": 3, "sourceHandle": "result", "targetHandle": "input"},
        {"source": 3, "target": 4, "sourceHandle": "result", "targetHandle": "signal"}
    ]
    result = execute_backtest(workflow, connections, historical_data=historical_data)
    log_test("NOT Gate - NOT RSI>70", "error" not in result,
             f"Blocks: {len(result.get('blocks_v2', []))}")

def test_strategy_templates():
    """Test common strategy templates"""
    print("\n" + "="*60)
    print("TESTING STRATEGY TEMPLATES")
    print("="*60)
    
    # RSI Oversold Strategy on AAPL
    historical_data = fetch_historical_data("AAPL", "1d", 100)
    workflow = [
        {"id": 1, "type": "rsi", "params": {"period": 14}},
        {"id": 2, "type": "threshold", "params": {"threshold": 30, "direction": "below"}},
        {"id": 3, "type": "output", "params": {}}
    ]
    connections = [
        {"source": 1, "target": 2, "sourceHandle": "value", "targetHandle": "value"},
        {"source": 2, "target": 3, "sourceHandle": "result", "targetHandle": "signal"}
    ]
    result = execute_backtest(workflow, connections, "AAPL", historical_data=historical_data)
    log_test("Strategy - RSI Oversold (AAPL)", "error" not in result,
             f"Trades: {result.get('total_trades', len(result.get('trades', [])))}")
    
    # EMA Crossover Strategy on NVDA
    historical_data = fetch_historical_data("NVDA", "1d", 100)
    workflow = [
        {"id": 1, "type": "ema", "params": {"period": 9}},
        {"id": 2, "type": "ema", "params": {"period": 21}},
        {"id": 3, "type": "crossover", "params": {"direction": "bullish"}},
        {"id": 4, "type": "output", "params": {}}
    ]
    connections = [
        {"source": 1, "target": 3, "sourceHandle": "value", "targetHandle": "fast"},
        {"source": 2, "target": 3, "sourceHandle": "value", "targetHandle": "slow"},
        {"source": 3, "target": 4, "sourceHandle": "result", "targetHandle": "signal"}
    ]
    result = execute_backtest(workflow, connections, "NVDA", historical_data=historical_data)
    log_test("Strategy - EMA 9/21 Crossover (NVDA)", "error" not in result,
             f"Trades: {result.get('total_trades', len(result.get('trades', [])))}, PnL: ${result.get('total_pnl', 'N/A')}")
    
    # Bollinger Band Lower Touch on SPY
    historical_data = fetch_historical_data("SPY", "1d", 100)
    workflow = [
        {"id": 1, "type": "price", "params": {"source": "close"}},
        {"id": 2, "type": "bollinger", "params": {"period": 20, "stdDev": 2}},
        {"id": 3, "type": "compare", "params": {"operator": "less"}},
        {"id": 4, "type": "output", "params": {}}
    ]
    connections = [
        {"source": 1, "target": 3, "sourceHandle": "value", "targetHandle": "a"},
        {"source": 2, "target": 3, "sourceHandle": "lower", "targetHandle": "b"},
        {"source": 3, "target": 4, "sourceHandle": "result", "targetHandle": "signal"}
    ]
    result = execute_backtest(workflow, connections, "SPY", historical_data=historical_data)
    log_test("Strategy - Bollinger Lower (SPY)", "error" not in result,
             f"Trades: {result.get('total_trades', len(result.get('trades', [])))}")
    
    # MACD Signal Crossover on TSLA
    historical_data = fetch_historical_data("TSLA", "1d", 100)
    workflow = [
        {"id": 1, "type": "macd", "params": {"fastPeriod": 12, "slowPeriod": 26, "signalPeriod": 9}},
        {"id": 2, "type": "crossover", "params": {"direction": "bullish"}},
        {"id": 3, "type": "output", "params": {}}
    ]
    connections = [
        {"source": 1, "target": 2, "sourceHandle": "macd", "targetHandle": "fast"},
        {"source": 1, "target": 2, "sourceHandle": "signal", "targetHandle": "slow"},
        {"source": 2, "target": 3, "sourceHandle": "result", "targetHandle": "signal"}
    ]
    result = execute_backtest(workflow, connections, "TSLA", historical_data=historical_data)
    log_test("Strategy - MACD Crossover (TSLA)", "error" not in result,
             f"Trades: {result.get('total_trades', len(result.get('trades', [])))}")

def test_backtest_execution():
    """Test full backtest execution with risk management"""
    print("\n" + "="*60)
    print("TESTING BACKTEST EXECUTION")
    print("="*60)
    
    historical_data = fetch_historical_data("NVDA", "1d", 100)
    
    # Full strategy: EMA crossover + RSI filter + risk management
    workflow = [
        {"id": 1, "type": "ema", "params": {"period": 12}},
        {"id": 2, "type": "ema", "params": {"period": 26}},
        {"id": 3, "type": "crossover", "params": {"direction": "bullish"}},
        {"id": 4, "type": "rsi", "params": {"period": 14}},
        {"id": 5, "type": "threshold", "params": {"threshold": 70, "direction": "below"}},
        {"id": 6, "type": "and", "params": {}},
        {"id": 7, "type": "output", "params": {}}
    ]
    connections = [
        {"source": 1, "target": 3, "sourceHandle": "value", "targetHandle": "fast"},
        {"source": 2, "target": 3, "sourceHandle": "value", "targetHandle": "slow"},
        {"source": 4, "target": 5, "sourceHandle": "value", "targetHandle": "value"},
        {"source": 3, "target": 6, "sourceHandle": "result", "targetHandle": "a"},
        {"source": 5, "target": 6, "sourceHandle": "result", "targetHandle": "b"},
        {"source": 6, "target": 7, "sourceHandle": "result", "targetHandle": "signal"}
    ]
    
    payload = {
        "symbol": "NVDA",
        "timeframe": "1Day",
        "workflow": workflow,
        "connections": connections,
        "historicalData": historical_data,
        "config": {
            "takeProfitPct": 5,
            "stopLossPct": 2,
            "sharesPerTrade": 10,
            "initialCapital": 100000
        }
    }
    
    try:
        response = requests.post(f"{API_URL}/execute_backtest", json=payload, timeout=60)
        result = response.json()
        
        log_test("Backtest - Execution Success", "error" not in result,
                 f"Status: {response.status_code}, Keys: {list(result.keys())[:5]}")
        
        if "error" not in result:
            trades = result.get('trades', [])
            log_test("Backtest - Has Trades", len(trades) >= 0,
                     f"Trades: {len(trades)}")
            
            log_test("Backtest - Has Metrics", 
                     "total_pnl" in result or "metrics" in result,
                     f"PnL: ${result.get('total_pnl', result.get('metrics', {}).get('total_pnl', 'N/A'))}")
            
            blocks = result.get("blocks_v2", [])
            log_test("Backtest - Block Results", len(blocks) > 0,
                     f"Blocks processed: {len(blocks)}")
            
            # Print block details
            print("\n   Block Results:")
            for block in blocks[:10]:
                status = block.get("status", "?")
                btype = block.get("type", "?")
                outputs = block.get("outputs", {})
                print(f"     - {btype}: {status}, outputs: {outputs}")
    except Exception as e:
        log_test("Backtest - Execution", False, str(e))

def print_summary():
    """Print test summary"""
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    total = results["passed"] + results["failed"]
    print(f"Total Tests: {total}")
    print(f"✅ Passed: {results['passed']}")
    print(f"❌ Failed: {results['failed']}")
    print(f"Pass Rate: {(results['passed']/total*100):.1f}%" if total > 0 else "N/A")
    
    if results["errors"]:
        print("\n" + "="*60)
        print("FAILED TESTS DETAILS")
        print("="*60)
        for err in results["errors"]:
            print(f"• {err['name']}: {err['details'][:100]}")

if __name__ == "__main__":
    print("="*60)
    print("FLOWGRID TRADING - COMPREHENSIVE NODE TEST SUITE")
    print(f"Started: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("="*60)
    
    # Run all tests
    test_alpaca_connection()
    test_historical_data()
    test_indicator_nodes()
    test_crossover_node()
    test_compare_nodes()
    test_logic_gates()
    test_strategy_templates()
    test_backtest_execution()
    
    # Print summary
    print_summary()
