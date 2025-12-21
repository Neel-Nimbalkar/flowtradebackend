"""
FlowGrid Trading - Backend API Server
Executes trading strategies and returns results to the browser dashboard
"""

import sys
import os

# Set UTF-8 encoding for Windows console to handle emoji characters
if sys.platform == 'win32':
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8')

from flask import Flask, request, jsonify, send_file
from flask import make_response
from flask_cors import CORS
import subprocess
import json
import re
from datetime import datetime, timedelta
import threading
import time
import random
import uuid
import logging
#from backendapi.integrations.alpaca_fetch import fetch_bars_full
from integrations.alpaca_fetch import fetch_bars_full
#from backendapi.workflows.workflow_engine import WorkflowEngine
from workflows.workflow_engine import WorkflowEngine
from typing import List, Dict, Any
from math import floor
import requests
import matplotlib
matplotlib.use('Agg')  # Use non-interactive backend
import matplotlib.pyplot as plt
from matplotlib.ticker import FuncFormatter
import matplotlib.dates as mdates
from io import BytesIO
#from backendapi.integrations.telegram_notifier import get_notifier, load_telegram_settings, save_telegram_settings
from integrations.telegram_notifier import get_notifier, load_telegram_settings, save_telegram_settings

app = Flask(__name__)
# Enable CORS for Firebase and localhost
CORS(app, origins=[
    'https://flowtrade210.web.app',
    'https://flowtrade210.firebaseapp.com',
    'http://localhost:5173',
    'http://localhost:5174',
    'http://localhost:5175',
    'http://127.0.0.1:5173'
])

# Initialize workflow engine
workflow_engine = WorkflowEngine()

# Track last sent signal per strategy to avoid spam
# Key: f"{symbol}_{timeframe}", Value: signal_type (BUY/SELL)
last_sent_signals = {}

# Setup logging
logger = logging.getLogger('flowgrid.backend')
logger.setLevel(logging.INFO)

# Data directory
current_file_dir = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(os.path.dirname(current_file_dir), 'data')

# Lightweight backtest manager (filesystem-backed) for local dev
try:
    from ..backtest.backtest_manager import get_manager
    backtest_manager = get_manager()
    print('✅ Backtest manager initialized')
except Exception as _e:
    print('⚠️ Backtest manager not available:', _e)
    backtest_manager = None

# Import indicator functions from strategy_cli
import sys
sys.path.append('.')


def _parse_time_ms(tval):
    if tval is None:
        return None
    # numeric
    if isinstance(tval, (int, float)):
        try:
            return int(tval)
        except Exception:
            return None
    # string: try numeric string first
    if isinstance(tval, str):
        s = tval.strip()
        if s.isdigit():
            try:
                return int(s)
            except Exception:
                pass
        # try float
        try:
            f = float(s)
            if not (f != f):
                return int(f)
        except Exception:
            pass
        # try ISO parse
        try:
            dt = datetime.fromisoformat(s)
            return int(dt.timestamp() * 1000)
        except Exception:
            pass
    return None


def normalize_backtest_result(raw: Dict) -> Dict:
    """Normalize a backtest result dict to a canonical shape for clients.

    Canonical fields:
      - equityCurve: [{ t: <ms|null>, v: <number> }, ...]
      - historical_bars: { close: [...], ... }
      - trades, metrics, summary preserved where possible
    """
    if not raw:
        return None
    out = dict(raw)

    # Normalize equity curve from various possible fields
    eq = []
    candidates = [raw.get('equityCurve'), raw.get('equity_curve'), raw.get('equity'), raw.get('equity_curve_points'), raw.get('equityCurvePoints')]
    for s in candidates:
        if not s or not isinstance(s, list):
            continue
        for it in s:
            if it is None:
                continue
            # primitive
            if isinstance(it, (int, float)):
                eq.append({'t': None, 'v': float(it)})
                continue
            if isinstance(it, str):
                try:
                    v = float(it)
                    eq.append({'t': None, 'v': v})
                except Exception:
                    continue
                continue
            if isinstance(it, dict):
                traw = it.get('t') or it.get('time') or it.get('timestamp') or it.get('ts') or it.get('time_ms')
                vraw = it.get('v') if 'v' in it else (it.get('value') if 'value' in it else (it.get('equity') if 'equity' in it else None))
                t = _parse_time_ms(traw)
                try:
                    v = float(vraw) if vraw is not None else None
                except Exception:
                    v = None
                if v is None or (isinstance(v, float) and (v != v)):
                    # try other keys
                    for k in it:
                        if k.lower() in ('equity', 'value', 'v', 'y', 'close', 'price'):
                            try:
                                v = float(it[k])
                                break
                            except Exception:
                                continue
                if v is None:
                    continue
                eq.append({'t': t, 'v': v})
            if eq:
                break
        out['equityCurve'] = eq

        # Normalize historical bars
        hist = raw.get('historical_bars') or raw.get('historicalBars') or raw.get('historical') or {}
        norm_hist = {}
        if isinstance(hist, dict):
            for k, val in hist.items():
                if not isinstance(val, list):
                    norm_hist[k] = val
                    continue
                if len(val) == 0:
                    norm_hist[k] = []
                    continue
                first = val[0]
                if isinstance(first, dict):
                    mapped = []
                    for it in val:
                        traw = it.get('t') or it.get('time') or it.get('timestamp') or it.get('ts')
                        vraw = it.get('v') if 'v' in it else (it.get('value') if 'value' in it else (it.get('close') if 'close' in it else None))
                        t = _parse_time_ms(traw)
                        try:
                            v = float(vraw) if vraw is not None else None
                        except Exception:
                            v = None
                        if v is None:
                            # try scanning keys
                            for kk in it:
                                if kk.lower() in ('close', 'value', 'v', 'price'):
                                    try:
                                        v = float(it[kk]); break
                                    except Exception:
                                        continue
                        if v is None:
                            continue
                        if t is not None:
                            mapped.append({'t': t, 'v': v})
                        else:
                            mapped.append(v)
                    norm_hist[k] = mapped
                else:
                    # primitives
                    vals = []
                    for x in val:
                        try:
                            n = float(x)
                            if n == n:
                                vals.append(n)
                        except Exception:
                            continue
                    norm_hist[k] = vals
        out['historical_bars'] = norm_hist

        out['trades'] = raw.get('trades') or raw.get('Trades') or out.get('trades') or []
        out['metrics'] = raw.get('metrics') or raw.get('metric') or out.get('metrics') or {}
        out['summary'] = raw.get('summary') or out.get('summary') or { 'symbol': raw.get('symbol'), 'timeframe': raw.get('timeframe') }

        return out


def fetch_current_price(symbol, api_key=None, api_secret=None):
    """Fetch the current real-time price from Alpaca."""
    try:
        endpoint = f'https://data.alpaca.markets/v2/stocks/{symbol}/trades/latest'
        api_key = api_key or os.environ.get('ALPACA_API_KEY')
        api_secret = api_secret or os.environ.get('ALPACA_API_SECRET')
        
        if not api_key or not api_secret:
            return None
        
        headers = {
            'APCA-API-KEY-ID': api_key,
            'APCA-API-SECRET-KEY': api_secret
        }
        
        params = {'feed': 'iex'}
        
        resp = requests.get(endpoint, headers=headers, params=params, timeout=5)
        if resp.ok:
            data = resp.json()
            trade = data.get('trade', {})
            return trade.get('p')  # Price
        return None
    except Exception as e:
        print(f"Error fetching current price: {e}")
        return None

def calculate_price_series(bars, price_type='close', current_price=None):
    """Calculate price series based on selected type.
    
    Args:
        bars: Dict with 'open', 'high', 'low', 'close' arrays
        price_type: 'current', 'open', 'high', 'low', 'close', 'hl2', 'hlc3', 'ohlc4'
        current_price: Real-time current price (optional, used for 'current' type)
    
    Returns:
        List of prices based on the selected type
    """
    opens = bars.get('open', [])
    highs = bars.get('high', [])
    lows = bars.get('low', [])
    closes = bars.get('close', [])
    
    if price_type == 'current':
        # For 'current', use real-time price if available, otherwise most recent close
        if current_price is not None:
            # Append current price to the close series
            return closes + [current_price]
        else:
            return closes
    elif price_type == 'open':
        return opens
    elif price_type == 'high':
        return highs
    elif price_type == 'low':
        return lows
    elif price_type == 'close':
        return closes
    elif price_type == 'hl2':
        return [(h + l) / 2 for h, l in zip(highs, lows)]
    elif price_type == 'hlc3':
        return [(h + l + c) / 3 for h, l, c in zip(highs, lows, closes)]
    elif price_type == 'ohlc4':
        return [(o + h + l + c) / 4 for o, h, l, c in zip(opens, highs, lows, closes)]
    else:
        return closes  # Default to close

def rsi(prices, period=14):
    """Calculate RSI using Wilder's smoothing"""
    deltas = [prices[i] - prices[i-1] for i in range(1, len(prices))]
    gains = [d if d > 0 else 0 for d in deltas]
    losses = [-d if d < 0 else 0 for d in deltas]
    
    if len(gains) < period:
        return [None] * len(prices)
    
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    
    rs_values = []
    for i in range(period, len(gains)):
        avg_gain = (avg_gain * (period - 1) + gains[i]) / period
        avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        # Wilder's RSI: if average loss is zero, RSI is 100 (no losses in period)
        if avg_loss == 0:
            rsi_val = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi_val = 100.0 - (100.0 / (1.0 + rs))
        rs_values.append(rsi_val)
    
    return [None] * (period + 1) + rs_values


def parse_days(value, default=7):
    """Coerce various 'days' representations into an int.

    Accepts ints, numeric strings, or strings like '5d'/'7D'. Falls back to `default` on error.
    """
    try:
        if value is None:
            return int(default)
        if isinstance(value, int):
            return value
        s = str(value).strip()
        # allow trailing 'd' or 'D' like '5d'
        if s.lower().endswith('d'):
            s = s[:-1]
        return int(s)
    except Exception:
        try:
            return int(float(value))
        except Exception:
            return int(default)

def ema(prices, period=20):
    """Calculate Exponential Moving Average"""
    if len(prices) < period:
        return [None] * len(prices)
    
    multiplier = 2 / (period + 1)
    ema_values = [None] * (period - 1)
    ema_values.append(sum(prices[:period]) / period)
    
    for i in range(period, len(prices)):
        ema_val = (prices[i] - ema_values[-1]) * multiplier + ema_values[-1]
        ema_values.append(ema_val)
    
    return ema_values

def sma(prices, period=20):
    """Calculate Simple Moving Average"""
    if len(prices) < period:
        return [None] * len(prices)
    out = []
    for i in range(len(prices)):
        if i < period - 1:
            out.append(None)
        else:
            window = prices[i - period + 1:i + 1]
            out.append(sum(window) / period)
    return out

def compute_macd(prices, fast=12, slow=26, signal=9):
    """Calculate MACD with signal line and histogram"""
    ema_fast = ema(prices, fast)
    ema_slow = ema(prices, slow)
    
    macd_line = []
    for i in range(len(prices)):
        if ema_fast[i] is not None and ema_slow[i] is not None:
            macd_line.append(ema_fast[i] - ema_slow[i])
        else:
            macd_line.append(None)
    
    signal_line = ema([m for m in macd_line if m is not None], signal)
    signal_line = [None] * (len(macd_line) - len(signal_line)) + signal_line
    
    histogram = []
    for i in range(len(macd_line)):
        if macd_line[i] is not None and signal_line[i] is not None:
            histogram.append(macd_line[i] - signal_line[i])
        else:
            histogram.append(None)
    
    return macd_line, signal_line, histogram

def vwap(prices, volumes):
    """Calculate VWAP"""
    cumulative_pv = 0
    cumulative_vol = 0
    vwap_values = []
    
    for i in range(len(prices)):
        cumulative_pv += prices[i] * volumes[i]
        cumulative_vol += volumes[i]
        vwap_values.append(cumulative_pv / cumulative_vol if cumulative_vol > 0 else None)
    
    return vwap_values

def boll_bands(prices, period=20, num_std=2):
    """Calculate Bollinger Bands"""
    if len(prices) < period:
        return [None] * len(prices), [None] * len(prices), [None] * len(prices)
    
    upper, middle, lower = [], [], []
    
    for i in range(len(prices)):
        if i < period - 1:
            upper.append(None)
            middle.append(None)
            lower.append(None)
        else:
            window = prices[i - period + 1:i + 1]
            sma = sum(window) / period
            variance = sum((x - sma) ** 2 for x in window) / period
            std = variance ** 0.5
            
            upper.append(sma + num_std * std)
            middle.append(sma)
            lower.append(sma - num_std * std)
    
    return upper, middle, lower

def atr(highs, lows, closes, period=14):
    """Calculate Average True Range"""
    tr_values = []
    for i in range(len(closes)):
        if i == 0:
            tr = highs[i] - lows[i]
        else:
            tr = max(
                highs[i] - lows[i],
                abs(highs[i] - closes[i - 1]),
                abs(lows[i] - closes[i - 1])
            )
        tr_values.append(tr)
    
    if len(tr_values) < period:
        return [None] * len(closes)
    
    atr_vals = [None] * (period - 1)
    atr_vals.append(sum(tr_values[:period]) / period)
    
    for i in range(period, len(tr_values)):
        atr_val = (atr_vals[-1] * (period - 1) + tr_values[i]) / period
        atr_vals.append(atr_val)
    
    return atr_vals

# --- Helper: map short timeframe tokens to Alpaca API timeframe strings ---
TIMEFRAME_MAP = {
    '1m': '1Min',
    '5m': '5Min',
    '15m': '15Min',
    '30m': '30Min',
    '1h': '1Hour',
    '4h': '4Hour',
    '1d': '1Day'
}

def normalize_timeframe(tf: str) -> str:
    if not tf:
        return '1Hour'
    tf = tf.strip()
    return TIMEFRAME_MAP.get(tf.lower(), tf)

@app.route('/price_history', methods=['GET'])
def price_history():
    """Return raw OHLCV bars for a symbol & timeframe for a recent window.
    Query Params:
      symbol: Ticker (default SPY)
      timeframe: 1m|5m|15m|30m|1h|4h|1d or Alpaca native (default 1h)
      limit: number of bars (default 200, max 1000)
      days: fallback days range if limit not provided (default 7)
    """
    try:
        symbol = request.args.get('symbol', 'SPY').upper()
        raw_tf = request.args.get('timeframe', '1h')
        timeframe = normalize_timeframe(raw_tf)
        limit = int(request.args.get('limit', '0'))
        days = int(request.args.get('days', '7'))

        alpaca_key_id = request.args.get('alpacaKeyId') or os.getenv('ALPACA_KEY_ID')
        alpaca_secret_key = request.args.get('alpacaSecretKey') or os.getenv('ALPACA_SECRET_KEY')

        end_date = datetime.utcnow()
        # If limit supplied, approximate days span (rough heuristic per timeframe)
        if limit > 0:
            # Map timeframe to minutes per bar for heuristic
            minutes_map = {'1Min':1,'5Min':5,'15Min':15,'30Min':30,'1Hour':60,'4Hour':240,'1Day':60*24}
            per_bar = minutes_map.get(timeframe, 60)
            total_minutes = per_bar * limit
            days_est = max(1, floor(total_minutes / (60*24)) + 1)
            days = days_est

        start_date = end_date - timedelta(days=days)
        start_str = start_date.strftime('%Y-%m-%dT%H:%M:%SZ')
        end_str = end_date.strftime('%Y-%m-%dT%H:%M:%SZ')

        bars = fetch_bars_full(symbol, start_str, end_str, timeframe, api_key=alpaca_key_id, api_secret=alpaca_secret_key)
        if not bars['close']:
            return jsonify({'symbol': symbol, 'timeframe': timeframe, 'bars': [], 'error': 'No data'}), 200

        response = {
            'symbol': symbol,
            'timeframe': timeframe,
            'count': len(bars['close']),
            'bars': [
                {
                    't': bars['timestamp'][i] if 'timestamp' in bars else None,
                    'open': bars['open'][i],
                    'high': bars['high'][i],
                    'low': bars['low'][i],
                    'close': bars['close'][i],
                    'volume': bars['volume'][i]
                } for i in range(len(bars['close']))
            ]
        }
        return jsonify(response)
    except Exception as e:
        return jsonify({'error': str(e)}), 500

def stochastic(highs, lows, closes, period=14, smooth_k=3, smooth_d=3):
    """Calculate Stochastic Oscillator"""
    k_values = []
    
    for i in range(len(closes)):
        if i < period - 1:
            k_values.append(None)
        else:
            window_high = max(highs[i - period + 1:i + 1])
            window_low = min(lows[i - period + 1:i + 1])
            if window_high == window_low:
                k_values.append(50)
            else:
                k = 100 * (closes[i] - window_low) / (window_high - window_low)
                k_values.append(k)
    
    k_smooth = []
    for i in range(len(k_values)):
        if k_values[i] is None or i < smooth_k - 1:
            k_smooth.append(None)
        else:
            window = [k for k in k_values[i - smooth_k + 1:i + 1] if k is not None]
            k_smooth.append(sum(window) / len(window) if window else None)
    
    d_values = []
    for i in range(len(k_smooth)):
        if k_smooth[i] is None or i < smooth_d - 1:
            d_values.append(None)
        else:
            window = [k for k in k_smooth[i - smooth_d + 1:i + 1] if k is not None]
            d_values.append(sum(window) / len(window) if window else None)
    
    return k_smooth, d_values

def obv(closes, volumes):
    """Calculate On-Balance Volume"""
    obv_values = [0]
    for i in range(1, len(closes)):
        if closes[i] > closes[i - 1]:
            obv_values.append(obv_values[-1] + volumes[i])
        elif closes[i] < closes[i - 1]:
            obv_values.append(obv_values[-1] - volumes[i])
        else:
            obv_values.append(obv_values[-1])
    return obv_values

def volume_spike(volumes, period=20, multiplier=1.5):
    """Detect volume spikes"""
    spikes = []
    for i in range(len(volumes)):
        if i < period - 1:
            spikes.append(False)
        else:
            avg_vol = sum(volumes[i - period + 1:i + 1]) / period
            spikes.append(volumes[i] > avg_vol * multiplier)
    return spikes

def compute_trendlines(highs, lows, closes, lookback=100, pivot_window=3, min_touches=2, tolerance_pct=0.5, num_trendlines=2):
    """Compute simple auto trendlines (support/resistance) and breakout detection.
    Returns dict with support/resistance line (slope/intercept), latest projected levels, slope bias and breakout classification.
    num_trendlines parameter allows analyzing multiple trendlines (currently uses best fit from pivots).
    """
    n = len(closes)
    if n == 0:
        return {}
    lb = min(lookback, n)
    start = n - lb
    # Collect pivot highs / lows
    piv_high_idx = []
    piv_high_val = []
    piv_low_idx = []
    piv_low_val = []
    for i in range(start + pivot_window, n - pivot_window):
        local_high = True
        local_low = True
        hi = highs[i]
        lo = lows[i]
        for j in range(i - pivot_window, i + pivot_window + 1):
            if highs[j] > hi:
                local_high = False
            if lows[j] < lo:
                local_low = False
            if not local_high and not local_low:
                break
        if local_high:
            piv_high_idx.append(i - start)
            piv_high_val.append(hi)
        if local_low:
            piv_low_idx.append(i - start)
            piv_low_val.append(lo)

    def lin_reg(indices, values):
        if len(indices) < min_touches:
            return None, None
        x_mean = sum(indices) / len(indices)
        y_mean = sum(values) / len(values)
        num = sum((indices[i] - x_mean) * (values[i] - y_mean) for i in range(len(indices)))
        den = sum((indices[i] - x_mean) ** 2 for i in range(len(indices)))
        if den == 0:
            return 0, y_mean
        m = num / den
        b = y_mean - m * x_mean
        return m, b

    m_high, b_high = lin_reg(piv_high_idx, piv_high_val)
    m_low, b_low = lin_reg(piv_low_idx, piv_low_val)

    last_rel_idx = lb - 1
    resistance_level = None if m_high is None else m_high * last_rel_idx + b_high
    support_level = None if m_low is None else m_low * last_rel_idx + b_low
    close = closes[-1]

    breakout = 'none'  # Default to 'none' instead of None
    if resistance_level is not None and close > resistance_level * (1 + tolerance_pct/100):
        breakout = 'bullish'
    elif support_level is not None and close < support_level * (1 - tolerance_pct/100):
        breakout = 'bearish'

    # Determine slope bias combining available slopes
    slopes = [s for s in [m_high, m_low] if s is not None]
    slope_bias = None
    if slopes:
        avg_slope = sum(slopes) / len(slopes)
        if avg_slope > 0:
            slope_bias = 'up'
        elif avg_slope < 0:
            slope_bias = 'down'
        else:
            slope_bias = 'flat'

    return {
        'trend_resistance': resistance_level,
        'trend_support': support_level,
        'trend_breakout': breakout,
        'trend_slope': slope_bias,
        'trend_high_touches': len(piv_high_idx),
        'trend_low_touches': len(piv_low_idx)
    }

