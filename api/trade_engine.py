"""
FlowGrid Trading - Percent-Only Alternating Trade Engine
Implements server-side state machine for alternating LONG↔SHORT trades.
All P&L and metrics are percentage-based (no USD amounts).

Signal Flow:
1. Frontend StrategyRunner polls execute_workflow_v2 every 1s
2. Backend returns finalSignal (BUY/SELL/HOLD)
3. Frontend calls POST /api/signals/ingest with signal
4. Trade engine processes signal, manages position state, records completed trades
5. Analytics computed from completed trades only
"""

import json
import os
import uuid
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from threading import Lock
from collections import defaultdict

# Data directory
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
POSITIONS_FILE = os.path.join(DATA_DIR, 'positions.json')
PERCENT_TRADES_FILE = os.path.join(DATA_DIR, 'percent_trades.json')
ANALYTICS_CACHE_FILE = os.path.join(DATA_DIR, 'analytics_cache.json')

# Ensure data directory exists
os.makedirs(DATA_DIR, exist_ok=True)

# Thread locks for concurrent access
_positions_lock = Lock()
_trades_lock = Lock()
_analytics_lock = Lock()

# Default fee percentages (can be overridden per-trade)
DEFAULT_FEE_PCT = 0.0  # Commission as % of notional
DEFAULT_SLIPPAGE_PCT = 0.0  # Slippage as % of price


# =============================================================================
# Persistence Helpers
# =============================================================================

def _load_json(filepath: str, default: Any = None) -> Any:
    """Safely load JSON from file."""
    try:
        if os.path.exists(filepath):
            with open(filepath, 'r', encoding='utf-8') as f:
                return json.load(f)
    except Exception as e:
        print(f"[TradeEngine] Error loading {filepath}: {e}")
    return default if default is not None else {}


def _save_json(filepath: str, data: Any) -> bool:
    """Safely save JSON to file."""
    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, default=str)
        return True
    except Exception as e:
        print(f"[TradeEngine] Error saving {filepath}: {e}")
        return False


# =============================================================================
# Position State Management
# =============================================================================

def get_all_positions() -> Dict[str, Dict[str, Any]]:
    """
    Get all strategy positions.
    Returns: {strategy_id: {position, last_signal, open_trade}}
    """
    with _positions_lock:
        return _load_json(POSITIONS_FILE, {})


def get_position(strategy_id: str) -> Dict[str, Any]:
    """
    Get position state for a specific strategy.
    Returns: {position: NONE|LONG|SHORT, last_signal: BUY|SELL|None, open_trade: {...}|None}
    """
    positions = get_all_positions()
    return positions.get(strategy_id, {
        'position': 'NONE',
        'last_signal': None,
        'open_trade': None
    })


def save_position(strategy_id: str, position_data: Dict[str, Any]) -> bool:
    """Save position state for a strategy."""
    with _positions_lock:
        positions = _load_json(POSITIONS_FILE, {})
        positions[strategy_id] = position_data
        return _save_json(POSITIONS_FILE, positions)


def clear_position(strategy_id: str) -> bool:
    """Clear position state for a strategy (reset to NONE)."""
    with _positions_lock:
        positions = _load_json(POSITIONS_FILE, {})
        if strategy_id in positions:
            del positions[strategy_id]
            return _save_json(POSITIONS_FILE, positions)
    return True


def clear_all_positions() -> bool:
    """Clear all position states."""
    with _positions_lock:
        return _save_json(POSITIONS_FILE, {})


# =============================================================================
# Completed Trades Storage (Percent-Based)
# =============================================================================

def get_all_percent_trades(
    strategy_id: Optional[str] = None,
    start_ts: Optional[str] = None,
    end_ts: Optional[str] = None,
    limit: int = 1000,
    offset: int = 0
) -> Dict[str, Any]:
    """
    Get completed trades with percent fields.
    Returns: {trades: [...], total: N, has_more: bool}
    """
    with _trades_lock:
        data = _load_json(PERCENT_TRADES_FILE, {'trades': []})
        trades = data.get('trades', [])
        
        # Filter by strategy
        if strategy_id:
            trades = [t for t in trades if t.get('strategy_id') == strategy_id]
        
        # Filter by date range
        if start_ts:
            trades = [t for t in trades if t.get('close_ts', '') >= start_ts]
        if end_ts:
            trades = [t for t in trades if t.get('close_ts', '') <= end_ts]
        
        # Sort by close timestamp descending
        trades.sort(key=lambda t: t.get('close_ts', ''), reverse=True)
        
        total = len(trades)
        paginated = trades[offset:offset + limit]
        
        return {
            'trades': paginated,
            'total': total,
            'has_more': (offset + limit) < total,
            'offset': offset,
            'limit': limit
        }


