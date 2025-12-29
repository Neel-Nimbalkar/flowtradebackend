"""Test script to fetch NVDA price history via Alpaca API"""
import os
import requests
from datetime import datetime, timedelta

# Set credentials - REPLACE WITH YOUR OWN KEYS
os.environ['ALPACA_KEY_ID'] = 'YOUR_ALPACA_KEY_ID_HERE'
os.environ['ALPACA_SECRET_KEY'] = 'YOUR_ALPACA_SECRET_KEY_HERE'

# Import backend function
from backendapi.integrations.alpaca_fetch import fetch_bars_full

symbol = 'NVDA'
timeframe = '1Hour'
days = 5

end_date = datetime.utcnow()
start_date = end_date - timedelta(days=days)
start_str = start_date.strftime('%Y-%m-%dT%H:%M:%SZ')
end_str = end_date.strftime('%Y-%m-%dT%H:%M:%SZ')

print(f"📊 Fetching {symbol} {timeframe} for last {days} days")
print(f"   Range: {start_str} to {end_str}")
print()

try:
    bars = fetch_bars_full(
        symbol, 
        start_str, 
        end_str, 
        timeframe,
        api_key=os.environ['ALPACA_KEY_ID'],
        api_secret=os.environ['ALPACA_SECRET_KEY']
    )
    
    if bars and bars.get('close'):
        print(f"✅ SUCCESS - Retrieved {len(bars['close'])} bars")
        print()
        print("First 10 bars:")
        print("-" * 80)
        for i in range(min(10, len(bars['close']))):
            ts = bars['timestamp'][i] if 'timestamp' in bars else f"Bar {i+1}"
            print(f"  {ts}")
            print(f"    O: ${bars['open'][i]:.2f}  H: ${bars['high'][i]:.2f}  L: ${bars['low'][i]:.2f}  C: ${bars['close'][i]:.2f}  V: {bars['volume'][i]:,}")
        print()
        print(f"Latest close: ${bars['close'][-1]:.2f}")
    else:
        print("❌ No data returned")
        
except Exception as e:
    print(f"❌ ERROR: {e}")
    import traceback
    traceback.print_exc()