@app.route('/execute', methods=['POST'])
def execute_strategy():
    """Execute trading strategy and return results"""
    try:
        data = request.json
        symbol = data.get('symbol', 'SPY')
        timeframe = data.get('timeframe', '1Hour')
        days = parse_days(data.get('days', 7), default=7)
        alpaca_key_id = data.get('alpacaKeyId')
        alpaca_secret_key = data.get('alpacaSecretKey')
        indicators = data.get('indicators', [])
        indicator_params = data.get('indicator_params', {})
        
        print(f"📊 Executing strategy: {symbol} {timeframe} {days}d - Indicators: {indicators}")
        
        # Fetch data from Alpaca
        end_date = datetime.now()
        start_date = end_date - timedelta(days=days)
        start_str = start_date.strftime('%Y-%m-%dT%H:%M:%SZ')
        end_str = end_date.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        bars = fetch_bars_full(symbol, start_str, end_str, timeframe, api_key=alpaca_key_id, api_secret=alpaca_secret_key)
        
        if not bars['close']:
            return jsonify({'error': 'No data returned from Alpaca'}), 400
        
        # Extract OHLCV
        opens = bars['open']
        highs = bars['high']
        lows = bars['low']
        closes = bars['close']
        volumes = bars['volume']

        # Attempt to fetch a real-time current price and build an effective closes
        # series for indicator computation. We replace the most recent close with
        # the live tick (if available) to keep arrays aligned (highs/lows/volumes)
        current_price = None
        try:
            current_price = fetch_current_price(symbol, api_key=alpaca_key_id, api_secret=alpaca_secret_key)
            if current_price is not None:
                # coerce to float
                current_price = float(current_price)
        except Exception:
            current_price = None

        # Build closes_for_indicators: same length as closes; replace last value with current_price when available
        closes_for_ind = list(closes)
        if closes_for_ind:
            if current_price is not None:
                closes_for_ind[-1] = current_price

        # Compute indicators
        results = {
            'bar_count': len(closes_for_ind),
            'latest': {
                'open': opens[-1],
                'high': highs[-1],
                'low': lows[-1],
                'close': closes_for_ind[-1],
                'volume': volumes[-1],
                'price': closes_for_ind[-1]
            }
        }
        
        for ind in indicators:
            if ind == 'rsi':
                period = 14
                try:
                    if 'rsi' in indicator_params:
                        period = int(indicator_params['rsi'].get('period', period))
                except Exception:
                    pass
                rsi_vals = rsi(closes_for_ind, period)
                if rsi_vals[-1] is not None:
                    results['latest']['rsi'] = rsi_vals[-1]

            elif ind == 'ema':
                period = 20
                try:
                    if 'ema' in indicator_params:
                        period = int(indicator_params['ema'].get('period', period))
                except Exception:
                    pass
                ema_vals = ema(closes_for_ind, period)
                if ema_vals[-1] is not None:
                    results['latest']['ema'] = ema_vals[-1]

            elif ind == 'macd':
                fast_p, slow_p, signal_p = 12, 26, 9
                try:
                    if 'macd' in indicator_params:
                        fast_p = int(indicator_params['macd'].get('fast', fast_p))
                        slow_p = int(indicator_params['macd'].get('slow', slow_p))
                        signal_p = int(indicator_params['macd'].get('signal', signal_p))
                except Exception:
                    pass
                # Compute macd with custom periods
                ema_fast = ema(closes_for_ind, fast_p)
                ema_slow = ema(closes_for_ind, slow_p)
                macd_line = []
                for i in range(len(closes_for_ind)):
                    if ema_fast[i] is not None and ema_slow[i] is not None:
                        macd_line.append(ema_fast[i] - ema_slow[i])
                    else:
                        macd_line.append(None)
                macd_signal = ema([m for m in macd_line if m is not None], signal_p)
                macd_signal = [None] * (len(macd_line) - len(macd_signal)) + macd_signal
                macd_hist = []
                for i in range(len(macd_line)):
                    if macd_line[i] is not None and macd_signal[i] is not None:
                        macd_hist.append(macd_line[i] - macd_signal[i])
                    else:
                        macd_hist.append(None)
                if macd_line[-1] is not None:
                    results['latest']['macd_line'] = macd_line[-1]
                    results['latest']['macd_signal'] = macd_signal[-1] if macd_signal[-1] else None
                    results['latest']['macd_hist'] = macd_hist[-1] if macd_hist[-1] else None

            elif ind == 'boll':
                period = 20
                num_std = 2
                try:
                    if 'boll' in indicator_params:
                        period = int(indicator_params['boll'].get('period', period))
                        num_std = float(indicator_params['boll'].get('std', num_std))
                except Exception:
                    pass
                upper, middle, lower = boll_bands(closes_for_ind, period=period, num_std=num_std)
                if upper[-1] is not None:
                    results['latest']['boll_upper'] = upper[-1]
                    results['latest']['boll_middle'] = middle[-1]
                    results['latest']['boll_lower'] = lower[-1]

            elif ind == 'vwap':
                # For VWAP, use the effective closes series so the latest tick is considered
                vwap_vals = vwap(closes_for_ind, volumes)
                if vwap_vals[-1] is not None:
                    results['latest']['vwap'] = vwap_vals[-1]

            elif ind == 'atr':
                period = 14
                try:
                    if 'atr' in indicator_params:
                        period = int(indicator_params['atr'].get('period', period))
                except Exception:
                    pass
                # ATR relies on highs/lows and closes; pass the adjusted closes
                atr_vals = atr(highs, lows, closes_for_ind, period=period)
                if atr_vals[-1] is not None:
                    results['latest']['atr'] = atr_vals[-1]

            elif ind == 'stoch':
                period = 14
                smooth_k, smooth_d = 3, 3
                try:
                    if 'stoch' in indicator_params:
                        period = int(indicator_params['stoch'].get('period', period))
                        smooth_k = int(indicator_params['stoch'].get('smoothK', smooth_k))
                        smooth_d = int(indicator_params['stoch'].get('smoothD', smooth_d))
                except Exception:
                    pass
                # Use adjusted closes so latest tick is used in stochastic calculation
                k_vals, d_vals = stochastic(highs, lows, closes_for_ind, period=period, smooth_k=smooth_k, smooth_d=smooth_d)
                if k_vals[-1] is not None:
                    results['latest']['stoch_k'] = k_vals[-1]
                    results['latest']['stoch_d'] = d_vals[-1] if d_vals[-1] else None

            elif ind == 'obv':
                obv_vals = obv(closes_for_ind, volumes)
                results['latest']['obv'] = obv_vals[-1]

            elif ind == 'volspike':
                period = 20
                multiplier = 1.5
                try:
                    if 'volspike' in indicator_params:
                        period = int(indicator_params['volspike'].get('period', period))
                        multiplier = float(indicator_params['volspike'].get('multiplier', multiplier))
                except Exception:
                    pass
                spike_vals = volume_spike(volumes, period=period, multiplier=multiplier)
                results['latest']['vol_spike'] = spike_vals[-1]

            elif ind == 'sma':
                period = 20
                try:
                    if 'sma' in indicator_params:
                        period = int(indicator_params['sma'].get('period', period))
                except Exception:
                    pass
                sma_vals = sma(closes_for_ind, period)
                if sma_vals[-1] is not None:
                    results['latest']['sma'] = sma_vals[-1]

            elif ind == 'sma_cross':
                fast_p, slow_p = 50, 200
                try:
                    if 'sma_cross' in indicator_params:
                        fast_p = int(indicator_params['sma_cross'].get('fast', fast_p))
                        slow_p = int(indicator_params['sma_cross'].get('slow', slow_p))
                except Exception:
                    pass
                sma_fast = sma(closes_for_ind, fast_p)
                sma_slow = sma(closes_for_ind, slow_p)
                cross = None
                direction = None
                if len(closes) >= slow_p + 1 and sma_fast[-1] is not None and sma_slow[-1] is not None:
                    prev_fast = sma_fast[-2]
                    prev_slow = sma_slow[-2]
                    if prev_fast is not None and prev_slow is not None:
                        if prev_fast <= prev_slow and sma_fast[-1] > sma_slow[-1]:
                            cross = True
                            direction = 'bullish'
                        elif prev_fast >= prev_slow and sma_fast[-1] < sma_slow[-1]:
                            cross = True
                            direction = 'bearish'
                        else:
                            cross = False
                results['latest']['sma_fast'] = sma_fast[-1] if sma_fast[-1] is not None else None
                results['latest']['sma_slow'] = sma_slow[-1] if sma_slow[-1] is not None else None
                results['latest']['sma_cross'] = cross
                if direction:
                    results['latest']['sma_cross_dir'] = direction
            elif ind == 'trendline':
                lookback = 100
                num_trendlines = 2
                pivot_window = 3
                tolerance_pct = 0.5
                min_touches = 2
                try:
                    if 'trendline' in indicator_params:
                        lookback = int(indicator_params['trendline'].get('lookback', lookback))
                        num_trendlines = int(indicator_params['trendline'].get('numTrendlines', num_trendlines))
                        pivot_window = int(indicator_params['trendline'].get('pivotWindow', pivot_window))
                        tolerance_pct = float(indicator_params['trendline'].get('tolerancePct', tolerance_pct))
                        min_touches = int(indicator_params['trendline'].get('minTouches', min_touches))
                except Exception:
                    pass
                # For trendline computation, we use adjusted closes so the latest tick can affect breakout detection
                tl = compute_trendlines(highs, lows, closes_for_ind, lookback=lookback, pivot_window=pivot_window, min_touches=min_touches, tolerance_pct=tolerance_pct, num_trendlines=num_trendlines)
                for k, v in tl.items():
                    results['latest'][k] = v
        
        print(f"✅ Strategy executed successfully - {len(closes)} bars analyzed")
        return jsonify(results)
        
    except Exception as e:
        print(f"❌ Error executing strategy: {str(e)}")
        return jsonify({'error': str(e)}), 500

