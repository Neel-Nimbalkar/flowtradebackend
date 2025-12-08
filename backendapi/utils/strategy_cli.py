#!/usr/bin/env python3
"""
Interactive / CLI-based strategy runner.

Allows the user to choose:
  • Symbol (e.g. SPY, AAPL)
  • Timeframe (1Min,5Min,15Min,1Hour,1Day)
  • Lookback days
  • Indicators to compute (comma separated)

Indicators implemented locally:
  rsi        - RSI(14)
  ema        - EMA(20)
  macd       - MACD(12,26,9)
  boll       - Bollinger Bands(20,2)
  vwap       - VWAP
  volspike   - Volume spike (SMA 20 *1.5)
  atr        - ATR(14)
  stoch      - Stochastic(14,3,3)
  obv        - On Balance Volume

Usage examples:
  python strategy_cli.py --symbol SPY --timeframe 1Hour --days 10 --indicators rsi,macd,ema,volspike
  python strategy_cli.py   (then follow interactive prompts)
"""
import os
import math
import argparse
import datetime
from typing import List, Dict
import requests

ALPACA_KEY = os.getenv("ALPACA_KEY", "PKMPVRKVFKFHFS72QZQQ2L57UN")
ALPACA_SECRET = os.getenv("ALPACA_SECRET", "8tv1igKmQRLoA3gDvUem8DHw6QfxKss1EtkmDdpZuR5q")
DATA_ENDPOINT = "https://data.alpaca.markets/v2/stocks/{symbol}/bars"

VALID_TIMEFRAMES = ["1Min","5Min","15Min","1Hour","1Day"]
ALL_INDICATORS = ["rsi","ema","macd","boll","vwap","volspike","atr","stoch","obv"]

def fetch_bars(symbol: str, start_iso: str, end_iso: str, timeframe: str) -> Dict[str,List[float]]:
    params = {
        "start": start_iso,
        "end": end_iso,
        "timeframe": timeframe,
        "limit": 1000,
        "adjustment": "raw",
        "feed": "iex"
    }
    headers = {"APCA-API-KEY-ID": ALPACA_KEY, "APCA-API-SECRET-KEY": ALPACA_SECRET}
    resp = requests.get(DATA_ENDPOINT.format(symbol=symbol), params=params, headers=headers, timeout=10)
    if not resp.ok:
        raise RuntimeError(f"Alpaca API error: {resp.status_code} {resp.text}")
    data = resp.json().get("bars", [])
    o = [b.get("o") for b in data]
    h = [b.get("h") for b in data]
    l = [b.get("l") for b in data]
    c = [b.get("c") for b in data]
    v = [b.get("v") for b in data]
    length = min(len(o),len(h),len(l),len(c),len(v))
    return {"open": o[:length],"high": h[:length],"low": l[:length],"close": c[:length],"volume": v[:length]}

# ---------------- Indicator Functions ----------------
def rsi(prices: List[float], period: int = 14) -> List[float]:
    if len(prices) < period + 1: return [math.nan]*len(prices)
    deltas = [prices[i]-prices[i-1] for i in range(1,len(prices))]
    gains = [d if d>0 else 0 for d in deltas]
    losses = [-d if d<0 else 0 for d in deltas]
    avg_gain = sum(gains[:period]) / period
    avg_loss = sum(losses[:period]) / period
    out = [math.nan]*period
    for i in range(period, len(prices)-1):
        avg_gain = (avg_gain*(period-1) + gains[i]) / period
        avg_loss = (avg_loss*(period-1) + losses[i]) / period
        rs = avg_gain/avg_loss if avg_loss != 0 else 0
        out.append(100 - (100/(1+rs)))
    out.append(math.nan)
    return out + [math.nan]*(len(prices)-len(out)) if len(out)<len(prices) else out

def ema(prices: List[float], period: int = 20) -> List[float]:
    if len(prices)<period: return [math.nan]*len(prices)
    multiplier = 2/(period+1)
    sma = sum(prices[:period])/period
    out = [math.nan]*(period-1)+[sma]
    prev = sma
    for i in range(period, len(prices)):
        val = prices[i]*multiplier + prev*(1-multiplier)
        out.append(val)
        prev = val
    return out

