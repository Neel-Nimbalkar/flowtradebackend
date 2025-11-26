import requests
import datetime
import os

def get_alpaca_prices(symbol, start, end, timeframe='1Hour', api_key=None, api_secret=None):
    """
    Fetch historical close prices from Alpaca Markets API.
    Calculates indicators locally; does NOT use Alpaca for indicators.
    """
    # Use Alpaca Data API host, not paper trading host
    endpoint = f'https://data.alpaca.markets/v2/stocks/{symbol}/bars'
    # Resolve credentials: passed parameters override environment
    api_key = api_key or os.environ.get('ALPACA_API_KEY')
    api_secret = api_secret or os.environ.get('ALPACA_API_SECRET')
    if not api_key or not api_secret:
        print('⚠️ Alpaca credentials missing (ALPACA_API_KEY / ALPACA_API_SECRET). Provide env vars or pass to function.')
        return []
    headers = {
        'APCA-API-KEY-ID': api_key,
        'APCA-API-SECRET-KEY': api_secret,
        'Content-Type': 'application/json'
    }
    params = {
        'start': start,
        'end': end,
        'timeframe': timeframe,
        'adjustment': 'raw',
        'limit': 1000,
        'feed': 'iex'
    }
    resp = requests.get(endpoint, headers=headers, params=params)
    if not resp.ok:
        print(f'Alpaca API error: {resp.status_code} {resp.text}')
        return []
    data = resp.json()
    if 'bars' not in data or not isinstance(data['bars'], list):
        print('Alpaca response missing bars')
        return []
    return [bar['c'] for bar in data['bars'] if 'c' in bar]

def fetch_bars_full(symbol: str, start: str, end: str, timeframe: str = '1Hour', api_key: str | None = None, api_secret: str | None = None):
    """Fetch full bar arrays (open, high, low, close, volume) from Alpaca Data API (IEX feed)."""
    endpoint = f'https://data.alpaca.markets/v2/stocks/{symbol}/bars'
    params = {
        'start': start,
        'end': end,
        'timeframe': timeframe,
        'adjustment': 'raw',
        'limit': 1000,
        'feed': 'iex'
    }
    api_key = api_key or os.environ.get('ALPACA_API_KEY')
    api_secret = api_secret or os.environ.get('ALPACA_API_SECRET')
    if not api_key or not api_secret:
        print('⚠️ Alpaca credentials missing (ALPACA_API_KEY / ALPACA_API_SECRET). Provide env vars or pass to function.')
        return {'open': [], 'high': [], 'low': [], 'close': [], 'volume': [], 'timestamp': []}
    headers = {
        'APCA-API-KEY-ID': api_key,
        'APCA-API-SECRET-KEY': api_secret
    }
    # Add verbose logging for debugging data fetch issues
    # Try primary feed first, then fall back if no bars returned
    attempts = [params.copy(), {k: v for k, v in params.items() if k != 'feed'}]
    resp = None
    data = None
    for attempt_idx, p in enumerate(attempts, start=1):
        try:
            resp = requests.get(endpoint, headers=headers, params=p, timeout=20)
        except Exception as e:
            print(f'Alpaca request exception (attempt {attempt_idx}): {e}')
            resp = None
        if resp is None:
            continue
        try:
            body_preview = resp.text[:2000]
        except Exception:
            body_preview = '<unreadable response body>'
        print(f"Alpaca fetch attempt {attempt_idx}: {endpoint} params={p} status={resp.status_code} body_preview={body_preview}")
        if not resp.ok:
            print(f'Alpaca API error (attempt {attempt_idx}): {resp.status_code} {body_preview}')
            continue
        try:
            data = resp.json()
        except Exception as e:
            print(f'Alpaca JSON parse error (attempt {attempt_idx}): {e}')
            data = None
        if not data:
            continue
        bars = data.get('bars', [])
        if bars:
            break
        # if no bars, try next attempt
        print(f'Alpaca returned no bars on attempt {attempt_idx}, trying fallback...')
        data = None
        bars = []
    open_ = [b.get('o') for b in bars if b.get('o') is not None]
    high_ = [b.get('h') for b in bars if b.get('h') is not None]
    low_ = [b.get('l') for b in bars if b.get('l') is not None]
    close_ = [b.get('c') for b in bars if b.get('c') is not None]
    volume_ = [b.get('v') for b in bars if b.get('v') is not None]
    timestamp_ = [b.get('t') for b in bars if b.get('t') is not None]
    # Align lengths
    length = min(len(open_), len(high_), len(low_), len(close_), len(volume_), len(timestamp_))
    return {
        'open': open_[:length],
        'high': high_[:length],
        'low': low_[:length],
        'close': close_[:length],
        'volume': volume_[:length],
        'timestamp': timestamp_[:length]
    }