def save_completed_trade(trade: Dict[str, Any]) -> str:
    """
    Save a completed trade with percent fields.
    Returns: trade_id
    """
    with _trades_lock:
        data = _load_json(PERCENT_TRADES_FILE, {'trades': []})
        trades = data.get('trades', [])
        
        # Ensure trade has an ID
        if 'id' not in trade:
            trade['id'] = str(uuid.uuid4())
        
        trades.append(trade)
        data['trades'] = trades
        _save_json(PERCENT_TRADES_FILE, data)
        
        # Trigger analytics recompute (debounced in production)
        _invalidate_analytics_cache()
        
        return trade['id']


def clear_all_trades() -> bool:
    """Clear all completed trades."""
    with _trades_lock:
        result = _save_json(PERCENT_TRADES_FILE, {'trades': []})
        _invalidate_analytics_cache()
        return result


# =============================================================================
# Percent Calculation Formulas
# =============================================================================

def calculate_gross_pct(open_side: str, open_price: float, close_price: float) -> float:
    """
    Calculate gross percentage P&L.
    LONG: ((exit / entry) - 1) * 100
    SHORT: ((entry / exit) - 1) * 100
    """
    if open_price <= 0:
        return 0.0
    
    if open_side == 'LONG':
        return ((close_price / open_price) - 1) * 100
    else:  # SHORT
        return ((open_price / close_price) - 1) * 100


def calculate_net_pct(gross_pct: float, fee_pct_total: float) -> float:
    """Calculate net percentage P&L after fees."""
    return gross_pct - fee_pct_total


# =============================================================================
# Signal Ingestion State Machine
# =============================================================================

