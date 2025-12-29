import requests, json
from backendapi.api.backend import rsi

payload = {
    "symbol": "NVDA",
    "timeframe": "1Min",
    "days": 7,
    "priceType": "current",
    "alpacaKeyId": "PKUGIT3UWBKBIFEJKSATXZ6CQD",
    "alpacaSecretKey": "EzjEz5kWTSogRQvzcUfF79d2UxzozKVqDMS5gRSjsE3u",
    "workflow": [
        {"id":1,"type":"alpaca_config","params":{"keyId":"PKUGIT3UWBKBIFEJKSATXZ6CQD","secretKey":"EzjEz5kWTSogRQvzcUfF79d2UxzozKVqDMS5gRSjsE3u","symbol":"NVDA","timeframe":"1Min","priceType":"current"}},
        {"id":2,"type":"input","params":{}},
        {"id":5,"type":"signal","params":{}},
        {"id":3,"type":"rsi","params":{}}
    ]
}

r = requests.post('http://127.0.0.1:5000/execute_workflow_v2', json=payload, timeout=180)
print('Status', r.status_code)
resp = r.json()
# pull closes
closes = resp.get('historical_bars', {}).get('close', [])
latest = resp.get('latest_data', {})
price = latest.get('price')
print('latest price from server:', price)
print('len closes:', len(closes))

# compute RSI on closes
rsi_closes = rsi(closes, period=14)
# compute RSI on closes with appended current price
closes_with_current = list(closes)
if price is not None:
    closes_with_current[-1] = price
rsi_with_current = rsi(closes_with_current, period=14)

print('rsi last (no current):', rsi_closes[-1])
print('rsi last (with current override):', rsi_with_current[-1])
print('server reported rsi:', latest.get('rsi'))
# show last 10 closes
print('last 10 closes:', closes[-10:])
print('last 10 closes with current override:', closes_with_current[-10:])
print('rsi tail (no current):', rsi_closes[-10:])
print('rsi tail (with current):', rsi_with_current[-10:])

# also compute rsi on closes + appended current tick (append rather than replace)
closes_append = list(closes) + ([price] if price is not None else [])
rsi_appended = rsi(closes_append, period=14)
print('rsi last (appended):', rsi_appended[-1])
print('last 10 closes appended:', closes_append[-10:])
print('rsi tail appended:', rsi_appended[-10:])

# Dump to file
with open('last_response.json', 'w', encoding='utf-8') as f:
    json.dump(resp, f, indent=2)
print('Saved last_response.json')