def compute_macd(prices: List[float], fast=12, slow=26, signal=9):
    def _ema(p, n):
        return ema(p, n)
    if len(prices) < slow: return [math.nan]*len(prices), [math.nan]*len(prices), [math.nan]*len(prices)
    fast_e = _ema(prices, fast)
    slow_e = _ema(prices, slow)
    macd_line = [f - slow_e[i] if not math.isnan(f) and not math.isnan(slow_e[i]) else math.nan for i,f in enumerate(fast_e)]
    # signal on macd_line excluding initial NaNs
    valid = [m for m in macd_line if not math.isnan(m)]
    sig_series = ema(valid, signal) if valid else []
    # pad
    sig_full = [math.nan]*(len(macd_line)-len(sig_series)) + sig_series
    hist = [macd_line[i]-sig_full[i] if not math.isnan(macd_line[i]) and not math.isnan(sig_full[i]) else math.nan for i in range(len(macd_line))]
    return macd_line, sig_full, hist

def boll_bands(prices: List[float], period=20, mult=2.0):
    upper=[]; mid=[]; lower=[]
    for i in range(len(prices)):
        if i < period-1:
            upper.append(math.nan); mid.append(math.nan); lower.append(math.nan)
        else:
            window = prices[i-period+1:i+1]
            m = sum(window)/period
            var = sum((p-m)**2 for p in window)/period
            sd = var**0.5
            mid.append(m); upper.append(m+mult*sd); lower.append(m-mult*sd)
    return upper, mid, lower

def vwap(prices: List[float], volumes: List[float]):
    cum_pv=0; cum_v=0; out=[]
    for p,v in zip(prices, volumes):
        cum_pv += p*v; cum_v += v
        out.append(cum_pv/cum_v if cum_v else math.nan)
    return out

def atr(high: List[float], low: List[float], close: List[float], period=14):
    if len(close) < period+1: return [math.nan]*len(close)
    trs=[]
    for i in range(len(close)):
        if i==0:
            trs.append(high[i]-low[i])
        else:
            hl=high[i]-low[i]
            hc=abs(high[i]-close[i-1])
            lc=abs(low[i]-close[i-1])
            trs.append(max(hl,hc,lc))
    out=[math.nan]*(period-1)
    first_avg = sum(trs[:period])/period
    out.append(first_avg)
    prev=first_avg
    for i in range(period,len(trs)):
        val=(prev*(period-1)+trs[i])/period
        out.append(val); prev=val
    return out

def stochastic(high: List[float], low: List[float], close: List[float], period=14, k_smooth=3, d_smooth=3):
    raw_k=[]
    for i in range(len(close)):
        if i < period-1:
            raw_k.append(math.nan)
        else:
            window_h = high[i-period+1:i+1]
            window_l = low[i-period+1:i+1]
            hhv=max(window_h); llv=min(window_l)
            k = ((close[i]-llv)/(hhv-llv))*100 if hhv!=llv else 0
            raw_k.append(k)
    def smooth(series, p):
        out=[]
        for i in range(len(series)):
            if i < p-1:
                out.append(math.nan)
            else:
                w=[s for s in series[i-p+1:i+1] if not math.isnan(s)]
                out.append(sum(w)/len(w) if w else math.nan)
        return out
    percent_k = smooth(raw_k, k_smooth)
    percent_d = smooth(percent_k, d_smooth)
    return percent_k, percent_d

def obv(close: List[float], volume: List[float]):
    out=[]; running=0
    for i in range(len(close)):
        if i==0: running +=0
        else:
            if close[i]>close[i-1]: running += volume[i]
            elif close[i]<close[i-1]: running -= volume[i]
        out.append(running)
    return out

def volume_spike(volume: List[float], period=20, multiplier=1.5):
    avg=[]; spike=[]
    for i in range(len(volume)):
        if i < period-1:
            avg.append(math.nan); spike.append(False)
        else:
            window=volume[i-period+1:i+1]
            m=sum(window)/period
            avg.append(m)
            spike.append(volume[i] > m*multiplier)
    return avg, spike

# ---------------- Flowchart ----------------
def render_flowchart(symbol:str, timeframe:str, indicators:List[str]) -> str:
    lines=[f"[INPUT: {symbol} {timeframe}]"]
    for ind in indicators:
        lines.append(f"   ├─→ [{ind.upper()}]")
    if indicators:
        lines[-1]=lines[-1].replace('├─','└─')
    return "\n".join(lines)

# ---------------- Main Logic ----------------
def parse_args():
    ap=argparse.ArgumentParser(description="Strategy CLI")
    ap.add_argument('--symbol', type=str, help='Ticker symbol (e.g. SPY)')
    ap.add_argument('--timeframe', type=str, choices=VALID_TIMEFRAMES)
    ap.add_argument('--days', type=int, help='Lookback days', default=10)
    ap.add_argument('--indicators', type=str, help='Comma separated indicators')
    ap.add_argument('--show-last', type=int, default=15, help='Rows to show at end')
    return ap.parse_args()

