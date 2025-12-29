import statistics

def bollinger_bands(values, period=20, num_std=2):
    """Return (upper, middle, lower) arrays aligned with input length.
    Values where data is insufficient are None.
    """
    n = len(values)
    upper = [None] * n
    middle = [None] * n
    lower = [None] * n
    if n < period:
        return upper, middle, lower
    for i in range(period - 1, n):
        window = values[i - period + 1:i + 1]
        mean = sum(window) / period
        # population stddev
        std = statistics.pstdev(window)
        middle[i] = mean
        upper[i] = mean + num_std * std
        lower[i] = mean - num_std * std
    return upper, middle, lower
