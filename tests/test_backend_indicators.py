import math
from backend import rsi, ema, sma, compute_macd, boll_bands, vwap, stochastic, atr, obv


def approx_list(a, b, tol=1e-6):
    assert len(a) == len(b)
    for x, y in zip(a, b):
        if x is None and y is None:
            continue
        assert x is not None and y is not None
        assert abs(x - y) <= tol


# Reference implementations (straightforward) for comparison

def rsi_ref(prices, period=14):
    deltas = [prices[i] - prices[i - 1] for i in range(1, len(prices))]
    gains = [d if d > 0 else 0 for d in deltas]
    losses = [-d if d < 0 else 0 for d in deltas]
    if len(gains) < period:
        return [None] * len(prices)
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    rs_vals = []
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        if avg_loss == 0:
            rs_vals.append(100.0)
        else:
            rs = avg_gain / avg_loss
            rs_vals.append(100.0 - (100.0 / (1.0 + rs)))
    return [None] * (period + 1) + rs_vals


def ema_ref(prices, period=20):
    if len(prices) < period:
        return [None] * len(prices)
    mult = 2 / (period + 1)
    out = [None] * (period - 1)
    out.append(sum(prices[:period]) / period)
    for i in range(period, len(prices)):
        val = (prices[i] - out[-1]) * mult + out[-1]
        out.append(val)
    return out


def test_ema_matches_ref():
    prices = [i + 100.0 for i in range(30)]
    out1 = ema(prices, period=10)
    out2 = ema_ref(prices, period=10)
    approx_list(out1, out2, tol=1e-8)


def test_sma_basic():
    prices = list(range(1, 21))
    out = sma(prices, period=5)
    # last value should be average of 16..20 = 18
    assert out[-1] == 18.0


def test_rsi_matches_ref():
    prices = [100.0 + math.sin(i / 2.0) * 2.0 + i * 0.01 for i in range(60)]
    out1 = rsi(prices, period=14)
    out2 = rsi_ref(prices, period=14)
    # compare last 10 non-None values
    tail1 = [v for v in out1 if v is not None]
    tail2 = [v for v in out2 if v is not None]
    assert len(tail1) == len(tail2)
    for a, b in zip(tail1[-10:], tail2[-10:]):
        assert abs(a - b) < 1e-6


def test_macd_basic():
    prices = [100.0 + math.sin(i / 3.0) * 3.0 + i * 0.02 for i in range(100)]
    macd_line, signal_line, hist = compute_macd(prices, fast=12, slow=26, signal=9)
    # basic sanity: lengths match
    assert len(macd_line) == len(prices)
    assert len(signal_line) == len(prices)
    assert len(hist) == len(prices)
    # hist values should be floats or None
    assert any(v is not None for v in hist)


def test_bollinger_basic():
    prices = [100 + (i % 5) for i in range(30)]
    upper, middle, lower = boll_bands(prices, period=5, num_std=2)
    assert len(upper) == len(prices)
    assert upper[-1] is not None and middle[-1] is not None and lower[-1] is not None


def test_vwap_basic():
    prices = [100.0 + i * 0.1 for i in range(10)]
    vols = [100 + (i * 10) for i in range(10)]
    vals = vwap(prices, vols)
    assert len(vals) == len(prices)
    # VWAP should be between min and max prices
    assert min(prices) <= vals[-1] <= max(prices)


def test_stochastic_basic():
    highs = [10 + (i % 5) for i in range(30)]
    lows = [h - 1 for h in highs]
    closes = [l + 0.5 for l in lows]
    k, d = stochastic(highs, lows, closes, period=5, smooth_k=3, smooth_d=3)
    assert len(k) == len(closes)
    assert len(d) == len(closes)


def test_atr_obv_basic():
    highs = [10 + i * 0.1 for i in range(30)]
    lows = [9 + i * 0.1 for i in range(30)]
    closes = [9.5 + i * 0.1 for i in range(30)]
    atr_vals = atr(highs, lows, closes, period=14)
    assert len(atr_vals) == len(closes)
    obs = obv(closes, [100] * len(closes))
    assert len(obs) == len(closes)
