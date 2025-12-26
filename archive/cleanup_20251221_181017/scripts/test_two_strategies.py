"""
Test Script: Two RSI Strategies (TSLA & NVDA)
Simulates the full signal → trade → analytics pipeline

NOTE: Backend API uses:
  - signal: BUY | SELL | HOLD (not LONG/SHORT)
  - strategy_id: includes symbol in name (e.g. "RSI_TSLA")
  - No separate symbol field - symbol is part of strategy_id
"""

import requests
import json
import time
from datetime import datetime, timezone, timedelta

# Backend API base URL
API_BASE = "http://127.0.0.1:5000"

def clear_data():
    """Clear existing positions and trades for fresh test"""
    print("\n" + "="*60)
    print("CLEARING EXISTING DATA")
    print("="*60)
    
    # Try to clear via API
    try:
        resp = requests.delete(f"{API_BASE}/api/trades/clear", timeout=5)
        print(f"Clear trades: {resp.status_code}")
    except:
        pass
    
    try:
        resp = requests.delete(f"{API_BASE}/api/positions/clear", timeout=5)
        print(f"Clear positions: {resp.status_code}")
    except:
        pass

def send_signal(strategy_id: str, signal: str, price: float, ts: str = None):
    """
    Send a signal to the trade engine
    
    Args:
        strategy_id: e.g. "RSI_TSLA" or "MACD_NVDA"
        signal: BUY | SELL | HOLD
        price: Current price
        ts: Timestamp (ISO format)
    """
    if ts is None:
        ts = datetime.now(timezone.utc).isoformat()
    
    payload = {
        "strategy_id": strategy_id,
        "signal": signal,  # BUY, SELL, HOLD - not LONG/SHORT
        "price": price,
        "ts": ts,
        "fee_pct": 0.05,  # 0.05% fee per trade
        "slippage_pct": 0.05  # 0.05% slippage
    }
    
    print(f"\n→ Sending {signal} signal: {strategy_id} @ ${price:.2f}")
    
    try:
        resp = requests.post(
            f"{API_BASE}/api/signals/ingest",
            json=payload,
            timeout=10
        )
        result = resp.json()
        
        if result.get("action") == "opened":
            side = result.get("opened", {}).get("side", "?")
            print(f"  ✓ OPENED {side} position")
        elif result.get("action") == "closed_and_opened":
            trade = result.get("completed_trade", {})
            net_pct = trade.get("net_pct", 0)
            sign = "+" if net_pct > 0 else ""
            new_side = result.get("opened", {}).get("side", "?")
            print(f"  ✓ CLOSED position → {sign}{net_pct:.2f}% P&L")
            print(f"  ✓ OPENED new {new_side} position")
        elif result.get("action") == "ignored":
            print(f"  ○ Ignored: {result.get('reason', 'duplicate')}")
        elif not result.get("accepted"):
            print(f"  ✗ Rejected: {result.get('reason', 'unknown')}")
        else:
            print(f"  ? Response: {result}")
            
        return result
    except Exception as e:
        print(f"  ✗ Error: {e}")
        return None

def get_analytics():
    """Fetch analytics from backend"""
    print("\n" + "="*60)
    print("FETCHING ANALYTICS")
    print("="*60)
    
    try:
        resp = requests.get(f"{API_BASE}/api/analytics/overview", timeout=10)
        data = resp.json()
        return data
    except Exception as e:
        print(f"Error fetching analytics: {e}")
        return None

def get_trades():
    """Fetch all trades"""
    try:
        resp = requests.get(f"{API_BASE}/api/trades", timeout=10)
        data = resp.json()
        return data.get('trades', []) if isinstance(data, dict) else data
    except Exception as e:
        print(f"Error fetching trades: {e}")
        return []

def get_positions():
    """Fetch current positions"""
    try:
        resp = requests.get(f"{API_BASE}/api/signals/current", timeout=10)
        return resp.json()
    except Exception as e:
        print(f"Error fetching positions: {e}")
        return {}

