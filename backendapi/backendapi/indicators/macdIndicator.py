def _ema(values, period):
    ema = [None] * len(values)
    if len(values) < period:
        return ema
    sma = sum(values[:period]) / period
    ema[period - 1] = sma
    k = 2.0 / (period + 1)
    for i in range(period, len(values)):
        ema[i] = (values[i] - ema[i - 1]) * k + ema[i - 1]
    return ema


def macd(values, fast=12, slow=26, signal=9):
    """Return (macd_line, signal_line, histogram) arrays aligned with input length.
    Values where data is insufficient are None.
    """
    if not values:
        return [], [], []
    ema_fast = _ema(values, fast)
    ema_slow = _ema(values, slow)
    macd_line = [None] * len(values)
    for i in range(len(values)):
        if ema_fast[i] is not None and ema_slow[i] is not None:
            macd_line[i] = ema_fast[i] - ema_slow[i]
    # Signal line is EMA of macd_line (skip None values)
    # Build list of macd numeric values with Nones preserved
    signal_line = [None] * len(values)
    # Find first index where macd_line is not None
    first = next((idx for idx, v in enumerate(macd_line) if v is not None), None)
    if first is None:
        return macd_line, signal_line, [None] * len(values)
    # For signal EMA we need at least `signal` points of macd_line
    macd_valid = [v for v in macd_line[first:] if v is not None]
    if len(macd_valid) < signal:
        return macd_line, signal_line, [None] * len(values)
    # Compute EMA over macd_line starting at `first`
    # Build an index-aligned list for signal calculation
    ema_buf = [None] * len(values)
    # Initialize SMA for signal
    sma = sum(macd_valid[:signal]) / signal
    idx = first + signal - 1
    ema_buf[idx] = sma
    k = 2.0 / (signal + 1)
    for j in range(idx + 1, len(values)):
        if macd_line[j] is None:
            ema_buf[j] = ema_buf[j - 1]
        else:
            ema_buf[j] = (macd_line[j] - ema_buf[j - 1]) * k + ema_buf[j - 1]
    # Copy ema_buf into signal_line
    for i in range(len(values)):
        signal_line[i] = ema_buf[i]
    # Histogram = macd - signal
    histogram = [None] * len(values)
    for i in range(len(values)):
        if macd_line[i] is not None and signal_line[i] is not None:
            histogram[i] = macd_line[i] - signal_line[i]
    return macd_line, signal_line, histogram
