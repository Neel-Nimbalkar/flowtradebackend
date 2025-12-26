import time
from flowgrid_realtime import PriceStream
from flowgrid_nodes import EMAIndicator


def test_realtime_propagation():
    # Create stream and node
    ps = PriceStream(symbols=['TST'], poll_interval=0.1, synthetic=True)
    ema = EMAIndicator('ema:TST', period=3)
    seen = []
    ema.subscribe('t1', lambda p: seen.append(p['value']))

    sub_id = ps.subscribe('TST', lambda t: ema.on_price_tick(t))
    ps.start()
    try:
        time.sleep(0.7)
    finally:
        ps.unsubscribe(sub_id)
        ps.stop()

    assert len(seen) > 0
