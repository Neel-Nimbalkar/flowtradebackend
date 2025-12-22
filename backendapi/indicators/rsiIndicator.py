def rsi(prices, period=14):
    """Compute RSI values for a list of closing prices.
    Returns a list of same length with None for indices where RSI cannot be computed yet.
    """
    if not prices:
        return []
    n = len(prices)
    if n < 2:
        return [None] * n

    gains = []
    losses = []
    for i in range(1, n):
        change = prices[i] - prices[i - 1]
        gains.append(max(change, 0.0))
        losses.append(max(-change, 0.0))

    rsi_vals = [None] * n
    if len(gains) < period:
        return rsi_vals

    # First average gain/loss (simple average)
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    # First RSI corresponds to index `period`
    if avg_loss == 0:
        rsi_vals[period] = 100.0
    else:
        rs = avg_gain / avg_loss
        rsi_vals[period] = 100.0 - (100.0 / (1.0 + rs))

    # Wilder's smoothing for subsequent values
    for i in range(period + 1, n):
        gain = gains[i - 1]
        loss = losses[i - 1]
        avg_gain = (avg_gain * (period - 1) + gain) / period
        avg_loss = (avg_loss * (period - 1) + loss) / period
        if avg_loss == 0:
            rsi_vals[i] = 100.0
        else:
            rs = avg_gain / avg_loss
            rsi_vals[i] = 100.0 - (100.0 / (1.0 + rs))

    return rsi_vals
