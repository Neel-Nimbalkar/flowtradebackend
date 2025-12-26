import pytest
from backtest_core import run_backtest
from workflow_engine import WorkflowEngine


def compute_wilder_rsi(prices, period=14):
    # port of the TS implementation (Wilder smoothing)
    n = len(prices)
    rsi = [float('nan')] * n
    if n <= period:
        return rsi
    deltas = [0.0] * n
    for i in range(1, n):
        deltas[i] = prices[i] - prices[i - 1]

    gain = 0.0
    loss = 0.0
    for i in range(1, period + 1):
        d = deltas[i]
        if d > 0:
            gain += d
        else:
            loss += abs(d)
    gain /= period
    loss /= period

    def rs(g, l):
        return 100.0 if l == 0 else (g / l)

    rsi[period] = 100.0 - 100.0 / (1.0 + rs(gain, loss))
    for i in range(period + 1, n):
        d = deltas[i]
        g = d if d > 0 else 0.0
        l = abs(d) if d < 0 else 0.0
        gain = (gain * (period - 1) + g) / period
        loss = (loss * (period - 1) + l) / period
        r = rs(gain, loss)
        rsi[i] = 100.0 - 100.0 / (1.0 + r)
    return rsi


def test_rsi_triggers_oversold():
    # craft prices that drop to produce low RSI
    prices = [100.0 - (i * 0.5) for i in range(30)]  # steadily falling
    # make a small uptick at the end to ensure a compute point
    prices[-1] += 0.2

    bars = {
        'open': prices,
        'high': prices,
        'low': prices,
        'close': prices,
        'volume': [1000 + i for i in range(len(prices))],
        'timestamp': [f"2025-11-25T00:{i:02d}:00Z" for i in range(len(prices))]
    }

    rsi_series = compute_wilder_rsi(prices, period=14)

    engine = WorkflowEngine()
    # define a single RSI block that treats oversold < 30 as buy
    blocks = [
        {'id': 1, 'type': 'rsi', 'params': {'threshold_low': 30, 'rsi_condition': 'oversold'}}
    ]

    # create iterator of latest_with_rsi values matching bars order
    latest_list = []
    for i in range(len(prices)):
        latest = {'open': prices[i], 'high': prices[i], 'low': prices[i], 'close': prices[i], 'volume': 1000 + i}
        # attach rsi value if available
        if i < len(rsi_series) and not (rsi_series[i] != rsi_series[i]):  # not NaN
            latest['rsi'] = rsi_series[i]
        latest_list.append(latest)

    # make a generator to supply latest data sequentially
    it = iter(latest_list)

    def execute_fn(workflow_blocks, latest):
        # ignore provided latest; use precomputed with RSI
        try:
            l = next(it)
        except StopIteration:
            l = latest
        res = engine.execute_workflow(workflow_blocks, l)
        return res

    result = run_backtest('MOCK', '1Min', bars, blocks, execute_fn, initial_cash=10000.0)

    # Expect at least one buy signal because prices fell and RSI should be low
    assert isinstance(result, dict)
    assert 'signals' in result
    assert any(s['signal'] == 'BUY' for s in result['signals']), "Expected at least one BUY signal from RSI oversold"