def print_analytics(analytics):
    """Pretty print analytics"""
    if not analytics:
        print("No analytics data")
        return
    
    metrics = analytics.get("metrics", {})
    by_strategy = analytics.get("by_strategy", {})
    
    print("\n┌────────────────────────────────────────────────────────┐")
    print("│              AGGREGATE METRICS (All Strategies)         │")
    print("├────────────────────────────────────────────────────────┤")
    print(f"│  Total Trades:    {metrics.get('trade_count', 0):>6}                            │")
    print(f"│  Wins:            {metrics.get('wins', 0):>6}                            │")
    print(f"│  Losses:          {metrics.get('losses', 0):>6}                            │")
    print(f"│  Win Rate:        {metrics.get('win_rate', 0):>6.1f}%                           │")
    print(f"│  Net Return:      {metrics.get('net_return_pct', 0):>+7.2f}%                          │")
    print(f"│  Gross Return:    {metrics.get('gross_return_pct', 0):>+7.2f}%                          │")
    pf = metrics.get('profit_factor', 0)
    pf_str = "∞" if pf == "inf" or pf == float('inf') else f"{pf:.2f}"
    print(f"│  Profit Factor:   {pf_str:>7}                           │")
    print(f"│  Max Drawdown:    {metrics.get('max_drawdown_pct', 0):>7.2f}%                          │")
    print(f"│  Avg Win:         {metrics.get('avg_win_pct', 0):>+7.2f}%                          │")
    print(f"│  Avg Loss:        {metrics.get('avg_loss_pct', 0):>+7.2f}%                          │")
    print("└────────────────────────────────────────────────────────┘")
    
    if by_strategy:
        print("\n┌────────────────────────────────────────────────────────┐")
        print("│              BY-STRATEGY BREAKDOWN                      │")
        print("├────────────────────────────────────────────────────────┤")
        for strat_id, strat_data in by_strategy.items():
            print(f"│  {strat_id:<20}                              │")
            print(f"│    Trades: {strat_data.get('trade_count', 0):>3}  |  Wins: {strat_data.get('wins', 0):>2}  |  Losses: {strat_data.get('losses', 0):>2}       │")
            print(f"│    Win Rate: {strat_data.get('win_rate', 0):>5.1f}%  |  Net Return: {strat_data.get('net_return_pct', 0):>+6.2f}%     │")
            print("├────────────────────────────────────────────────────────┤")
        print("└────────────────────────────────────────────────────────┘")

def print_trades(trades):
    """Pretty print trades list"""
    if not trades:
        print("\nNo completed trades recorded yet")
        return
    
    print("\n┌────────────────────────────────────────────────────────────────────────┐")
    print("│                          COMPLETED TRADES                              │")
    print("├─────────────────┬──────────┬──────────┬──────────┬─────────────────────┤")
    print("│ Strategy        │ Side     │ Entry    │ Exit     │ Net P&L             │")
    print("├─────────────────┼──────────┼──────────┼──────────┼─────────────────────┤")
    
    for t in trades:
        strat = t.get('strategy_id', 'unknown')[:15]
        side = t.get('open_side', '?')[:8]
        entry = t.get('entry_price', 0)
        exit_p = t.get('exit_price', 0)
        net = t.get('net_pct', 0)
        sign = "+" if net > 0 else ""
        color = "🟢" if net > 0 else "🔴" if net < 0 else "⚪"
        
        print(f"│ {strat:<15} │ {side:<8} │ ${entry:>7.2f} │ ${exit_p:>7.2f} │ {color} {sign}{net:>6.2f}%        │")
    
    print("└─────────────────┴──────────┴──────────┴──────────┴─────────────────────┘")