def interactive_fallback(args):
    if not args.symbol:
        args.symbol = input(f"Symbol [{ 'SPY' }]: ").strip() or 'SPY'
    if not args.timeframe:
        tf = input(f"Timeframe {VALID_TIMEFRAMES} [1Hour]: ").strip() or '1Hour'
        if tf not in VALID_TIMEFRAMES:
            print('Invalid timeframe, defaulting to 1Hour'); tf='1Hour'
        args.timeframe=tf
    if not args.indicators:
        sel = input(f"Indicators (comma) {ALL_INDICATORS} [rsi,macd,ema,volspike]: ").strip() or 'rsi,macd,ema,volspike'
        args.indicators = sel
    return args

def main():
    args=parse_args()
    args=interactive_fallback(args)
    indicators=[i.strip().lower() for i in args.indicators.split(',') if i.strip()]
    for i in indicators:
        if i not in ALL_INDICATORS:
            print(f"Warning: unsupported indicator '{i}' (skipped)")
    indicators=[i for i in indicators if i in ALL_INDICATORS]

    now=datetime.datetime.utcnow()
    end=now.isoformat()+"Z"
    start=(now - datetime.timedelta(days=args.days)).isoformat()+"Z"
    print(f"Fetching {args.symbol} {args.timeframe} bars ({args.days} days)...")
    bars=fetch_bars(args.symbol, start, end, args.timeframe)
    close=bars['close']; high=bars['high']; low=bars['low']; volume=bars['volume']
    if not close:
        print('No data returned. Exiting.')
        return
    print(f"Fetched {len(close)} bars\n")
    print('[Flowchart]')
    print(render_flowchart(args.symbol, args.timeframe, indicators))
    print()

    results={}
    if 'rsi' in indicators: results['rsi']=rsi(close,14)
    if 'ema' in indicators: results['ema']=ema(close,20)
    if 'macd' in indicators:
        m_line, m_sig, m_hist = compute_macd(close)
        results['macd_line']=m_line; results['macd_signal']=m_sig; results['macd_hist']=m_hist
    if 'boll' in indicators:
        u,m,l = boll_bands(close)
        results['boll_upper']=u; results['boll_mid']=m; results['boll_lower']=l
    if 'vwap' in indicators:
        results['vwap']=vwap(close, volume)
    if 'volspike' in indicators:
        avg, sp = volume_spike(volume)
        results['vol_avg']=avg; results['vol_spike']=sp
    if 'atr' in indicators:
        results['atr']=atr(high, low, close)
    if 'stoch' in indicators:
        k,d = stochastic(high, low, close)
        results['stoch_k']=k; results['stoch_d']=d
    if 'obv' in indicators:
        results['obv']=obv(close, volume)

    # Summary counts for boolean signals
    bool_signals={k:v for k,v in results.items() if isinstance(v,list) and v and isinstance(v[0], bool)}
    if bool_signals:
        print('Boolean signal counts:')
        for k,v in bool_signals.items():
            print(f"  {k}: {sum(1 for x in v if x)}")
        print()

    # Display last N rows
    n=args.show_last; start_idx=max(0,len(close)-n)
    print(f"Last {n} rows:")
    cols=['close'] + [k for k in results.keys() if k not in ('macd_signal','macd_hist','macd_line')] # basic order tweak
    print('Index  Price   ' + '  '.join(c.upper()[:10].ljust(10) for c in cols[1:]))
    print('-'*120)
    for i in range(start_idx, len(close)):
        row=[f"{i:>5}", f"{close[i]:>7.2f}"]
        for c in cols[1:]:
            series=results.get(c)
            if not series or i>=len(series):
                row.append(' '*10)
            else:
                val=series[i]
                if isinstance(val, bool):
                    row.append(('Y' if val else 'N').ljust(10))
                elif isinstance(val, (int,float)) and not math.isnan(val):
                    row.append(f"{val:.2f}".ljust(10))
                else:
                    row.append('NaN'.ljust(10))
        print(' '.join(row))
    print('-'*120)
    
    # Generate visualization
    try:
        from visualize import generate_chart_html
        output_path = generate_chart_html(args.symbol, args.timeframe, bars, results)
        print(f"\n📊 Interactive chart generated: {output_path}")
        print("   Open this file in your browser to view the visualization.")
    except Exception as e:
        print(f"\nVisualization generation failed: {e}")
    
    print('Done.')

if __name__=='__main__':
    main()