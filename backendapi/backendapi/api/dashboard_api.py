"""
FlowGrid Trading - Dashboard API Module
Provides computed metrics, equity curves, and strategy management for the dashboard homepage.
All calculations respect fees, commissions, slippage, and use the same calculation engine as backtesting.
"""

import json
import os
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional
from collections import defaultdict

# Path to persisted data
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
TRADES_FILE = os.path.join(DATA_DIR, 'trades.json')
PERCENT_TRADES_FILE = os.path.join(DATA_DIR, 'percent_trades.json')  # Trade engine source
STRATEGIES_FILE = os.path.join(DATA_DIR, 'saved_strategies.json')
ACCOUNT_FILE = os.path.join(DATA_DIR, 'account.json')

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)


def _load_json_file(filepath: str, default: Any = None) -> Any:
    """Safely load JSON from file."""
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"Error loading {filepath}: {e}")
    return default if default is not None else {}


def _save_json_file(filepath: str, data: Any) -> bool:
    """Safely save JSON to file."""
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, default=str)
        return True
    except Exception as e:
        print(f"Error saving {filepath}: {e}")
        return False


def get_account_info() -> Dict[str, Any]:
    """Get account-level information including starting capital and current balances."""
    default_account = {
        'starting_capital': 100000.0,
        'cash': 100000.0,
        'equity': 100000.0,
        'buying_power': 100000.0,
        'last_updated': datetime.utcnow().isoformat()
    }
    return _load_json_file(ACCOUNT_FILE, default_account)


def save_account_info(account: Dict[str, Any]) -> bool:
    """Persist account information."""
    account['last_updated'] = datetime.utcnow().isoformat()
    return _save_json_file(ACCOUNT_FILE, account)


def get_all_strategies() -> Dict[str, Dict[str, Any]]:
    """Load all saved strategies with their enabled states."""
    return _load_json_file(STRATEGIES_FILE, {})


def save_strategies(strategies: Dict[str, Dict[str, Any]]) -> bool:
    """Persist strategies data."""
    return _save_json_file(STRATEGIES_FILE, strategies)


def toggle_strategy(strategy_name: str, enabled: bool) -> Dict[str, Any]:
    """Toggle a strategy's enabled state and return updated strategy info."""
    strategies = get_all_strategies()
    if strategy_name in strategies:
        strategies[strategy_name]['enabled'] = enabled
        strategies[strategy_name]['updated_at'] = datetime.utcnow().isoformat()
        save_strategies(strategies)
        return strategies[strategy_name]
    return {'error': 'Strategy not found'}


