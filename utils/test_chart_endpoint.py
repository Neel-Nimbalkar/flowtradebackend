"""Test the /price_history endpoint to diagnose chart visibility issues"""
import requests
import json

# Test 1: Check if backend is running
print("=" * 80)
print("TEST 1: Checking if backend server is running...")
print("=" * 80)
try:
    response = requests.get('http://localhost:5000/health', timeout=2)
    if response.ok:
        print("✅ Backend is running")
        print(f"   Response: {response.json()}")
    else:
        print(f"❌ Backend returned error: {response.status_code}")
except Exception as e:
    print(f"❌ Cannot connect to backend: {e}")
    print("   Make sure to run: python -m backendapi.api.backend")
    exit(1)

print()

# Test 2: Try to fetch price history without credentials
print("=" * 80)
print("TEST 2: Fetching price history without credentials (should fail gracefully)")
print("=" * 80)
try:
    response = requests.get('http://localhost:5000/price_history', params={
        'symbol': 'SPY',
        'timeframe': '1h',
        'limit': '10'
    }, timeout=5)
    
    print(f"Status: {response.status_code}")
    data = response.json()
    print(f"Response: {json.dumps(data, indent=2)}")
    
    if 'bars' in data and len(data['bars']) > 0:
        print(f"✅ Got {len(data['bars'])} bars (using environment credentials)")
    elif 'error' in data:
        print(f"⚠️ Error (expected without credentials): {data['error']}")
    else:
        print("⚠️ No bars returned (credentials may be required)")
        
except Exception as e:
    print(f"❌ Request failed: {e}")

print()

# Test 3: Show what the frontend needs to do
print("=" * 80)
print("TEST 3: Frontend Integration Requirements")
print("=" * 80)
print("""
To make the chart visible in the browser:

1. Open workflow_builder.html in Chrome
2. Add an 'Alpaca Data' block to your workflow
3. Click the gear icon on the Alpaca Data block
4. Enter your Alpaca API credentials:
   - Alpaca Key ID: YOUR_KEY_HERE
   - Alpaca Secret Key: YOUR_SECRET_HERE
5. Select a symbol (e.g., SPY, AAPL, NVDA)
6. Click 'Run Strategy' button

The chart should appear in the bottom drawer showing:
- Real-time price line graph
- Latest price and % change
- Hover tooltips on price points
- Time axis labels

If the chart doesn't appear:
- Check browser console (F12) for errors
- Verify backend is running (python -m backendapi.api.backend)
- Confirm Alpaca credentials are entered correctly
- Make sure the symbol exists and markets are open (or use historical data)
""")
