"""Combined NVDA Report: Alpaca Historical Data + TradingView Technical Analysis

Fetches NVDA weekly OHLCV bars from Alpaca and enriches with TradingView indicators.
"""
import datetime as dt
import os
import sys

import requests
from tradingview_screener import Query, col
from tabulate import tabulate


def fetch_alpaca_week_data():
    """Fetch NVDA daily bars from Alpaca for the last week."""
    key_id = os.environ.get("ALPACA_KEY_ID")
    secret_key = os.environ.get("ALPACA_SECRET_KEY")
    
    if not key_id or not secret_key:
        print("❌ Set ALPACA_KEY_ID and ALPACA_SECRET_KEY environment variables")
        return None
    
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
    
    response = requests.get(url, params=params, headers=headers, timeout=10)
    if response.status_code != 200:
        print(f"❌ Alpaca API Error {response.status_code}: {response.text}")
        return None
    
    data = response.json()
    return data.get("bars", [])


def fetch_tradingview_data():
    """Fetch current NVDA snapshot with technical indicators from TradingView."""
    query = (Query()
        .select(
            'name', 'close', 'open', 'high', 'low', 'volume',
            'change', 'change_abs', 'market_cap_basic',
            'Recommend.All', 'RSI', 'MACD.macd', 'MACD.signal',
            'BB.lower', 'BB.upper', 'EMA5', 'EMA10', 'EMA20',
            'SMA5', 'SMA10', 'SMA20', 'SMA50', 'SMA200',
            'Stoch.K', 'Stoch.D', 'ADX', 'AO', 'ATR'
        )
        .where(col('name') == 'NVDA')
    )
    
    result = query.get_scanner_data()
    
    if not result or len(result[1]) == 0:
        print("❌ TradingView: No data found for NVDA")
        return None
    
    return result[1].iloc[0].to_dict()


