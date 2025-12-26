"""
Quick harness to run `run_backtest` with a mock execute function for deterministic testing.
Run with: `python -m tests.debug_backtest_core` or `python tests/debug_backtest_core.py`
"""
from backtest_core import run_backtest


class MockResp:
    def __init__(self, success: bool, final_decision: str = None):
        self.success = success
        self.final_decision = final_decision


def mock_execute(workflow, latest):
    # Simple rule: if close is greater than open -> CONFIRMED (buy);
    # if close is lower than open -> REJECTED (sell/close)
    c = latest.get('close')
    o = latest.get('open')
    if c is None or o is None:
        return MockResp(False, None)
    if c > o:
        return MockResp(True, 'CONFIRMED')
    if c < o:
        return MockResp(True, 'REJECTED')
    return MockResp(False, None)


def make_bars(n=20, start_price=100.0, step=0.5):
    opens = []
    highs = []
    lows = []
    closes = []
    vols = []
    ts = []
    p = start_price
    from datetime import datetime, timedelta
    t0 = datetime.utcnow()
    for i in range(n):
        o = p
        c = p + (step if i % 2 == 0 else -step)
        h = max(o, c) + 0.1
        l = min(o, c) - 0.1
        v = 1000 + i * 10
        opens.append(o)
        highs.append(h)
        lows.append(l)
        closes.append(c)
        vols.append(v)
        ts.append((t0 + timedelta(minutes=i)).isoformat() + 'Z')
        p = c
    return {'open': opens, 'high': highs, 'low': lows, 'close': closes, 'volume': vols, 'timestamp': ts}


def main():
    bars = make_bars(40, start_price=100.0, step=1.0)
    workflow = []
    res = run_backtest('MOCK', '1Min', bars, workflow, mock_execute, initial_cash=10000.0)
    print('Result metrics:', res['metrics'])
    print('Trades:', res['trades'])
    print('Equity last:', res['equity_curve'][-1] if res['equity_curve'] else None)


if __name__ == '__main__':
    main()
