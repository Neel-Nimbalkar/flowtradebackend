import requests, json, sys

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

try:
    r = requests.post('http://127.0.0.1:5000/execute_workflow_v2', json=payload, timeout=180)
    print('Status', r.status_code)
    j = r.json()
    print(json.dumps(j, indent=2))
except Exception as e:
    print('Request failed:', e)
    sys.exit(1)