def generate_combined_report():
    """Generate comprehensive NVDA report with both data sources."""
    print("=" * 90)
    print("📊 COMPREHENSIVE NVDA REPORT")
    print("=" * 90)
    
    # Fetch Alpaca historical data
    print("\n🔄 Fetching historical data from Alpaca...")
    bars = fetch_alpaca_week_data()
    
    # Fetch TradingView indicators
    print("🔄 Fetching technical indicators from TradingView...")
    tv_data = fetch_tradingview_data()
    
    if not bars and not tv_data:
        print("❌ Failed to fetch data from both sources")
        return
    
    # Section 1: Historical Price Data (Alpaca)
    if bars:
        print("\n" + "=" * 90)
        print("📅 HISTORICAL PRICE DATA (Last Week)")
        print("=" * 90)
        
        table_data = []
        for bar in bars:
            date = dt.datetime.fromisoformat(bar["t"].replace("Z", "+00:00")).strftime("%Y-%m-%d")
            open_price = f"${bar['o']:.2f}"
            high_price = f"${bar['h']:.2f}"
            low_price = f"${bar['l']:.2f}"
            close_price = f"${bar['c']:.2f}"
            volume = f"{bar['v']:,.0f}"
            
            change = bar['c'] - bar['o']
            change_pct = (change / bar['o']) * 100
            change_str = f"{change:+.2f} ({change_pct:+.2f}%)"
            
            table_data.append([date, open_price, high_price, low_price, close_price, volume, change_str])
        
        headers = ["Date", "Open", "High", "Low", "Close", "Volume", "Daily Change"]
        print(tabulate(table_data, headers=headers, tablefmt="pretty"))
        
        # Calculate weekly summary
        if len(bars) > 1:
            week_open = bars[0]['o']
            week_close = bars[-1]['c']
            week_high = max(bar['h'] for bar in bars)
            week_low = min(bar['l'] for bar in bars)
            total_volume = sum(bar['v'] for bar in bars)
            week_change = week_close - week_open
            week_change_pct = (week_change / week_open) * 100
            
            print(f"\n📊 Weekly Summary:")
            summary_table = [
                ["Week Open", f"${week_open:.2f}"],
                ["Week Close", f"${week_close:.2f}"],
                ["Week High", f"${week_high:.2f}"],
                ["Week Low", f"${week_low:.2f}"],
                ["Week Change", f"{week_change:+.2f} ({week_change_pct:+.2f}%)"],
                ["Total Volume", f"{total_volume:,.0f}"],
            ]
            print(tabulate(summary_table, tablefmt="plain"))
    
    # Section 2: Current Snapshot & Technical Indicators (TradingView)
    if tv_data:
        print("\n" + "=" * 90)
        print("📈 CURRENT SNAPSHOT & TECHNICAL ANALYSIS (TradingView)")
        print("=" * 90)
        
        print("\n💰 Current Trading Data:")
        print("-" * 90)
        price_table = [
            ["Current Price", f"${tv_data.get('close', 0):.2f}"],
            ["Open", f"${tv_data.get('open', 0):.2f}"],
            ["High", f"${tv_data.get('high', 0):.2f}"],
            ["Low", f"${tv_data.get('low', 0):.2f}"],
            ["Change", f"{tv_data.get('change', 0):+.2f}% (${tv_data.get('change_abs', 0):+.2f})"],
            ["Volume", f"{tv_data.get('volume', 0):,.0f}"],
            ["Market Cap", f"${tv_data.get('market_cap_basic', 0):,.0f}"],
            ["ATR (14)", f"${tv_data.get('ATR', 0):.2f}"],
        ]
        print(tabulate(price_table, tablefmt="plain"))
        
        print("\n📊 Technical Indicators:")
        print("-" * 90)
        indicators_table = [
            ["Overall Rating", f"{tv_data.get('Recommend.All', 0):.2f}", 
             "🟢 Buy" if tv_data.get('Recommend.All', 0) > 0.5 else "🔴 Sell" if tv_data.get('Recommend.All', 0) < -0.5 else "⚪ Neutral"],
            ["RSI (14)", f"{tv_data.get('RSI', 0):.2f}",
             "🔥 Overbought" if tv_data.get('RSI', 0) > 70 else "❄️ Oversold" if tv_data.get('RSI', 0) < 30 else "⚪ Neutral"],
            ["MACD", f"{tv_data.get('MACD.macd', 0):.4f}", ""],
            ["MACD Signal", f"{tv_data.get('MACD.signal', 0):.4f}", 
             "🟢 Bullish" if tv_data.get('MACD.macd', 0) > tv_data.get('MACD.signal', 0) else "🔴 Bearish"],
            ["Stochastic %K", f"{tv_data.get('Stoch.K', 0):.2f}", ""],
            ["Stochastic %D", f"{tv_data.get('Stoch.D', 0):.2f}", ""],
            ["ADX", f"{tv_data.get('ADX', 0):.2f}",
             "💪 Strong Trend" if tv_data.get('ADX', 0) > 25 else "📊 Weak Trend"],
            ["Awesome Oscillator", f"{tv_data.get('AO', 0):.2f}", ""],
        ]
        print(tabulate(indicators_table, headers=["Indicator", "Value", "Signal"], tablefmt="pretty"))
        
        print("\n📈 Moving Averages:")
        print("-" * 90)
        current_price = tv_data.get('close', 0)
        ma_table = [
            ["EMA 5", f"${tv_data.get('EMA5', 0):.2f}", 
             "🔴 Below" if current_price < tv_data.get('EMA5', 0) else "🟢 Above"],
            ["EMA 10", f"${tv_data.get('EMA10', 0):.2f}",
             "🔴 Below" if current_price < tv_data.get('EMA10', 0) else "🟢 Above"],
            ["EMA 20", f"${tv_data.get('EMA20', 0):.2f}",
             "🔴 Below" if current_price < tv_data.get('EMA20', 0) else "🟢 Above"],
            ["SMA 5", f"${tv_data.get('SMA5', 0):.2f}",
             "🔴 Below" if current_price < tv_data.get('SMA5', 0) else "🟢 Above"],
            ["SMA 10", f"${tv_data.get('SMA10', 0):.2f}",
             "🔴 Below" if current_price < tv_data.get('SMA10', 0) else "🟢 Above"],
            ["SMA 20", f"${tv_data.get('SMA20', 0):.2f}",
             "🔴 Below" if current_price < tv_data.get('SMA20', 0) else "🟢 Above"],
            ["SMA 50", f"${tv_data.get('SMA50', 0):.2f}",
             "🔴 Below" if current_price < tv_data.get('SMA50', 0) else "🟢 Above"],
            ["SMA 200", f"${tv_data.get('SMA200', 0):.2f}",
             "🔴 Below" if current_price < tv_data.get('SMA200', 0) else "🟢 Above"],
        ]
        print(tabulate(ma_table, headers=["MA Type", "Value", "Position"], tablefmt="pretty"))
        
        print("\n💡 Bollinger Bands:")
        print("-" * 90)
        bb_upper = tv_data.get('BB.upper', 0)
        bb_lower = tv_data.get('BB.lower', 0)
        bb_position = "Upper Zone" if current_price > (bb_upper + bb_lower) / 2 + (bb_upper - bb_lower) * 0.25 else \
                      "Lower Zone" if current_price < (bb_upper + bb_lower) / 2 - (bb_upper - bb_lower) * 0.25 else \
                      "Middle Zone"
        bb_table = [
            ["Upper Band", f"${bb_upper:.2f}"],
            ["Current Price", f"${current_price:.2f}"],
            ["Lower Band", f"${bb_lower:.2f}"],
            ["Position", bb_position],
        ]
        print(tabulate(bb_table, tablefmt="plain"))
    
    print("\n" + "=" * 90)
    print("✅ Report Complete")
    print("=" * 90)


if __name__ == "__main__":
    try:
        generate_combined_report()
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
