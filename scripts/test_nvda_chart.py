"""Quick NVDA price chart demo using Alpaca Data API.

Set environment variables before running:
  setx ALPACA_KEY_ID "<your-key>"
  setx ALPACA_SECRET_KEY "<your-secret>"
Restart the terminal after setx, or for a one-off run:
  set ALPACA_KEY_ID=<your-key>
  set ALPACA_SECRET_KEY=<your-secret>

This script fetches the last month of daily bars for NVDA and renders a dark-themed
line chart showing closing prices. Matplotlib is required (pip install matplotlib).
"""
from __future__ import annotations

import datetime as dt
import os
import sys
from typing import List, Dict

import requests

try:
    import matplotlib.pyplot as plt
    from matplotlib.ticker import FuncFormatter
except ImportError as exc:  # pragma: no cover
    print("matplotlib is required for this script. Install with: pip install matplotlib", file=sys.stderr)
    raise

SYMBOL = "NVDA"
TIMEFRAME = "1Hour"
LOOKBACK_DAYS = 7

ALPACA_DATA_URL = f"https://data.alpaca.markets/v2/stocks/{SYMBOL}/bars"

def _get_env_var(name: str) -> str:
    value = os.environ.get(name)
    if not value:
        raise RuntimeError(f"Environment variable {name} is required but not set.")
    return value

def fetch_nvda_bars() -> List[Dict]:
    key_id = _get_env_var("ALPACA_KEY_ID")
    secret_key = _get_env_var("ALPACA_SECRET_KEY")

    end = dt.datetime.now(dt.UTC)
    start = end - dt.timedelta(days=LOOKBACK_DAYS)

    params = {
        "timeframe": TIMEFRAME,
        "start": start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "end": end.strftime("%Y-%m-%dT%H:%M:%SZ"),
        "adjustment": "raw",
        "limit": 100,
        "feed": "iex",
    }

    headers = {
        "APCA-API-KEY-ID": key_id,
        "APCA-API-SECRET-KEY": secret_key,
    }

    response = requests.get(ALPACA_DATA_URL, params=params, headers=headers, timeout=10)
    if response.status_code != 200:
        raise RuntimeError(f"Alpaca API error {response.status_code}: {response.text}")

    payload = response.json()
    bars = payload.get("bars", [])
    if not bars:
        raise RuntimeError("No bar data returned for NVDA.")
    return bars

def render_chart(bars: List[Dict], *, save_path: str | None = None) -> None:
    dates = [dt.datetime.fromisoformat(bar["t"].replace("Z", "+00:00")) for bar in bars]
    closes = [bar["c"] for bar in bars]

    plt.style.use("dark_background")
    fig, ax = plt.subplots(figsize=(10, 5), constrained_layout=True)

    ax.plot(dates, closes, color="#60a5fa", linewidth=2.2, alpha=0.95)
    ax.fill_between(dates, closes, color="#60a5fa", alpha=0.18)

    tf_label = TIMEFRAME.replace("Hour", " Hour").replace("Min", " Min")
    ax.set_title(f"{SYMBOL} Price Chart — {tf_label}", color="#e5e7eb", fontsize=14, pad=16)
    ax.set_ylabel("Price (USD)", color="#cbd5f5")
    ax.set_xlabel("Date", color="#cbd5f5", labelpad=10)
    ax.grid(True, which="major", color="#1f2933", linestyle="--", linewidth=0.6, alpha=0.7)

    ax.tick_params(colors="#9ca3af")
    ax.yaxis.set_major_formatter(FuncFormatter(lambda x, _: f"${x:,.2f}"))

    try:
        fig.canvas.manager.set_window_title(f"{SYMBOL} Price Chart — {tf_label}")
    except Exception:
        pass
    fig.patch.set_facecolor("#000000")
    ax.set_facecolor("#0f172a")

    if save_path:
        os.makedirs(os.path.dirname(save_path), exist_ok=True)
        plt.savefig(save_path, dpi=160)
        print(f"Chart saved to {save_path}")

    plt.show()


def main():
    try:
        bars = fetch_nvda_bars()
    except Exception as exc:  # pragma: no cover
        print(f"Error fetching NVDA data: {exc}", file=sys.stderr)
        sys.exit(1)

    output_path = os.path.join(os.path.dirname(__file__), "..", "outputs", "nvda_price_chart.png")
    output_path = os.path.abspath(output_path)
    render_chart(bars, save_path=output_path)


if __name__ == "__main__":
    main()
