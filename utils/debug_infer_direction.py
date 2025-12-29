from backendapi.api.backend import _build_v2_response

# Craft engine_resp that mirrors execute_workflow v2 shape
engine_resp = {
    'success': True,
    'final_decision': 'CONFIRMED',
    'stop_reason': None,
    'execution_time_ms': 12.3,
    'blocks': [
        {'block_id': 1, 'block_type': 'alpaca_config', 'status': 'passed', 'message': 'cfg ok', 'data': {}},
        {'block_id': 2, 'block_type': 'input', 'status': 'passed', 'message': 'input ok', 'data': {}},
        {'block_id': 3, 'block_type': 'signal', 'status': 'passed', 'message': 'signal ok', 'data': {}},
        {'block_id': 4, 'block_type': 'rsi', 'status': 'passed', 'message': 'RSI 89.24 > 70', 'data': {'condition_met': True, 'params': {}}}
    ],
    'latest_data': {
        'price': 180.18,
        'close': 180.18,
        'rsi': 89.24460269207016,
        'volume': 1000
    },
    'bar_count': 1000,
    'historical_bars': {
        'timestamps': [1700000000000, 1700000060000],
        'open': [179, 180],
        'high': [181,181.5],
        'low':[178,179],
        'close':[179.5,180.18],
        'volume':[1000,1200]
    },
    'signals': []
}

out = _build_v2_response('NVDA', '1Min', 7, engine_resp)
print('finalSignal:', out.get('finalSignal'))
print('blocks v2:')
for b in out.get('blocks', []):
    print('-', b['id'], b['type'], b['status'], b.get('explanation'))
print('latest_data:', out.get('latest_data'))
