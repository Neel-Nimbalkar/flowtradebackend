import json
from backendapi.api.backend import _build_v2_response

with open('last_response.json','r',encoding='utf-8') as f:
    v2 = json.load(f)

# Reconstruct an engine_resp-like object: take raw blocks from v2['blocks'] if available
blocks_raw = []
for b in v2.get('blocks', []):
    raw = b.get('raw')
    if raw:
        blocks_raw.append(raw)

engine_resp = {
    'final_decision': 'CONFIRMED',
    'success': True,
    'blocks': blocks_raw,
    'latest_data': v2.get('latest_data', {}),
    'bar_count': v2.get('bar_count', 0),
    'historical_bars': v2.get('historical_bars', {})
}

out = _build_v2_response(v2.get('summary',{}).get('symbol','NVDA'), v2.get('summary',{}).get('timeframe','1Min'), v2.get('summary',{}).get('lookbackDays',7), engine_resp)
print('reconstructed finalSignal:', out.get('finalSignal'))
print('engine latest_data rsi:', engine_resp['latest_data'].get('rsi'))
print('blocks_raw types:', [ (b.get('block_type'), b.get('status')) for b in blocks_raw ])