def get_all_trades(
    strategy_names: Optional[List[str]] = None,
    start_date: Optional[str] = None,
    end_date: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get all executed trades from percent_trades.json (trade engine source).
    Converts percent trade format to dashboard-compatible format.
    """
    # Primary: Read from trade engine's percent_trades.json
    percent_data = _load_json_file(PERCENT_TRADES_FILE, {'trades': []})
    percent_trades = percent_data.get('trades', [])
    
    # Convert percent_trades format to dashboard format
    trades = []
    for pt in percent_trades:
        # Each percent trade is already a completed trade with entry/exit
        trade = {
            'id': pt.get('id', ''),
            'type': 'exit',  # All percent trades are completed (entry+exit)
            'strategy_name': pt.get('strategy_id', 'Unknown'),
            'symbol': pt.get('meta', {}).get('symbol', 'SPY'),
            'direction': 'LONG' if pt.get('open_side') == 'LONG' else 'SHORT',
            'entry_price': pt.get('open_price', 0),
            'price': pt.get('close_price', 0),
            'timestamp': pt.get('close_ts', ''),
            'entry_timestamp': pt.get('open_ts', ''),
            # P&L in percent - convert to notional using reference price
            'pnl_pct': pt.get('net_pct', 0),
            'gross_pct': pt.get('gross_pct', 0),
            'fee_pct': pt.get('fee_pct_total', 0),
            # Approximate notional P&L (assuming $10k position size for display)
            'pnl': pt.get('net_pct', 0) * 100,  # $10k base → 1% = $100
            'commission': pt.get('fee_pct_total', 0) * 100,
            'qty': 1,  # Position-based
            'meta': pt.get('meta', {})
        }
        trades.append(trade)
    
    # Fallback: Also check legacy trades.json if no percent trades
    if not trades:
        legacy_data = _load_json_file(TRADES_FILE, {'trades': []})
        trades = legacy_data.get('trades', [])
    
    # Filter by strategy if specified
    if strategy_names:
        trades = [t for t in trades if t.get('strategy_name') in strategy_names]
    
    # Filter by date range
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            trades = [t for t in trades if _parse_trade_time(t.get('timestamp', '')) >= start_dt]
        except Exception:
            pass
    
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            trades = [t for t in trades if _parse_trade_time(t.get('timestamp', '')) <= end_dt]
        except Exception:
            pass
    
    return trades


def _parse_trade_time(timestamp_str: str) -> datetime:
    """Parse a trade timestamp string to datetime."""
    try:
        if timestamp_str:
            return datetime.fromisoformat(timestamp_str.replace('Z', '+00:00'))
    except Exception:
        pass
    return datetime.min


def calculate_net_pnl(
    trades: List[Dict[str, Any]],
    include_fees: bool = True,
    include_commissions: bool = True,
    include_slippage: bool = True
) -> Dict[str, float]:
    """
    Calculate net P&L from trades.
    Supports both percent-based trades (from trade engine) and legacy dollar-based trades.
    Returns: { 'net_pnl': float, 'gross_pnl': float, 'total_fees': float, 'net_pnl_percent': float }
    """
    # Check if these are percent-based trades (from trade engine)
    has_pct_trades = any(t.get('pnl_pct') is not None for t in trades)
    
    if has_pct_trades:
        # Sum percent-based P&L
        net_pnl_pct = sum(float(t.get('pnl_pct', 0) or 0) for t in trades if t.get('type') == 'exit' or t.get('pnl_pct') is not None)
        gross_pnl_pct = sum(float(t.get('gross_pct', 0) or 0) for t in trades if t.get('type') == 'exit' or t.get('gross_pct') is not None)
        total_fees_pct = sum(float(t.get('fee_pct', 0) or 0) for t in trades if t.get('type') == 'exit' or t.get('fee_pct') is not None)
        
        # Convert to notional (approximate, using $10k reference for display)
        base_capital = 10000
        net_pnl = net_pnl_pct * base_capital / 100
        gross_pnl = gross_pnl_pct * base_capital / 100
        total_fees = total_fees_pct * base_capital / 100
        
        return {
            'net_pnl': round(net_pnl, 2),
            'gross_pnl': round(gross_pnl, 2),
            'total_fees': round(total_fees, 2),
            'net_pnl_percent': round(net_pnl_pct, 2)
        }
    
    # Legacy dollar-based calculation
    gross_pnl = 0.0
    total_fees = 0.0
    total_commissions = 0.0
    total_slippage = 0.0
    total_cost_basis = 0.0
    
    for trade in trades:
        if trade.get('type') == 'exit' or trade.get('pnl') is not None:
            pnl = float(trade.get('pnl', 0) or 0)
            gross_pnl += pnl
            
            # Accumulate fees
            if include_fees:
                total_fees += float(trade.get('fee', 0) or 0)
            if include_commissions:
                total_commissions += float(trade.get('commission', 0) or 0)
            if include_slippage:
                total_slippage += float(trade.get('slippage_cost', 0) or 0)
            
            # Track cost basis for percentage calculation
            entry_price = float(trade.get('entry_price', 0) or trade.get('price', 0) or 0)
            qty = float(trade.get('qty', 0) or trade.get('quantity', 1) or 1)
            total_cost_basis += abs(entry_price * qty)
    
    total_deductions = total_fees + total_commissions + total_slippage
    net_pnl = gross_pnl - total_deductions
    
    # Calculate percentage return
    account = get_account_info()
    starting_capital = float(account.get('starting_capital', 100000))
    net_pnl_percent = (net_pnl / starting_capital) * 100 if starting_capital > 0 else 0
    
    return {
        'net_pnl': round(net_pnl, 2),
        'gross_pnl': round(gross_pnl, 2),
        'total_fees': round(total_deductions, 2),
        'net_pnl_percent': round(net_pnl_percent, 2)
    }


def _get_trade_pnl(trade: Dict[str, Any]) -> float:
    """Get P&L from a trade, supporting both percent and dollar formats."""
    # Prefer pnl_pct for percent-based trades
    if trade.get('pnl_pct') is not None:
        return float(trade.get('pnl_pct', 0) or 0)
    return float(trade.get('pnl', 0) or 0)


def calculate_win_rate(trades: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate win rate from exit trades.
    Supports both percent-based and dollar-based trades.
    Returns: { 'win_rate': float, 'wins': int, 'losses': int, 'total': int }
    """
    exit_trades = [t for t in trades if t.get('type') == 'exit' or t.get('pnl') is not None or t.get('pnl_pct') is not None]
    
    wins = sum(1 for t in exit_trades if _get_trade_pnl(t) > 0)
    losses = sum(1 for t in exit_trades if _get_trade_pnl(t) < 0)
    breakeven = len(exit_trades) - wins - losses
    total = len(exit_trades)
    
    win_rate = (wins / total * 100) if total > 0 else 0
    
    return {
        'win_rate': round(win_rate, 1),
        'wins': wins,
        'losses': losses,
        'breakeven': breakeven,
        'total': total
    }


def calculate_profit_factor(trades: List[Dict[str, Any]]) -> float:
    """
    Calculate profit factor: gross profits / gross losses.
    A value > 1 indicates profitable trading.
    Supports both percent-based and dollar-based trades.
    """
    exit_trades = [t for t in trades if t.get('type') == 'exit' or t.get('pnl') is not None or t.get('pnl_pct') is not None]
    
    gross_profits = sum(_get_trade_pnl(t) for t in exit_trades if _get_trade_pnl(t) > 0)
    gross_losses = abs(sum(_get_trade_pnl(t) for t in exit_trades if _get_trade_pnl(t) < 0))
    
    if gross_losses == 0:
        return float('inf') if gross_profits > 0 else 0.0
    
    return round(gross_profits / gross_losses, 2)


def calculate_expectancy(trades: List[Dict[str, Any]]) -> Dict[str, float]:
    """
    Calculate trade expectancy: (win_rate * avg_win) - (loss_rate * avg_loss).
    This is the expected profit per trade.
    Supports both percent-based and dollar-based trades.
    """
    exit_trades = [t for t in trades if t.get('type') == 'exit' or t.get('pnl') is not None or t.get('pnl_pct') is not None]
    
    if not exit_trades:
        return {'expectancy': 0.0, 'avg_win': 0.0, 'avg_loss': 0.0}
    
    winning_trades = [_get_trade_pnl(t) for t in exit_trades if _get_trade_pnl(t) > 0]
    losing_trades = [_get_trade_pnl(t) for t in exit_trades if _get_trade_pnl(t) < 0]
    
    avg_win = sum(winning_trades) / len(winning_trades) if winning_trades else 0
    avg_loss = abs(sum(losing_trades) / len(losing_trades)) if losing_trades else 0
    
    win_rate = len(winning_trades) / len(exit_trades) if exit_trades else 0
    loss_rate = len(losing_trades) / len(exit_trades) if exit_trades else 0
    
    expectancy = (win_rate * avg_win) - (loss_rate * avg_loss)
    
    return {
        'expectancy': round(expectancy, 2),
        'avg_win': round(avg_win, 2),
        'avg_loss': round(avg_loss, 2)
    }


def calculate_max_drawdown(
    trades: List[Dict[str, Any]],
    starting_capital: float = None
) -> Dict[str, float]:
    """
    Calculate maximum drawdown from equity curve.
    Supports both percent-based and dollar-based trades.
    Returns: { 'max_drawdown_pct': float, 'max_drawdown_value': float, 'peak_equity': float }
    """
    account = get_account_info()
    if starting_capital is None:
        starting_capital = float(account.get('starting_capital', 100000))
    
    # Check if percent-based trades
    has_pct_trades = any(t.get('pnl_pct') is not None for t in trades)
    
    # Sort trades by timestamp
    sorted_trades = sorted(trades, key=lambda t: _parse_trade_time(t.get('timestamp', '')))
    
    if has_pct_trades:
        # Percent-based drawdown calculation
        equity_pct = 100.0  # Start at 100%
        peak_pct = equity_pct
        max_dd_pct = 0.0
        
        for trade in sorted_trades:
            pnl_pct = float(trade.get('pnl_pct', 0) or 0)
            equity_pct = equity_pct * (1 + pnl_pct / 100)
            
            if equity_pct > peak_pct:
                peak_pct = equity_pct
            
            drawdown_pct = ((peak_pct - equity_pct) / peak_pct * 100) if peak_pct > 0 else 0
            max_dd_pct = max(max_dd_pct, drawdown_pct)
        
        # Convert to notional for display
        max_dd_value = max_dd_pct * starting_capital / 100
        peak_equity = peak_pct * starting_capital / 100
        
        return {
            'max_drawdown_pct': round(max_dd_pct, 2),
            'max_drawdown_value': round(max_dd_value, 2),
            'peak_equity': round(peak_equity, 2)
        }
    
    # Legacy dollar-based calculation
    equity = starting_capital
    peak = equity
    max_dd_value = 0.0
    max_dd_pct = 0.0
    
    for trade in sorted_trades:
        pnl = float(trade.get('pnl', 0) or 0)
        commission = float(trade.get('commission', 0) or 0)
        fee = float(trade.get('fee', 0) or 0)
        
        equity += pnl - commission - fee
        
        if equity > peak:
            peak = equity
        
        drawdown_value = peak - equity
        drawdown_pct = (drawdown_value / peak * 100) if peak > 0 else 0
        
        if drawdown_value > max_dd_value:
            max_dd_value = drawdown_value
            max_dd_pct = drawdown_pct
    
    return {
        'max_drawdown_pct': round(max_dd_pct, 2),
        'max_drawdown_value': round(max_dd_value, 2),
        'peak_equity': round(peak, 2)
    }


def calculate_equity_curve(
    trades: List[Dict[str, Any]],
    starting_capital: float = None,
    timeframe: str = '1M'
) -> List[Dict[str, Any]]:
    """
    Generate equity curve data points.
    Supports both percent-based and dollar-based trades.
    Returns list of { 't': timestamp_ms, 'v': equity_value, 'v_pct': equity_percent }
    """
    account = get_account_info()
    if starting_capital is None:
        starting_capital = float(account.get('starting_capital', 100000))
    
    # Sort trades by timestamp
    sorted_trades = sorted(trades, key=lambda t: _parse_trade_time(t.get('timestamp', '')))
    
    # Check if percent-based trades
    has_pct_trades = any(t.get('pnl_pct') is not None for t in trades)
    
    curve = []
    
    if has_pct_trades:
        # Percent-based equity curve
        equity_pct = 100.0
        peak_pct = equity_pct
        
        if sorted_trades:
            first_time = _parse_trade_time(sorted_trades[0].get('timestamp', ''))
            curve.append({
                't': int(first_time.timestamp() * 1000) if first_time != datetime.min else None,
                'v': starting_capital,
                'v_pct': equity_pct,
                'drawdown': 0
            })
        
        for trade in sorted_trades:
            timestamp = _parse_trade_time(trade.get('timestamp', ''))
            pnl_pct = float(trade.get('pnl_pct', 0) or 0)
            
            equity_pct = equity_pct * (1 + pnl_pct / 100)
            
            if equity_pct > peak_pct:
                peak_pct = equity_pct
            
            drawdown = ((peak_pct - equity_pct) / peak_pct * 100) if peak_pct > 0 else 0
            equity_value = equity_pct * starting_capital / 100
            
            curve.append({
                't': int(timestamp.timestamp() * 1000) if timestamp != datetime.min else None,
                'v': round(equity_value, 2),
                'v_pct': round(equity_pct, 2),
                'drawdown': round(drawdown, 2)
            })
        
        return curve
    
    # Legacy dollar-based equity curve
    equity = starting_capital
    peak = equity
    
    if sorted_trades:
        first_time = _parse_trade_time(sorted_trades[0].get('timestamp', ''))
        curve.append({
            't': int(first_time.timestamp() * 1000) if first_time != datetime.min else None,
            'v': equity,
            'v_pct': 100.0,
            'drawdown': 0
        })
    
    for trade in sorted_trades:
        timestamp = _parse_trade_time(trade.get('timestamp', ''))
        pnl = float(trade.get('pnl', 0) or 0)
        commission = float(trade.get('commission', 0) or 0)
        fee = float(trade.get('fee', 0) or 0)
        
        equity += pnl - commission - fee
        
        if equity > peak:
            peak = equity
        
        drawdown = (peak - equity) / peak * 100 if peak > 0 else 0
        equity_pct = (equity / starting_capital) * 100
        
        curve.append({
            't': int(timestamp.timestamp() * 1000) if timestamp != datetime.min else None,
            'v': round(equity, 2),
            'v_pct': round(equity_pct, 2),
            'drawdown': round(drawdown, 2)
        })
    
    return curve


def calculate_cumulative_pnl_curve(
    trades: List[Dict[str, Any]]
) -> List[Dict[str, Any]]:
    """
    Generate cumulative P&L curve (not equity, just P&L accumulation).
    Returns list of { 't': timestamp_ms, 'v': cumulative_pnl }
    """
    sorted_trades = sorted(trades, key=lambda t: _parse_trade_time(t.get('timestamp', '')))
    
    cumulative = 0.0
    curve = []
    
    for trade in sorted_trades:
        timestamp = _parse_trade_time(trade.get('timestamp', ''))
        pnl = float(trade.get('pnl', 0) or 0)
        commission = float(trade.get('commission', 0) or 0)
        
        cumulative += pnl - commission
        
        curve.append({
            't': int(timestamp.timestamp() * 1000) if timestamp != datetime.min else None,
            'v': round(cumulative, 2)
        })
    
    return curve


def calculate_strategy_metrics(
    strategy_name: str,
    trades: List[Dict[str, Any]]
) -> Dict[str, Any]:
    """
    Calculate metrics for a specific strategy.
    """
    strategy_trades = [t for t in trades if t.get('strategy_name') == strategy_name]
    
    pnl_data = calculate_net_pnl(strategy_trades)
    win_data = calculate_win_rate(strategy_trades)
    
    return {
        'strategy_name': strategy_name,
        'net_pnl': pnl_data['net_pnl'],
        'net_pnl_percent': pnl_data['net_pnl_percent'],
        'win_rate': win_data['win_rate'],
        'trade_count': win_data['total'],
        'wins': win_data['wins'],
        'losses': win_data['losses']
    }


def calculate_time_based_pnl(
    trades: List[Dict[str, Any]],
    group_by: str = 'day_of_week'  # 'day_of_week' or 'hour_of_day'
) -> List[Dict[str, Any]]:
    """
    Aggregate realized P&L by time component.
    Returns list of { 'label': str, 'pnl': float }
    """
    exit_trades = [t for t in trades if t.get('type') == 'exit' or t.get('pnl') is not None]
    
    if group_by == 'day_of_week':
        day_names = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
        aggregated = defaultdict(float)
        
        for trade in exit_trades:
            timestamp = _parse_trade_time(trade.get('timestamp', ''))
            if timestamp != datetime.min:
                day_idx = timestamp.weekday()
                pnl = float(trade.get('pnl', 0) or 0) - float(trade.get('commission', 0) or 0)
                aggregated[day_idx] += pnl
        
        return [
            {'label': day_names[i], 'pnl': round(aggregated.get(i, 0), 2)}
            for i in range(5)  # Mon-Fri for trading
        ]
    
    elif group_by == 'hour_of_day':
        aggregated = defaultdict(float)
        
        for trade in exit_trades:
            timestamp = _parse_trade_time(trade.get('timestamp', ''))
            if timestamp != datetime.min:
                hour = timestamp.hour
                pnl = float(trade.get('pnl', 0) or 0) - float(trade.get('commission', 0) or 0)
                aggregated[hour] += pnl
        
        # Trading hours (9 AM to 4 PM)
        hours = list(range(9, 17))
        return [
            {'label': f'{h}:00', 'pnl': round(aggregated.get(h, 0), 2)}
            for h in hours
        ]
    
    return []


def calculate_risk_metrics(trades: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Calculate risk and trade quality metrics.
    Supports both percent-based and dollar-based trades.
    """
    exit_trades = [t for t in trades if t.get('type') == 'exit' or t.get('pnl') is not None or t.get('pnl_pct') is not None]
    
    if not exit_trades:
        return {
            'avg_win': 0,
            'avg_loss': 0,
            'largest_win': 0,
            'largest_loss': 0,
            'profit_factor': 0,
            'risk_reward_ratio': 0
        }
    
    pnls = [_get_trade_pnl(t) for t in exit_trades]
    winning_pnls = [p for p in pnls if p > 0]
    losing_pnls = [p for p in pnls if p < 0]
    
    avg_win = sum(winning_pnls) / len(winning_pnls) if winning_pnls else 0
    avg_loss = abs(sum(losing_pnls) / len(losing_pnls)) if losing_pnls else 0
    
    largest_win = max(pnls) if pnls else 0
    largest_loss = min(pnls) if pnls else 0
    
    profit_factor = calculate_profit_factor(trades)
    risk_reward_ratio = avg_win / avg_loss if avg_loss > 0 else 0
    
    return {
        'avg_win': round(avg_win, 2),
        'avg_loss': round(avg_loss, 2),
        'largest_win': round(largest_win, 2),
        'largest_loss': round(largest_loss, 2),
        'profit_factor': profit_factor,
        'risk_reward_ratio': round(risk_reward_ratio, 2)
    }


def get_recent_trades(
    limit: int = 5,
    strategy_names: Optional[List[str]] = None
) -> List[Dict[str, Any]]:
    """
    Get most recent trades for display.
    """
    trades = get_all_trades(strategy_names=strategy_names)
    
    # Sort by timestamp descending
    sorted_trades = sorted(
        trades,
        key=lambda t: _parse_trade_time(t.get('timestamp', '')),
        reverse=True
    )
    
    return sorted_trades[:limit]


def get_dashboard_metrics(
    enabled_strategies_only: bool = True,
    date_range: Optional[str] = None  # '1D', '1W', '1M', '3M', '1Y', 'ALL'
) -> Dict[str, Any]:
    """
    Get all dashboard metrics in a single call.
    This is the main entry point for the dashboard API.
    """
    # Get strategies
    strategies = get_all_strategies()
    
    # Filter to enabled strategies if requested
    if enabled_strategies_only:
        enabled_strategy_names = [
            name for name, data in strategies.items()
            if data.get('enabled', False)
        ]
    else:
        enabled_strategy_names = list(strategies.keys())
    
    # Calculate date range
    end_date = datetime.utcnow()
    start_date = None
    
    if date_range == '1D':
        start_date = end_date - timedelta(days=1)
    elif date_range == '1W':
        start_date = end_date - timedelta(weeks=1)
    elif date_range == '1M':
        start_date = end_date - timedelta(days=30)
    elif date_range == '3M':
        start_date = end_date - timedelta(days=90)
    elif date_range == '1Y':
        start_date = end_date - timedelta(days=365)
    # 'ALL' means no date filter
    
    # Get trades
    trades = get_all_trades(
        strategy_names=enabled_strategy_names if enabled_strategies_only else None,
        start_date=start_date.isoformat() if start_date else None,
        end_date=end_date.isoformat()
    )
    
    # Calculate all metrics
    account = get_account_info()
    pnl_data = calculate_net_pnl(trades)
    win_data = calculate_win_rate(trades)
    expectancy_data = calculate_expectancy(trades)
    drawdown_data = calculate_max_drawdown(trades)
    risk_data = calculate_risk_metrics(trades)
    
    # Build strategy list with metrics
    strategy_list = []
    for name, data in strategies.items():
        strat_metrics = calculate_strategy_metrics(name, trades)
        strategy_list.append({
            'name': name,
            'enabled': data.get('enabled', False),
            'net_pnl': strat_metrics['net_pnl'],
            'win_rate': strat_metrics['win_rate'],
            'trade_count': strat_metrics['trade_count'],
            'created_at': data.get('created_at'),
            'updated_at': data.get('updated_at')
        })
    
    return {
        'account': {
            'starting_capital': account.get('starting_capital', 100000),
            'current_equity': account.get('equity', 100000) + pnl_data['net_pnl'],
            'cash': account.get('cash', 100000)
        },
        'metrics': {
            'net_pnl': pnl_data['net_pnl'],
            'net_pnl_percent': pnl_data['net_pnl_percent'],
            'gross_pnl': pnl_data['gross_pnl'],
            'total_fees': pnl_data['total_fees'],
            'win_rate': win_data['win_rate'],
            'wins': win_data['wins'],
            'losses': win_data['losses'],
            'total_trades': win_data['total'],
            'profit_factor': calculate_profit_factor(trades),
            'expectancy': expectancy_data['expectancy'],
            'avg_win': expectancy_data['avg_win'],
            'avg_loss': expectancy_data['avg_loss'],
            'max_drawdown_pct': drawdown_data['max_drawdown_pct'],
            'max_drawdown_value': drawdown_data['max_drawdown_value']
        },
        'risk': risk_data,
        'strategies': strategy_list,
        'equity_curve': calculate_equity_curve(trades),
        'cumulative_pnl_curve': calculate_cumulative_pnl_curve(trades),
        'time_pnl_by_day': calculate_time_based_pnl(trades, 'day_of_week'),
        'time_pnl_by_hour': calculate_time_based_pnl(trades, 'hour_of_day'),
        'recent_trades': get_recent_trades(5, enabled_strategy_names if enabled_strategies_only else None),
        'computed_at': datetime.utcnow().isoformat()
    }


def add_trade(trade: Dict[str, Any]) -> bool:
    """Add a new trade to the trades file."""
    trades_data = _load_json_file(TRADES_FILE, {'trades': []})
    
    # Ensure required fields
    if 'timestamp' not in trade:
        trade['timestamp'] = datetime.utcnow().isoformat()
    if 'id' not in trade:
        trade['id'] = f"trade_{int(datetime.utcnow().timestamp() * 1000)}"
    
    trades_data['trades'].append(trade)
    return _save_json_file(TRADES_FILE, trades_data)


def clear_trades() -> bool:
    """Clear all trades (for testing)."""
    return _save_json_file(TRADES_FILE, {'trades': []})


# Demo data generation for testing
def generate_demo_data():
    """Generate demo trades and strategies for testing the dashboard."""
    import random
    
    # Create demo strategies
    strategies = {
        'RSI Momentum': {
            'enabled': True,
            'created_at': (datetime.utcnow() - timedelta(days=30)).isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
            'nodes': [],
            'connections': []
        },
        'MACD Crossover': {
            'enabled': True,
            'created_at': (datetime.utcnow() - timedelta(days=25)).isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
            'nodes': [],
            'connections': []
        },
        'Bollinger Breakout': {
            'enabled': False,
            'created_at': (datetime.utcnow() - timedelta(days=20)).isoformat(),
            'updated_at': datetime.utcnow().isoformat(),
            'nodes': [],
            'connections': []
        }
    }
    save_strategies(strategies)
    
    # Create demo trades
    symbols = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'SPY', 'QQQ', 'NVDA', 'AMD']
    strategy_names = ['RSI Momentum', 'MACD Crossover', 'Bollinger Breakout']
    
    trades = []
    base_time = datetime.utcnow() - timedelta(days=30)
    
    for i in range(50):
        symbol = random.choice(symbols)
        strategy = random.choice(strategy_names)
        direction = random.choice(['LONG', 'SHORT'])
        entry_price = random.uniform(100, 500)
        qty = random.randint(10, 100)
        
        # Simulate entry trade
        entry_time = base_time + timedelta(hours=i * 12)
        exit_time = entry_time + timedelta(hours=random.randint(1, 48))
        
        # P&L with some wins and losses
        pnl_direction = 1 if random.random() > 0.4 else -1  # 60% win rate
        pnl_magnitude = random.uniform(50, 500)
        pnl = pnl_direction * pnl_magnitude
        if direction == 'SHORT':
            pnl = -pnl  # Reverse for short trades
        
        commission = qty * 0.005  # $0.005 per share
        
        # Entry
        trades.append({
            'id': f'trade_entry_{i}',
            'type': 'entry',
            'symbol': symbol,
            'strategy_name': strategy,
            'direction': direction,
            'price': round(entry_price, 2),
            'qty': qty,
            'timestamp': entry_time.isoformat(),
            'commission': round(commission, 2)
        })
        
        # Exit
        exit_price = entry_price + (pnl / qty)
        trades.append({
            'id': f'trade_exit_{i}',
            'type': 'exit',
            'symbol': symbol,
            'strategy_name': strategy,
            'direction': direction,
            'price': round(exit_price, 2),
            'entry_price': round(entry_price, 2),
            'qty': qty,
            'pnl': round(pnl, 2),
            'timestamp': exit_time.isoformat(),
            'commission': round(commission, 2)
        })
    
    _save_json_file(TRADES_FILE, {'trades': trades})
    
    # Set account info
    save_account_info({
        'starting_capital': 100000.0,
        'cash': 100000.0,
        'equity': 100000.0,
        'buying_power': 200000.0
    })
    
    return {'status': 'success', 'trades_generated': len(trades)}
