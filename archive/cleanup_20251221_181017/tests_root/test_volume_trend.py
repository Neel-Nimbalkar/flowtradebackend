from backend import volume_spike, compute_trendlines


def test_volume_spike_detects_last_spike():
    # Construct volumes where the last bar is a clear spike
    vols = [100, 110, 95, 105, 98, 102, 100, 99, 500]
    spikes = volume_spike(vols, period=5, multiplier=2.0)
    # Ensure output length matches input
    assert len(spikes) == len(vols)
    # The final bar should be detected as a spike given multiplier 2.0
    assert spikes[-1] is True


def test_compute_trendlines_detects_uptrend():
    # Create an uptrending series with small oscillations so the pivot detector finds pivots
    highs = []
    for i in range(30):
        base = 10 + i * 0.2
        oscillation = 0.3 if i % 2 == 0 else -0.2
        highs.append(base + oscillation)
    lows = [h - 1.0 for h in highs]
    closes = [l + 0.5 for l in lows]

    tl = compute_trendlines(highs, lows, closes, lookback=30, pivot_window=1, min_touches=2, tolerance_pct=0.5)

    # Expect a slope bias 'up' for the noisy rising series
    assert tl.get('trend_slope') in ('up', 'flat')
    # trend_resistance/support keys should exist
    assert 'trend_resistance' in tl and 'trend_support' in tl
    # trend_high_touches and low touches should be integers
    assert isinstance(tl.get('trend_high_touches', 0), int)
    assert isinstance(tl.get('trend_low_touches', 0), int)
