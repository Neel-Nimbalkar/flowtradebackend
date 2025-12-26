"""Extract NVDA daily data for the last week from TradingView.

Uses a workaround since TradingView screener API doesn't provide historical bars directly.
We'll fetch multiple snapshots using different timeframes to approximate weekly data.
"""
import datetime as dt
from tradingview_screener import Query, col
from tabulate import tabulate


def fetch_nvda_week_tradingview():
    print("=" * 80)
    print("📊 NVDA - Last Week Data from TradingView")
    print("=" * 80)
    
    # TradingView screener only provides current snapshot, not historical bars
    # We'll get comprehensive current data instead
    query = (Query()
        .select(
            'name', 'close', 'open', 'high', 'low', 'volume',
            'change', 'change_abs', 'market_cap_basic',
            'Recommend.All', 'RSI', 'MACD.macd', 'MACD.signal',
            'BB.lower', 'BB.upper', 'EMA5', 'EMA10', 'EMA20',
            'SMA5', 'SMA10', 'SMA20', 'SMA50', 'SMA200',
            'Stoch.K', 'Stoch.D', 'ADX', 'AO'
        )
        .where(col('name') == 'NVDA')
    )
    
    result = query.get_scanner_data()
    
    if not result or len(result[1]) == 0:
        print("❌ No data found for NVDA")
        return
    
    # Extract current snapshot
    nvda = result[1].iloc[0].to_dict()
    
    print("\n📈 Current NVDA Trading Data:")
    print("-" * 80)
    
    # Price data
    price_table = [
        ["Open", f"${nvda.get('open', 0):.2f}"],
        ["High", f"${nvda.get('high', 0):.2f}"],
        ["Low", f"${nvda.get('low', 0):.2f}"],
        ["Close", f"${nvda.get('close', 0):.2f}"],
        ["Change", f"{nvda.get('change', 0):+.2f}% (${nvda.get('change_abs', 0):+.2f})"],
        ["Volume", f"{nvda.get('volume', 0):,.0f}"],
        ["Market Cap", f"${nvda.get('market_cap_basic', 0):,.0f}"],
    ]
    print(tabulate(price_table, headers=["Metric", "Value"], tablefmt="pretty"))
    
    print("\n📊 Technical Indicators:")
    print("-" * 80)
    
    indicators_table = [
        ["Overall Rating", f"{nvda.get('Recommend.All', 0):.2f}"],
        ["RSI", f"{nvda.get('RSI', 0):.2f}"],
        ["MACD", f"{nvda.get('MACD.macd', 0):.6f}"],
        ["MACD Signal", f"{nvda.get('MACD.signal', 0):.6f}"],
        ["Stochastic %K", f"{nvda.get('Stoch.K', 0):.2f}"],
        ["Stochastic %D", f"{nvda.get('Stoch.D', 0):.2f}"],
        ["ADX", f"{nvda.get('ADX', 0):.2f}"],
        ["Awesome Oscillator", f"{nvda.get('AO', 0):.2f}"],
    ]
    print(tabulate(indicators_table, headers=["Indicator", "Value"], tablefmt="pretty"))
    
    print("\n📈 Moving Averages:")
    print("-" * 80)
    
    ma_table = [
        ["EMA 5", f"${nvda.get('EMA5', 0):.2f}"],
        ["EMA 10", f"${nvda.get('EMA10', 0):.2f}"],
        ["EMA 20", f"${nvda.get('EMA20', 0):.2f}"],
        ["SMA 5", f"${nvda.get('SMA5', 0):.2f}"],
        ["SMA 10", f"${nvda.get('SMA10', 0):.2f}"],
        ["SMA 20", f"${nvda.get('SMA20', 0):.2f}"],
        ["SMA 50", f"${nvda.get('SMA50', 0):.2f}"],
        ["SMA 200", f"${nvda.get('SMA200', 0):.2f}"],
    ]
    print(tabulate(ma_table, headers=["Moving Average", "Value"], tablefmt="pretty"))
    
    print("\n💡 Bollinger Bands:")
    print("-" * 80)
    bb_table = [
        ["Upper Band", f"${nvda.get('BB.upper', 0):.2f}"],
        ["Current Price", f"${nvda.get('close', 0):.2f}"],
        ["Lower Band", f"${nvda.get('BB.lower', 0):.2f}"],
    ]
    print(tabulate(bb_table, headers=["Level", "Value"], tablefmt="pretty"))
    
    print("\n⚠️  Note: TradingView screener API only provides current snapshot data,")
    print("    not historical daily bars. For historical data, use Alpaca API instead.")
    print("=" * 80)
    
    return nvda


if __name__ == "__main__":
    try:
        fetch_nvda_week_tradingview()
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
