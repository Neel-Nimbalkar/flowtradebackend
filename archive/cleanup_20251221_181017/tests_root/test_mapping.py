from backend import _build_v2_response


def make_engine_resp(rsi_value=None, macd_hist=None, boll_upper=None, close=None):
    blocks = []
    if rsi_value is not None:
        blocks.append({'block_id': 1, 'block_type': 'rsi', 'status': 'passed', 'message': f'RSI {rsi_value} > 70', 'data': {'condition_met': True, 'params': {}}})
    if macd_hist is not None:
        blocks.append({'block_id': 2, 'block_type': 'macd', 'status': 'passed', 'message': 'MACD positive', 'data': {'condition_met': True}})
    if boll_upper is not None:
        blocks.append({'block_id': 3, 'block_type': 'bollinger', 'status': 'passed', 'message': 'Close above upper', 'data': {'condition_met': True}})
    latest = {}
    if rsi_value is not None:
        latest['rsi'] = rsi_value
    if macd_hist is not None:
        latest['macd_hist'] = macd_hist
    if boll_upper is not None and close is not None:
        latest['boll_upper'] = boll_upper
        latest['close'] = close

    engine = {
        'final_decision': 'CONFIRMED',
        'success': True,
        'blocks': blocks,
        'latest_data': latest,
        'bar_count': 100,
        'historical_bars': {'timestamps': [1,2,3], 'close':[1,2,3]}
    }
    return engine


def test_rsi_overbought_maps_sell():
    e = make_engine_resp(rsi_value=85.0)
    v2 = _build_v2_response('SYM','1Min',7,e)
    assert v2['finalSignal'] == 'SELL'


def test_rsi_oversold_maps_buy():
    e = make_engine_resp(rsi_value=15.0)
    v2 = _build_v2_response('SYM','1Min',7,e)
    assert v2['finalSignal'] == 'BUY'


def test_macd_positive_maps_buy():
    e = make_engine_resp(macd_hist=0.5)
    v2 = _build_v2_response('SYM','1Min',7,e)
    assert v2['finalSignal'] == 'BUY'


def test_bollinger_above_upper_maps_sell():
    e = make_engine_resp(boll_upper=100, close=105)
    v2 = _build_v2_response('SYM','1Min',7,e)
    assert v2['finalSignal'] == 'SELL'
