"""Fetch NVDA daily data for the last week using Alpaca API.

Displays a clean table showing OHLCV data for each trading day.
"""
import datetime as dt
import os
import sys

import requests
from tabulate import tabulate


def fetch_nvda_week_data():
    key_id = os.environ.get("ALPACA_KEY_ID")
    secret_key = os.environ.get("ALPACA_SECRET_KEY")
    
    if not key_id or not secret_key:
        print("❌ Set ALPACA_KEY_ID and ALPACA_SECRET_KEY environment variables")
        sys.exit(1)
    
    end = dt.datetime.now(dt.UTC)
    start = end - dt.timedelta(days=7)
    
    url = "https://data.alpaca.markets/v2/stocks/NVDA/bars"
    params = {
        "timeframe": "1Day",
        "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "adjustment": "raw",
        "limit": 10,
        "feed": "iex",
    }
    
    headers = {
        "APCA-API-KEY-ID": key_id,
        "APCA-API-SECRET-KEY": secret_key,
    }
    
    print("=" * 80)
    print("📊 NVDA - Last Week Daily Data")
    print("=" * 80)
    
    response = requests.get(url, params=params, headers=headers, timeout=10)
    if response.status_code != 200:
        print(f"❌ API Error {response.status_code}: {response.text}")
        sys.exit(1)
    
    data = response.json()
    bars = data.get("bars", [])
    
    if not bars:
        print("❌ No data returned")
        return
    
    # Format data for table
    table_data = []
    for bar in bars:
        date = dt.datetime.fromisoformat(bar["t"].replace("Z", "+00:00")).strftime("%Y-%m-%d")
        open_price = f"${bar['o']:.2f}"
        high_price = f"${bar['h']:.2f}"
        low_price = f"${bar['l']:.2f}"
        close_price = f"${bar['c']:.2f}"
        volume = f"{bar['v']:,.0f}"
        
        # Calculate daily change
        change = bar['c'] - bar['o']
        change_pct = (change / bar['o']) * 100
        change_str = f"{change:+.2f} ({change_pct:+.2f}%)"
        
        table_data.append([date, open_price, high_price, low_price, close_price, volume, change_str])
    
    headers = ["Date", "Open", "High", "Low", "Close", "Volume", "Change"]
    
    print(tabulate(table_data, headers=headers, tablefmt="pretty"))
    print(f"\n✅ Fetched {len(bars)} trading days")
    print("=" * 80)


if __name__ == "__main__":
    try:
        fetch_nvda_week_data()
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
