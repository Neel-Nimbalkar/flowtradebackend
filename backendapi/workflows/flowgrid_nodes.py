"""
flowgrid_nodes.py

Defines Node base class and indicator node implementations (EMA, RSI, MACD, BollingerBands).
Each node receives price ticks and computes incremental updates, notifying downstream
consumers via callbacks. Thread-safe and non-blocking: computations run synchronously
but are deliberately lightweight; orchestration may execute callbacks on worker threads.

All nodes expose:
  - on_price_tick(tick: dict)
  - subscribe(cb) / unsubscribe

Callbacks receive a dict: { 'node': node, 'value': <indicator output>, 'tick': tick }
"""
from typing import Callable, List, Dict, Optional
import threading
import math
import statistics


class Node:
    def __init__(self, name: str):
        self.name = name
        self._subs: Dict[str, Callable] = {}
        self._lock = threading.Lock()

    def subscribe(self, sub_id: str, cb: Callable[[dict], None]):
        with self._lock:
            self._subs[sub_id] = cb

    def unsubscribe(self, sub_id: str):
        with self._lock:
            if sub_id in self._subs:
                del self._subs[sub_id]

    def _emit(self, payload: dict):
        # call subscribers (safely copy)
        subs = None
        with self._lock:
            subs = list(self._subs.items())
        for sid, cb in subs:
            try:
                cb(payload)
            except Exception:
                # swallow exceptions to ensure one bad subscriber does not break node
                print(f'Node {self.name} subscriber {sid} callback failed')

    def on_price_tick(self, tick: dict):
        raise NotImplementedError()


class EMAIndicator(Node):
    def __init__(self, name: str, period: int = 14):
        super().__init__(name)
        self.period = period
        self.k = 2.0 / (period + 1)
        self.value: Optional[float] = None
        self.lock = threading.Lock()

    def on_price_tick(self, tick: dict):
        price = float(tick['price'])
        with self.lock:
            if self.value is None:
                self.value = price
            else:
                self.value = (price - self.value) * self.k + self.value
            out = {'node': self, 'value': self.value, 'tick': tick}
        self._emit(out)


class RSIIndicator(Node):
    def __init__(self, name: str, period: int = 14):
        super().__init__(name)
        self.period = period
        self.gains: List[float] = []
        self.losses: List[float] = []
        self.prev: Optional[float] = None
        self.avg_gain: Optional[float] = None
        self.avg_loss: Optional[float] = None
        self.lock = threading.Lock()

    def on_price_tick(self, tick: dict):
        price = float(tick['price'])
        with self.lock:
            if self.prev is None:
                self.prev = price
                return
            delta = price - self.prev
            self.prev = price
            gain = max(delta, 0.0)
            loss = max(-delta, 0.0)
            self.gains.append(gain)
            self.losses.append(loss)
            if len(self.gains) > self.period:
                self.gains.pop(0)
                self.losses.pop(0)

            if self.avg_gain is None:
                if len(self.gains) < self.period:
                    return
                self.avg_gain = sum(self.gains) / self.period
                self.avg_loss = sum(self.losses) / self.period
            else:
                self.avg_gain = (self.avg_gain * (self.period - 1) + gain) / self.period
                self.avg_loss = (self.avg_loss * (self.period - 1) + loss) / self.period

            rs = (self.avg_gain / self.avg_loss) if (self.avg_loss and self.avg_loss > 0) else (float('inf') if self.avg_gain and self.avg_gain > 0 else 0.0)
            rsi = 100.0 - (100.0 / (1.0 + rs)) if rs != float('inf') else 100.0
            out = {'node': self, 'value': rsi, 'tick': tick}
        self._emit(out)


class MACDIndicator(Node):
    def __init__(self, name: str, fast=12, slow=26, signal=9):
        super().__init__(name)
        self.ema_fast = EMAIndicator(name + '.ema_fast', period=fast)
        self.ema_slow = EMAIndicator(name + '.ema_slow', period=slow)
        self.signal_period = signal
        self.macd_value: Optional[float] = None
        self.signal_value: Optional[float] = None
        self.hist: Optional[float] = None
        # subscribe internally to EMAs
        self.ema_fast.subscribe('macd_fast', lambda p: self._on_fast(p))
        self.ema_slow.subscribe('macd_slow', lambda p: self._on_slow(p))
        self.lock = threading.Lock()
        self._fast_v = None
        self._slow_v = None
        self._signal_k = 2.0 / (signal + 1)

    def _on_fast(self, payload):
        self._fast_v = payload['value']
        self._try_emit(payload['tick'])

    def _on_slow(self, payload):
        self._slow_v = payload['value']
        self._try_emit(payload['tick'])

    def _try_emit(self, tick):
        with self.lock:
            if self._fast_v is None or self._slow_v is None:
                return
            macd = self._fast_v - self._slow_v
            if self.signal_value is None:
                self.signal_value = macd
            else:
                self.signal_value = (macd - self.signal_value) * self._signal_k + self.signal_value
            hist = macd - self.signal_value
            self.macd_value = macd
            self.hist = hist
            out = {'node': self, 'value': {'macd': macd, 'signal': self.signal_value, 'hist': hist}, 'tick': tick}
        self._emit(out)

    def on_price_tick(self, tick: dict):
        # forward tick to EMAs
        self.ema_fast.on_price_tick(tick)
        self.ema_slow.on_price_tick(tick)


class BollingerBands(Node):
    def __init__(self, name: str, period=20, num_std=2.0):
        super().__init__(name)
        self.period = period
        self.num_std = num_std
        self.prices: List[float] = []
        self.lock = threading.Lock()

    def on_price_tick(self, tick: dict):
        price = float(tick['price'])
        with self.lock:
            self.prices.append(price)
            if len(self.prices) > self.period:
                self.prices.pop(0)
            if len(self.prices) < self.period:
                return
            ma = sum(self.prices) / len(self.prices)
            variance = sum((p - ma) ** 2 for p in self.prices) / len(self.prices)
            sd = math.sqrt(variance)
            upper = ma + self.num_std * sd
            lower = ma - self.num_std * sd
            out = {'node': self, 'value': {'upper': upper, 'middle': ma, 'lower': lower}, 'tick': tick}
        self._emit(out)
