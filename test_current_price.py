"""Test current price fetching and workflow execution"""
import requests
import json
import os

# Set credentials
os.environ['ALPACA_KEY_ID'] = 'PKWK255BDE3PVZT6WUHB77TNR2'
os.environ['ALPACA_SECRET_KEY'] = 'HArLrbCW2zvoM217Nc6HxSqvpMLvHvEXdNATyznRfQY7'

def test_current_price_api():
    """Test fetching current price directly from Alpaca"""
    print("=" * 80)
    print("TEST 1: Fetch Current Price from Alpaca API")
    print("=" * 80)
    
    symbol = 'SPY'
    endpoint = f'https://data.alpaca.markets/v2/stocks/{symbol}/trades/latest'
    
    headers = {
        'APCA-API-KEY-ID': os.environ['ALPACA_KEY_ID'],
        'APCA-API-SECRET-KEY': os.environ['ALPACA_SECRET_KEY']
    }
    
    params = {'feed': 'iex'}
    
    try:
        resp = requests.get(endpoint, headers=headers, params=params, timeout=5)
        print(f"Status Code: {resp.status_code}")
        
        if resp.ok:
            data = resp.json()
            print(f"Response: {json.dumps(data, indent=2)}")
            
            trade = data.get('trade', {})
            current_price = trade.get('p')
            print(f"\n✅ Current {symbol} Price: ${current_price}")
            return current_price
        else:
            print(f"❌ Error: {resp.status_code} {resp.text}")
            return None
    except Exception as e:
        print(f"❌ Exception: {e}")
        return None

def test_workflow_with_current_price():
    """Test workflow execution with 'current' price type"""
    print("\n" + "=" * 80)
    print("TEST 2: Execute Workflow with 'current' Price Type")
    print("=" * 80)
    
    workflow_data = {
        "symbol": "SPY",
        "timeframe": "1Hour",
        "days": 7,
        "priceType": "current",
        "workflow": [
            {
                "id": "1",
                "type": "alpaca_config",
                "params": {
                    "symbol": "SPY",
                    "timeframe": "1Hour",
                    "days": "7",
                    "priceType": "current",
                    "keyId": os.environ['ALPACA_KEY_ID'],
                    "secretKey": os.environ['ALPACA_SECRET_KEY']
                }
            },
            {
                "id": "2",
                "type": "rsi",
                "params": {
                    "period": 14,
                    "overbought": 70,
                    "oversold": 30
                }
            }
        ],
        "indicator_params": {},
        "alpacaKeyId": os.environ['ALPACA_KEY_ID'],
        "alpacaSecretKey": os.environ['ALPACA_SECRET_KEY']
    }
    
    try:
        resp = requests.post(
            'http://localhost:5000/execute_workflow',
            json=workflow_data,
            timeout=30
        )
        
        print(f"Status Code: {resp.status_code}")
        
        if resp.ok:
            data = resp.json()
            print(f"\nWorkflow Response Keys: {list(data.keys())}")
            
            if 'latest_data' in data:
                latest = data['latest_data']
                print(f"\nLatest Data Keys: {list(latest.keys())}")
                print(f"\nLatest Data:")
                print(f"  Open: ${latest.get('open', 'N/A')}")
                print(f"  High: ${latest.get('high', 'N/A')}")
                print(f"  Low: ${latest.get('low', 'N/A')}")
                print(f"  Close: ${latest.get('close', 'N/A')}")
                print(f"  Price (selected type): ${latest.get('price', 'N/A')}")
                print(f"  RSI: {latest.get('rsi', 'N/A')}")
                
                if 'price' in latest:
                    print(f"\n✅ SUCCESS: 'price' field is present in latest_data")
                    print(f"   Price value: ${latest['price']:.2f}")
                else:
                    print(f"\n❌ FAILED: 'price' field is missing from latest_data")
                    
                return data
            else:
                print(f"❌ No 'latest_data' in response")
                print(f"Response: {json.dumps(data, indent=2)}")
        else:
            print(f"❌ Error: {resp.status_code}")
            print(f"Response: {resp.text}")
            
    except Exception as e:
        print(f"❌ Exception: {e}")
        import traceback
        traceback.print_exc()

def test_close_vs_current():
    """Test the difference between 'close' and 'current' price types"""
    print("\n" + "=" * 80)
    print("TEST 3: Compare 'close' vs 'current' Price Types")
    print("=" * 80)
    
    for price_type in ['close', 'current']:
        print(f"\n--- Testing with priceType='{price_type}' ---")
        
        workflow_data = {
            "symbol": "SPY",
            "timeframe": "1Hour",
            "days": 7,
            "priceType": price_type,
            "workflow": [
                {
                    "id": "1",
                    "type": "alpaca_config",
                    "params": {
                        "symbol": "SPY",
                        "timeframe": "1Hour",
                        "days": "7",
                        "priceType": price_type,
                        "keyId": os.environ['ALPACA_KEY_ID'],
                        "secretKey": os.environ['ALPACA_SECRET_KEY']
                    }
                }
            ],
            "indicator_params": {},
            "alpacaKeyId": os.environ['ALPACA_KEY_ID'],
            "alpacaSecretKey": os.environ['ALPACA_SECRET_KEY']
        }
        
        try:
            resp = requests.post(
                'http://localhost:5000/execute_workflow',
                json=workflow_data,
                timeout=30
            )
            
            if resp.ok:
                data = resp.json()
                latest = data.get('latest_data', {})
                
                close_price = latest.get('close', 0)
                price = latest.get('price', 0)
                
                print(f"  Close: ${close_price:.2f}")
                print(f"  Price: ${price:.2f}")
                print(f"  Difference: ${abs(price - close_price):.2f}")
                
                if price_type == 'current' and price != close_price:
                    print(f"  ✅ Current price differs from close (real-time data)")
                elif price_type == 'close' and price == close_price:
                    print(f"  ✅ Price matches close (as expected)")
                    
        except Exception as e:
            print(f"  ❌ Error: {e}")

if __name__ == "__main__":
    print("\n🧪 Testing Current Price Functionality\n")
    
    # Test 1: Direct API call
    current_price = test_current_price_api()
    
    # Test 2: Workflow execution with current price
    test_workflow_with_current_price()
    
    # Test 3: Compare close vs current
    test_close_vs_current()
    
    print("\n" + "=" * 80)
    print("✅ All tests completed")
    print("=" * 80)
