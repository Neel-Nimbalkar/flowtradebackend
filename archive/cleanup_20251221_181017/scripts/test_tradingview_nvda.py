"""Test TradingView API to extract NVDA stock data.

Fetches historical bars and latest quote for NVDA using tradingview-screener.
Based on: https://github.com/Mathieu2301/TradingView-API
"""
from tradingview_screener import Query, col

def fetch_nvda_tradingview():
    print("=" * 60)
    print("Fetching NVDA data from TradingView...")
    print("=" * 60)
    
    # Query NVDA using ticker column filter
    query = (Query()
        .select('name', 'close', 'volume', 'market_cap_basic', 
                'price_earnings_ttm', 'earnings_per_share_basic_ttm',
                'change', 'change_abs', 'high', 'low', 'open',
                'Recommend.All', 'RSI', 'MACD.macd', 'MACD.signal')
        .where(col('name') == 'NVDA')
    )
    
    result = query.get_scanner_data()
    
    print(f"\n🔍 Debug - Result type: {type(result)}")
    print(f"🔍 Debug - Result shape: {result[1].shape if hasattr(result, '__len__') and len(result) > 1 else 'N/A'}")
    print(f"🔍 Debug - Columns: {list(result[1].columns) if hasattr(result, '__len__') and len(result) > 1 else 'N/A'}")
    
    if not result or len(result[1]) == 0:
        print("❌ No data found for NVDA")
        return
    
    # Extract first row as dictionary
    nvda_data = result[1].iloc[0].to_dict()
    
    print("\n📊 NVDA Stock Data:")
    print("-" * 60)
    print(f"Symbol:           {nvda_data.get('name', 'N/A')}")
    print(f"Close Price:      ${nvda_data.get('close', 0):.2f}")
    print(f"Open Price:       ${nvda_data.get('open', 0):.2f}")
    print(f"High:             ${nvda_data.get('high', 0):.2f}")
    print(f"Low:              ${nvda_data.get('low', 0):.2f}")
    print(f"Change:           {nvda_data.get('change', 0):.2f}%")
    print(f"Change (abs):     ${nvda_data.get('change_abs', 0):.2f}")
    print(f"Volume:           {nvda_data.get('volume', 0):,.0f}")
    print(f"Market Cap:       ${nvda_data.get('market_cap_basic', 0):,.0f}")
    print(f"P/E Ratio:        {nvda_data.get('price_earnings_ttm', 0):.2f}")
    print(f"EPS (TTM):        ${nvda_data.get('earnings_per_share_basic_ttm', 0):.2f}")
    print("\n📈 Technical Indicators:")
    print("-" * 60)
    print(f"Overall Rating:   {nvda_data.get('Recommend.All', 0):.2f}")
    print(f"RSI:              {nvda_data.get('RSI', 0):.2f}")
    print(f"MACD:             {nvda_data.get('MACD.macd', 0):.6f}")
    print(f"MACD Signal:      {nvda_data.get('MACD.signal', 0):.6f}")
    print("\n✅ Data fetch complete!")
    print("=" * 60)
    
    return nvda_data

if __name__ == "__main__":
    try:
        fetch_nvda_tradingview()
    except Exception as e:
        print(f"❌ Error: {e}")
        import traceback
        traceback.print_exc()