def ingest_signal(
    strategy_id: str,
    signal: str,
    price: float,
    ts: Optional[str] = None,
    fee_pct: float = DEFAULT_FEE_PCT,
    slippage_pct: float = DEFAULT_SLIPPAGE_PCT,
    meta: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Ingest a signal and process according to state machine.
    
    Args:
        strategy_id: Unique strategy identifier
        signal: BUY | SELL | HOLD
        price: Current price
        ts: Timestamp (ISO format, defaults to now)
        fee_pct: Fee as percentage of notional
        slippage_pct: Slippage as percentage
        meta: Optional metadata
    
    Returns:
        {
            accepted: bool,
            action: ignored | opened | closed_and_opened,
            reason: str,
            completed_trade: {...} | None,
            opened: {...} | None,
            position: current position state
        }
    """
    # Validate inputs
    if not strategy_id:
        return {'accepted': False, 'reason': 'missing_strategy_id'}
    
    signal = (signal or '').upper()
    if signal not in ('BUY', 'SELL', 'HOLD'):
        return {'accepted': False, 'reason': 'invalid_signal'}
    
    # Ignore HOLD signals
    if signal == 'HOLD':
        return {'accepted': False, 'action': 'ignored', 'reason': 'hold_ignored'}
    
    if price is None or price <= 0:
        return {'accepted': False, 'reason': 'missing_or_invalid_price'}
    
    ts = ts or datetime.utcnow().isoformat()
    
    # Get current position state
    pos = get_position(strategy_id)
    position = pos.get('position', 'NONE')
    last_signal = pos.get('last_signal')
    open_trade = pos.get('open_trade')
    
    # Dedup: ignore if same as last signal
    if signal == last_signal:
        return {
            'accepted': False,
            'action': 'ignored',
            'reason': 'duplicate_signal',
            'position': pos
        }
    
    # Determine new side based on signal
    new_side = 'LONG' if signal == 'BUY' else 'SHORT'
    fee_pct_total = fee_pct + slippage_pct
    
    result = {
        'accepted': True,
        'completed_trade': None,
        'opened': None
    }
    
    if position == 'NONE':
        # Open new position (no completed trade)
        new_open = {
            'entry_price': price,
            'entry_ts': ts,
            'side': new_side,
            'meta': meta or {}
        }
        
        save_position(strategy_id, {
            'position': new_side,
            'last_signal': signal,
            'open_trade': new_open
        })
        
        result['action'] = 'opened'
        result['opened'] = new_open
        result['reason'] = f'opened_{new_side.lower()}_position'
        
        print(f"[TradeEngine] {strategy_id}: Opened {new_side} @ {price}")
        
    elif position != new_side:
        # Close existing position and open opposite
        entry_price = open_trade.get('entry_price', price)
        entry_ts = open_trade.get('entry_ts', ts)
        
        # Calculate percent P&L
        gross_pct = calculate_gross_pct(position, entry_price, price)
        net_pct = calculate_net_pct(gross_pct, fee_pct_total)
        
        # Create completed trade record
        completed = {
            'id': str(uuid.uuid4()),
            'strategy_id': strategy_id,
            'open_side': position,
            'open_price': entry_price,
            'open_ts': entry_ts,
            'close_side': new_side,
            'close_price': price,
            'close_ts': ts,
            'gross_pct': round(gross_pct, 4),
            'fee_pct_total': round(fee_pct_total, 4),
            'net_pct': round(net_pct, 4),
            'meta': {**(open_trade.get('meta') or {}), **(meta or {})}
        }
        
        # Save completed trade
        save_completed_trade(completed)
        
        # Open new opposite position
        new_open = {
            'entry_price': price,
            'entry_ts': ts,
            'side': new_side,
            'meta': meta or {}
        }
        
        save_position(strategy_id, {
            'position': new_side,
            'last_signal': signal,
            'open_trade': new_open
        })
        
        result['action'] = 'closed_and_opened'
        result['completed_trade'] = completed
        result['opened'] = new_open
        result['reason'] = f'closed_{position.lower()}_opened_{new_side.lower()}'
        
        print(f"[TradeEngine] {strategy_id}: Closed {position} ({net_pct:+.2f}%), Opened {new_side} @ {price}")
        
    else:
        # Same side but different signal? Shouldn't happen with BUY/SELL mapping
        result['accepted'] = False
        result['action'] = 'ignored'
        result['reason'] = 'position_already_matches'
    
    # Return current position
    result['position'] = get_position(strategy_id)
    
    return result


def log_external_trade(
    strategy_id: str,
    open_price: float,
    close_price: float,
    open_ts: str,
    close_ts: str,
    open_side: str = 'LONG',
    gross_pct: Optional[float] = None,
    fee_pct_total: float = 0.0,
    net_pct: Optional[float] = None,
    meta: Optional[Dict[str, Any]] = None
) -> Dict[str, Any]:
    """
    Log an externally-sourced completed trade.
    Calculates percent fields if not provided.
    """
    if not strategy_id:
        return {'accepted': False, 'reason': 'missing_strategy_id'}
    
    open_side = (open_side or 'LONG').upper()
    if open_side not in ('LONG', 'SHORT'):
        return {'accepted': False, 'reason': 'invalid_open_side'}
    
    # Calculate gross_pct if not provided
    if gross_pct is None:
        gross_pct = calculate_gross_pct(open_side, open_price, close_price)
    
    # Calculate net_pct if not provided
    if net_pct is None:
        net_pct = calculate_net_pct(gross_pct, fee_pct_total)
    
    close_side = 'SHORT' if open_side == 'LONG' else 'LONG'
    
    trade = {
        'id': str(uuid.uuid4()),
        'strategy_id': strategy_id,
        'open_side': open_side,
        'open_price': open_price,
        'open_ts': open_ts,
        'close_side': close_side,
        'close_price': close_price,
        'close_ts': close_ts,
        'gross_pct': round(gross_pct, 4),
        'fee_pct_total': round(fee_pct_total, 4),
        'net_pct': round(net_pct, 4),
        'meta': meta or {'source': 'external'}
    }
    
    trade_id = save_completed_trade(trade)
    
    return {
        'accepted': True,
        'trade_id': trade_id,
        'trade': trade
    }


# =============================================================================
# Analytics Computation (Percent-Based)
# =============================================================================

def _invalidate_analytics_cache():
    """Invalidate cached analytics."""
    with _analytics_lock:
        cache = _load_json(ANALYTICS_CACHE_FILE, {})
        cache['valid'] = False
        cache['invalidated_at'] = datetime.utcnow().isoformat()
        _save_json(ANALYTICS_CACHE_FILE, cache)


def compute_analytics(
    strategy_ids: Optional[List[str]] = None,
    start_ts: Optional[str] = None,
    end_ts: Optional[str] = None,
    use_cache: bool = True
) -> Dict[str, Any]:
    """
    Compute analytics KPIs from completed percent trades.
    
    Returns:
        {
            empty: bool,
            guidance: str,
            metrics: {
                net_return_pct, win_rate, profit_factor, expectancy,
                max_drawdown_pct, avg_win_pct, avg_loss_pct,
                largest_win_pct, largest_loss_pct, trade_count
            },
            by_strategy: {strategy_id: {...}},
            computed_at: timestamp
        }
    """
    # Get all trades first to check if we have any
    trades_data = get_all_percent_trades(limit=10000)
    trades = trades_data.get('trades', [])
    
    # Check cache - but only if trades exist (cache might be stale after deploy)
    if use_cache and len(trades) > 0:
        with _analytics_lock:
            cache = _load_json(ANALYTICS_CACHE_FILE, {})
            if cache.get('valid') and cache.get('data'):
                # Verify cache trade count matches actual trades
                cached_count = cache['data'].get('metrics', {}).get('trade_count', 0)
                if cached_count == len(trades):
                    return cache['data']
                # Cache is stale, invalidate
                cache['valid'] = False
                _save_json(ANALYTICS_CACHE_FILE, cache)
    
    # Filter by strategy
    if strategy_ids:
        trades = [t for t in trades if t.get('strategy_id') in strategy_ids]
    
    # Filter by date range
    if start_ts:
        trades = [t for t in trades if t.get('close_ts', '') >= start_ts]
    if end_ts:
        trades = [t for t in trades if t.get('close_ts', '') <= end_ts]
    
    # Empty state
    if not trades:
        result = {
            'empty': True,
            'guidance': 'No completed trades yet. Enable a strategy and wait for alternating BUY/SELL signals to generate trades.',
            'metrics': _empty_metrics(),
            'by_strategy': {},
            'computed_at': datetime.utcnow().isoformat()
        }
        _cache_analytics(result)
        return result
    
    # Compute aggregate metrics
    metrics = _compute_metrics_from_trades(trades)
    
    # Compute per-strategy metrics
    by_strategy = {}
    strategy_groups = defaultdict(list)
    for t in trades:
        strategy_groups[t.get('strategy_id', 'unknown')].append(t)
    
    for sid, strades in strategy_groups.items():
        by_strategy[sid] = _compute_metrics_from_trades(strades)
    
    result = {
        'empty': False,
        'guidance': None,
        'metrics': metrics,
        'by_strategy': by_strategy,
        'computed_at': datetime.utcnow().isoformat()
    }
    
    _cache_analytics(result)
    return result


def _empty_metrics() -> Dict[str, Any]:
    """Return empty metrics structure."""
    return {
        'net_return_pct': 0.0,
        'win_rate': 0.0,
        'profit_factor': 0.0,
        'expectancy': 0.0,
        'max_drawdown_pct': 0.0,
        'avg_win_pct': 0.0,
        'avg_loss_pct': 0.0,
        'largest_win_pct': 0.0,
        'largest_loss_pct': 0.0,
        'trade_count': 0,
        'wins': 0,
        'losses': 0
    }


def _compute_metrics_from_trades(trades: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Compute all metrics from a list of percent trades."""
    if not trades:
        return _empty_metrics()
    
    # Extract net_pct values
    net_pcts = [t.get('net_pct', 0) for t in trades]
    
    # Wins and losses
    wins = [p for p in net_pcts if p > 0]
    losses = [p for p in net_pcts if p <= 0]
    
    # Aggregate net return (compounded)
    # For simplicity, use additive for now: sum of all net_pct
    net_return_pct = sum(net_pcts)
    
    # Win rate
    win_rate = (len(wins) / len(net_pcts)) * 100 if net_pcts else 0
    
    # Profit factor (sum of wins / abs sum of losses)
    sum_wins = sum(wins) if wins else 0
    sum_losses = abs(sum(losses)) if losses else 0
    profit_factor = sum_wins / sum_losses if sum_losses > 0 else (float('inf') if sum_wins > 0 else 0)
    
    # Average win/loss
    avg_win_pct = sum_wins / len(wins) if wins else 0
    avg_loss_pct = sum_losses / len(losses) if losses else 0
    
    # Expectancy
    win_prob = len(wins) / len(net_pcts) if net_pcts else 0
    loss_prob = len(losses) / len(net_pcts) if net_pcts else 0
    expectancy = (win_prob * avg_win_pct) - (loss_prob * avg_loss_pct)
    
    # Largest win/loss
    largest_win_pct = max(wins) if wins else 0
    largest_loss_pct = min(losses) if losses else 0
    
    # Max drawdown (peak-to-trough in cumulative %)
    max_drawdown_pct = _compute_max_drawdown_pct(trades)
    
    return {
        'net_return_pct': round(net_return_pct, 4),
        'win_rate': round(win_rate, 2),
        'profit_factor': round(profit_factor, 4) if profit_factor != float('inf') else 'Infinity',
        'expectancy': round(expectancy, 4),
        'max_drawdown_pct': round(max_drawdown_pct, 4),
        'avg_win_pct': round(avg_win_pct, 4),
        'avg_loss_pct': round(avg_loss_pct, 4),
        'largest_win_pct': round(largest_win_pct, 4),
        'largest_loss_pct': round(largest_loss_pct, 4),
        'trade_count': len(trades),
        'wins': len(wins),
        'losses': len(losses)
    }


def _compute_max_drawdown_pct(trades: List[Dict[str, Any]]) -> float:
    """
    Compute max drawdown as percentage.
    Uses cumulative return curve and finds largest peak-to-trough decline.
    """
    if not trades:
        return 0.0
    
    # Sort by close timestamp
    sorted_trades = sorted(trades, key=lambda t: t.get('close_ts', ''))
    
    # Build cumulative return curve
    cumulative = 0.0
    peak = 0.0
    max_dd = 0.0
    
    for t in sorted_trades:
        cumulative += t.get('net_pct', 0)
        if cumulative > peak:
            peak = cumulative
        dd = peak - cumulative
        if dd > max_dd:
            max_dd = dd
    
    return max_dd


def _cache_analytics(data: Dict[str, Any]):
    """Cache analytics result."""
    with _analytics_lock:
        cache = {
            'valid': True,
            'data': data,
            'cached_at': datetime.utcnow().isoformat()
        }
        _save_json(ANALYTICS_CACHE_FILE, cache)


def get_equity_curve_pct(
    strategy_ids: Optional[List[str]] = None,
    start_ts: Optional[str] = None,
    end_ts: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Get equity curve as percentage returns.
    Returns: [{ts, equity_pct, drawdown_pct}, ...]
    """
    trades_data = get_all_percent_trades(limit=10000)
    trades = trades_data.get('trades', [])
    
    if strategy_ids:
        trades = [t for t in trades if t.get('strategy_id') in strategy_ids]
    if start_ts:
        trades = [t for t in trades if t.get('close_ts', '') >= start_ts]
    if end_ts:
        trades = [t for t in trades if t.get('close_ts', '') <= end_ts]
    
    if not trades:
        return []
    
    # Sort by close timestamp
    sorted_trades = sorted(trades, key=lambda t: t.get('close_ts', ''))
    
    curve = []
    cumulative = 0.0
    peak = 0.0
    
    for t in sorted_trades:
        cumulative += t.get('net_pct', 0)
        if cumulative > peak:
            peak = cumulative
        dd = peak - cumulative
        
        curve.append({
            'ts': t.get('close_ts'),
            'equity_pct': round(cumulative, 4),
            'drawdown_pct': round(dd, 4)
        })
    
    return curve


def get_pnl_distribution(
    strategy_ids: Optional[List[str]] = None,
    bins: int = 20
) -> Dict[str, Any]:
    """
    Get P&L distribution histogram.
    Returns: {bins: [{range, count}], stats: {min, max, mean, std}}
    """
    trades_data = get_all_percent_trades(limit=10000)
    trades = trades_data.get('trades', [])
    
    if strategy_ids:
        trades = [t for t in trades if t.get('strategy_id') in strategy_ids]
    
    if not trades:
        return {'bins': [], 'stats': {}}
    
    net_pcts = [t.get('net_pct', 0) for t in trades]
    
    min_pct = min(net_pcts)
    max_pct = max(net_pcts)
    mean_pct = sum(net_pcts) / len(net_pcts)
    
    # Simple std dev calculation
    variance = sum((p - mean_pct) ** 2 for p in net_pcts) / len(net_pcts)
    std_pct = variance ** 0.5
    
    # Create histogram bins
    bin_width = (max_pct - min_pct) / bins if max_pct != min_pct else 1
    histogram = []
    
    for i in range(bins):
        low = min_pct + (i * bin_width)
        high = low + bin_width
        count = sum(1 for p in net_pcts if low <= p < high)
        histogram.append({
            'range': f"{low:.2f}% - {high:.2f}%",
            'low': round(low, 4),
            'high': round(high, 4),
            'count': count
        })
    
    return {
        'bins': histogram,
        'stats': {
            'min': round(min_pct, 4),
            'max': round(max_pct, 4),
            'mean': round(mean_pct, 4),
            'std': round(std_pct, 4),
            'total': len(net_pcts)
        }
    }


def get_pnl_heatmap(
    strategy_ids: Optional[List[str]] = None
) -> Dict[str, Any]:
    """
    Get P&L heatmap by day of week and hour.
    Returns: {by_day: [...], by_hour: [...]}
    """
    trades_data = get_all_percent_trades(limit=10000)
    trades = trades_data.get('trades', [])
    
    if strategy_ids:
        trades = [t for t in trades if t.get('strategy_id') in strategy_ids]
    
    if not trades:
        return {'by_day': [], 'by_hour': []}
    
    # Group by day of week
    day_pnl = defaultdict(list)
    hour_pnl = defaultdict(list)
    
    days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
    
    for t in trades:
        try:
            ts = t.get('close_ts', '')
            if ts:
                dt = datetime.fromisoformat(ts.replace('Z', '+00:00'))
                day_pnl[days[dt.weekday()]].append(t.get('net_pct', 0))
                hour_pnl[dt.hour].append(t.get('net_pct', 0))
        except Exception:
            pass
    
    by_day = []
    for day in days:
        pcts = day_pnl.get(day, [])
        by_day.append({
            'label': day,
            'pnl': round(sum(pcts), 4) if pcts else 0,
            'count': len(pcts)
        })
    
    by_hour = []
    for h in range(24):
        pcts = hour_pnl.get(h, [])
        by_hour.append({
            'label': f"{h:02d}:00",
            'hour': h,
            'pnl': round(sum(pcts), 4) if pcts else 0,
            'count': len(pcts)
        })
    
    return {
        'by_day': by_day,
        'by_hour': by_hour
    }


# =============================================================================
# Current Signals (for frontend display)
# =============================================================================

def get_current_signals() -> List[Dict[str, Any]]:
    """
    Get current signal state for all strategies with open positions.
    Returns: [{strategy_id, position, last_signal, entry_price, entry_ts}]
    """
    positions = get_all_positions()
    signals = []
    
    for strategy_id, pos in positions.items():
        if pos.get('position') != 'NONE':
            open_trade = pos.get('open_trade', {})
            signals.append({
                'strategy_id': strategy_id,
                'position': pos.get('position'),
                'last_signal': pos.get('last_signal'),
                'entry_price': open_trade.get('entry_price'),
                'entry_ts': open_trade.get('entry_ts'),
                'side': open_trade.get('side')
            })
    
    return signals


# =============================================================================
# Initialization
# =============================================================================

def init_trade_engine():
    """Initialize trade engine data files if they don't exist."""
    if not os.path.exists(POSITIONS_FILE):
        _save_json(POSITIONS_FILE, {})
    if not os.path.exists(PERCENT_TRADES_FILE):
        _save_json(PERCENT_TRADES_FILE, {'trades': []})
    if not os.path.exists(ANALYTICS_CACHE_FILE):
        _save_json(ANALYTICS_CACHE_FILE, {'valid': False})
    print("[TradeEngine] Initialized")


# Initialize on module load
init_trade_engine()
