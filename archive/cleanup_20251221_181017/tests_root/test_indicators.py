import time
from flowgrid_nodes import EMAIndicator, RSIIndicator, MACDIndicator, BollingerBands


def test_ema_simple():
    ema = EMAIndicator('ema_test', period=3)
    results = []
    ema.subscribe('t1', lambda p: results.append(p['value']))
    series = [10, 11, 12, 13, 14]
    for v in series:
        ema.on_price_tick({'symbol': 'X', 'ts': time.time(), 'price': v})
    # last EMA should be a number and between min/max
    assert isinstance(results[-1], float)
    assert min(series) <= results[-1] <= max(series)


def test_rsi_ramp():
    rsi = RSIIndicator('rsi_test', period=3)
    out = []
    rsi.subscribe('t1', lambda p: out.append(p['value']))
    # ramp up prices -> RSI should trend high
    for v in [10, 11, 12, 13, 14, 15, 16]:
        rsi.on_price_tick({'symbol': 'X', 'ts': time.time(), 'price': v})
    assert out
    assert out[-1] > 50


def test_bollinger_basic():
    bb = BollingerBands('bb_test', period=5)
    out = []
    bb.subscribe('t1', lambda p: out.append(p['value']))
    data = [100, 101, 99, 102, 100, 103]
    for v in data:
        bb.on_price_tick({'symbol': 'X', 'ts': time.time(), 'price': v})
    assert out
    last = out[-1]
    assert 'upper' in last and 'lower' in last and 'middle' in last


def test_macd_basic():
    macd = MACDIndicator('macd_test')
    out = []
    macd.subscribe('t1', lambda p: out.append(p['value']))
    # feed a gentle increasing series
    for v in range(100, 120):
        macd.on_price_tick({'symbol': 'X', 'ts': time.time(), 'price': float(v)})
    # should have emitted macd values
    assert out
    last = out[-1]
    assert 'macd' in last and 'signal' in last and 'hist' in last
