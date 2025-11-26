from datetime import datetime
from typing import Any, Callable, Dict, List

"""
Pure backtest runner: extracts the core loop from BacktestManager so it can be
unit-tested and reused by other runners. It accepts a callable `execute_fn`
that evaluates the workflow for a given bar (to allow mocking in tests).
"""

def run_backtest(symbol: str, timeframe: str, bars: Dict[str, List[Any]], workflow_blocks: List[Any], execute_fn: Callable[[List[Any], Dict[str, Any]], Any], initial_cash: float = 100000.0, execution_config: Dict[str, Any] = None) -> Dict[str, Any]:
    opens = bars.get('open', [])
    highs = bars.get('high', [])
    lows = bars.get('low', [])
    closes = bars.get('close', [])
    volumes = bars.get('volume', [])
    timestamps = bars.get('timestamp', [])

    n = len(closes)
    signals = []
    trades = []
    position = 0
    entry_price = None
    cash = float(initial_cash)
    equity = cash
    equity_curve = []
    peak = equity
    max_drawdown = 0.0

    # Execution config defaults
    cfg = execution_config or {}
    # position sizing: either fixed units 'position_size' or fraction of equity 'position_size_pct'
    pos_units = cfg.get('position_size')
    pos_pct = cfg.get('position_size_pct')
    # commission: fixed per trade and/or percent of trade value
    commission_fixed = float(cfg.get('commission_fixed', 0.0) or 0.0)
    commission_pct = float(cfg.get('commission_pct', 0.0) or 0.0)
    # slippage percent (e.g. 0.001 = 0.1%) applied to execution price
    slippage_pct = float(cfg.get('slippage_pct', 0.0) or 0.0)

    for i in range(n):
        latest = {
            'open': opens[i] if i < len(opens) else None,
            'high': highs[i] if i < len(highs) else None,
            'low': lows[i] if i < len(lows) else None,
            'close': closes[i] if i < len(closes) else None,
            'volume': volumes[i] if i < len(volumes) else None,
        }
        # call the provided execute function
        try:
            resp = execute_fn(workflow_blocks, latest)
            final = getattr(resp, 'final_decision', None) if resp is not None else None
            success = getattr(resp, 'success', False) if resp is not None else False
        except Exception:
            final = None
            success = False

        # Act on the engine's final decision string regardless of the `success` boolean.
        # This allows workflows that return a `final_decision` of 'REJECTED' (with success=False)
        # to produce exit signals, while 'CONFIRMED' triggers entries.
        if final and 'CONFIRMED' in str(final).upper():
            market_price = closes[i]
            # compute execution price with slippage (buys pay +slippage)
            exec_price = market_price * (1.0 + slippage_pct)
            # determine quantity
            if pos_units is not None:
                try:
                    quantity = int(pos_units)
                except Exception:
                    quantity = 0
            elif pos_pct is not None:
                # allocate fraction of current equity
                try:
                    alloc = max(0.0, min(1.0, float(pos_pct)))
                except Exception:
                    alloc = 0.0
                # approximate available buying power
                quantity = int((cash * alloc) // exec_price) if exec_price > 0 else 0
            else:
                quantity = 1

            if quantity > 0:
                signals.append({'time': timestamps[i] if i < len(timestamps) else None, 'signal': 'BUY', 'price': market_price})
                if position == 0:
                    position = quantity
                    entry_price = exec_price
                    # charge cost + commission
                    trade_value = exec_price * quantity
                    fee = commission_fixed + (commission_pct * trade_value)
                    cash -= (trade_value + fee)
                    trades.append({'type': 'entry', 'time': timestamps[i] if i < len(timestamps) else None, 'price': entry_price, 'qty': quantity, 'commission': fee})
        elif final and 'REJECTED' in str(final).upper():
            market_price = closes[i]
            exec_price = market_price * (1.0 - slippage_pct)
            signals.append({'time': timestamps[i] if i < len(timestamps) else None, 'signal': 'SELL', 'price': market_price})
            if position > 0:
                exit_price = exec_price
                trade_value = exit_price * position
                fee = commission_fixed + (commission_pct * trade_value)
                # credit proceeds minus commission
                cash += (trade_value - fee)
                pnl = (exit_price - entry_price) * position if entry_price is not None else None
                trades.append({'type': 'exit', 'time': timestamps[i] if i < len(timestamps) else None, 'price': exit_price, 'qty': position, 'pnl': pnl, 'commission': fee})
                position = 0
                entry_price = None

        equity = cash + (position * closes[i])
        equity_curve.append({'time': timestamps[i] if i < len(timestamps) else None, 'equity': equity})
        if equity > peak:
            peak = equity
        dd = (peak - equity) / peak if peak > 0 else 0
        if dd > max_drawdown:
            max_drawdown = dd

    # close remaining position at last price
    if position > 0 and entry_price is not None and len(closes):
        exit_price = closes[-1]
        cash += exit_price * position
        pnl = (exit_price - entry_price) * position
        trades.append({'type': 'exit', 'time': timestamps[-1] if timestamps else None, 'price': exit_price, 'qty': position, 'pnl': pnl})
        position = 0
        equity = cash

    total_return = (equity - float(initial_cash)) / float(initial_cash)
    years = max(1/365.0, (len(closes) / 252.0)) if len(closes) else 1/365.0
    annualized_return = (1 + total_return) ** (1/years) - 1 if years > 0 else total_return
    win_trades = [t for t in trades if t.get('type') == 'exit' and t.get('pnl', 0) > 0]
    exit_trades = [t for t in trades if t.get('type') == 'exit']
    win_rate = (len(win_trades) / len(exit_trades)) if exit_trades else 0.0

    result = {
        'symbol': symbol,
        'timeframe': timeframe,
        'bar_count': n,
        'signals': signals,
        'trades': trades,
        'metrics': {
            'final_equity': equity,
            'total_return': total_return,
            'annualized_return': annualized_return,
            'max_drawdown': max_drawdown,
            'win_rate': win_rate,
        },
        'equity_curve': equity_curve,
        'created_at': datetime.utcnow().isoformat() + 'Z'
    }

    return result
