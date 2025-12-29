#!/usr/bin/env python3
"""
Trade Logic Verification Test
Verifies that trades are ONLY created through proper strategy execution.

Run: python3 verify_trade_logic.py
"""

import requests
import json
import time

API_BASE = "http://localhost:8000"


def clear_all_data():
    """Clear all trades and positions before testing."""
    print("🗑️  Clearing all trades and positions...")
    
    # Clear trades
    resp = requests.delete(f"{API_BASE}/api/trades")
    print(f"   Trades cleared: {resp.status_code}")
    
    # Clear positions
    resp = requests.delete(f"{API_BASE}/api/positions")
    print(f"   Positions cleared: {resp.status_code}")


def get_trade_count():
    """Get current number of trades."""
    resp = requests.get(f"{API_BASE}/api/trades")
    if resp.status_code == 200:
        data = resp.json()
        return data.get('total', len(data.get('trades', [])))
    return 0


def test_no_trades_without_signal():
    """Test 1: No trades should exist without signal ingestion."""
    print("\n📋 Test 1: No trades without signals")
    print("-" * 50)
    
    clear_all_data()
    time.sleep(0.5)
    
    count = get_trade_count()
    
    if count == 0:
        print("✅ PASSED: No trades exist (expected: 0)")
        return True
    else:
        print(f"❌ FAILED: Found {count} trades (expected: 0)")
        return False


def test_strategy_isolated_trades():
    """Test 2: Trades should be isolated per strategy."""
    print("\n📋 Test 2: Strategy isolation")
    print("-" * 50)
    
    clear_all_data()
    
    # Strategy A: BUY then SELL
    print("   Sending BUY signal for Strategy_A...")
    resp = requests.post(f"{API_BASE}/api/signals/ingest", json={
        "strategy_id": "Strategy_A",
        "signal": "BUY",
        "price": 100.0
    })
    print(f"   Response: {resp.json()}")
    
    # Strategy B: BUY (should create its own position)
    print("   Sending BUY signal for Strategy_B...")
    resp = requests.post(f"{API_BASE}/api/signals/ingest", json={
        "strategy_id": "Strategy_B",
        "signal": "BUY",
        "price": 200.0
    })
    print(f"   Response: {resp.json()}")
    
    # Strategy A: SELL (should close A's position, not B's)
    print("   Sending SELL signal for Strategy_A...")
    resp = requests.post(f"{API_BASE}/api/signals/ingest", json={
        "strategy_id": "Strategy_A",
        "signal": "SELL",
        "price": 110.0  # 10% profit
    })
    result = resp.json()
    print(f"   Response: {result}")
    
    if result.get('completed_trade'):
        trade = result['completed_trade']
        if trade['strategy_id'] == 'Strategy_A' and abs(trade['gross_pct'] - 10.0) < 0.01:
            print("✅ PASSED: Strategy A trade closed correctly (+10%)")
            return True
        else:
            print(f"❌ FAILED: Wrong trade data: {trade}")
            return False
    else:
        print("❌ FAILED: No trade was closed")
        return False


def test_alternating_signals():
    """Test 3: Trades should alternate LONG/SHORT."""
    print("\n📋 Test 3: Alternating trade direction")
    print("-" * 50)
    
    clear_all_data()
    
    # BUY → Opens LONG
    print("   BUY signal → Opens LONG...")
    resp = requests.post(f"{API_BASE}/api/signals/ingest", json={
        "strategy_id": "Alternating_Test",
        "signal": "BUY",
        "price": 100.0
    })
    r1 = resp.json()
    print(f"   Action: {r1.get('action')}")
    
    # SELL → Closes LONG, Opens SHORT
    print("   SELL signal → Closes LONG, Opens SHORT...")
    resp = requests.post(f"{API_BASE}/api/signals/ingest", json={
        "strategy_id": "Alternating_Test",
        "signal": "SELL",
        "price": 105.0
    })
    r2 = resp.json()
    print(f"   Action: {r2.get('action')}, Trade: {r2.get('completed_trade', {}).get('open_side')}")
    
    # BUY → Closes SHORT, Opens LONG
    print("   BUY signal → Closes SHORT, Opens LONG...")
    resp = requests.post(f"{API_BASE}/api/signals/ingest", json={
        "strategy_id": "Alternating_Test",
        "signal": "BUY",
        "price": 100.0
    })
    r3 = resp.json()
    print(f"   Action: {r3.get('action')}, Trade: {r3.get('completed_trade', {}).get('open_side')}")
    
    # Verify 2 trades were created (LONG closed, SHORT closed)
    count = get_trade_count()
    
    if count == 2:
        # Verify trade directions
        resp = requests.get(f"{API_BASE}/api/trades")
        trades = resp.json().get('trades', [])
        directions = [t.get('open_side') for t in trades]
        
        if 'LONG' in directions and 'SHORT' in directions:
            print("✅ PASSED: Alternating LONG/SHORT trades created")
            return True
        else:
            print(f"❌ FAILED: Wrong directions: {directions}")
            return False
    else:
        print(f"❌ FAILED: Expected 2 trades, got {count}")
        return False


def test_duplicate_signal_ignored():
    """Test 4: Duplicate signals should be ignored."""
    print("\n📋 Test 4: Duplicate signal handling")
    print("-" * 50)
    
    clear_all_data()
    
    # First BUY
    print("   First BUY signal...")
    resp = requests.post(f"{API_BASE}/api/signals/ingest", json={
        "strategy_id": "Duplicate_Test",
        "signal": "BUY",
        "price": 100.0
    })
    r1 = resp.json()
    print(f"   Action: {r1.get('action')}")
    
    # Second BUY (should be ignored)
    print("   Second BUY signal (should be ignored)...")
    resp = requests.post(f"{API_BASE}/api/signals/ingest", json={
        "strategy_id": "Duplicate_Test",
        "signal": "BUY",
        "price": 105.0
    })
    r2 = resp.json()
    print(f"   Action: {r2.get('action')}, Reason: {r2.get('reason')}")
    
    if r2.get('action') == 'ignored' and r2.get('reason') == 'duplicate_signal':
        print("✅ PASSED: Duplicate signal correctly ignored")
        return True
    else:
        print(f"❌ FAILED: Duplicate was not ignored: {r2}")
        return False


def main():
    print("=" * 60)
    print("TRADE LOGIC VERIFICATION")
    print("=" * 60)
    
    # Check backend is running
    try:
        resp = requests.get(f"{API_BASE}/health", timeout=5)
        if resp.status_code != 200:
            raise Exception("Backend not healthy")
    except Exception as e:
        print(f"❌ Backend not running at {API_BASE}")
        print("   Start with: ./start.sh")
        return
    
    print("✅ Backend is running\n")
    
    results = []
    results.append(("No trades without signals", test_no_trades_without_signal()))
    results.append(("Strategy isolation", test_strategy_isolated_trades()))
    results.append(("Alternating direction", test_alternating_signals()))
    results.append(("Duplicate signal handling", test_duplicate_signal_ignored()))
    
    # Summary
    print("\n" + "=" * 60)
    print("SUMMARY")
    print("=" * 60)
    
    passed = sum(1 for _, r in results if r)
    total = len(results)
    
    for name, result in results:
        status = "✅ PASSED" if result else "❌ FAILED"
        print(f"  {status}: {name}")
    
    print(f"\n{passed}/{total} tests passed")
    
    if passed == total:
        print("\n🎉 All trade logic tests passed!")
    else:
        print("\n⚠️  Some tests failed - review the output above")


if __name__ == "__main__":
    main()
