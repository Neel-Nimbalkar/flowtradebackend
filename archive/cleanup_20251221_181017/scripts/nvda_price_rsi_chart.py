"""NVDA Price & RSI Chart using Alpaca historical data + TradingView RSI.

Creates a dual-panel chart with price on top and RSI indicator on bottom.
"""
import datetime as dt
import os
import sys

import requests
from tradingview_screener import Query, col
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
import matplotlib.dates as mdates


def fetch_alpaca_bars(days=7):
    """Fetch NVDA bars from Alpaca."""
    key_id = os.environ.get("ALPACA_KEY_ID")
    secret_key = os.environ.get("ALPACA_SECRET_KEY")
    
    if not key_id or not secret_key:
        raise RuntimeError("Set ALPACA_KEY_ID and ALPACA_SECRET_KEY")
    
    end = dt.datetime.now(dt.UTC)
    start = end - dt.timedelta(days=days)
    
    url = "https://data.alpaca.markets/v2/stocks/NVDA/bars"
    params = {
        "timeframe": "1Hour",
        "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "adjustment": "raw",
        "limit": 200,
        "feed": "iex",
    }
    
    headers = {
        "APCA-API-KEY-ID": key_id,
        "APCA-API-SECRET-KEY": secret_key,
    }
    
    response = requests.get(url, params=params, headers=headers, timeout=10)
    response.raise_for_status()
    
    data = response.json()
    bars = data.get("bars", [])
    if not bars:
        raise RuntimeError("No bars returned")
    
    return bars


