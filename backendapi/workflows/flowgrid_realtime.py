"""
flowgrid_realtime.py

Provides a simple PriceStream manager with subscription support and auto-reconnect.
This is a lightweight, testable abstraction: it can be driven by a real data source
or by a synthetic generator (used in tests / offline demos).

API:
  PriceStream.start()
  PriceStream.stop()
  PriceStream.subscribe(symbol, callback) -> subscription_id
  PriceStream.unsubscribe(subscription_id)

Callbacks receive a dict: { 'symbol': str, 'ts': float, 'price': float }

The implementation uses a background thread to poll or produce ticks and will
attempt automatic reconnects (exponential backoff) on errors.
"""
import threading
import time
import uuid
import logging
import random
from typing import Callable, Dict

logger = logging.getLogger('flowgrid.realtime')
logger.setLevel(logging.DEBUG)
handler = logging.StreamHandler()
handler.setFormatter(logging.Formatter('[%(asctime)s] %(levelname)s %(message)s'))
logger.addHandler(handler)


class PriceStream:
    """Manage subscriptions for price updates for many symbols.

    This intentionally keeps the transport abstract. A real implementation
    could subclass PriceStream and override `_run_loop` to connect to Alpaca
    or a WebSocket feed. For demos/tests we use the built-in synthetic feeder.
    """
    def __init__(self, symbols=None, poll_interval=1.0, synthetic=True):
        self.poll_interval = poll_interval
        self._symbols = list(symbols or [])
        self._subscriptions: Dict[str, Dict] = {}  # sub_id -> {symbol, callback}
        self._lock = threading.Lock()
        self._thread = None
        self._stop = threading.Event()
        self.synthetic = synthetic
        self._state = {s: {'price': 100.0 + random.random() * 10} for s in self._symbols}

    def start(self):
        with self._lock:
            if self._thread and self._thread.is_alive():
                logger.debug('PriceStream already running')
                return
            self._stop.clear()
            self._thread = threading.Thread(target=self._run_loop, name='PriceStreamThread', daemon=True)
            logger.debug('Starting PriceStream thread')
            self._thread.start()

    def stop(self):
        self._stop.set()
        t = None
        with self._lock:
            t = self._thread
        if t:
            logger.debug('Stopping PriceStream thread...')
            t.join(timeout=2)
            logger.debug('PriceStream stopped')

    def subscribe(self, symbol: str, callback: Callable[[dict], None]):
        sub_id = str(uuid.uuid4())
        with self._lock:
            self._subscriptions[sub_id] = {'symbol': symbol, 'cb': callback}
            if symbol not in self._symbols:
                self._symbols.append(symbol)
                # initialize state
                self._state.setdefault(symbol, {'price': 100.0 + random.random() * 10})
        logger.debug('Subscribe %s -> %s', sub_id, symbol)
        return sub_id

    def unsubscribe(self, sub_id: str):
        with self._lock:
            if sub_id in self._subscriptions:
                logger.debug('Unsubscribe %s', sub_id)
                del self._subscriptions[sub_id]

    def _emit(self, tick: dict):
        # Copy subscribers under lock to avoid holding the lock while invoking callbacks
        subs = []
        with self._lock:
            for sid, info in self._subscriptions.items():
                if info['symbol'] == tick['symbol']:
                    subs.append((sid, info['cb']))

        for sid, cb in subs:
            try:
                cb(tick)
            except Exception:
                logger.exception('Subscriber %s callback failed', sid)

    def _run_loop(self):
        """Main loop: either poll a real API or generate synthetic ticks."""
        backoff = 1.0
        while not self._stop.is_set():
            try:
                if self.synthetic:
                    # generate ticks for each symbol
                    symbols = None
                    with self._lock:
                        symbols = list(self._symbols)
                    ts = time.time()
                    for s in symbols:
                        # small random walk
                        st = self._state.setdefault(s, {'price': 100.0})
                        change = (random.random() - 0.5) * 0.5
                        st['price'] = max(0.01, st['price'] * (1 + change / 100.0))
                        tick = {'symbol': s, 'ts': ts, 'price': round(st['price'], 6)}
                        self._emit(tick)
                    time.sleep(self.poll_interval)
                else:
                    # Placeholder for real-data fetching loop; sleep to avoid busy-wait
                    time.sleep(self.poll_interval)
                backoff = 1.0
            except Exception:
                logger.exception('PriceStream loop error; will retry after backoff=%s', backoff)
                # exponential backoff with jitter
                time.sleep(backoff + random.random() * 0.5)
                backoff = min(60.0, backoff * 2)


if __name__ == '__main__':
    # Quick manual smoke demo
    ps = PriceStream(symbols=['AAPL', 'NVDA'], poll_interval=0.5, synthetic=True)

    def cb(t):
        print('tick', t)

    ps.subscribe('AAPL', cb)
    ps.start()
    try:
        time.sleep(3)
    finally:
        ps.stop()