@app.route('/execute_workflow', methods=['POST'])
def execute_workflow():
    """Execute sequential workflow with stop-on-fail logic.
    
    Now supports graph-based execution via UnifiedStrategyExecutor when connections are provided.
    """
    try:
        data = request.json
        if not data:
            print("❌ ERROR: request.json is None or empty")
            return jsonify({'error': 'Empty request body'}), 400
        
        print(f"📥 Received request with keys: {list(data.keys())}")
        
        symbol = data.get('symbol', 'SPY')
        timeframe = data.get('timeframe', '1Hour')
        days = parse_days(data.get('days', 7), default=7)
        workflow_blocks = data.get('workflow', [])
        connections = data.get('connections', [])  # ✅ Get connections for graph execution
        
        # Extract alpaca credentials and price type from request or alpaca_config block
        alpaca_key_id = data.get('alpacaKeyId')
        alpaca_secret_key = data.get('alpacaSecretKey')
        price_type = data.get('priceType', 'close')  # Default to close
        
        if (not alpaca_key_id or not alpaca_secret_key) and workflow_blocks:
            for b in workflow_blocks:
                if b.get('type') == 'alpaca_config':
                    params = b.get('params', {})
                    alpaca_key_id = alpaca_key_id or params.get('keyId')
                    alpaca_secret_key = alpaca_secret_key or params.get('secretKey')
                    price_type = params.get('priceType', price_type)
                    break
        indicator_params = data.get('indicator_params', {})
        
        print(f"🔄 Executing workflow: {symbol} {timeframe} {days}d - {len(workflow_blocks)} blocks, {len(connections)} connections - Price Type: {price_type}")
        
        # Fetch data from Alpaca - extend lookback for weekends/holidays
        end_date = datetime.now()
        # Add extra days to account for weekends/holidays (markets closed Sat/Sun + holidays)
        # For 1 day lookback, use 4 days to ensure we get data even on Monday morning
        extended_days = max(days + 3, days * 2) if days <= 3 else days + 5
        start_date = end_date - timedelta(days=extended_days)
        start_str = start_date.strftime('%Y-%m-%dT%H:%M:%SZ')
        end_str = end_date.strftime('%Y-%m-%dT%H:%M:%SZ')
        
        bars = fetch_bars_full(symbol, start_str, end_str, timeframe, api_key=alpaca_key_id, api_secret=alpaca_secret_key)
        
        # If still no data, try an even longer lookback (handles long holiday weekends)
        if not bars['close']:
            print(f"⚠️ No data with {extended_days}d lookback, trying 14 days...")
            start_date = end_date - timedelta(days=14)
            start_str = start_date.strftime('%Y-%m-%dT%H:%M:%SZ')
            bars = fetch_bars_full(symbol, start_str, end_str, timeframe, api_key=alpaca_key_id, api_secret=alpaca_secret_key)
        
        if not bars['close']:
            error_msg = f'No data returned from Alpaca for {symbol} {timeframe} ({start_str} to {end_str})'
            if not alpaca_key_id or not alpaca_secret_key:
                error_msg += ' - Missing Alpaca API credentials. Please configure API keys in Settings.'
            else:
                error_msg += ' - Check if market is open or try a different timeframe/symbol.'
            print(f"❌ {error_msg}")
            return jsonify({'error': error_msg}), 400
        
        # Extract OHLCV
        opens = bars['open']
        highs = bars['high']
        lows = bars['low']
        closes = bars['close']
        volumes = bars['volume']
        
        # Fetch current price if price_type is 'current'
        current_price = None
        if price_type == 'current':
            current_price = fetch_current_price(symbol, api_key=alpaca_key_id, api_secret=alpaca_secret_key)
            print(f"📊 Current real-time price: ${current_price}" if current_price else "⚠️ Could not fetch current price, using last close")
        
        # Calculate price series based on selected price type
        prices = calculate_price_series(bars, price_type, current_price)

        # Ensure we expose both the canonical 'close' and the 'price' (real-time) values.
        # When price_type == 'current', `prices` ends with the real-time tick appended
        # so use that as the authoritative latest price for condition checks.
        latest_price = prices[-1] if prices else (closes[-1] if closes else None)
        prev_price = None
        if len(prices) >= 2:
            prev_price = prices[-2]
        elif len(closes) >= 2:
            prev_price = closes[-2]

        # Compute all required indicators using the selected price series
        latest_data = {
            'open': opens[-1],
            'high': highs[-1],
            'low': lows[-1],
            # expose 'close' as the most recent authoritative price (may be real-time)
            'close': latest_price,
            'volume': volumes[-1],
            'price': latest_price,
            'price_prev': prev_price
        }
        
        # Compute indicators based on workflow needs
        block_types = {b.get('type') for b in workflow_blocks}
        print(f"[DEBUG] Block types detected: {block_types}")
        print(f"[DEBUG] Volumes available: {len(volumes)} bars, sample: {volumes[-5:] if len(volumes) >= 5 else volumes}")
        
        if 'rsi' in block_types:
            period = indicator_params.get('rsi', {}).get('period', 14)
            rsi_vals = rsi(prices, period)
            # Use the most recent non-None RSI value (robust if the very last index is None)
            last_rsi = None
            for v in reversed(rsi_vals):
                if v is not None:
                    last_rsi = v
                    break
            if last_rsi is not None:
                try:
                    latest_data['rsi'] = float(last_rsi)
                except Exception:
                    latest_data['rsi'] = last_rsi
                print(f"[INFO] Computed RSI (last non-None): {latest_data['rsi']}")
                # Diagnostic: show recent price tail and RSI tail to help debugging spikes
                try:
                    tail_len = min(30, len(prices))
                    print(f"[DEBUG_RSI] prices_tail={prices[-tail_len:]}\n[DEBUG_RSI] rsi_tail={rsi_vals[-min(10,len(rsi_vals)):]}" )
                except Exception:
                    pass
        
        if 'ema' in block_types or 'sma' in block_types:
            period = indicator_params.get('ema', {}).get('period', 20)
            ema_vals = ema(prices, period)
            if ema_vals[-1] is not None:
                latest_data['ema'] = ema_vals[-1]
        
        if 'macd' in block_types:
            fast_p = indicator_params.get('macd', {}).get('fast', 12)
            slow_p = indicator_params.get('macd', {}).get('slow', 26)
            signal_p = indicator_params.get('macd', {}).get('signal', 9)
            ema_fast = ema(prices, fast_p)
            ema_slow = ema(prices, slow_p)
            macd_line = []
            for i in range(len(prices)):
                if ema_fast[i] is not None and ema_slow[i] is not None:
                    macd_line.append(ema_fast[i] - ema_slow[i])
                else:
                    macd_line.append(None)
            macd_signal = ema([m for m in macd_line if m is not None], signal_p)
            macd_signal = [None] * (len(macd_line) - len(macd_signal)) + macd_signal
            macd_hist = []
            for i in range(len(macd_line)):
                if macd_line[i] is not None and macd_signal[i] is not None:
                    macd_hist.append(macd_line[i] - macd_signal[i])
                else:
                    macd_hist.append(None)
            if macd_hist[-1] is not None:
                latest_data['macd_hist'] = macd_hist[-1]
                if len(macd_hist) > 1 and macd_hist[-2] is not None:
                    latest_data['macd_hist_prev'] = macd_hist[-2]
        
        if 'volspike' in block_types:
            period = indicator_params.get('volspike', {}).get('period', 20)
            multiplier = indicator_params.get('volspike', {}).get('multiplier', 1.5)
            spike_vals = volume_spike(volumes, period, multiplier)
            latest_data['vol_spike'] = spike_vals[-1]
        
        if 'bollinger' in block_types:
            period = indicator_params.get('boll', {}).get('period', 20)
            num_std = indicator_params.get('boll', {}).get('std', 2)
            upper, middle, lower = boll_bands(closes, period, num_std)
            if upper[-1] is not None:
                latest_data['boll_upper'] = upper[-1]
                latest_data['boll_middle'] = middle[-1]
                latest_data['boll_lower'] = lower[-1]
                if middle[-1] not in (None, 0):
                    latest_data['boll_bandwidth'] = (upper[-1] - lower[-1]) / middle[-1]
        
        if 'trendline' in block_types:
            tl_params = indicator_params.get('trendline', {})
            lookback = tl_params.get('lookback', 100)
            num_trendlines = tl_params.get('numTrendlines', 2)
            pivot_window = tl_params.get('pivotWindow', 3)
            tolerance_pct = tl_params.get('tolerancePct', 0.5)
            min_touches = tl_params.get('minTouches', 2)
            tl = compute_trendlines(highs, lows, closes, lookback, pivot_window, min_touches, tolerance_pct, num_trendlines)
            latest_data.update(tl)

        if 'vwap' in block_types:
            print(f"[DEBUG] VWAP block detected! Computing VWAP...")
            # VWAP calculation
            tp = [(highs[i] + lows[i] + closes[i]) / 3.0 for i in range(len(closes))]
            total_pv = 0.0
            total_v = 0.0
            for i in range(len(closes)):
                vol = volumes[i] if volumes[i] is not None else 0
                total_pv += tp[i] * vol
                total_v += vol
            if total_v > 0:
                latest_data['vwap'] = total_pv / total_v
                print(f"[INFO] Computed VWAP: {latest_data['vwap']:.4f}, total_volume={total_v:.0f}")
            else:
                # Fallback: use simple average price if no volume data
                latest_data['vwap'] = sum(tp) / len(tp) if tp else closes[-1]
                print(f"[WARN] No volume data for VWAP, using avg typical price: {latest_data['vwap']:.4f}")
        else:
            print(f"[DEBUG] VWAP block NOT in block_types: {block_types}")

        if 'obv' in block_types:
            current_obv = 0.0
            obv_vals = []
            for i in range(1, len(closes)):
                if closes[i] > closes[i-1]:
                    current_obv += volumes[i]
                elif closes[i] < closes[i-1]:
                    current_obv -= volumes[i]
                obv_vals.append(current_obv)
            if obv_vals:
                latest_data['obv'] = obv_vals[-1]
                if len(obv_vals) > 1:
                    latest_data['obv_prev'] = obv_vals[-2]
        
        if 'stochastic' in block_types:
            stoch_params = indicator_params.get('stoch', {})
            period = stoch_params.get('period', 14)
            smooth_k = stoch_params.get('smoothK', 3)
            smooth_d = stoch_params.get('smoothD', 3)
            k_vals, d_vals = stochastic(highs, lows, closes, period, smooth_k, smooth_d)
            if k_vals[-1] is not None:
                latest_data['stoch_k'] = k_vals[-1]
        
        # ═══════════════════════════════════════════════════════════════════════
        # ATR (Average True Range) calculation
        # ═══════════════════════════════════════════════════════════════════════
        if 'atr' in block_types:
            atr_params = indicator_params.get('atr', {})
            atr_period = int(atr_params.get('period', 14))
            atr_vals = atr(highs, lows, closes, atr_period)
            if atr_vals and atr_vals[-1] is not None:
                latest_data['atr'] = atr_vals[-1]
                print(f"[INFO] Computed ATR({atr_period}): {latest_data['atr']:.4f}")
        
        # ═══════════════════════════════════════════════════════════════════════
        # Support/Resistance calculation (simple pivot-based levels)
        # ═══════════════════════════════════════════════════════════════════════
        if 'support_resistance' in block_types:
            sr_params = indicator_params.get('support_resistance', {})
            lookback = int(sr_params.get('lookback', 20))
            
            # Calculate support and resistance using recent highs/lows
            if len(closes) >= lookback:
                recent_highs = highs[-lookback:]
                recent_lows = lows[-lookback:]
                recent_closes = closes[-lookback:]
                
                # Resistance = highest high in lookback
                # Support = lowest low in lookback
                resistance = max(recent_highs) if recent_highs else None
                support = min(recent_lows) if recent_lows else None
                
                # Optional: use pivot points for more sophisticated S/R
                # Classic Pivot: PP = (H + L + C) / 3
                if recent_highs and recent_lows and recent_closes:
                    h = recent_highs[-1]
                    l = recent_lows[-1]
                    c = recent_closes[-1]
                    pivot = (h + l + c) / 3
                    # R1 = 2*PP - L, S1 = 2*PP - H
                    r1 = 2 * pivot - l
                    s1 = 2 * pivot - h
                    
                    latest_data['support'] = support
                    latest_data['resistance'] = resistance
                    latest_data['pivot'] = pivot
                    latest_data['r1'] = r1
                    latest_data['s1'] = s1
                    print(f"[INFO] Computed S/R: Support=${support:.2f}, Resistance=${resistance:.2f}, Pivot=${pivot:.2f}")
        
        # ═══════════════════════════════════════════════════════════════════════
        # UNIFIED EXECUTION: Use UnifiedStrategyExecutor when connections provided
        # This ensures live signals use the SAME execution path as backtesting
        # ═══════════════════════════════════════════════════════════════════════
        unified_signal = None
        unified_debug = {}
        
        if connections and len(connections) > 0:
            from workflows.unified_executor import execute_unified_workflow
            
            # Build market_data with history for the unified executor
            market_data_for_unified = {
                'close': latest_price,
                'open': opens[-1] if opens else latest_price,
                'high': highs[-1] if highs else latest_price,
                'low': lows[-1] if lows else latest_price,
                'volume': volumes[-1] if volumes else 0,
                'close_history': closes,  # Full price history
                'volume_history': volumes,  # Full volume history
                'high_history': highs,
                'low_history': lows
            }
            
            try:
                unified_signal, unified_debug = execute_unified_workflow(
                    nodes=workflow_blocks,
                    connections=connections,
                    market_data=market_data_for_unified,
                    debug=True
                )
                # ENHANCED DEBUG: Show node outputs to trace false signals
                print(f"  [UNIFIED LIVE] Signal={unified_signal}, nodes={unified_debug.get('nodes_count')}, connections={unified_debug.get('connections_count')}")
                print(f"  [UNIFIED DEBUG] final_condition={unified_debug.get('final_condition')}, signal_direction={unified_debug.get('signal_direction')}")
                if unified_debug.get('node_outputs'):
                    for nid, outputs in unified_debug.get('node_outputs', {}).items():
                        print(f"    Node {nid}: {outputs}")
            except Exception as ue:
                print(f"  [UNIFIED ERROR] {ue}")
                import traceback
                traceback.print_exc()
        else:
            print(f"  [UNIFIED SKIP] No connections provided ({len(connections) if connections else 0} connections)")
        
        # Execute workflow sequentially (fallback / AI agent blocks are skipped here)
        workflow_result = workflow_engine.execute_workflow(workflow_blocks, latest_data)

        # Collect AI agent blocks (executed after core conditions regardless of pass/fail)
        ai_blocks = [b for b in workflow_blocks if b.get('type') == 'ai_agent']
        ai_agent_results = []
        if ai_blocks:
            print(f"🧠 Executing {len(ai_blocks)} AI agent block(s)...")
            # Build context summary of condition blocks
            condition_summary_lines = []
            for br in workflow_result.blocks:
                condition_summary_lines.append(f"- {br.block_type}: {br.status.value} | {br.message}")
            condition_summary = "\n".join(condition_summary_lines)

            # Attempt OpenAI client initialization from environment (fallback)
            openai_client = None
            env_api_key = os.environ.get('OPENAI_API_KEY')
            if env_api_key:
                try:
                    from openai import OpenAI
                    openai_client = OpenAI(api_key=env_api_key)
                except Exception as init_err:
                    print(f"⚠️ OpenAI env client init failed: {init_err}")
            else:
                print("ℹ️ No OPENAI_API_KEY in environment; expecting per-block API key")

            for ai_block in ai_blocks:
                params = ai_block.get('params', {})
                model = params.get('model', 'gpt-4o-mini')
                provider = (params.get('provider') or 'openai').strip().lower()
                script = (params.get('script') or '').strip()
                comments = (params.get('comments') or '').strip()
                temperature = float(params.get('temperature', 0.7))
                max_tokens = int(params.get('maxTokens', 500))
                api_key_block = (params.get('apiKey') or '').strip()
                context_obj = params.get('context', {})
                indicator_params_ctx = context_obj.get('indicator_params', {})
                blocks_ctx = context_obj.get('blocks', [])

                # Build user settings summary for indicators
                settings_lines = []
                for name, cfg in indicator_params_ctx.items():
                    try:
                        if isinstance(cfg, dict):
                            kv = ", ".join(f"{k}={v}" for k,v in cfg.items())
                            settings_lines.append(f"{name}: {kv}")
                        else:
                            settings_lines.append(f"{name}: {cfg}")
                    except Exception:
                        pass
                indicator_settings_summary = "\n".join(settings_lines) if settings_lines else "(none)"

                # Include raw block params (sanitized) for deeper context
                block_param_lines = []
                for b in blocks_ctx:
                    bt = b.get('type'); p = b.get('params', {})
                    if bt in ['ai_agent', 'alpaca_config']: # skip secrets / internal
                        continue
                    try:
                        bp = ", ".join(f"{k}={v}" for k,v in p.items() if k not in ['apiKey','secretKey','keyId'])
                        block_param_lines.append(f"{bt}: {bp}")
                    except Exception:
                        pass
                block_params_summary = "\n".join(block_param_lines) if block_param_lines else "(none)"

                prompt = (
                    f"Symbol: {symbol}\nTimeframe: {timeframe}\nLookback Days: {days}\n"\
                    f"Latest Data: {json.dumps(latest_data, ensure_ascii=False)}\n\n"\
                    f"Condition Blocks (status + message):\n{condition_summary}\n\n"\
                    f"User Indicator Settings:\n{indicator_settings_summary}\n\n"\
                    f"Workflow Block Parameters:\n{block_params_summary}\n\n"\
                    f"User Script:\n{script}\n\n"\
                    f"User Comments:\n{comments}\n\n"\
                    "Task: Act strictly within the user's strategy configuration. Provide:\n"
                    "1. Market context referencing provided indicator thresholds & parameters.\n"
                    "2. Specific analysis of each passed and failed condition referencing user settings (do NOT assume defaults).\n"
                    "3. A single actionable recommendation aligned with the configured logic.\n"
                    "Avoid generic disclaimers. Do not invent parameters. Use ONLY supplied data."
                )

                # Provider routing (OpenAI default, Gemini optional)
                analysis_text = None
                error_message = None
                exec_ms = 0.0
                import time as _t
                _start_ai = _t.time()

                if provider == 'gemini' or model.startswith('gemini'):
                    # Gemini path with fallback models
                    gemini_key = api_key_block or os.environ.get('GEMINI_API_KEY') or os.environ.get('GOOGLE_API_KEY')
                    if not gemini_key:
                        analysis_text = 'Gemini API key not provided.'
                        error_message = 'Missing Gemini key. Supply in block or set GEMINI_API_KEY.'
                    else:
                        import google.generativeai as gen
                        gen.configure(api_key=gemini_key)
                        generation_config = {
                            'temperature': temperature,
                            'max_output_tokens': max_tokens,
                        }
                        # Build candidate list (user model first, then fallbacks)
                        user_model = model if model.startswith('gemini') else 'gemini-2.5-flash-lite'
                        gemini_candidates = [m for m in [
                            user_model,
                            'gemini-2.5-flash-lite',
                            'gemini-flash-lite-latest',
                            'gemini-flash-latest',
                            'gemini-2.5-flash',
                            'gemini-2.5-pro',
                            'gemini-pro-latest'
                        ] if m]
                        last_err = None
                        for gm in gemini_candidates:
                            try:
                                gmodel = gen.GenerativeModel(gm, generation_config=generation_config)
                                resp = gmodel.generate_content(prompt)
                                candidate_text = None
                                finish_reason = None
                                safety_notes = []
                                if resp and hasattr(resp, 'candidates') and resp.candidates:
                                    for cand in resp.candidates:
                                        finish_reason = getattr(cand, 'finish_reason', finish_reason)
                                        parts = getattr(cand, 'content', None)
                                        # parts may have .parts attribute in newer SDK
                                        if parts and hasattr(parts, 'parts'):
                                            joined = []
                                            for p in parts.parts:
                                                if hasattr(p, 'text') and p.text:
                                                    joined.append(p.text)
                                            if joined:
                                                candidate_text = '\n'.join(joined).strip()
                                                break
                                        elif hasattr(cand, 'content') and getattr(cand.content, 'parts', None):
                                            joined = []
                                            for p in cand.content.parts:
                                                if hasattr(p, 'text') and p.text:
                                                    joined.append(p.text)
                                            if joined:
                                                candidate_text = '\n'.join(joined).strip()
                                                break
                                        # Collect safety ratings
                                        if hasattr(cand, 'safety_ratings') and cand.safety_ratings:
                                            for r in cand.safety_ratings:
                                                cat = getattr(r, 'category', None)
                                                prob = getattr(r, 'probability', None)
                                                if prob in ('MEDIUM', 'HIGH'):
                                                    safety_notes.append(f"{cat}:{prob}")
                                if candidate_text:
                                    analysis_text = candidate_text
                                    model = gm
                                    last_err = None
                                    break
                                else:
                                    reason_label = str(finish_reason) if finish_reason is not None else 'unknown'
                                    safety_str = f" | safety: {', '.join(safety_notes)}" if safety_notes else ''
                                    # If safety blocked (finish_reason==2) attempt a sanitized prompt once
                                    if finish_reason == 2:
                                        print(f"🛑 Gemini safety blocked for model {gm}. Retrying with sanitized prompt...")
                                        safe_prompt = "Summarize recent market conditions for the symbol and indicators with neutral, educational phrasing. Provide: 1) Context, 2) Indicator alignment, 3) Directional bias (bullish/bearish/neutral), 4) Simple next step. Avoid financial advice wording."\
                                            + "\n\nOriginal (truncated):\n" + prompt[:350]
                                        try:
                                            resp2 = gmodel.generate_content(safe_prompt)
                                            # Extract again
                                            if resp2 and hasattr(resp2,'candidates') and resp2.candidates:
                                                for cand2 in resp2.candidates:
                                                    parts2 = getattr(cand2, 'content', None)
                                                    if parts2 and hasattr(parts2,'parts'):
                                                        joined2 = []
                                                        for p2 in parts2.parts:
                                                            if hasattr(p2,'text') and p2.text:
                                                                joined2.append(p2.text)
                                                        if joined2:
                                                            analysis_text = '\n'.join(joined2).strip()
                                                            model = gm
                                                            last_err = None
                                                            print(f"✅ Gemini recovered with sanitized prompt on model {gm}")
                                                            break
                                            if analysis_text:
                                                break
                                        except Exception as retry_err:
                                            print(f"❌ Gemini retry failed: {retry_err}")
                                    if not analysis_text:
                                        last_err = Exception(f"No textual content (finish_reason={reason_label}{safety_str})")
                                        print(f"⚠️ Gemini empty/blocked response for model {gm} finish_reason={reason_label}{safety_str}")
                            except Exception as gerr:
                                err_msg = str(gerr)
                                print(f"❌ Gemini error for {gm}: {err_msg}")
                                # Safety block / finish_reason=2 retry with minimal neutral prompt
                                if 'finishreason' in err_msg.lower() and '2' in err_msg:
                                    try:
                                        safe_prompt = (
                                            "Provide neutral market context summary for the symbol and indicators. Return: context; indicator alignment; bias (bullish/bearish/neutral); next step phrased as 'monitor', 'accumulate', or 'reduce'. Avoid advice words like 'should' or 'recommend'."
                                        )
                                        resp_safe = gmodel.generate_content(safe_prompt)
                                        if resp_safe and hasattr(resp_safe,'candidates') and resp_safe.candidates:
                                            for cand3 in resp_safe.candidates:
                                                parts3 = getattr(cand3, 'content', None)
                                                if parts3 and hasattr(parts3,'parts'):
                                                    joined3 = []
                                                    for p3 in parts3.parts:
                                                        if hasattr(p3,'text') and p3.text:
                                                            joined3.append(p3.text)
                                                    if joined3:
                                                        analysis_text = '\n'.join(joined3).strip()
                                                        model = gm
                                                        last_err = None
                                                        print(f"✅ Gemini recovered via safety retry on {gm}")
                                                        break
                                            if analysis_text:
                                                continue  # proceed to classify/action outside loop
                                    except Exception as retry_block_err:
                                        print(f"❌ Gemini safety retry failed: {retry_block_err}")
                                # Record last error and decide whether to continue to next candidate
                                last_err = gerr
                                err_low = err_msg.lower()
                                if not ('not found' in err_low or 'unsupported' in err_low or ('finishreason' in err_low and '2' in err_low)):
                                    break
                        if last_err is not None and analysis_text is None:
                            error_message = f"Gemini call failed: {last_err}"[:300]
                            analysis_text = 'AI analysis failed.'
                else:
                    # OpenAI path
                    # Decide client (block key override > env key > None)
                    client_for_block = None
                    if api_key_block:
                        try:
                            from openai import OpenAI
                            client_for_block = OpenAI(api_key=api_key_block)
                        except Exception as blk_err:
                            print(f"⚠️ Block API key init failed: {blk_err}")
                    elif openai_client is not None:
                        client_for_block = openai_client

                    if client_for_block is None:
                        analysis_text = 'AI analysis unavailable: OpenAI not configured.'
                    else:
                        # Normalize certain UI models
                        ui_model = (model or '').strip()
                        if ui_model in ['o4-mini', 'gpt-4.1', 'gpt-4.1-mini']:
                            ui_model = 'gpt-4o-mini'
                        model_candidates = [m for m in [ui_model, 'gpt-4o-mini', 'gpt-4o', 'gpt-3.5-turbo-0125'] if m]
                        last_err = None
                        for m in model_candidates:
                            try:
                                resp = client_for_block.chat.completions.create(
                                    model=m,
                                    messages=[
                                        {"role": "system", "content": "You are an expert trading strategy analyst. Be concise, structured, and objective."},
                                        {"role": "user", "content": prompt}
                                    ],
                                    max_tokens=max_tokens,
                                    temperature=temperature
                                )
                                analysis_text = resp.choices[0].message.content.strip()
                                model = m
                                last_err = None
                                break
                            except Exception as ai_err:
                                last_err = ai_err
                                print(f"❌ OpenAI error with model '{m}': {ai_err}")

                        if last_err is not None and analysis_text is None:
                            err_txt = str(last_err)
                            if 'api_key' in err_txt.lower() or 'invalid' in err_txt.lower():
                                error_message = 'Invalid or unauthorized OpenAI API key. Please verify the key and account access to the selected model.'
                            elif 'model' in err_txt.lower() and ('not found' in err_txt.lower() or 'does not exist' in err_txt.lower() or 'unknown' in err_txt.lower()):
                                error_message = 'Requested model is unavailable for this API key. Tried fallbacks without success.'
                            elif 'insufficient_quota' in err_txt.lower() or 'quota' in err_txt.lower():
                                error_message = 'OpenAI account has insufficient quota/billing. Add credits or a payment method, then retry.'
                            elif 'rate' in err_txt.lower():
                                error_message = 'OpenAI rate limit hit. Please retry in a minute or lower request frequency.'
                            else:
                                error_message = f"OpenAI call failed: {err_txt}"[:300]
                            analysis_text = 'AI analysis failed.'

                exec_ms = (_t.time() - _start_ai) * 1000

                # Action classification
                def classify_action(text):
                    if not text:
                        return 'neutral'
                    tl = text.lower()
                    if any(k in tl for k in ['sell','short','reduce','exit']):
                        return 'bearish'
                    if any(k in tl for k in ['buy','long','accumulate','enter']):
                        return 'bullish'
                    if any(k in tl for k in ['wait','hold','neutral','sidelines']):
                        return 'neutral'
                    return 'neutral'
                action = classify_action(analysis_text)

                # Improve message clarity when failure
                display_message = (analysis_text or '')
                if error_message and display_message.strip() == 'AI analysis failed.':
                    display_message = f"{display_message} {error_message}".strip()
                ai_agent_results.append({
                    'block_id': ai_block.get('id'),
                    'block_type': 'ai_agent',
                    'status': 'passed' if error_message is None else 'failed',
                    'message': display_message[:1000],
                    'data': {
                        'analysis': analysis_text,
                        'model': model,
                        'provider': provider,
                        'temperature': temperature,
                        'max_tokens': max_tokens,
                        'error': error_message,
                        'action': action
                    },
                    'execution_time_ms': exec_ms
                })

            print(f"✅ AI agent processing complete ({len(ai_agent_results)} result entries)")
        
        # Evaluate strategy performance over time (sample for efficiency)
        strategy_performance = []
        print(f"📊 Calculating strategy performance for {len(closes)} bars...")
        
        # Sample every N bars to avoid performance issues, but include recent data
        sample_rate = max(1, len(closes) // 100)  # Max 100 points
        
        for i in range(len(closes)):
            # Skip most early bars, but keep recent ones
            if i < len(closes) - 50:  # Always include last 50 bars
                if i % sample_rate != 0:
                    continue
            
            # Build data point for this bar
            bar_data = {
                'open': opens[i],
                'high': highs[i],
                'low': lows[i],
                'close': closes[i],
                'volume': volumes[i]
            }
            
            # Calculate indicators up to this point if enough data
            sentiment = 'neutral'
            if i >= 20:  # Need minimum data for indicators
                try:
                    if 'rsi' in block_types:
                        rsi_vals = rsi(closes[:i+1], indicator_params.get('rsi', {}).get('period', 14))
                        if rsi_vals and rsi_vals[-1] is not None:
                            bar_data['rsi'] = rsi_vals[-1]
                    
                    if 'ema' in block_types or 'sma' in block_types:
                        ema_vals = ema(closes[:i+1], indicator_params.get('ema', {}).get('period', 20))
                        if ema_vals and ema_vals[-1] is not None:
                            bar_data['ema'] = ema_vals[-1]
                    
                    if 'vwap' in block_types:
                        # Calculate VWAP for historical bars
                        slice_highs = highs[:i+1]
                        slice_lows = lows[:i+1]
                        slice_closes = closes[:i+1]
                        slice_volumes = volumes[:i+1]
                        
                        typical_prices = [(h + l + c) / 3.0 for h, l, c in zip(slice_highs, slice_lows, slice_closes)]
                        total_v = sum(v for v in slice_volumes if v)
                        
                        if total_v > 0:
                            vwap_val = sum(tp * v for tp, v in zip(typical_prices, slice_volumes)) / total_v
                        else:
                            vwap_val = sum(typical_prices) / len(typical_prices) if typical_prices else slice_closes[-1]
                        
                        bar_data['vwap'] = vwap_val
                    
                    if 'bollinger' in block_types:
                        # Calculate Bollinger Bands for historical bars
                        period = indicator_params.get('bollinger', {}).get('period', 20)
                        num_std = indicator_params.get('bollinger', {}).get('num_std', 2)
                        upper, middle, lower = boll_bands(closes[:i+1], period=period, num_std=num_std)
                        if upper[-1] is not None:
                            bar_data['boll_upper'] = upper[-1]
                            bar_data['boll_middle'] = middle[-1]
                            bar_data['boll_lower'] = lower[-1]
                    
                    if 'macd' in block_types:
                        # Calculate MACD for historical bars
                        fast = indicator_params.get('macd', {}).get('fast', 12)
                        slow = indicator_params.get('macd', {}).get('slow', 26)
                        signal = indicator_params.get('macd', {}).get('signal', 9)
                        macd_line, macd_signal, macd_hist = compute_macd(closes[:i+1], fast=fast, slow=slow, signal=signal)
                        if macd_line[-1] is not None:
                            bar_data['macd_line'] = macd_line[-1]
                            if macd_signal[-1] is not None:
                                bar_data['macd_signal'] = macd_signal[-1]
                            if macd_hist[-1] is not None:
                                bar_data['macd_histogram'] = macd_hist[-1]
                    
                    if 'sma' in block_types:
                        # Calculate SMA for historical bars
                        period = indicator_params.get('sma', {}).get('period', 20)
                        sma_vals = sma(closes[:i+1], period)
                        if sma_vals and sma_vals[-1] is not None:
                            bar_data['sma'] = sma_vals[-1]
                    
                    # Evaluate strategy decision for this bar
                    bar_result = workflow_engine.execute_workflow(workflow_blocks, bar_data)
                    if bar_result.success and bar_result.final_decision:
                        decision_lower = bar_result.final_decision.lower()
                        if 'bullish' in decision_lower or 'long' in decision_lower or 'buy' in decision_lower:
                            sentiment = 'bullish'
                        elif 'bearish' in decision_lower or 'short' in decision_lower or 'sell' in decision_lower:
                            sentiment = 'bearish'
                except Exception as bar_err:
                    print(f"⚠️ Error evaluating bar {i}: {bar_err}")
            
            strategy_performance.append({
                'timestamp': bars.get('timestamp', [])[i] if i < len(bars.get('timestamp', [])) else None,
                'close': closes[i],
                'sentiment': sentiment,
                'decision': workflow_result.final_decision if i == len(closes) - 1 else None,
                'success': workflow_result.success if i == len(closes) - 1 else False
            })
        
        print(f"✅ Strategy performance calculated: {len(strategy_performance)} data points")
        
        # Format response with historical data for charting
        # Prepare block results including AI agent outputs (append after condition blocks)
        block_output = [
            {
                'block_id': b.block_id,
                'block_type': b.block_type,
                'status': b.status.value,
                'message': b.message,
                'data': b.data,
                'execution_time_ms': b.execution_time_ms
            }
            for b in workflow_result.blocks
        ] + ai_agent_results

        response = {
            'success': workflow_result.success,
            'final_decision': workflow_result.final_decision,
            'stop_reason': workflow_result.stop_reason,
            'execution_time_ms': workflow_result.total_execution_time_ms,
            'blocks': block_output,
            'latest_data': latest_data,
            'bar_count': len(closes),
            'historical_bars': {
                'timestamps': bars.get('timestamp', []),
                'open': opens,
                'high': highs,
                'low': lows,
                'close': closes,
                'volume': volumes
            },
            'strategy_performance': strategy_performance,
            # ✅ Include unified executor signal and debug info
            'unified_signal': unified_signal,
            'unified_debug': unified_debug
        }
        
        print(f"✅ Workflow completed: {workflow_result.final_decision}")
        print(f"📊 latest_data keys: {list(latest_data.keys())}")
        print(f"💰 latest_data.price: {latest_data.get('price', 'MISSING')}")
        print(f"🎯 Unified signal: {unified_signal}")
        
        # Send Telegram notification if workflow succeeded (all conditions passed)
        try:
            # Extract signal type from signal block OR infer from conditions
            # ✅ Use unified_signal if available (takes precedence)
            signal_type = unified_signal
            
            # Fallback: try to get signal type from Signal block
            if not signal_type:
                for block in workflow_blocks:
                    if block.get('type') == 'signal':
                        signal_type = block.get('params', {}).get('type')
                        break
            
            # If no explicit signal type, infer from RSI conditions
            if not signal_type and workflow_result.success:
                for result in workflow_result.blocks:
                    if result.block_type == 'rsi' and result.status.value == 'passed':
                        # Check if it was oversold (BUY) or overbought (SELL)
                        if 'oversold' in result.message.lower():
                            signal_type = 'BUY'
                            break
                        elif 'overbought' in result.message.lower():
                            signal_type = 'SELL'
                            break
            
            # Send notification if workflow succeeded and we have a signal type
            if workflow_result.success and signal_type:
                # Check if this is a new signal (different from last sent)
                strategy_key = f"{symbol}_{timeframe}"
                last_signal = last_sent_signals.get(strategy_key)
                
                if last_signal != signal_type:
                    # Signal changed! Send notification
                    print(f"📱 Signal CHANGED from {last_signal} to {signal_type}, sending Telegram notification...")
                    notifier = get_notifier()
                    
                    # Load settings if not already loaded
                    if not notifier.is_configured():
                        settings = load_telegram_settings()
                        if settings.get('bot_token') and settings.get('chat_id'):
                            notifier.set_credentials(settings['bot_token'], settings['chat_id'])
                    
                    # Send notification if configured
                    if notifier.is_configured():
                        # Get strategy name from request or use default
                        strategy_name = data.get('strategy_name', f"{symbol} {timeframe} Strategy")
                        
                        # Extract additional indicator data for the message
                        additional_info = {}
                        if 'rsi' in latest_data:
                            additional_info['RSI'] = latest_data['rsi']
                        if 'macd' in latest_data:
                            additional_info['MACD'] = latest_data['macd']
                        if 'ema' in latest_data:
                            additional_info['EMA'] = latest_data['ema']
                        if 'volume' in latest_data:
                            additional_info['Volume'] = latest_data['volume']
                        
                        telegram_result = notifier.send_signal(
                            strategy_name=strategy_name,
                            signal=signal_type,  # Use the signal type from the Signal block
                            symbol=symbol,
                            price=latest_data.get('price') or latest_data.get('close'),
                            timeframe=timeframe,
                            additional_info=additional_info if additional_info else None
                        )
                        
                        if telegram_result.get('success'):
                            print(f"📱 Telegram notification sent successfully for {signal_type} signal")
                            # Update last sent signal
                            last_sent_signals[strategy_key] = signal_type
                        else:
                            print(f"⚠️ Telegram notification failed: {telegram_result.get('error')}")
                else:
                    # Same signal as before, don't spam
                    print(f"ℹ️ Signal remains {signal_type}, not sending duplicate Telegram notification")
            elif workflow_result.success:
                print(f"ℹ️ No Telegram notification sent (no signal block found or Telegram not configured)")
        except Exception as telegram_err:
            # Don't fail the whole request if Telegram fails
            print(f"⚠️ Telegram notification error: {telegram_err}")
        
        return jsonify(response)
    
    except Exception as e:
        print(f"❌ Error executing workflow: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

def _build_v2_response(symbol: str, timeframe: str, days: int, engine_resp: Dict[str, Any]) -> Dict[str, Any]:
    """Transform existing workflow execute response into Results Panel v2 shape."""
    import time as _t
    ts = engine_resp.get('historical_bars', {}).get('timestamps', [])
    start_ts = ts[0] if ts else None
    end_ts = ts[-1] if ts else None
    blocks_raw = engine_resp.get('blocks', [])
    
    # ═══════════════════════════════════════════════════════════════════════
    # FIX: Sort blocks according to unified executor's topological order
    # This ensures blocks appear in proper execution order (input → indicators → logic → output)
    # ═══════════════════════════════════════════════════════════════════════
    unified_debug = engine_resp.get('unified_debug', {})
    execution_order = unified_debug.get('execution_order', [])
    
    if execution_order and blocks_raw:
        # Create a map of block_id to position in topological order
        # The execution_order contains node IDs in correct dependency order
        order_map = {}
        for pos, node_id in enumerate(execution_order):
            # Handle both string and int node IDs
            order_map[str(node_id)] = pos
            order_map[int(node_id) if str(node_id).isdigit() else node_id] = pos
        
        # Type-based priority for fallback (when block_id not in execution_order)
        type_priority = {
            'input': 0, 'symbol': 1, 'timeframe': 2, 'config': 3, 'alpaca_config': 4,
            'volume_history': 5,
            'rsi': 100, 'ema': 101, 'sma': 102, 'macd': 103, 'bollinger': 104,
            'stochastic': 105, 'vwap': 106, 'obv': 107, 'atr': 108, 'volspike': 109,
            'volume_spike': 109, 'support_resistance': 110, 'trendline': 111,
            'compare': 200,
            'and': 300, 'or': 301, 'not': 302,
            'signal': 400, 'output': 401
        }
        
        # Sort blocks_raw by their position in the topological order
        def get_sort_key(block):
            block_id = block.get('block_id')
            block_type = block.get('block_type', '')
            
            # Primary: use execution_order position if available
            if block_id is not None:
                if str(block_id) in order_map:
                    return (order_map[str(block_id)], 0)  # (position, tie-breaker)
                if block_id in order_map:
                    return (order_map[block_id], 0)
            
            # Fallback: use type-based priority
            priority = type_priority.get(block_type, 150)
            return (priority, block_id if block_id is not None else 9999)
        
        blocks_raw = sorted(blocks_raw, key=get_sort_key)
        print(f"[DIAG] Sorted blocks by topological order: {[(b.get('block_id'), b.get('block_type')) for b in blocks_raw]}")
    
    # Map block types to friendly names/emojis
    icon_map = {
        'rsi': ('⚡', 'RSI'), 'ema': ('⚡', 'EMA'), 'sma': ('⚡', 'SMA'), 'macd': ('⚡', 'MACD'),
        'bollinger': ('⚡', 'Bollinger Bands'), 'vwap': ('⚡', 'VWAP'), 'stochastic': ('⚡', 'Stochastic'),
        'obv': ('💧', 'OBV'), 'trendline': ('⚡', 'Trendline'), 'volspike': ('💧', 'Volume Spike'),
        'atr': ('📊', 'ATR'), 'support_resistance': ('📈', 'Support/Resistance'),
        'and': ('➕', 'AND Gate'), 'or': ('➕', 'OR Gate'), 'not': ('➕', 'NOT Gate'),
        'compare': ('➕', 'Compare'), 'ai_agent': ('🤖', 'AI Agent')
    }
    
    # ═══════════════════════════════════════════════════════════════════════
    # FIX: Use unified executor's node_outputs to get correct AND/OR gate results
    # The sequential engine doesn't understand graph connections, but unified executor does
    # ═══════════════════════════════════════════════════════════════════════
    node_outputs = unified_debug.get('node_outputs', {})
    
    # Debug: log node_outputs keys vs blocks_raw block_ids
    print(f"[V2 DEBUG] node_outputs keys: {list(node_outputs.keys()) if node_outputs else 'EMPTY'}")
    print(f"[V2 DEBUG] blocks_raw block_ids: {[b.get('block_id') for b in blocks_raw]}")
    
    blocks_v2: List[Dict[str, Any]] = []
    for i, b in enumerate(blocks_raw):
        block_id = b.get('block_id', i)
        block_type = b.get('block_type')
        ico, nm = icon_map.get(block_type, ('🧩', block_type))
        
        # Default values from sequential engine
        status = str(b.get('status', 'skipped')).lower()
        message = b.get('message') or ''
        block_data = b.get('data') or {}
        
        # ═══════════════════════════════════════════════════════════════════
        # OVERRIDE with unified executor results for logic gates and indicators
        # This fixes the "AND gate missing input(s)" issue
        # ═══════════════════════════════════════════════════════════════════
        
        # Debug for logic gates
        if block_type in ['and', 'or', 'not']:
            print(f"[V2 LOGIC] block_id={block_id}, type={block_type}, checking node_outputs...")
            print(f"[V2 LOGIC]   str(block_id) in node_outputs: {str(block_id) in node_outputs if node_outputs else 'EMPTY'}")
        
        if node_outputs and str(block_id) in node_outputs:
            unified_output = node_outputs[str(block_id)]
            
            if block_type in ['and', 'or', 'not']:
                print(f"[V2 LOGIC]   FOUND! unified_output = {unified_output}")
            
            # Get the result from unified executor
            result = unified_output.get('result')
            if result is None:
                result = unified_output.get('value')
            if result is None:
                result = unified_output.get('signal')
            
            # For AND/OR/NOT gates, use the unified executor's actual evaluation
            if block_type in ['and', 'or', 'not']:
                if result is True:
                    status = 'passed'
                    # Build message showing actual inputs
                    a_val = unified_output.get('a', 'N/A')
                    b_val = unified_output.get('b', 'N/A')
                    if block_type == 'and':
                        message = f"AND({a_val}, {b_val}) = True"
                    elif block_type == 'or':
                        message = f"OR({a_val}, {b_val}) = True"
                    elif block_type == 'not':
                        message = f"NOT({a_val}) = True"
                elif result is False:
                    status = 'failed'
                    a_val = unified_output.get('a', 'N/A')
                    b_val = unified_output.get('b', 'N/A')
                    if block_type == 'and':
                        message = f"AND({a_val}, {b_val}) = False"
                    elif block_type == 'or':
                        message = f"OR({a_val}, {b_val}) = False"
                    elif block_type == 'not':
                        message = f"NOT({a_val}) = False"
                print(f"[V2 LOGIC]   OVERRIDE: status={status} message={message}")
                block_data = {'condition_met': result, 'unified_output': unified_output}
            
            # For compare nodes
            elif block_type == 'compare':
                if result is True:
                    status = 'passed'
                elif result is False:
                    status = 'failed'
                a_val = unified_output.get('a', unified_output.get('value'))
                b_val = unified_output.get('b', unified_output.get('threshold'))
                op = unified_output.get('operator', '>')
                message = f"{a_val} {op} {b_val} = {result}"
                block_data = {'condition_met': result, 'unified_output': unified_output}
            
            # For indicators, include computed values
            elif block_type in ['rsi', 'ema', 'sma', 'macd', 'bollinger', 'stochastic', 'vwap', 'obv', 'atr']:
                # Indicators pass if they computed a value
                has_value = any(v is not None for k, v in unified_output.items() if k not in ['signal', 'result'])
                if has_value:
                    status = 'passed'
                block_data = {'condition_met': True, 'unified_output': unified_output, **unified_output}
        
        blocks_v2.append({
            'id': block_id,
            'type': block_type,
            'emoji': ico,
            'name': nm,
            'status': 'passed' if status == 'passed' else ('failed' if status == 'failed' else 'skipped'),
            'outputs': block_data,
            'params': block_data,
            'logs': [message] if message else [],
            'explanation': message,
            'failReason': message if status == 'failed' else None,
            'executionTimeMs': float(b.get('execution_time_ms', 0) or 0),
            'raw': b
        })
    # AI analysis (first ai_agent block message if any)
    ai_blocks = [b for b in blocks_raw if b.get('block_type') == 'ai_agent']
    ai_text = None
    if ai_blocks:
        d = (ai_blocks[0].get('data') or {})
        ai_text = d.get('analysis') or ai_blocks[0].get('message')
    # Equity curve: normalize closes to 100000 starting equity
    closes = engine_resp.get('historical_bars', {}).get('close', [])
    times = ts
    equity_curve = []
    if closes and times:
        base = closes[0] if closes[0] else 1.0
        for c, t in zip(closes, times):
            if c is None:
                continue
            value = 100000.0 * (c / base)
            equity_curve.append({'time': t, 'value': value})
    # Status mapping
    status = 'completed' if engine_resp.get('success') else ('stopped' if engine_resp.get('stop_reason') else 'failed')
    # Diagnostic: print core decision & block statuses for troubleshooting
    try:
        print(f"[DIAG] engine_resp.final_decision={engine_resp.get('final_decision')} success={engine_resp.get('success')}")
        for idx, b in enumerate(blocks_raw):
            btype = b.get('block_type')
            bstatus = b.get('status')
            bmsg = b.get('message')
            bdata = b.get('data') or {}
            cm = bdata.get('condition_met') if isinstance(bdata, dict) else None
            print(f"[DIAG] block[{idx}] type={btype} status={bstatus} condition_met={cm} message={bmsg}")
    except Exception as _e:
        print(f"[DIAG] failed to print diagnostics: {_e}")

    # Decide signal mapping
    # ✅ Use unified_signal if available (takes precedence over inference)
    unified_signal = engine_resp.get('unified_signal')
    unified_debug = engine_resp.get('unified_debug', {})
    has_connections = unified_debug.get('connections_count', 0) > 0
    
    if unified_signal:
        # Unified executor returned a signal (BUY or SELL) - use it
        final_signal = unified_signal
        print(f"[DIAG] Using unified_signal={final_signal}")
    elif has_connections and unified_signal is None:
        # ✅ FIX: Unified executor was used (has connections) but returned None
        # This means workflow conditions were NOT met (e.g., AND gate failed)
        # Do NOT fall back to inference - respect the unified executor's decision
        final_signal = 'HOLD'
        print(f"[DIAG] Unified executor returned None (conditions not met) -> HOLD")
    else:
        # Fallback for sequential (non-graph) workflows without connections
        final_decision = (engine_resp.get('final_decision') or '')
        final_decision_up = str(final_decision).upper()
        final_signal = 'HOLD'
        if 'CONFIRMED' in final_decision_up:
            # Attempt to infer BUY vs SELL from the passed condition blocks and latest_data
            def infer_direction(blocks, latest):
                # Prefer any passed RSI block anywhere in the workflow: explicit rsi signals should override
                try:
                    for b in (blocks or []):
                        try:
                            btype = b.get('block_type') or b.get('type')
                            status = (b.get('status') or '').lower()
                            if status != 'passed':
                                continue
                            params = (b.get('data') or {}).get('params') or b.get('params') or {}
                            if btype == 'rsi':
                                rsi_val = float(latest.get('rsi') or 0)
                                low = float(params.get('oversold') or params.get('threshold_low') or 30)
                                high = float(params.get('overbought') or params.get('threshold_high') or 70)
                                cond = (params.get('rsi_condition') or params.get('condition') or 'any').lower()
                                if cond == 'oversold':
                                    return 'BUY'
                                if cond == 'overbought':
                                    return 'SELL'
                                if rsi_val < low:
                                    return 'BUY'
                                if rsi_val > high:
                                    return 'SELL'
                        except Exception:
                            continue
                except Exception:
                    pass

                # Fallback to original reverse-order heuristics for other indicators
                for b in reversed(blocks or []):
                    try:
                        btype = b.get('block_type') or b.get('type')
                        status = (b.get('status') or '').lower()
                        if status != 'passed':
                            continue
                        params = (b.get('data') or {}).get('params') or b.get('params') or {}
                        if btype in ('ema', 'sma'):
                            ema = latest.get('ema')
                            close = latest.get('close')
                            if ema is None or close is None:
                                continue
                            direction = (params.get('direction') or 'above').lower()
                            if direction == 'above':
                                return 'BUY' if close > ema else 'SELL'
                            if direction == 'below':
                                return 'SELL' if close < ema else 'BUY'
                        if btype == 'macd':
                            hist = latest.get('macd_hist')
                            if hist is None:
                                continue
                            return 'BUY' if hist > 0 else 'SELL'
                        if btype == 'bollinger':
                            upper = latest.get('boll_upper')
                            lower = latest.get('boll_lower')
                            close = latest.get('close')
                            # If we have an upper band and the close is above it, infer SELL.
                            # If we only have a lower band and the close is below it, infer BUY.
                            if upper is not None and close is not None:
                                if close >= upper:
                                    return 'SELL'
                            if lower is not None and close is not None:
                                if close <= lower:
                                    return 'BUY'
                        if btype == 'stochastic':
                            k = latest.get('stoch_k')
                            low = float(params.get('oversold') or params.get('stoch_low') or 20)
                            high = float(params.get('overbought') or params.get('stoch_high') or 80)
                            if k is None:
                                continue
                            if k < low:
                                return 'BUY'
                            if k > high:
                                return 'SELL'
                        if btype == 'vwap':
                            vwap = latest.get('vwap')
                            close = latest.get('close')
                            if vwap is None or close is None:
                                continue
                            return 'BUY' if close > vwap else 'SELL'
                    except Exception:
                        continue

                # If we couldn't infer direction from any passed block, be conservative and HOLD
                return 'HOLD'

            final_signal = infer_direction(engine_resp.get('blocks', []), engine_resp.get('latest_data', {}))
        elif 'REJECTED' in final_decision_up:
            # If stopped/failed, treat as HOLD unless explicit sell conditions determined elsewhere
            final_signal = 'HOLD'
        else:
            final_signal = 'HOLD'
    summary = {
        'strategyName': 'Flow Trades Workflow',
        'startedAt': engine_resp.get('historical_bars', {}).get('timestamps', [None])[0] or '',
        'completedAt': engine_resp.get('historical_bars', {}).get('timestamps', [None])[-1] if ts else '',
        'status': status,
        'symbol': symbol,
        'timeframe': timeframe,
        'lookbackDays': days,
        'startTimestamp': start_ts or '',
        'endTimestamp': end_ts or '',
        'candlesProcessed': int(engine_resp.get('bar_count', 0)),
        'runtimeMs': float(engine_resp.get('execution_time_ms', 0) or 0),
        'workflowLength': len(blocks_raw)
    }
    return {
        'summary': summary,
        'blocks': blocks_v2,
        'finalSignal': final_signal,
        'confidence': engine_resp.get('confidence', None),
        'aiAnalysis': ai_text,
        'equityCurve': equity_curve,
        'latest_data': engine_resp.get('latest_data', {}),
        'signals': engine_resp.get('signals', []),
        'trades': engine_resp.get('trades', []),
        'bar_count': engine_resp.get('bar_count', 0),
        'historical_bars': engine_resp.get('historical_bars', {})
    }

@app.route('/execute_workflow_v2', methods=['POST'])
def execute_workflow_v2():
    """Execute workflow and return Results Panel v2 shape."""
    try:
        # Reuse existing endpoint logic by calling the function directly
        # but we reconstruct with required shape.
        req = request.json or {}
        symbol = req.get('symbol', 'SPY')
        timeframe = req.get('timeframe', '1Hour')
        days = req.get('days', 7)

        # Call the original implementation to get full context.
        # execute_workflow may return either a Flask Response or a (response, status) tuple,
        # so normalize using make_response to ensure we can call get_json().
        with app.test_request_context('/execute_workflow', method='POST', json=req):
            raw = execute_workflow()
        # Normalize to a Response object
        if isinstance(raw, tuple):
            resp = make_response(*raw)
        else:
            resp = make_response(raw)
        
        # Check status and get response data
        engine_resp = None
        if resp.status_code != 200:
            # Try to surface the backend response body for easier debugging
            try:
                body_text = resp.get_data(as_text=True)
                print(f"⚠️ execute_workflow returned status {resp.status_code}: {body_text}")
                # Try to parse JSON body
                try:
                    body_json = resp.get_json(force=True)
                except Exception:
                    body_json = {'raw': body_text}
            except Exception as e:
                print(f"⚠️ Failed reading wrapped response body: {e}")
                body_json = {'error': 'Failed to read backend response body'}
            return make_response(jsonify({'error': 'wrapped_execute_failed', 'details': body_json}), resp.status_code)
        else:
            engine_resp = resp.get_json()
        
        v2 = _build_v2_response(symbol, timeframe, days, engine_resp)
        return jsonify(v2)
    except Exception as e:
        print(f"❌ Error in v2 execute: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/test_alpaca_keys', methods=['POST'])
def test_alpaca_keys():
    """Quick endpoint to validate Alpaca API keys by attempting to fetch a small bar window.

    Body: { alpacaKeyId, alpacaSecretKey, symbol?, timeframe?, days? }
    Returns: { ok: true } on success or { ok: false, error: '...' } on failure
    """
    try:
        data = request.json or {}
        key = data.get('alpacaKeyId') or data.get('alpacaKey')
        secret = data.get('alpacaSecretKey') or data.get('alpacaSecret')
        symbol = (data.get('symbol') or 'SPY').upper()
        tf = normalize_timeframe(data.get('timeframe') or '1Hour')
        days = parse_days(data.get('days') or 1, default=1)

        if not key or not secret:
            return jsonify({'ok': False, 'error': 'Missing alpacaKeyId or alpacaSecretKey in request body'}), 400

        end_date = datetime.utcnow()
        start_date = end_date - timedelta(days=days)
        start_str = start_date.strftime('%Y-%m-%dT%H:%M:%SZ')
        end_str = end_date.strftime('%Y-%m-%dT%H:%M:%SZ')

        bars = fetch_bars_full(symbol, start_str, end_str, tf, api_key=key, api_secret=secret)
        if not bars or not bars.get('close'):
            return jsonify({'ok': False, 'error': 'No bars returned with provided keys (check permissions/timeframe)'}), 400
        # minimal success payload
        return jsonify({'ok': True, 'symbol': symbol, 'timeframe': tf, 'count': len(bars.get('close', []))}), 200
    except Exception as e:
        print(f"❌ Error validating Alpaca keys: {e}")
        return jsonify({'ok': False, 'error': str(e)}), 500


# --- Backtest Data & Execution Endpoints (for frontend backtesting) -----------------------
@app.route('/backtest_data', methods=['POST'])
def backtest_data():
    """Fetch historical data for backtesting"""
    try:
        req = request.json or {}
        symbol = req.get('symbol', 'SPY')
        timeframe = req.get('timeframe', '1Hour')
        start_date = req.get('start')
        end_date = req.get('end')
        alpaca_key_id = req.get('alpacaKeyId')
        alpaca_secret_key = req.get('alpacaSecretKey')

        if not start_date or not end_date:
            return jsonify({'error': 'start and end dates required'}), 400

        print(f"📊 Fetching backtest data: {symbol} {timeframe} from {start_date} to {end_date}")

        # Fetch bars using alpaca_fetch
        bars = fetch_bars_full(
            symbol=symbol,
            timeframe=timeframe,
            start=start_date,
            end=end_date,
            api_key=alpaca_key_id,
            api_secret=alpaca_secret_key
        )

        if not bars or 'error' in bars:
            return jsonify({'error': bars.get('error', 'Failed to fetch data')}), 500

        # Convert to list of bar objects
        bar_list = []
        length = len(bars.get('timestamp', []))
        for i in range(length):
            bar_list.append({
                't': bars['timestamp'][i],
                'o': bars['open'][i],
                'h': bars['high'][i],
                'l': bars['low'][i],
                'c': bars['close'][i],
                'v': bars['volume'][i]
            })

        print(f"✅ Fetched {len(bar_list)} bars for backtesting")
        return jsonify({'bars': bar_list}), 200

    except Exception as e:
        print(f"❌ Error fetching backtest data: {e}")
        return jsonify({'error': str(e)}), 500


@app.route('/execute_backtest', methods=['POST'])
def execute_backtest():
    """
    Execute workflow against historical data and return signals.
    
    Uses UnifiedStrategyExecutor for graph-based execution to ensure
    identical signal generation between backtesting and live signals.
    """
    try:
        req = request.json or {}
        
        # Debug: Log request keys
        print(f"📥 /execute_backtest received keys: {list(req.keys())}", flush=True)
        
        symbol = req.get('symbol', 'SPY')
        timeframe = req.get('timeframe', '1Hour')
        workflow = req.get('workflow', [])
        historical_data = req.get('historicalData', [])
        connections = req.get('connections', [])
        
        # Backtest configuration
        config = req.get('config', {})
        take_profit_pct = float(config.get('takeProfitPct', 0))
        stop_loss_pct = float(config.get('stopLossPct', 0))
        shares_per_trade = int(config.get('sharesPerTrade', 100))
        initial_capital = float(config.get('initialCapital', 10000))
        commission_per_trade = float(config.get('commissionPerTrade', 0))

        if not workflow:
            return jsonify({'error': 'workflow required'}), 400
        if not historical_data:
            return jsonify({'error': 'historicalData required'}), 400

        print(f"🔄 Executing backtest with UnifiedStrategyExecutor: {len(workflow)} nodes, {len(historical_data)} bars, {len(connections)} connections", flush=True)
        print(f"⚙️  Config: TP={take_profit_pct}% SL={stop_loss_pct}% Shares={shares_per_trade} Capital=${initial_capital}", flush=True)
        
        # Debug: Print node types
        node_types = [n.get('type') for n in workflow]
        print(f"📋 Node types: {node_types}", flush=True)
        
        # Debug: Print first few connections
        if connections:
            print(f"📎 First 3 connections: {connections[:3]}", flush=True)
        else:
            print(f"⚠️  No connections received from frontend - will use sequential fallback", flush=True)

        # Import the unified executor
        from workflows.unified_executor import execute_unified_workflow

        # Calculate warmup period based on indicator periods
        warmup_period = 50  # Default minimum
        for node in workflow:
            params = node.get('params') or node.get('configValues') or {}
            node_type = node.get('type', '').lower()
            
            if node_type == 'rsi':
                warmup_period = max(warmup_period, int(params.get('period', 14)) + 5)
            elif node_type == 'ema':
                warmup_period = max(warmup_period, int(params.get('period', 9)) + 5)
            elif node_type == 'sma':
                warmup_period = max(warmup_period, int(params.get('period', 20)) + 5)
            elif node_type == 'macd':
                slow = int(params.get('slow', params.get('slowPeriod', 26)))
                signal = int(params.get('signal', params.get('signalPeriod', 9)))
                warmup_period = max(warmup_period, slow + signal + 5)
            elif node_type in ['bollinger', 'bollingerbands']:
                warmup_period = max(warmup_period, int(params.get('period', 20)) + 5)
            elif node_type == 'volume_spike':
                warmup_period = max(warmup_period, int(params.get('period', 20)) + 5)
        
        print(f"📊 Calculated warmup period: {warmup_period} bars", flush=True)

        # Process each bar through the workflow
        signals = []
        
        for i in range(warmup_period, len(historical_data)):
            bar = historical_data[i]
            
            # Build price/volume history arrays up to current bar
            close_history = [historical_data[j]['c'] for j in range(max(0, i - 1000), i + 1)]
            volume_history = [historical_data[j]['v'] for j in range(max(0, i - 1000), i + 1)]
            high_history = [historical_data[j]['h'] for j in range(max(0, i - 1000), i + 1)]
            low_history = [historical_data[j]['l'] for j in range(max(0, i - 1000), i + 1)]
            
            # Build market_data dict for UnifiedStrategyExecutor
            market_data = {
                'close': bar['c'],
                'open': bar['o'],
                'high': bar['h'],
                'low': bar['l'],
                'volume': bar['v'],
                'timestamp': bar['t'],
                'close_history': close_history,
                'volume_history': volume_history,
                'high_history': high_history,
                'low_history': low_history
            }
            
            # Execute using UnifiedStrategyExecutor
            signal_value = None
            
            if connections and len(connections) > 0:
                # Graph-based execution
                try:
                    signal_value, debug_info = execute_unified_workflow(
                        nodes=workflow,
                        connections=connections,
                        market_data=market_data,
                        debug=(i < warmup_period + 5)  # Debug first 5 bars after warmup
                    )
                    
                    if i < warmup_period + 5:
                        print(f"  [UNIFIED] Bar {i}: signal={signal_value}, nodes={debug_info.get('nodes_count')}, connections={debug_info.get('connections_count')}")
                        if signal_value:
                            print(f"    → Output condition: {debug_info.get('final_condition')}, direction: {debug_info.get('signal_direction')}")
                        
                except Exception as e:
                    if i < warmup_period + 10:
                        print(f"  [UNIFIED ERROR] Bar {i}: {e}")
                        import traceback
                        traceback.print_exc()
                    signal_value = None
            else:
                # Sequential fallback (no connections) - use simple RSI/EMA inference
                result = workflow_engine.execute_workflow(workflow, {
                    'close': bar['c'],
                    'open': bar['o'],
                    'high': bar['h'],
                    'low': bar['l'],
                    'volume': bar['v']
                })
                
                if result and result.success:
                    # Try to infer signal from result messages
                    for block_result in result.blocks:
                        if block_result.status.value == 'passed':
                            msg = block_result.message.lower()
                            if 'oversold' in msg or 'below' in msg:
                                signal_value = 'BUY'
                                break
                            elif 'overbought' in msg or 'above' in msg:
                                signal_value = 'SELL'
                                break
            
            # Add signal if different from last (deduplication)
            if signal_value:
                last_signal = signals[-1]['signal'] if signals else None
                if signal_value != last_signal:
                    signals.append({
                        'time': bar['t'],
                        'timestamp': bar['t'],
                        'signal': signal_value,
                        'price': bar['c'],
                        'close': bar['c']
                    })
                    print(f"  📍 Bar {i+1}/{len(historical_data)}: {signal_value} @ ${bar['c']:.2f} | time={bar['t']} [Total: {len(signals)}]")
            
            # Progress logging every 100 bars
            if i > 0 and i % 100 == 0:
                print(f"  ⏳ Processed {i}/{len(historical_data)} bars, {len(signals)} signals so far")

        print(f"✅ Generated {len(signals)} signals from backtest using UnifiedStrategyExecutor")
        
        return jsonify({
            'signals': signals,
            'historicalData': historical_data,
            'symbol': symbol,
            'timeframe': timeframe,
            'config': {
                'takeProfitPct': take_profit_pct,
                'stopLossPct': stop_loss_pct,
                'sharesPerTrade': shares_per_trade,
                'initialCapital': initial_capital,
                'commissionPerTrade': commission_per_trade
            }
        }), 200

    except Exception as e:
        print(f"❌ Error executing backtest: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


# --- Backtest API (MVP filesystem-backed) -------------------------------------------------
@app.route('/api/backtest/start', methods=['POST'])
def api_backtest_start():
    """Start a backtest job. Body expects at minimum: { symbol, timeframe, start, end, workflow }"""
    try:
        if backtest_manager is None:
            return jsonify({'error': 'Backtest manager not available'}), 503
        req = request.json or {}
        # Debug: log incoming backtest start payload for UI troubleshooting
        try:
            print(f"[DEBUG] /api/backtest/start payload: {json.dumps(req)[:2000]}")
        except Exception:
            print(f"[DEBUG] /api/backtest/start payload (unserializable)")
        meta = backtest_manager.submit_job(req)
        job_id = meta['job_id']
        return jsonify({'job_id': job_id, 'status_url': f"/api/backtest/status/{job_id}", 'results_url': f"/api/backtest/results/{job_id}"}), 202
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/backtest/status/<job_id>', methods=['GET'])
def api_backtest_status(job_id):
    try:
        if backtest_manager is None:
            return jsonify({'error': 'Backtest manager not available'}), 503
        meta = backtest_manager.get_job(job_id)
        if not meta:
            return jsonify({'error': 'job not found'}), 404
        return jsonify({'job_id': job_id, 'status': meta.get('status'), 'progress': meta.get('progress', 0), 'updated_at': meta.get('updated_at'), 'error': meta.get('error')}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/backtest/results/<job_id>', methods=['GET'])
def api_backtest_results(job_id):
    try:
        if backtest_manager is None:
            return jsonify({'error': 'Backtest manager not available'}), 503
        meta = backtest_manager.get_job(job_id)
        if not meta:
            return jsonify({'error': 'job not found'}), 404
        # If result stored inline in the job file
        result = meta.get('result')
        if result:
            return jsonify({'job_id': job_id, 'status': meta.get('status'), 'result': normalize_backtest_result(result)}), 200
        # If result path exists, load it
        if meta.get('result_path') and os.path.exists(meta['result_path']):
            with open(meta['result_path'], 'r', encoding='utf-8') as f:
                data = json.load(f)
            return jsonify({'job_id': job_id, 'status': data.get('status', meta.get('status')), 'result': normalize_backtest_result(data.get('result'))}), 200
        return jsonify({'job_id': job_id, 'status': meta.get('status'), 'result': None}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    return jsonify({'status': 'ok', 'message': 'FlowGrid Trading backend is running'})

@app.route('/', methods=['GET'])
def index():
    """Serve the main workflow builder HTML"""
    try:
        # Try to find workflow_builder.html in frontend directories
        possible_paths = [
            'workflow_builder.html',
            '../../../frontend/public/workflow_builder.html',
            '../../../frontend/ui/workflow-react/public/workflow_builder.html'
        ]
        for path in possible_paths:
            if os.path.exists(path):
                return send_file(path)
        # If not found, return a simple HTML response
        return jsonify({'message': 'FlowGrid Trading Backend API running. Frontend not found.'}), 200
    except Exception as e:
        return jsonify({'message': 'FlowGrid Trading Backend API running', 'error': str(e)}), 200

@app.route('/nvda_chart.png', methods=['GET'])
def nvda_chart():
    """Generate and serve NVDA price & RSI chart dynamically"""
    try:
        # Fetch data from Alpaca
        key_id = os.environ.get("ALPACA_KEY_ID", "PKWK255BDE3PVZT6WUHB77TNR2")
        secret_key = os.environ.get("ALPACA_SECRET_KEY", "HArLrbCW2zvoM217Nc6HxSqvpMLvHvEXdNATyznRfQY7")
        
        end = datetime.now()
        start = end - timedelta(days=7)
        
        url = "https://data.alpaca.markets/v2/stocks/NVDA/bars"
        params = {
            "timeframe": "1Hour",
            "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "end": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
            "adjustment": "raw",
            "limit": 200,
            "feed": "iex",
        }
        
        headers = {
            "APCA-API-KEY-ID": key_id,
            "APCA-API-SECRET-KEY": secret_key,
        }
        
        response = requests.get(url, params=params, headers=headers, timeout=10)
        response.raise_for_status()
        
        data = response.json()
        bars = data.get("bars", [])
        
        if not bars:
            raise RuntimeError("No bars returned")
        
        # Parse data
        dates = [datetime.fromisoformat(bar["t"].replace("Z", "+00:00")) for bar in bars]
        closes = [bar["c"] for bar in bars]
        highs = [bar["h"] for bar in bars]
        lows = [bar["l"] for bar in bars]
        
        # Calculate RSI
        def calculate_rsi(closes, period=14):
            if len(closes) < period + 1:
                return [50.0] * len(closes)
            
            deltas = [closes[i] - closes[i-1] for i in range(1, len(closes))]
            gains = [d if d > 0 else 0 for d in deltas]
            losses = [-d if d < 0 else 0 for d in deltas]
            
            rsi_values = [50.0]
            avg_gain = sum(gains[:period]) / period
            avg_loss = sum(losses[:period]) / period
            
            for i in range(period, len(deltas)):
                avg_gain = (avg_gain * (period - 1) + gains[i]) / period
                avg_loss = (avg_loss * (period - 1) + losses[i]) / period
                
                if avg_loss == 0:
                    rsi = 100.0
                else:
                    rs = avg_gain / avg_loss
                    rsi = 100 - (100 / (1 + rs))
                
                rsi_values.append(rsi)
            
            return rsi_values
        
        # Calculate EMA
        def calculate_ema(closes, period):
            if len(closes) < period:
                return [None] * len(closes)
            
            ema_values = [None] * (period - 1)
            sma = sum(closes[:period]) / period
            ema_values.append(sma)
            
            multiplier = 2 / (period + 1)
            
            for i in range(period, len(closes)):
                ema = (closes[i] - ema_values[-1]) * multiplier + ema_values[-1]
                ema_values.append(ema)
            
            return ema_values
        
        rsi_values = calculate_rsi(closes)
        ema20 = calculate_ema(closes, 20)
        ema50 = calculate_ema(closes, 50)
        
        # Pad RSI
        while len(rsi_values) < len(dates):
            rsi_values.insert(0, 50.0)
        
        # Create chart
        plt.style.use("dark_background")
        fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(13, 8), height_ratios=[3, 1], constrained_layout=True)
        
        # Price panel
        ax1.plot(dates, closes, color="#3b82f6", linewidth=2.5, alpha=0.98, label="Close", zorder=3)
        
        if len([v for v in ema20 if v is not None]) > 0:
            ax1.plot(dates, ema20, color="#f59e0b", linewidth=2.0, alpha=0.90, label="EMA 20", linestyle="-", zorder=2)
        if len([v for v in ema50 if v is not None]) > 0:
            ax1.plot(dates, ema50, color="#8b5cf6", linewidth=2.0, alpha=0.90, label="EMA 50", linestyle="-", zorder=2)
        
        ax1.set_title("NVDA Price & RSI - 1 Hour Bars (Last Week)", color="#f8fafc", fontsize=15, pad=18, fontweight=600)
        ax1.set_ylabel("Price (USD)", color="#cbd5e1", fontsize=12, fontweight=500)
        ax1.grid(True, which="major", color="#1e293b", linestyle="-", linewidth=0.8, alpha=0.5)
        ax1.tick_params(colors="#94a3b8", labelsize=10)
        ax1.yaxis.set_major_formatter(FuncFormatter(lambda x, _: f"${x:,.0f}"))
        
        # Auto-scale y-axis
        all_prices = closes + highs + lows
        if ema20:
            all_prices.extend([v for v in ema20 if v is not None])
        if ema50:
            all_prices.extend([v for v in ema50 if v is not None])
        
        price_min = min(all_prices)
        price_max = max(all_prices)
        price_range = price_max - price_min
        ax1.set_ylim(price_min - price_range * 0.02, price_max + price_range * 0.02)
        
        ax1.legend(loc="upper left", fontsize=10, framealpha=0.95, edgecolor="#334155")
        ax1.set_facecolor("#0a0f1a")
        
        # RSI panel
        ax2.plot(dates, rsi_values, color="#3b82f6", linewidth=2.3, label="RSI (14)", zorder=3)
        ax2.axhline(70, color="#ef4444", linestyle="-", linewidth=1.5, alpha=0.7, label="Overbought (70)")
        ax2.axhline(30, color="#10b981", linestyle="-", linewidth=1.5, alpha=0.7, label="Oversold (30)")
        ax2.axhline(50, color="#475569", linestyle=":", linewidth=1.0, alpha=0.5)
        ax2.fill_between(dates, 30, 70, color="#1e293b", alpha=0.25)
        
        ax2.set_ylabel("RSI", color="#cbd5e1", fontsize=12, fontweight=500)
        ax2.set_xlabel("Date/Time", color="#cbd5e1", fontsize=12, labelpad=12, fontweight=500)
        ax2.set_ylim(0, 100)
        ax2.grid(True, which="major", color="#1e293b", linestyle="-", linewidth=0.8, alpha=0.5)
        ax2.tick_params(colors="#94a3b8", labelsize=10)
        ax2.legend(loc="upper left", fontsize=9, framealpha=0.95, edgecolor="#334155")
        ax2.set_facecolor("#0a0f1a")
        
        # Format x-axis
        ax2.xaxis.set_major_formatter(mdates.DateFormatter("%m/%d %H:%M"))
        ax2.xaxis.set_major_locator(mdates.AutoDateLocator())
        plt.setp(ax2.xaxis.get_majorticklabels(), rotation=45, ha='right')
        
        fig.patch.set_facecolor("#000000")
        
        # Save to BytesIO
        img_buffer = BytesIO()
        plt.savefig(img_buffer, format='png', dpi=160, bbox_inches='tight')
        img_buffer.seek(0)
        plt.close(fig)
        
        return send_file(img_buffer, mimetype='image/png')
        
    except Exception as e:
        print(f"❌ Chart generation error: {e}")
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500

# ===== Telegram Notification Endpoints =====

@app.route('/api/telegram/settings', methods=['GET'])
def get_telegram_settings():
    """Get current Telegram settings"""
    try:
        settings = load_telegram_settings()
        # Don't send full token to frontend for security
        return jsonify({
            'bot_token_set': bool(settings.get('bot_token')),
            'chat_id': settings.get('chat_id', '')
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/telegram/settings', methods=['POST'])
def save_telegram_settings_endpoint():
    """Save Telegram settings"""
    try:
        data = request.json
        bot_token = data.get('bot_token', '').strip()
        chat_id = data.get('chat_id', '').strip()
        
        if not bot_token or not chat_id:
            return jsonify({'error': 'Bot token and chat ID are required'}), 400
        
        success = save_telegram_settings(bot_token, chat_id)
        
        if success:
            return jsonify({
                'success': True,
                'message': 'Telegram settings saved successfully'
            }), 200
        else:
            return jsonify({'error': 'Failed to save settings'}), 500
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/telegram/test', methods=['POST'])
def test_telegram():
    """Test Telegram connection and send test message"""
    try:
        notifier = get_notifier()
        
        # Load settings if not already loaded
        if not notifier.is_configured():
            settings = load_telegram_settings()
            if settings.get('bot_token') and settings.get('chat_id'):
                notifier.set_credentials(
                    settings['bot_token'],
                    settings['chat_id']
                )
        
        if not notifier.is_configured():
            return jsonify({
                'success': False,
                'error': 'Telegram not configured. Please save your settings first.'
            }), 400
        
        # Test connection
        test_result = notifier.test_connection()
        
        if not test_result.get('success'):
            return jsonify(test_result), 400
        
        # Send test message
        result = notifier.send_signal(
            strategy_name="Test Strategy",
            signal="BUY",
            symbol="TEST",
            price=100.50,
            timeframe="Test",
            additional_info={
                "message": "This is a test message from FlowGrid Trading"
            }
        )
        
        if result.get('success'):
            return jsonify({
                'success': True,
                'message': 'Test message sent successfully!',
                'bot_info': test_result
            }), 200
        else:
            return jsonify({
                'success': False,
                'error': result.get('error', 'Failed to send test message')
            }), 400
    
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500


# ============================================
# Dashboard API Endpoints
# ============================================

# In-memory storage for strategies, alerts, and activity (in production, use a database)
_dashboard_strategies = []
_dashboard_alerts = []
_dashboard_activity = []
_dashboard_account = {
    'equity': 100000,
    'initial_equity': 100000,
    'equity_history': [],
    'trades': []
}


def _calculate_flow_grade(account_data):
    """Calculate Flow Grade performance score based on account metrics."""
    trades = account_data.get('trades', [])
    equity_history = account_data.get('equity_history', [])
    
    if len(trades) < 5:
        return None  # Not enough data to calculate grade
    
    # Calculate metrics
    winning_trades = [t for t in trades if t.get('pnl', 0) > 0]
    losing_trades = [t for t in trades if t.get('pnl', 0) < 0]
    
    win_rate = len(winning_trades) / len(trades) * 100 if trades else 0
    
    total_wins = sum(t.get('pnl', 0) for t in winning_trades)
    total_losses = abs(sum(t.get('pnl', 0) for t in losing_trades))
    profit_factor = total_wins / total_losses if total_losses > 0 else 0
    
    # Calculate Sharpe-like ratio (simplified)
    if len(equity_history) > 1:
        returns = []
        for i in range(1, len(equity_history)):
            prev = equity_history[i-1].get('v', equity_history[i-1])
            curr = equity_history[i].get('v', equity_history[i])
            if isinstance(prev, (int, float)) and isinstance(curr, (int, float)) and prev > 0:
                returns.append((curr - prev) / prev)
        
        if returns:
            avg_return = sum(returns) / len(returns)
            std_return = (sum((r - avg_return)**2 for r in returns) / len(returns)) ** 0.5
            sharpe_ratio = (avg_return / std_return * (252 ** 0.5)) if std_return > 0 else 0
        else:
            sharpe_ratio = 0
    else:
        sharpe_ratio = 0
    
    # Calculate consistency (percentage of profitable periods)
    consistency = 0
    if len(equity_history) > 5:
        profitable_periods = 0
        for i in range(1, len(equity_history)):
            prev = equity_history[i-1].get('v', equity_history[i-1])
            curr = equity_history[i].get('v', equity_history[i])
            if isinstance(prev, (int, float)) and isinstance(curr, (int, float)):
                if curr >= prev:
                    profitable_periods += 1
        consistency = profitable_periods / (len(equity_history) - 1) * 100
    
    # Calculate overall score (0-100)
    score = 0
    score += min(win_rate * 0.3, 30)  # Win rate contributes up to 30 points
    score += min(profit_factor * 10, 25)  # Profit factor contributes up to 25 points
    score += min(max(sharpe_ratio + 1, 0) * 15, 25)  # Sharpe contributes up to 25 points
    score += min(consistency * 0.2, 20)  # Consistency contributes up to 20 points
    
    return {
        'score': round(min(max(score, 0), 100)),
        'metrics': {
            'winRate': round(win_rate, 2),
            'profitFactor': round(profit_factor, 2),
            'sharpeRatio': round(sharpe_ratio, 2),
            'consistency': round(consistency, 2)
        }
    }


def _get_market_status():
    """Determine market status based on time and API connectivity."""
    now = datetime.now()
    hour = now.hour
    weekday = now.weekday()
    
    # Markets closed on weekends
    if weekday >= 5:
        return 'disconnected'
    
    # Pre-market: 4am-9:30am ET, Market hours: 9:30am-4pm ET
    if 9 <= hour < 16:
        return 'live'
    elif 4 <= hour < 9 or 16 <= hour < 20:
        return 'delayed'
    else:
        return 'disconnected'


@app.route('/api/dashboard/metrics', methods=['GET'])
def get_dashboard_metrics():
    """Get main dashboard metrics for the top widgets."""
    try:
        equity = _dashboard_account.get('equity', 100000)
        initial = _dashboard_account.get('initial_equity', 100000)
        equity_history = _dashboard_account.get('equity_history', [])
        
        # Calculate total return
        total_return = ((equity - initial) / initial) * 100 if initial > 0 else 0
        
        # Calculate max drawdown
        max_drawdown = 0
        peak = initial
        for point in equity_history:
            val = point.get('v', point) if isinstance(point, dict) else point
            if isinstance(val, (int, float)):
                if val > peak:
                    peak = val
                drawdown = ((peak - val) / peak) * 100 if peak > 0 else 0
                max_drawdown = max(max_drawdown, drawdown)
        
        # Generate sparkline data (last 20 points)
        equity_spark = []
        if equity_history:
            spark_data = equity_history[-20:]
            equity_spark = [p.get('v', p) if isinstance(p, dict) else p for p in spark_data]
        else:
            # Generate sample data if no history
            import random
            base = initial
            for _ in range(20):
                base = base * (1 + random.uniform(-0.01, 0.015))
                equity_spark.append(round(base, 2))
        
        # Return sparkline data
        return_spark = []
        if len(equity_spark) > 1:
            for i, val in enumerate(equity_spark):
                ret = ((val - initial) / initial) * 100
                return_spark.append(round(ret, 2))
        
        # Drawdown spark
        drawdown_spark = []
        peak = equity_spark[0] if equity_spark else initial
        for val in equity_spark:
            if val > peak:
                peak = val
            dd = -((peak - val) / peak) * 100 if peak > 0 else 0
            drawdown_spark.append(round(dd, 2))
        
        # Sample trading metrics for TradeZella-style dashboard
        import random
        net_pnl = 248.78
        trade_count = 12
        trade_expectancy = 248.78
        profit_factor = 1.24
        win_percent = 39.02
        win_count = 32
        loss_count = 51
        avg_win_loss_ratio = 2.4
        avg_win = 34.82
        avg_loss = 51.32
        
        return jsonify({
            'accountEquity': round(equity, 2),
            'totalReturn': round(total_return, 2),
            'maxDrawdown': round(-max_drawdown, 2),
            'marketStatus': _get_market_status(),
            'equitySpark': equity_spark,
            'returnSpark': return_spark,
            'drawdownSpark': drawdown_spark,
            # TradeZella-style metrics
            'netPnL': net_pnl,
            'tradeCount': trade_count,
            'tradeExpectancy': trade_expectancy,
            'profitFactor': profit_factor,
            'winPercent': win_percent,
            'winCount': win_count,
            'lossCount': loss_count,
            'avgWinLossRatio': avg_win_loss_ratio,
            'avgWin': avg_win,
            'avgLoss': avg_loss
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/equity', methods=['GET'])
def get_dashboard_equity():
    """Get equity curve data for the chart."""
    try:
        timeframe = request.args.get('timeframe', '1M')
        equity_history = _dashboard_account.get('equity_history', [])
        initial = _dashboard_account.get('initial_equity', 100000)
        
        # Calculate how many days to show
        days_map = {
            '1W': 7,
            '1M': 30,
            '3M': 90,
            'YTD': (datetime.now() - datetime(datetime.now().year, 1, 1)).days,
            'All': 365
        }
        days = days_map.get(timeframe, 30)
        
        # Generate data if we don't have history
        data = []
        if equity_history:
            data = equity_history[-days:]
        else:
            # Generate sample data
            import random
            base = initial
            for i in range(days):
                date = datetime.now() - timedelta(days=days-i-1)
                base = base * (1 + random.uniform(-0.015, 0.02))
                data.append({
                    't': int(date.timestamp() * 1000),
                    'v': round(base, 2),
                    'equity': round(base, 2),
                    'date': date.isoformat()
                })
            # Update account with generated data
            _dashboard_account['equity_history'] = data
            _dashboard_account['equity'] = data[-1]['v'] if data else initial
        
        return jsonify({
            'data': data,
            'timeframe': timeframe
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/flow-grade', methods=['GET'])
def get_flow_grade():
    """Get Flow Grade performance score."""
    try:
        grade_data = _calculate_flow_grade(_dashboard_account)
        
        if grade_data is None:
            # Return sample data for demo
            return jsonify({
                'score': 81,
                'metrics': {
                    'winRate': 39.02,
                    'avgWinLoss': 2.4,
                    'profitFactor': 1.24,
                    'sharpeRatio': 1.24,
                    'consistency': 65.0
                }
            })
        
        return jsonify(grade_data)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================
# Saved Strategies - File-based Persistence
# ============================================
STRATEGIES_FILE = os.path.join(os.path.dirname(__file__), '..', 'data', 'saved_strategies.json')

def _ensure_data_dir():
    """Ensure data directory exists."""
    data_dir = os.path.dirname(STRATEGIES_FILE)
    if not os.path.exists(data_dir):
        os.makedirs(data_dir, exist_ok=True)

def _load_strategies():
    """Load saved strategies from file."""
    try:
        _ensure_data_dir()
        if os.path.exists(STRATEGIES_FILE):
            with open(STRATEGIES_FILE, 'r') as f:
                return json.load(f)
    except Exception as e:
        print(f'Error loading strategies: {e}')
    return []

def _save_strategies(strategies):
    """Save strategies to file."""
    try:
        _ensure_data_dir()
        with open(STRATEGIES_FILE, 'w') as f:
            json.dump(strategies, f, indent=2)
        return True
    except Exception as e:
        print(f'Error saving strategies: {e}')
        return False


@app.route('/api/strategies/saved', methods=['GET'])
def get_saved_strategies():
    """Get list of saved strategies with on/off state."""
    try:
        strategies = _load_strategies()
        return jsonify(strategies)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/strategies/saved', methods=['POST'])
def save_strategy():
    """Save a new strategy from workflow builder."""
    try:
        data = request.get_json()
        
        strategies = _load_strategies()
        
        # Generate unique ID if not provided
        strategy_id = data.get('id') or f"strat-{datetime.now().strftime('%Y%m%d%H%M%S')}-{len(strategies)}"
        
        # Extract symbol and timeframe from workflow nodes if available
        symbol = data.get('symbol', 'UNKNOWN')
        timeframe = data.get('timeframe', '1D')
        
        # Check if strategy with this name already exists
        existing_idx = next((i for i, s in enumerate(strategies) if s.get('name') == data.get('name')), None)
        
        strategy = {
            'id': strategy_id,
            'name': data.get('name', f'Strategy {len(strategies) + 1}'),
            'symbol': symbol,
            'timeframe': timeframe,
            'isRunning': False,
            'workflow': data.get('workflow', {}),
            'createdAt': datetime.now().isoformat(),
            'lastSignal': None
        }
        
        if existing_idx is not None:
            # Update existing
            strategy['id'] = strategies[existing_idx]['id']
            strategy['isRunning'] = strategies[existing_idx].get('isRunning', False)
            strategies[existing_idx] = strategy
        else:
            strategies.append(strategy)
        
        _save_strategies(strategies)
        
        return jsonify({'success': True, 'strategy': strategy})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/strategies/<strategy_id>', methods=['DELETE'])
def delete_strategy(strategy_id):
    """Delete a saved strategy."""
    try:
        strategies = _load_strategies()
        strategies = [s for s in strategies if s.get('id') != strategy_id]
        _save_strategies(strategies)
        return jsonify({'success': True})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/strategies/<strategy_id>/toggle', methods=['POST'])
def toggle_strategy(strategy_id):
    """Toggle a strategy on/off."""
    try:
        data = request.get_json()
        is_running = data.get('isRunning', False)
        
        strategies = _load_strategies()
        
        for strategy in strategies:
            if strategy['id'] == strategy_id:
                strategy['isRunning'] = is_running
                _save_strategies(strategies)
                return jsonify({'success': True, 'strategy': strategy})
        
        return jsonify({'error': 'Strategy not found'}), 404
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/signals', methods=['GET'])
def get_live_signals():
    """Get live signals from running strategies."""
    try:
        import random
        
        strategies = _load_strategies()
        signals = []
        
        for strategy in strategies:
            if strategy.get('isRunning'):
                # Generate mock signal data based on strategy
                signal_types = ['BUY', 'SELL', 'HOLD']
                weights = [0.3, 0.2, 0.5]  # HOLD is most common
                signal = random.choices(signal_types, weights=weights)[0]
                
                # Generate realistic price based on symbol
                base_prices = {
                    'AAPL': 195.0,
                    'NVDA': 140.0,
                    'SPY': 590.0,
                    'TSLA': 250.0,
                    'GOOGL': 175.0,
                    'MSFT': 430.0,
                    'AMD': 140.0,
                    'META': 580.0,
                    'QQQ': 520.0,
                    'AMZN': 225.0
                }
                symbol = strategy.get('symbol', 'UNKNOWN')
                base_price = base_prices.get(symbol, 100.0)
                price = base_price * (1 + random.uniform(-0.02, 0.02))
                
                signals.append({
                    'strategyId': strategy['id'],
                    'strategyName': strategy['name'],
                    'symbol': symbol,
                    'price': round(price, 2),
                    'signal': signal,
                    'timestamp': datetime.now().isoformat()
                })
        
        return jsonify(signals)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/performance', methods=['GET'])
def get_performance_data():
    """Get account performance data for chart."""
    try:
        import random
        
        timeframe = request.args.get('timeframe', '1M')
        
        # Determine number of data points based on timeframe
        points_map = {
            '1D': 24,
            '1W': 7,
            '1M': 30,
            '3M': 90,
            'YTD': (datetime.now() - datetime(datetime.now().year, 1, 1)).days or 1,
            'All': 365
        }
        num_points = points_map.get(timeframe, 30)
        
        # Generate performance data
        data = []
        initial_value = 100000
        current_value = initial_value
        
        for i in range(num_points):
            # Simulate daily returns with slight upward bias
            daily_return = random.gauss(0.0003, 0.015)  # 0.03% mean, 1.5% std
            current_value *= (1 + daily_return)
            
            data.append({
                'date': (datetime.now() - timedelta(days=num_points-i-1)).strftime('%m/%d'),
                'value': round(current_value, 2)
            })
        
        return jsonify({
            'data': data,
            'timeframe': timeframe,
            'startValue': initial_value,
            'endValue': round(current_value, 2),
            'change': round((current_value - initial_value) / initial_value * 100, 2)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/daily-pnl', methods=['GET'])
def get_daily_pnl():
    """Get daily P&L data for charts."""
    try:
        import random
        
        # Generate sample daily P&L data for demo
        daily_data = []
        cumulative_data = []
        cumulative = 0
        
        base_date = datetime.now() - timedelta(days=14)
        
        for i in range(14):
            date = base_date + timedelta(days=i)
            date_str = date.strftime('%m/%d')
            
            # Random daily P&L between -200 and +200
            daily_pnl = random.uniform(-150, 200)
            if random.random() > 0.4:  # 60% chance of profit
                daily_pnl = abs(daily_pnl)
            else:
                daily_pnl = -abs(daily_pnl) * 0.7
            
            cumulative += daily_pnl
            
            daily_data.append({
                'date': date_str,
                'value': round(daily_pnl, 2)
            })
            
            cumulative_data.append({
                'date': date_str,
                'value': round(cumulative, 2)
            })
        
        return jsonify({
            'daily': daily_data,
            'cumulative': cumulative_data
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/strategies/status', methods=['GET'])
def get_strategies_status():
    """Get list of strategies with their current status."""
    try:
        if not _dashboard_strategies:
            # Return sample strategies for demo
            return jsonify([
                {
                    'id': 'strat-1',
                    'name': 'RSI Momentum',
                    'status': 'active',
                    'health': 'healthy',
                    'capitalPercent': 30,
                    'lastSignal': (datetime.now() - timedelta(hours=2)).isoformat()
                },
                {
                    'id': 'strat-2',
                    'name': 'MACD Crossover',
                    'status': 'active',
                    'health': 'healthy',
                    'capitalPercent': 25,
                    'lastSignal': (datetime.now() - timedelta(hours=5)).isoformat()
                },
                {
                    'id': 'strat-3',
                    'name': 'Bollinger Breakout',
                    'status': 'paused',
                    'health': 'warning',
                    'capitalPercent': 20,
                    'lastSignal': (datetime.now() - timedelta(days=1)).isoformat()
                },
                {
                    'id': 'strat-4',
                    'name': 'Volume Spike',
                    'status': 'testing',
                    'health': 'healthy',
                    'capitalPercent': 0,
                    'lastSignal': None
                }
            ])
        
        return jsonify(_dashboard_strategies)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/alerts/active', methods=['GET'])
def get_active_alerts():
    """Get list of active alerts."""
    try:
        if not _dashboard_alerts:
            # Return sample alerts for demo
            return jsonify([
                {
                    'id': 'alert-1',
                    'type': 'triggered',
                    'message': 'RSI crossed above 70 on AAPL',
                    'timestamp': (datetime.now() - timedelta(minutes=15)).isoformat(),
                    'deliveryStatus': 'sent'
                },
                {
                    'id': 'alert-2',
                    'type': 'triggered',
                    'message': 'MACD bullish crossover on NVDA',
                    'timestamp': (datetime.now() - timedelta(hours=1)).isoformat(),
                    'deliveryStatus': 'sent'
                },
                {
                    'id': 'alert-3',
                    'type': 'pending',
                    'message': 'Waiting for SPY to reach $480',
                    'timestamp': (datetime.now() - timedelta(hours=3)).isoformat(),
                    'deliveryStatus': None
                },
                {
                    'id': 'alert-4',
                    'type': 'pending',
                    'message': 'RSI oversold condition watch on TSLA',
                    'timestamp': (datetime.now() - timedelta(hours=6)).isoformat(),
                    'deliveryStatus': None
                }
            ])
        
        return jsonify(_dashboard_alerts)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/activity/recent', methods=['GET'])
def get_recent_activity():
    """Get recent activity feed."""
    try:
        limit = request.args.get('limit', 10, type=int)
        
        if not _dashboard_activity:
            # Return sample activity for demo
            sample_events = [
                {
                    'id': 'evt-1',
                    'type': 'alert_triggered',
                    'message': 'Alert triggered: RSI crossed 70 on AAPL',
                    'timestamp': (datetime.now() - timedelta(minutes=15)).isoformat()
                },
                {
                    'id': 'evt-2',
                    'type': 'backtest_completed',
                    'message': 'Backtest completed: RSI Strategy on NVDA',
                    'timestamp': (datetime.now() - timedelta(hours=1)).isoformat()
                },
                {
                    'id': 'evt-3',
                    'type': 'strategy_edited',
                    'message': 'Strategy updated: MACD Crossover parameters changed',
                    'timestamp': (datetime.now() - timedelta(hours=2)).isoformat()
                },
                {
                    'id': 'evt-4',
                    'type': 'config_changed',
                    'message': 'Telegram notifications enabled',
                    'timestamp': (datetime.now() - timedelta(hours=5)).isoformat()
                },
                {
                    'id': 'evt-5',
                    'type': 'strategy_created',
                    'message': 'New strategy created: Volume Spike Detector',
                    'timestamp': (datetime.now() - timedelta(days=1)).isoformat()
                },
                {
                    'id': 'evt-6',
                    'type': 'market_reconnect',
                    'message': 'Market data connection restored',
                    'timestamp': (datetime.now() - timedelta(days=1, hours=2)).isoformat()
                }
            ]
            return jsonify({
                'events': sample_events[:limit],
                'hasMore': len(sample_events) > limit
            })
        
        events = _dashboard_activity[:limit]
        return jsonify({
            'events': events,
            'hasMore': len(_dashboard_activity) > limit
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/add-activity', methods=['POST'])
def add_activity():
    """Add a new activity event (internal use)."""
    try:
        data = request.get_json()
        event = {
            'id': f"evt-{len(_dashboard_activity)+1}",
            'type': data.get('type', 'info'),
            'message': data.get('message', ''),
            'timestamp': datetime.now().isoformat()
        }
        _dashboard_activity.insert(0, event)
        # Keep only last 100 events
        if len(_dashboard_activity) > 100:
            _dashboard_activity.pop()
        return jsonify({'success': True, 'event': event})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# ============================================
# Advanced Dashboard Endpoints for Trade Analytics
# ============================================

# In-memory trade history storage (would be DB in production)
_trade_history = []

def _generate_sample_trades():
    """Generate realistic sample trade data for demo purposes."""
    import random
    trades = []
    symbols = ['AAPL', 'NVDA', 'SPY', 'TSLA', 'GOOGL', 'MSFT', 'AMD', 'META', 'QQQ', 'AMZN']
    strategies = ['RSI Momentum', 'MACD Crossover', 'Bollinger Breakout', 'Volume Spike', 'EMA Cross']
    
    base_date = datetime.now() - timedelta(days=30)
    cumulative_pnl = 0
    equity = 100000
    
    for i in range(83):  # 83 trades for realistic demo
        symbol = random.choice(symbols)
        strategy = random.choice(strategies)
        direction = random.choice(['LONG', 'SHORT'])
        
        # Entry time
        entry_time = base_date + timedelta(
            days=random.randint(0, 29),
            hours=random.randint(9, 15),
            minutes=random.randint(0, 59)
        )
        
        # Hold time: 5 minutes to 4 hours
        hold_minutes = random.randint(5, 240)
        exit_time = entry_time + timedelta(minutes=hold_minutes)
        
        # Price and P&L
        base_prices = {'AAPL': 195, 'NVDA': 140, 'SPY': 590, 'TSLA': 250, 'GOOGL': 175, 
                       'MSFT': 430, 'AMD': 140, 'META': 580, 'QQQ': 520, 'AMZN': 225}
        entry_price = base_prices.get(symbol, 100) * random.uniform(0.95, 1.05)
        
        # Win rate ~47%, average win > average loss (positive expectancy)
        is_win = random.random() < 0.47
        if is_win:
            pnl_percent = random.uniform(0.5, 4.5)  # Wins: 0.5% to 4.5%
        else:
            pnl_percent = -random.uniform(0.3, 2.5)  # Losses: 0.3% to 2.5%
        
        if direction == 'SHORT':
            pnl_percent = -pnl_percent  # Invert for short
            exit_price = entry_price * (1 - pnl_percent / 100)
            pnl_percent = -pnl_percent  # Calculate actual P&L
        else:
            exit_price = entry_price * (1 + pnl_percent / 100)
        
        # Position size: 1-10% of equity
        position_size = equity * random.uniform(0.01, 0.10)
        shares = int(position_size / entry_price)
        if shares < 1:
            shares = 1
        
        gross_pnl = (exit_price - entry_price) * shares
        if direction == 'SHORT':
            gross_pnl = -gross_pnl
        
        # Fees and commission
        commission = shares * 0.005  # $0.005 per share
        fees = abs(gross_pnl) * 0.001  # 0.1% SEC/TAF fees estimate
        net_pnl = gross_pnl - commission - fees
        
        cumulative_pnl += net_pnl
        equity += net_pnl
        
        # R-multiple (risk was 1% of equity at entry)
        risk_amount = position_size * 0.01  # 1% stop loss
        r_multiple = net_pnl / risk_amount if risk_amount > 0 else 0
        
        trades.append({
            'id': f'trade-{i+1}',
            'symbol': symbol,
            'strategy': strategy,
            'direction': direction,
            'entryTime': entry_time.isoformat(),
            'exitTime': exit_time.isoformat(),
            'entryPrice': round(entry_price, 2),
            'exitPrice': round(exit_price, 2),
            'shares': shares,
            'grossPnL': round(gross_pnl, 2),
            'commission': round(commission, 2),
            'fees': round(fees, 2),
            'netPnL': round(net_pnl, 2),
            'cumulativePnL': round(cumulative_pnl, 2),
            'equity': round(equity, 2),
            'rMultiple': round(r_multiple, 2),
            'holdTimeMinutes': hold_minutes
        })
    
    # Sort by entry time
    trades.sort(key=lambda x: x['entryTime'])
    
    # Recalculate cumulative values after sorting
    cumulative = 0
    equity = 100000
    for trade in trades:
        cumulative += trade['netPnL']
        equity += trade['netPnL']
        trade['cumulativePnL'] = round(cumulative, 2)
        trade['equity'] = round(equity, 2)
    
    return trades


def _get_trades():
    """Get trades, generating sample data if needed."""
    global _trade_history
    if not _trade_history:
        _trade_history = _generate_sample_trades()
    return _trade_history


# =============================================================================
# Real-Time Strategy Execution System
# =============================================================================

_realtime_monitoring_active = False
_realtime_thread = None
_realtime_stop_event = threading.Event()
_live_signals = []  # Store live signals from enabled strategies
_MAX_LIVE_SIGNALS = 100

def _start_realtime_monitoring():
    """Start background thread to monitor enabled strategies."""
    global _realtime_monitoring_active, _realtime_thread
    
    if _realtime_monitoring_active:
        return
    
    _realtime_stop_event.clear()
    _realtime_monitoring_active = True
    
    def monitor_loop():
        logger.info("🔴 Real-time monitoring started")
        while not _realtime_stop_event.is_set():
            try:
                # Check enabled strategies
                enabled = _get_enabled_strategies()
                if not enabled:
                    time.sleep(5)
                    continue
                
                # For each enabled strategy, check if it generates a signal
                for strategy_name in enabled:
                    strategy = _load_strategy(strategy_name)
                    if not strategy:
                        continue
                    
                    # Execute workflow with current market data
                    # For demo: generate synthetic signals
                    if random.random() < 0.05:  # 5% chance per check
                        signal = _generate_live_signal(strategy_name, strategy)
                        _live_signals.append(signal)
                        
                        # Keep only last N signals
                        if len(_live_signals) > _MAX_LIVE_SIGNALS:
                            _live_signals.pop(0)
                        
                        logger.info(f"📊 Signal generated: {signal['symbol']} {signal['direction']} from {strategy_name}")
                
                time.sleep(10)  # Check every 10 seconds
                
            except Exception as e:
                logger.error(f"Real-time monitoring error: {e}")
                time.sleep(5)
        
        logger.info("🔴 Real-time monitoring stopped")
    
    _realtime_thread = threading.Thread(target=monitor_loop, daemon=True, name='RealtimeMonitor')
    _realtime_thread.start()

def _stop_realtime_monitoring():
    """Stop background monitoring thread."""
    global _realtime_monitoring_active
    
    if not _realtime_monitoring_active:
        return
    
    _realtime_monitoring_active = False
    _realtime_stop_event.set()
    
    if _realtime_thread:
        _realtime_thread.join(timeout=3)

def _generate_live_signal(strategy_name, strategy):
    """Generate a live signal from strategy."""
    symbols = ['AAPL', 'NVDA', 'TSLA', 'MSFT', 'GOOGL', 'AMZN', 'META']
    symbol = random.choice(symbols)
    direction = random.choice(['BUY', 'SELL'])
    price = 100 + random.random() * 200
    
    return {
        'id': str(uuid.uuid4())[:8],
        'timestamp': datetime.now().isoformat(),
        'strategy_name': strategy_name,
        'symbol': symbol,
        'direction': direction,
        'type': 'entry',
        'price': round(price, 2),
        'quantity': random.randint(1, 10),
        'pnl': None,  # Entry signal has no P&L yet
        'status': 'open'
    }

def _get_enabled_strategies():
    """Get list of currently enabled strategy names."""
    try:
        strategies_file = os.path.join(DATA_DIR, 'enabled_strategies.json')
        if os.path.exists(strategies_file):
            with open(strategies_file, 'r') as f:
                data = json.load(f)
                return [name for name, enabled in data.items() if enabled]
    except:
        pass
    return []

def _load_strategy(strategy_name):
    """Load strategy configuration from saved_strategies.json."""
    try:
        strategies_file = os.path.join(DATA_DIR, 'saved_strategies.json')
        if os.path.exists(strategies_file):
            with open(strategies_file, 'r') as f:
                strategies = json.load(f)
                return strategies.get(strategy_name)
    except:
        pass
    return None


@app.route('/api/trades-legacy', methods=['GET'])
def get_trades_legacy():
    """Get all trades with optional filtering."""
    try:
        trades = _get_trades()
        
        # Apply filters if provided
        strategy = request.args.get('strategy')
        symbol = request.args.get('symbol')
        direction = request.args.get('direction')
        start_date = request.args.get('startDate')
        end_date = request.args.get('endDate')
        
        filtered = trades
        
        if strategy:
            filtered = [t for t in filtered if t['strategy'] == strategy]
        if symbol:
            filtered = [t for t in filtered if t['symbol'] == symbol]
        if direction:
            filtered = [t for t in filtered if t['direction'].upper() == direction.upper()]
        if start_date:
            filtered = [t for t in filtered if t['entryTime'] >= start_date]
        if end_date:
            filtered = [t for t in filtered if t['entryTime'] <= end_date]
        
        return jsonify(filtered)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/trades/recent-legacy', methods=['GET'])
def get_recent_trades_legacy():
    """Get most recent trades (default 5)."""
    try:
        limit = int(request.args.get('limit', 5))
        trades = _get_trades()
        recent = sorted(trades, key=lambda x: x['exitTime'], reverse=True)[:limit]
        return jsonify(recent)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/signals/live', methods=['GET'])
def get_live_strategy_signals():
    """Get live signals from enabled strategies."""
    try:
        limit = int(request.args.get('limit', 10))
        # Return most recent live signals
        recent = list(reversed(_live_signals[-limit:]))
        return jsonify(recent)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/comprehensive-metrics', methods=['GET'])
def get_comprehensive_metrics():
    """Get all dashboard metrics computed from trade history."""
    try:
        trades = _get_trades()
        
        if not trades:
            return jsonify({
                'netPnL': 0, 'netPnLPercent': 0, 'winRate': 0, 'profitFactor': 0,
                'expectancy': 0, 'totalTrades': 0, 'maxDrawdown': 0, 'maxDrawdownPercent': 0,
                'avgWin': 0, 'avgLoss': 0, 'largestWin': 0, 'largestLoss': 0,
                'avgRMultiple': 0, 'winCount': 0, 'lossCount': 0, 'longPnL': 0, 'shortPnL': 0
            })
        
        initial_equity = 100000
        
        # Basic metrics
        wins = [t for t in trades if t['netPnL'] > 0]
        losses = [t for t in trades if t['netPnL'] < 0]
        
        total_trades = len(trades)
        win_count = len(wins)
        loss_count = len(losses)
        
        net_pnl = sum(t['netPnL'] for t in trades)
        net_pnl_percent = (net_pnl / initial_equity) * 100
        
        win_rate = (win_count / total_trades * 100) if total_trades > 0 else 0
        
        gross_profit = sum(t['netPnL'] for t in wins)
        gross_loss = abs(sum(t['netPnL'] for t in losses))
        profit_factor = (gross_profit / gross_loss) if gross_loss > 0 else float('inf') if gross_profit > 0 else 0
        
        expectancy = net_pnl / total_trades if total_trades > 0 else 0
        
        avg_win = gross_profit / win_count if win_count > 0 else 0
        avg_loss = gross_loss / loss_count if loss_count > 0 else 0
        
        largest_win = max((t['netPnL'] for t in trades), default=0)
        largest_loss = min((t['netPnL'] for t in trades), default=0)
        
        avg_r = sum(t['rMultiple'] for t in trades) / total_trades if total_trades > 0 else 0
        
        # Direction breakdown
        long_trades = [t for t in trades if t['direction'] == 'LONG']
        short_trades = [t for t in trades if t['direction'] == 'SHORT']
        long_pnl = sum(t['netPnL'] for t in long_trades)
        short_pnl = sum(t['netPnL'] for t in short_trades)
        
        # Max drawdown calculation
        max_drawdown = 0
        max_drawdown_percent = 0
        peak_equity = initial_equity
        
        for trade in trades:
            current_equity = trade['equity']
            if current_equity > peak_equity:
                peak_equity = current_equity
            drawdown = peak_equity - current_equity
            drawdown_percent = (drawdown / peak_equity) * 100 if peak_equity > 0 else 0
            if drawdown > max_drawdown:
                max_drawdown = drawdown
                max_drawdown_percent = drawdown_percent
        
        return jsonify({
            'netPnL': round(net_pnl, 2),
            'netPnLPercent': round(net_pnl_percent, 2),
            'winRate': round(win_rate, 2),
            'profitFactor': round(profit_factor, 2) if profit_factor != float('inf') else 999.99,
            'expectancy': round(expectancy, 2),
            'totalTrades': total_trades,
            'maxDrawdown': round(max_drawdown, 2),
            'maxDrawdownPercent': round(max_drawdown_percent, 2),
            'avgWin': round(avg_win, 2),
            'avgLoss': round(avg_loss, 2),
            'largestWin': round(largest_win, 2),
            'largestLoss': round(largest_loss, 2),
            'avgRMultiple': round(avg_r, 2),
            'winCount': win_count,
            'lossCount': loss_count,
            'longPnL': round(long_pnl, 2),
            'shortPnL': round(short_pnl, 2),
            'longTrades': len(long_trades),
            'shortTrades': len(short_trades),
            'longWinRate': round(len([t for t in long_trades if t['netPnL'] > 0]) / len(long_trades) * 100, 2) if long_trades else 0,
            'shortWinRate': round(len([t for t in short_trades if t['netPnL'] > 0]) / len(short_trades) * 100, 2) if short_trades else 0
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/equity-curve', methods=['GET'])
def get_equity_curve():
    """Get equity curve with drawdown data for charting."""
    try:
        trades = _get_trades()
        initial_equity = 100000
        
        if not trades:
            return jsonify({'data': [], 'drawdown': []})
        
        equity_data = [{'t': None, 'equity': initial_equity, 'cumPnL': 0, 'drawdown': 0}]
        peak = initial_equity
        
        for trade in trades:
            timestamp = trade['exitTime']
            equity = trade['equity']
            cum_pnl = trade['cumulativePnL']
            
            if equity > peak:
                peak = equity
            drawdown = ((peak - equity) / peak) * 100 if peak > 0 else 0
            
            equity_data.append({
                't': timestamp,
                'equity': equity,
                'cumPnL': cum_pnl,
                'drawdown': round(drawdown, 2)
            })
        
        return jsonify({
            'data': equity_data,
            'initialEquity': initial_equity,
            'finalEquity': trades[-1]['equity'] if trades else initial_equity,
            'peakEquity': peak
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/pnl-distribution', methods=['GET'])
def get_pnl_distribution():
    """Get P&L distribution for histogram."""
    try:
        trades = _get_trades()
        
        if not trades:
            return jsonify({'buckets': [], 'stats': {}})
        
        pnls = [t['netPnL'] for t in trades]
        
        # Create buckets
        min_pnl = min(pnls)
        max_pnl = max(pnls)
        
        # 10 buckets
        num_buckets = 10
        bucket_size = (max_pnl - min_pnl) / num_buckets if max_pnl != min_pnl else 1
        
        buckets = []
        for i in range(num_buckets):
            lower = min_pnl + i * bucket_size
            upper = min_pnl + (i + 1) * bucket_size
            count = len([p for p in pnls if lower <= p < upper or (i == num_buckets - 1 and p == upper)])
            buckets.append({
                'range': f"${lower:.0f} to ${upper:.0f}",
                'lower': round(lower, 2),
                'upper': round(upper, 2),
                'count': count,
                'isProfit': (lower + upper) / 2 > 0
            })
        
        # Stats
        import statistics
        mean = statistics.mean(pnls)
        median = statistics.median(pnls)
        std_dev = statistics.stdev(pnls) if len(pnls) > 1 else 0
        
        return jsonify({
            'buckets': buckets,
            'stats': {
                'mean': round(mean, 2),
                'median': round(median, 2),
                'stdDev': round(std_dev, 2),
                'min': round(min_pnl, 2),
                'max': round(max_pnl, 2)
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/time-analysis', methods=['GET'])
def get_time_analysis():
    """Get performance by time of day and day of week."""
    try:
        trades = _get_trades()
        
        if not trades:
            return jsonify({'hourly': [], 'daily': []})
        
        # Hourly analysis
        hourly = {}
        for hour in range(24):
            hourly[hour] = {'pnl': 0, 'trades': 0, 'wins': 0}
        
        # Daily analysis
        daily = {}
        for day in range(7):  # 0=Monday, 6=Sunday
            daily[day] = {'pnl': 0, 'trades': 0, 'wins': 0}
        
        for trade in trades:
            try:
                entry_dt = datetime.fromisoformat(trade['entryTime'].replace('Z', '+00:00'))
                hour = entry_dt.hour
                day = entry_dt.weekday()
                
                hourly[hour]['pnl'] += trade['netPnL']
                hourly[hour]['trades'] += 1
                if trade['netPnL'] > 0:
                    hourly[hour]['wins'] += 1
                
                daily[day]['pnl'] += trade['netPnL']
                daily[day]['trades'] += 1
                if trade['netPnL'] > 0:
                    daily[day]['wins'] += 1
            except:
                continue
        
        day_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        
        hourly_data = [
            {'hour': h, 'label': f"{h:02d}:00", 'pnl': round(hourly[h]['pnl'], 2), 
             'trades': hourly[h]['trades'], 'winRate': round(hourly[h]['wins'] / hourly[h]['trades'] * 100, 1) if hourly[h]['trades'] > 0 else 0}
            for h in range(9, 17)  # Market hours only
        ]
        
        daily_data = [
            {'day': d, 'label': day_names[d], 'pnl': round(daily[d]['pnl'], 2),
             'trades': daily[d]['trades'], 'winRate': round(daily[d]['wins'] / daily[d]['trades'] * 100, 1) if daily[d]['trades'] > 0 else 0}
            for d in range(5)  # Weekdays only
        ]
        
        return jsonify({
            'hourly': hourly_data,
            'daily': daily_data
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/strategy-performance', methods=['GET'])
def get_strategy_performance():
    """Get performance breakdown by strategy."""
    try:
        trades = _get_trades()
        
        if not trades:
            return jsonify({'strategies': [], 'directions': {}})
        
        strategy_stats = {}
        
        for trade in trades:
            strat = trade.get('strategy', 'Unknown')
            if strat not in strategy_stats:
                strategy_stats[strat] = {'pnl': 0, 'trades': 0, 'wins': 0}
            
            strategy_stats[strat]['pnl'] += trade['netPnL']
            strategy_stats[strat]['trades'] += 1
            if trade['netPnL'] > 0:
                strategy_stats[strat]['wins'] += 1
        
        strategies = [
            {
                'name': name,
                'pnl': round(stats['pnl'], 2),
                'trades': stats['trades'],
                'winRate': round(stats['wins'] / stats['trades'] * 100, 1) if stats['trades'] > 0 else 0
            }
            for name, stats in strategy_stats.items()
        ]
        strategies.sort(key=lambda x: x['pnl'], reverse=True)
        
        # Direction breakdown
        long_trades = [t for t in trades if t['direction'] == 'LONG']
        short_trades = [t for t in trades if t['direction'] == 'SHORT']
        
        directions = {
            'long': {
                'pnl': round(sum(t['netPnL'] for t in long_trades), 2),
                'trades': len(long_trades),
                'winRate': round(len([t for t in long_trades if t['netPnL'] > 0]) / len(long_trades) * 100, 1) if long_trades else 0
            },
            'short': {
                'pnl': round(sum(t['netPnL'] for t in short_trades), 2),
                'trades': len(short_trades),
                'winRate': round(len([t for t in short_trades if t['netPnL'] > 0]) / len(short_trades) * 100, 1) if short_trades else 0
            }
        }
        
        return jsonify({
            'strategies': strategies,
            'directions': directions
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# =============================================================================
# Dashboard API Endpoints
# =============================================================================

# Import dashboard API module
try:
    from dashboard_api import (
        get_dashboard_metrics,
        get_all_strategies,
        save_strategies,
        toggle_strategy,
        get_all_trades,
        add_trade,
        get_account_info,
        save_account_info,
        calculate_equity_curve,
        calculate_time_based_pnl,
        get_recent_trades,
        generate_demo_data
    )
    DASHBOARD_API_AVAILABLE = True
    print('✅ Dashboard API module loaded')
except ImportError as e:
    print(f'⚠️ Dashboard API not available: {e}')
    DASHBOARD_API_AVAILABLE = False


@app.route('/api/dashboard/metrics', methods=['GET'])
def dashboard_metrics():
    """
    Get all dashboard metrics in a single call.
    Query params:
      - enabled_only: 'true' to filter to enabled strategies only (default true)
      - date_range: '1D', '1W', '1M', '3M', '1Y', 'ALL' (default '1M')
    """
    if not DASHBOARD_API_AVAILABLE:
        return jsonify({'error': 'Dashboard API not available'}), 500
    
    try:
        enabled_only = request.args.get('enabled_only', 'true').lower() == 'true'
        date_range = request.args.get('date_range', '1M')
        
        metrics = get_dashboard_metrics(
            enabled_strategies_only=enabled_only,
            date_range=date_range
        )
        return jsonify(metrics)
    except Exception as e:
        print(f'Dashboard metrics error: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/strategies', methods=['GET'])
def dashboard_strategies():
    """Get all saved strategies with their states."""
    if not DASHBOARD_API_AVAILABLE:
        return jsonify({'error': 'Dashboard API not available'}), 500
    
    try:
        strategies = get_all_strategies()
        strategy_list = [
            {
                'name': name,
                'enabled': data.get('enabled', False),
                'created_at': data.get('created_at'),
                'updated_at': data.get('updated_at')
            }
            for name, data in strategies.items()
        ]
        return jsonify({'strategies': strategy_list})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/strategies/<strategy_name>/toggle', methods=['POST'])
def dashboard_toggle_strategy(strategy_name):
    """Toggle a strategy on/off and start/stop real-time monitoring."""
    try:
        data = request.get_json()
        enabled = data.get('enabled', False)
        
        # Update enabled_strategies.json
        enabled_file = os.path.join(DATA_DIR, 'enabled_strategies.json')
        enabled_map = {}
        
        if os.path.exists(enabled_file):
            try:
                with open(enabled_file, 'r') as f:
                    enabled_map = json.load(f)
            except:
                enabled_map = {}
        
        enabled_map[strategy_name] = enabled
        
        try:
            with open(enabled_file, 'w') as f:
                json.dump(enabled_map, f, indent=2)
        except Exception as write_err:
            print(f"❌ Error writing enabled_strategies.json: {write_err}")
            return jsonify({'error': f'Failed to save: {str(write_err)}'}), 500
        
        # Start/stop real-time monitoring based on enabled strategies
        enabled_count = sum(1 for v in enabled_map.values() if v)
        
        if enabled_count > 0 and not _realtime_monitoring_active:
            try:
                _start_realtime_monitoring()
                print(f"✅ Real-time monitoring started ({enabled_count} strategies enabled)")
            except Exception as monitor_err:
                print(f"⚠️ Failed to start monitoring: {monitor_err}")
        elif enabled_count == 0 and _realtime_monitoring_active:
            try:
                _stop_realtime_monitoring()
                print("⏸️ Real-time monitoring stopped (no strategies enabled)")
            except Exception as stop_err:
                print(f"⚠️ Failed to stop monitoring: {stop_err}")
        
        return jsonify({
            'success': True,
            'strategy': strategy_name,
            'enabled': enabled,
            'monitoring_active': _realtime_monitoring_active,
            'enabled_count': enabled_count
        })
    except Exception as e:
        import traceback
        error_trace = traceback.format_exc()
        print(f"❌ Toggle error: {error_trace}")
        return jsonify({'error': str(e), 'trace': error_trace}), 500


@app.route('/api/dashboard/strategies', methods=['POST'])
def dashboard_save_strategy():
    """Save or update a strategy."""
    if not DASHBOARD_API_AVAILABLE:
        return jsonify({'error': 'Dashboard API not available'}), 500
    
    try:
        data = request.get_json()
        if not data or 'name' not in data:
            return jsonify({'error': 'Strategy name required'}), 400
        
        strategies = get_all_strategies()
        name = data['name']
        
        strategies[name] = {
            'enabled': data.get('enabled', False),
            'nodes': data.get('nodes', []),
            'connections': data.get('connections', []),
            'created_at': strategies.get(name, {}).get('created_at', datetime.utcnow().isoformat()),
            'updated_at': datetime.utcnow().isoformat()
        }
        
        save_strategies(strategies)
        return jsonify({'message': 'Strategy saved', 'name': name})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/equity-curve', methods=['GET'])
def dashboard_equity_curve():
    """
    Get equity curve data.
    Query params:
      - enabled_only: filter to enabled strategies (default true)
      - date_range: '1D', '1W', '1M', '3M', '1Y', 'ALL'
    """
    if not DASHBOARD_API_AVAILABLE:
        return jsonify({'error': 'Dashboard API not available'}), 500
    
    try:
        enabled_only = request.args.get('enabled_only', 'true').lower() == 'true'
        
        strategies = get_all_strategies()
        enabled_names = [n for n, d in strategies.items() if d.get('enabled')] if enabled_only else None
        
        trades = get_all_trades(strategy_names=enabled_names)
        curve = calculate_equity_curve(trades)
        
        return jsonify({'equity_curve': curve})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/time-pnl', methods=['GET'])
def dashboard_time_pnl():
    """
    Get time-based P&L aggregation.
    Query params:
      - group_by: 'day_of_week' or 'hour_of_day' (default 'day_of_week')
      - enabled_only: filter to enabled strategies (default true)
    """
    if not DASHBOARD_API_AVAILABLE:
        return jsonify({'error': 'Dashboard API not available'}), 500
    
    try:
        group_by = request.args.get('group_by', 'day_of_week')
        enabled_only = request.args.get('enabled_only', 'true').lower() == 'true'
        
        strategies = get_all_strategies()
        enabled_names = [n for n, d in strategies.items() if d.get('enabled')] if enabled_only else None
        
        trades = get_all_trades(strategy_names=enabled_names)
        data = calculate_time_based_pnl(trades, group_by)
        
        return jsonify({'data': data, 'group_by': group_by})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/recent-trades', methods=['GET'])
def dashboard_recent_trades():
    """
    Get recent trades.
    Query params:
      - limit: number of trades to return (default 5)
      - enabled_only: filter to enabled strategies (default true)
    """
    if not DASHBOARD_API_AVAILABLE:
        return jsonify({'error': 'Dashboard API not available'}), 500
    
    try:
        limit = int(request.args.get('limit', '5'))
        enabled_only = request.args.get('enabled_only', 'true').lower() == 'true'
        
        strategies = get_all_strategies()
        enabled_names = [n for n, d in strategies.items() if d.get('enabled')] if enabled_only else None
        
        trades = get_recent_trades(limit, enabled_names)
        
        return jsonify({'trades': trades})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/trades', methods=['POST'])
def dashboard_add_trade():
    """Add a new executed trade."""
    if not DASHBOARD_API_AVAILABLE:
        return jsonify({'error': 'Dashboard API not available'}), 500
    
    try:
        trade = request.get_json()
        if not trade:
            return jsonify({'error': 'Trade data required'}), 400
        
        success = add_trade(trade)
        if success:
            return jsonify({'message': 'Trade added', 'trade': trade})
        return jsonify({'error': 'Failed to add trade'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/account', methods=['GET'])
def dashboard_get_account():
    """Get account information."""
    if not DASHBOARD_API_AVAILABLE:
        return jsonify({'error': 'Dashboard API not available'}), 500
    
    try:
        account = get_account_info()
        return jsonify(account)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/account', methods=['POST'])
def dashboard_update_account():
    """Update account information."""
    if not DASHBOARD_API_AVAILABLE:
        return jsonify({'error': 'Dashboard API not available'}), 500
    
    try:
        data = request.get_json()
        if not data:
            return jsonify({'error': 'Account data required'}), 400
        
        # Merge with existing
        account = get_account_info()
        account.update(data)
        
        success = save_account_info(account)
        if success:
            return jsonify({'message': 'Account updated', 'account': account})
        return jsonify({'error': 'Failed to update account'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/dashboard/demo-data', methods=['POST'])
def dashboard_generate_demo():
    """Generate demo data for testing the dashboard."""
    if not DASHBOARD_API_AVAILABLE:
        return jsonify({'error': 'Dashboard API not available'}), 500
    
    try:
        result = generate_demo_data()
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# =============================================================================
# Analytics API Routes
# =============================================================================

try:
    from .analytics_api import (
        get_analytics_overview, calculate_flow_grade, get_equity_curve_data,
        get_trades_paginated, calculate_pnl_distribution, calculate_duration_distribution,
        calculate_heatmap, calculate_strategy_contribution, run_monte_carlo,
        create_recompute_job, get_recompute_job_status, get_recent_activity
    )
    ANALYTICS_API_AVAILABLE = True
    print('✅ Analytics API module loaded')
except ImportError as e:
    ANALYTICS_API_AVAILABLE = False
    print(f'⚠️ Analytics API not available: {e}')


@app.route('/api/analytics/overview-legacy', methods=['GET'])
def analytics_overview():
    """LEGACY: Get comprehensive analytics overview with KPIs and Flow Grade."""
    if not ANALYTICS_API_AVAILABLE:
        return jsonify({'error': 'Analytics API not available'}), 500
    
    try:
        enabled_only = request.args.get('enabled_only', 'true').lower() == 'true'
        date_range = request.args.get('range', 'ALL')
        
        result = get_analytics_overview(
            enabled_strategies_only=enabled_only,
            date_range=date_range
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/flow-grade', methods=['GET'])
def analytics_flow_grade():
    """Get Flow Grade performance score with breakdown."""
    if not ANALYTICS_API_AVAILABLE:
        return jsonify({'error': 'Analytics API not available'}), 500
    
    try:
        from .dashboard_api import get_all_trades, get_account_info
        
        trades = get_all_trades()
        account = get_account_info()
        
        result = calculate_flow_grade(trades, account)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/equity-curve-legacy', methods=['GET'])
def analytics_equity_curve():
    """LEGACY: Get equity curve time-series data."""
    if not ANALYTICS_API_AVAILABLE:
        return jsonify({'error': 'Analytics API not available'}), 500
    
    try:
        timeframe = request.args.get('timeframe', 'ALL')
        include_drawdown = request.args.get('drawdown', 'true').lower() == 'true'
        
        result = get_equity_curve_data(timeframe, include_drawdown)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/trades', methods=['GET'])
def analytics_trades():
    """Get paginated trades list."""
    if not ANALYTICS_API_AVAILABLE:
        return jsonify({'error': 'Analytics API not available'}), 500
    
    try:
        page = int(request.args.get('page', 1))
        per_page = int(request.args.get('per_page', 50))
        strategy = request.args.get('strategy')
        symbol = request.args.get('symbol')
        sort_by = request.args.get('sort_by', 'timestamp')
        sort_order = request.args.get('sort_order', 'desc')
        
        result = get_trades_paginated(
            page=page,
            per_page=per_page,
            strategy_name=strategy,
            symbol=symbol,
            sort_by=sort_by,
            sort_order=sort_order
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/distributions-legacy', methods=['GET'])
def analytics_distributions():
    """LEGACY: Get P&L and duration distributions."""
    if not ANALYTICS_API_AVAILABLE:
        return jsonify({'error': 'Analytics API not available'}), 500
    
    try:
        from .dashboard_api import get_all_trades
        
        trades = get_all_trades()
        dist_type = request.args.get('type', 'pnl')
        bins = int(request.args.get('bins', 20))
        
        if dist_type == 'pnl':
            result = calculate_pnl_distribution(trades, bins)
        elif dist_type == 'duration':
            result = calculate_duration_distribution(trades, bins)
        else:
            result = {'error': 'Invalid distribution type. Use pnl or duration.'}
        
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/heatmap-legacy', methods=['GET'])
def analytics_heatmap():
    """LEGACY: Get P&L heatmap by hour/day or instrument."""
    if not ANALYTICS_API_AVAILABLE:
        return jsonify({'error': 'Analytics API not available'}), 500
    
    try:
        from .dashboard_api import get_all_trades
        
        trades = get_all_trades()
        heatmap_type = request.args.get('type', 'hour_day')
        
        result = calculate_heatmap(trades, heatmap_type)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/strategy-contrib', methods=['GET'])
def analytics_strategy_contrib():
    """Get strategy contribution analysis."""
    if not ANALYTICS_API_AVAILABLE:
        return jsonify({'error': 'Analytics API not available'}), 500
    
    try:
        from .dashboard_api import get_all_trades
        
        trades = get_all_trades()
        result = calculate_strategy_contribution(trades)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/montecarlo', methods=['GET'])
def analytics_montecarlo():
    """Get Monte Carlo simulation results."""
    if not ANALYTICS_API_AVAILABLE:
        return jsonify({'error': 'Analytics API not available'}), 500
    
    try:
        from .dashboard_api import get_all_trades, get_account_info
        
        trades = get_all_trades()
        account = get_account_info()
        
        num_sims = int(request.args.get('simulations', 1000))
        is_premium = request.args.get('premium', 'false').lower() == 'true'
        
        result = run_monte_carlo(
            trades,
            num_simulations=num_sims,
            starting_capital=account.get('starting_capital', 100000),
            is_premium=is_premium
        )
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/recompute', methods=['POST'])
def analytics_recompute():
    """Trigger a metrics recompute job."""
    if not ANALYTICS_API_AVAILABLE:
        return jsonify({'error': 'Analytics API not available'}), 500
    
    try:
        data = request.get_json() or {}
        enabled_strategies = data.get('enabled_strategies', [])
        trigger = data.get('trigger', 'manual')
        
        result = create_recompute_job(enabled_strategies, trigger)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/recompute/<job_id>/status', methods=['GET'])
def analytics_recompute_status(job_id):
    """Get status of a recompute job."""
    if not ANALYTICS_API_AVAILABLE:
        return jsonify({'error': 'Analytics API not available'}), 500
    
    try:
        result = get_recompute_job_status(job_id)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/recent-activity', methods=['GET'])
def analytics_recent_activity():
    """Get recent signals and trade events."""
    if not ANALYTICS_API_AVAILABLE:
        return jsonify({'error': 'Analytics API not available'}), 500
    
    try:
        limit = int(request.args.get('limit', 20))
        result = get_recent_activity(limit)
        return jsonify(result)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


# =============================================================================
# SSE Stream for Live Updates (Analytics)
# =============================================================================

@app.route('/api/analytics/stream')
def analytics_stream():
    """Server-Sent Events stream for live analytics updates."""
    def generate():
        """Generate SSE events."""
        import time
        
        # Send initial connection event
        yield f"event: connected\ndata: {json.dumps({'status': 'connected', 'timestamp': datetime.utcnow().isoformat()})}\n\n"
        
        last_trade_count = 0
        
        while True:
            try:
                # Check for new trades
                if DASHBOARD_API_AVAILABLE:
                    trades = get_all_trades()
                    current_count = len(trades)
                    
                    if current_count != last_trade_count:
                        # New trade detected, send update
                        last_trade_count = current_count
                        
                        if ANALYTICS_API_AVAILABLE:
                            overview = get_analytics_overview()
                            yield f"event: metrics_update\ndata: {json.dumps(overview)}\n\n"
                
                # Send heartbeat every 30 seconds
                yield f"event: heartbeat\ndata: {json.dumps({'timestamp': datetime.utcnow().isoformat()})}\n\n"
                
                time.sleep(5)  # Check every 5 seconds
                
            except GeneratorExit:
                break
            except Exception as e:
                yield f"event: error\ndata: {json.dumps({'error': str(e)})}\n\n"
                break
    
    response = make_response(generate())
    response.headers['Content-Type'] = 'text/event-stream'
    response.headers['Cache-Control'] = 'no-cache'
    response.headers['Connection'] = 'keep-alive'
    response.headers['X-Accel-Buffering'] = 'no'
    return response


# =============================================================================
# Trade Engine API Routes (Percent-Only Alternating Trades)
# =============================================================================

# Import trade engine
try:
    from api.trade_engine import (
        ingest_signal, log_external_trade, get_all_percent_trades,
        compute_analytics, get_equity_curve_pct, get_pnl_distribution,
        get_pnl_heatmap, get_current_signals, get_position, clear_position,
        clear_all_positions, clear_all_trades
    )
    TRADE_ENGINE_AVAILABLE = True
    print('✅ Trade engine initialized')
except ImportError as e:
    print(f'⚠️ Trade engine not available: {e}')
    TRADE_ENGINE_AVAILABLE = False


@app.route('/api/signals/ingest', methods=['POST'])
def api_ingest_signal():
    """
    Ingest a signal from frontend StrategyRunner.
    
    Body: {
        strategy_id: str,
        signal: BUY|SELL|HOLD,
        price: float,
        ts: str (optional),
        fee_pct: float (optional),
        slippage_pct: float (optional),
        meta: dict (optional)
    }
    """
    if not TRADE_ENGINE_AVAILABLE:
        return jsonify({'error': 'Trade engine not available'}), 503
    
    try:
        data = request.json or {}
        
        result = ingest_signal(
            strategy_id=data.get('strategy_id'),
            signal=data.get('signal'),
            price=data.get('price'),
            ts=data.get('ts'),
            fee_pct=data.get('fee_pct', 0.0),
            slippage_pct=data.get('slippage_pct', 0.0),
            meta=data.get('meta')
        )
        
        return jsonify(result)
        
    except Exception as e:
        print(f'❌ Error ingesting signal: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/api/trades/log', methods=['POST'])
def api_log_trade():
    """
    Log an externally-sourced completed trade.
    
    Body: {
        strategy_id: str,
        open_price: float,
        close_price: float,
        open_ts: str,
        close_ts: str,
        open_side: LONG|SHORT (optional, default LONG),
        gross_pct: float (optional, computed if missing),
        fee_pct_total: float (optional),
        net_pct: float (optional, computed if missing),
        meta: dict (optional)
    }
    """
    if not TRADE_ENGINE_AVAILABLE:
        return jsonify({'error': 'Trade engine not available'}), 503
    
    try:
        data = request.json or {}
        
        result = log_external_trade(
            strategy_id=data.get('strategy_id'),
            open_price=data.get('open_price'),
            close_price=data.get('close_price'),
            open_ts=data.get('open_ts'),
            close_ts=data.get('close_ts'),
            open_side=data.get('open_side', 'LONG'),
            gross_pct=data.get('gross_pct'),
            fee_pct_total=data.get('fee_pct_total', 0.0),
            net_pct=data.get('net_pct'),
            meta=data.get('meta')
        )
        
        return jsonify(result)
        
    except Exception as e:
        print(f'❌ Error logging trade: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/api/trades', methods=['GET'])
def api_get_trades():
    """
    Get completed trades (percent-based).
    
    Query params:
        strategy_id: str (optional)
        start_ts: str (optional)
        end_ts: str (optional)
        limit: int (default 100)
        offset: int (default 0)
    """
    if not TRADE_ENGINE_AVAILABLE:
        return jsonify({'error': 'Trade engine not available'}), 503
    
    try:
        result = get_all_percent_trades(
            strategy_id=request.args.get('strategy_id'),
            start_ts=request.args.get('start_ts'),
            end_ts=request.args.get('end_ts'),
            limit=int(request.args.get('limit', 100)),
            offset=int(request.args.get('offset', 0))
        )
        
        return jsonify(result)
        
    except Exception as e:
        print(f'❌ Error getting trades: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/api/trades', methods=['DELETE'])
def api_clear_trades():
    """Clear all completed trades."""
    if not TRADE_ENGINE_AVAILABLE:
        return jsonify({'error': 'Trade engine not available'}), 503
    
    try:
        success = clear_all_trades()
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/overview', methods=['GET'])
def api_analytics_overview():
    """
    Get analytics KPIs computed from percent trades.
    
    Query params:
        strategies: comma-separated list (optional)
        start_ts: str (optional)
        end_ts: str (optional)
        use_cache: bool (default true)
    """
    if not TRADE_ENGINE_AVAILABLE:
        return jsonify({'error': 'Trade engine not available'}), 503
    
    try:
        strategy_ids = None
        strategies_param = request.args.get('strategies')
        if strategies_param:
            strategy_ids = [s.strip() for s in strategies_param.split(',') if s.strip()]
        
        result = compute_analytics(
            strategy_ids=strategy_ids,
            start_ts=request.args.get('start_ts'),
            end_ts=request.args.get('end_ts'),
            use_cache=request.args.get('use_cache', 'true').lower() == 'true'
        )
        
        return jsonify(result)
        
    except Exception as e:
        print(f'❌ Error computing analytics: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/equity-curve', methods=['GET'])
def api_equity_curve():
    """
    Get equity curve as percentage returns.
    
    Returns: [{ts, equity_pct, drawdown_pct}, ...]
    """
    if not TRADE_ENGINE_AVAILABLE:
        return jsonify({'error': 'Trade engine not available'}), 503
    
    try:
        strategy_ids = None
        strategies_param = request.args.get('strategies')
        if strategies_param:
            strategy_ids = [s.strip() for s in strategies_param.split(',') if s.strip()]
        
        curve = get_equity_curve_pct(
            strategy_ids=strategy_ids,
            start_ts=request.args.get('start_ts'),
            end_ts=request.args.get('end_ts')
        )
        
        return jsonify({'curve': curve})
        
    except Exception as e:
        print(f'❌ Error getting equity curve: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/distributions', methods=['GET'])
def api_distributions():
    """
    Get P&L distribution histogram.
    
    Returns: {bins: [...], stats: {...}}
    """
    if not TRADE_ENGINE_AVAILABLE:
        return jsonify({'error': 'Trade engine not available'}), 503
    
    try:
        strategy_ids = None
        strategies_param = request.args.get('strategies')
        if strategies_param:
            strategy_ids = [s.strip() for s in strategies_param.split(',') if s.strip()]
        
        result = get_pnl_distribution(
            strategy_ids=strategy_ids,
            bins=int(request.args.get('bins', 20))
        )
        
        return jsonify(result)
        
    except Exception as e:
        print(f'❌ Error getting distributions: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/api/analytics/heatmap', methods=['GET'])
def api_heatmap():
    """
    Get P&L heatmap by day/hour.
    
    Returns: {by_day: [...], by_hour: [...]}
    """
    if not TRADE_ENGINE_AVAILABLE:
        return jsonify({'error': 'Trade engine not available'}), 503
    
    try:
        strategy_ids = None
        strategies_param = request.args.get('strategies')
        if strategies_param:
            strategy_ids = [s.strip() for s in strategies_param.split(',') if s.strip()]
        
        result = get_pnl_heatmap(strategy_ids=strategy_ids)
        
        return jsonify(result)
        
    except Exception as e:
        print(f'❌ Error getting heatmap: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/api/signals/current', methods=['GET'])
def api_current_signals():
    """
    Get current signal state for all strategies with open positions.
    
    Returns: [{strategy_id, position, last_signal, entry_price, entry_ts}]
    """
    if not TRADE_ENGINE_AVAILABLE:
        return jsonify({'error': 'Trade engine not available'}), 503
    
    try:
        signals = get_current_signals()
        return jsonify({'signals': signals})
    except Exception as e:
        print(f'❌ Error getting current signals: {e}')
        return jsonify({'error': str(e)}), 500


@app.route('/api/positions/<strategy_id>', methods=['GET'])
def api_get_position(strategy_id):
    """Get position state for a specific strategy."""
    if not TRADE_ENGINE_AVAILABLE:
        return jsonify({'error': 'Trade engine not available'}), 503
    
    try:
        position = get_position(strategy_id)
        return jsonify(position)
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/positions/<strategy_id>', methods=['DELETE'])
def api_clear_position(strategy_id):
    """Clear position state for a strategy (reset to NONE)."""
    if not TRADE_ENGINE_AVAILABLE:
        return jsonify({'error': 'Trade engine not available'}), 503
    
    try:
        success = clear_position(strategy_id)
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/positions', methods=['DELETE'])
def api_clear_all_positions():
    """Clear all position states."""
    if not TRADE_ENGINE_AVAILABLE:
        return jsonify({'error': 'Trade engine not available'}), 503
    
    try:
        success = clear_all_positions()
        return jsonify({'success': success})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


if __name__ == '__main__':
    print("FlowGrid Trading Backend Server")
    print("Running on http://localhost:5000")
    print("Refresh your browser to connect the dashboard")
    print("\nPress Ctrl+C to stop\n")
    app.run(host='0.0.0.0', port=5000, debug=False)