def calculate_rsi(closes, period=14):
    """Calculate RSI manually from closing prices."""
    if len(closes) < period + 1:
        return [50.0] * len(closes)
    
    deltas = [closes[i] - closes[i-1] for i in range(1, len(closes))]
    gains = [d if d > 0 else 0 for d in deltas]
    losses = [-d if d < 0 else 0 for d in deltas]
    
    rsi_values = [50.0]  # First value neutral
    
    # Initial average
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    
    for i in range(period, len(deltas)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        
        if avg_loss == 0:
            rsi = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi = 100 - (100 / (1 + rs))
        
        rsi_values.append(rsi)
    
    return rsi_values


def calculate_ema(closes, period):
    """Calculate EMA (Exponential Moving Average)."""
    if len(closes) < period:
        return [None] * len(closes)
    
    ema_values = [None] * (period - 1)
    
    # Initial SMA for first EMA value
    sma = sum(closes[:period]) / period
    ema_values.append(sma)
    
    multiplier = 2 / (period + 1)
    
    for i in range(period, len(closes)):
        ema = (closes[i] - ema_values[-1]) * multiplier + ema_values[-1]
        ema_values.append(ema)
    
    return ema_values


def create_price_rsi_chart(bars, output_path):
    """Create dual-panel chart: price + RSI."""
    dates = [dt.datetime.fromisoformat(bar["t"].replace("Z", "+00:00")) for bar in bars]
    closes = [bar["c"] for bar in bars]
    highs = [bar["h"] for bar in bars]
    lows = [bar["l"] for bar in bars]
    
    # Calculate indicators
    rsi_values = calculate_rsi(closes)
    ema20 = calculate_ema(closes, 20)
    ema50 = calculate_ema(closes, 50)
    
    # Pad RSI to match dates length
    while len(rsi_values) < len(dates):
        rsi_values.insert(0, 50.0)
    
    # Setup dark theme
    plt.style.use("dark_background")
    fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(13, 8), height_ratios=[3, 1], constrained_layout=True)
    
    # Panel 1: Price Chart with EMAs (clean lines, no fills)
    ax1.plot(dates, closes, color="#3b82f6", linewidth=2.5, alpha=0.98, label="Close", zorder=3)
    
    # Plot EMAs
    if len([v for v in ema20 if v is not None]) > 0:
        ax1.plot(dates, ema20, color="#f59e0b", linewidth=2.0, alpha=0.90, label="EMA 20", linestyle="-", zorder=2)
    if len([v for v in ema50 if v is not None]) > 0:
        ax1.plot(dates, ema50, color="#8b5cf6", linewidth=2.0, alpha=0.90, label="EMA 50", linestyle="-", zorder=2)
    
    ax1.set_title("NVDA Price & RSI - 1 Hour Bars (Last Week)", color="#f8fafc", fontsize=15, pad=18, fontweight=600)
    ax1.set_ylabel("Price (USD)", color="#cbd5e1", fontsize=12, fontweight=500)
    ax1.grid(True, which="major", color="#1e293b", linestyle="-", linewidth=0.8, alpha=0.5)
    ax1.tick_params(colors="#94a3b8", labelsize=10)
    ax1.yaxis.set_major_formatter(FuncFormatter(lambda x, _: f"${x:,.0f}"))
    
    # Auto-scale y-axis to price range with 2% padding for better visibility
    all_prices = closes + highs + lows
    if ema20:
        all_prices.extend([v for v in ema20 if v is not None])
    if ema50:
        all_prices.extend([v for v in ema50 if v is not None])
    
    price_min = min(all_prices)
    price_max = max(all_prices)
    price_range = price_max - price_min
    ax1.set_ylim(price_min - price_range * 0.02, price_max + price_range * 0.02)
    
    ax1.legend(loc="upper left", fontsize=10, framealpha=0.95, edgecolor="#334155")
    ax1.set_facecolor("#0a0f1a")
    
    # Panel 2: RSI Chart (clean blue line)
    ax2.plot(dates, rsi_values, color="#3b82f6", linewidth=2.3, label="RSI (14)", zorder=3)
    ax2.axhline(70, color="#ef4444", linestyle="-", linewidth=1.5, alpha=0.7, label="Overbought (70)")
    ax2.axhline(30, color="#10b981", linestyle="-", linewidth=1.5, alpha=0.7, label="Oversold (30)")
    ax2.axhline(50, color="#475569", linestyle=":", linewidth=1.0, alpha=0.5)
    ax2.fill_between(dates, 30, 70, color="#1e293b", alpha=0.25)
    
    ax2.set_ylabel("RSI", color="#cbd5e1", fontsize=12, fontweight=500)
    ax2.set_xlabel("Date/Time", color="#cbd5e1", fontsize=12, labelpad=12, fontweight=500)
    ax2.set_ylim(0, 100)
    ax2.grid(True, which="major", color="#1e293b", linestyle="-", linewidth=0.8, alpha=0.5)
    ax2.tick_params(colors="#94a3b8", labelsize=10)
    ax2.legend(loc="upper left", fontsize=9, framealpha=0.95, edgecolor="#334155")
    ax2.set_facecolor("#0a0f1a")
    
    # Format x-axis dates
    ax2.xaxis.set_major_formatter(mdates.DateFormatter("%m/%d %H:%M"))
    ax2.xaxis.set_major_locator(mdates.AutoDateLocator())
    plt.setp(ax2.xaxis.get_majorticklabels(), rotation=45, ha='right')
    
    fig.patch.set_facecolor("#000000")
    
    # Save and show
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    plt.savefig(output_path, dpi=160, bbox_inches='tight')
    print(f"✅ Chart saved to {output_path}")
    
    plt.show()


def main():
    print("=" * 80)
    print("📊 Generating NVDA Price & RSI Chart")
    print("=" * 80)
    
    print("🔄 Fetching 1-hour bars from Alpaca...")
    bars = fetch_alpaca_bars(days=7)
    print(f"✅ Fetched {len(bars)} bars")
    
    output_path = os.path.join(
        os.path.dirname(__file__), 
        "..", 
        "outputs", 
        "nvda_price_rsi_chart.png"
    )
    output_path = os.path.abspath(output_path)
    
    print("📈 Creating dual-panel chart...")
    create_price_rsi_chart(bars, output_path)
    
    print("=" * 80)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