def run_test():
    """Run the full test scenario"""
    print("\n" + "="*60)
    print("  TEST: Two RSI Strategies (TSLA & NVDA)")
    print("  Simulating signals with mock prices")
    print("="*60)
    
    # Check backend is running
    try:
        resp = requests.get(f"{API_BASE}/health", timeout=5)
        print(f"\n✓ Backend is running at {API_BASE}")
    except:
        print(f"\n✗ Backend not responding at {API_BASE}")
        print("  Please start the backend first:")
        print("  cd backendapi && python -m api.backend")
        return
    
    # Clear existing data for a fresh test
    clear_data()
    time.sleep(0.5)
    
    # Base time for signals
    base_time = datetime.now(timezone.utc) - timedelta(hours=6)
    
    print("\n" + "="*60)
    print("SCENARIO: Simulating 6 hours of trading")
    print("="*60)
    
    # ========================================
    # Strategy 1: RSI_TSLA
    # ========================================
    print("\n--- RSI_TSLA Strategy ---")
    
    # Trade 1: BUY (go LONG) TSLA $420 → SELL $435 (close LONG, open SHORT)
    t1 = base_time
    send_signal("RSI_TSLA", "BUY", 420.00, t1.isoformat())
    time.sleep(0.2)
    
    t2 = t1 + timedelta(hours=1)
    send_signal("RSI_TSLA", "SELL", 435.00, t2.isoformat())  # Closes LONG → Opens SHORT
    time.sleep(0.2)
    
    # Trade 2: BUY $428 (closes SHORT, opens LONG)
    t3 = t2 + timedelta(hours=1)
    send_signal("RSI_TSLA", "BUY", 428.00, t3.isoformat())  # Closes SHORT → Opens LONG
    time.sleep(0.2)
    
    # Trade 3: SELL $415 (closes LONG at loss, opens SHORT)
    t4 = t3 + timedelta(hours=1)
    send_signal("RSI_TSLA", "SELL", 415.00, t4.isoformat())  # Closes LONG (loss) → Opens SHORT
    time.sleep(0.2)
    
    # ========================================
    # Strategy 2: RSI_NVDA
    # ========================================
    print("\n--- RSI_NVDA Strategy ---")
    
    # Trade 1: BUY (go LONG) NVDA $140 → SELL $148
    n1 = base_time + timedelta(minutes=15)
    send_signal("RSI_NVDA", "BUY", 140.00, n1.isoformat())
    time.sleep(0.2)
    
    n2 = n1 + timedelta(hours=2)
    send_signal("RSI_NVDA", "SELL", 148.00, n2.isoformat())  # Closes LONG → Opens SHORT
    time.sleep(0.2)
    
    # Trade 2: BUY $145 (closes SHORT, opens LONG)
    n3 = n2 + timedelta(hours=1)
    send_signal("RSI_NVDA", "BUY", 145.00, n3.isoformat())  # Closes SHORT → Opens LONG
    time.sleep(0.2)
    
    # Trade 3: SELL $152 (closes LONG)
    n4 = n3 + timedelta(hours=1)
    send_signal("RSI_NVDA", "SELL", 152.00, n4.isoformat())  # Closes LONG → Opens SHORT
    time.sleep(0.2)
    
    # ========================================
    # Fetch and display results
    # ========================================
    print("\n" + "="*60)
    print("RESULTS")
    print("="*60)
    
    # Get current positions
    positions = get_positions()
    print(f"\nOpen Positions: {len(positions.get('positions', {}))}")
    if positions.get('positions'):
        for key, pos in positions['positions'].items():
            side = pos.get('position', pos.get('side', '?'))
            entry = pos.get('open_trade', {}).get('entry_price', 0) or pos.get('entry_price', 0)
            print(f"  - {key}: {side} @ ${entry:.2f}")
    
    # Get all trades
    trades = get_trades()
    print_trades(trades)
    
    # Get analytics
    analytics = get_analytics()
    print_analytics(analytics)
    
    # Summary
    print("\n" + "="*60)
    print("TEST SUMMARY")
    print("="*60)
    if analytics and analytics.get("metrics"):
        m = analytics["metrics"]
        print(f"""
Expected Results (assuming 0.1% total fee per trade):
  - RSI_TSLA: 3 completed trades
    • Trade 1: LONG $420 → $435 = +3.47% (gross +3.57%)
    • Trade 2: SHORT $435 → $428 = +1.51% (gross +1.61%)  
    • Trade 3: LONG $428 → $415 = -3.14% (gross -3.04%)
    
  - RSI_NVDA: 3 completed trades
    • Trade 1: LONG $140 → $148 = +5.61% (gross +5.71%)
    • Trade 2: SHORT $148 → $145 = +1.93% (gross +2.03%)
    • Trade 3: LONG $145 → $152 = +4.73% (gross +4.83%)

Actual Results:
  - Total Trades: {m.get('trade_count', 0)}
  - Wins: {m.get('wins', 0)}  
  - Losses: {m.get('losses', 0)}
  - Win Rate: {m.get('win_rate', 0):.1f}%
  - Net Return: {m.get('net_return_pct', 0):+.2f}%
""")
    
    print("\n✓ Test complete! Check the Dashboard and Analytics pages.")
    print(f"  Frontend: http://localhost:5173 (dev) or your Firebase URL")

if __name__ == "__main__":
    run_test()
