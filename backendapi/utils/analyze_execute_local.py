from backendapi.api.backend import app, execute_workflow
import json

req = {
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

with app.test_request_context('/execute_workflow', method='POST', json=req):
    resp = execute_workflow()
    # execute_workflow returns a Flask Response; normalize
    if isinstance(resp, tuple):
        res = resp[0]
    else:
        res = resp
    try:
        data = res.get_json()
    except Exception:
        data = str(res)
    print('--- RESPONSE JSON ---')
    print(json.dumps(data, indent=2))
