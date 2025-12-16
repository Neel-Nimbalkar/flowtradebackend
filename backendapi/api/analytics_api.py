"""
FlowGrid Trading - Analytics API Module
Comprehensive analytics endpoints for the Analytics page.
All calculations use the backtest engine for consistency.
"""

import json
import os
import uuid
import random
import math
from datetime import datetime, timedelta
from typing import Any, Dict, List, Optional, Tuple
from collections import defaultdict
from threading import Lock
import time

# Import shared dashboard functions
from .dashboard_api import (
    get_account_info, get_all_strategies, get_all_trades,
    calculate_net_pnl, calculate_win_rate, calculate_profit_factor,
    calculate_expectancy, calculate_max_drawdown, calculate_equity_curve,
    calculate_strategy_metrics, _parse_trade_time, _load_json_file, _save_json_file
)

# Data directory
DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), 'data')
JOBS_FILE = os.path.join(DATA_DIR, 'recompute_jobs.json')

# Recompute job queue (in-memory for MVP, could use Redis/Celery in production)
_recompute_jobs: Dict[str, Dict[str, Any]] = {}
_jobs_lock = Lock()


# =============================================================================
# Flow Grade Calculation
# =============================================================================

def calculate_flow_grade(trades: List[Dict[str, Any]], account: Dict[str, Any] = None) -> Dict[str, Any]:
    """
    Calculate Flow Grade - a single performance score (0-100) with letter grade (A-F).
    
    Components:
    - net_return_pct (28%): Return on capital
    - max_drawdown_pct (22%, inverted): Lower is better
    - win_rate (16%): Consistency
    - profit_factor (16%): Quality of wins vs losses
    - avg_win_loss_ratio (12%): Risk/reward
    - concentration_penalty (-10%): Penalize over-concentration
    """
    if not account:
        account = get_account_info()
    
    starting_capital = float(account.get('starting_capital', 100000))
    
    # Check for empty state
    exit_trades = [t for t in trades if t.get('type') == 'exit' or t.get('pnl') is not None]
    
    if not exit_trades:
        return {
            'score': 0,
            'letter': 'F',
            'empty': True,
            'guidance': 'No completed trades yet. Enable a strategy and let it execute to see your Flow Grade.',
            'components': {},
            'reasons': [],
            'suggestions': []
        }
    
    # Calculate component metrics
    pnl_data = calculate_net_pnl(trades)
    win_data = calculate_win_rate(trades)
    expectancy_data = calculate_expectancy(trades)
    drawdown_data = calculate_max_drawdown(trades)
    profit_factor = calculate_profit_factor(trades)
    
    # Net return percentage (normalized 0-100)
    net_return_pct = pnl_data.get('net_pnl_percent', 0)
    # Scale: -20% -> 0, 0% -> 50, +50% -> 100
    return_score = max(0, min(100, (net_return_pct + 20) * (100 / 70)))
    
    # Max drawdown (inverted - lower is better)
    max_dd = drawdown_data.get('max_drawdown_pct', 0)
    # Scale: 0% DD -> 100, 25% DD -> 0
    drawdown_score = max(0, min(100, 100 - (max_dd * 4)))
    
    # Win rate (as percentage)
    win_rate = win_data.get('win_rate', 0)
    # Scale: 0% -> 0, 50% -> 50, 70%+ -> 100
    win_score = min(100, win_rate * (100 / 70))
    
    # Profit factor (ratio > 1 is good)
    pf = min(profit_factor, 5) if profit_factor != float('inf') else 5
    # Scale: 0 -> 0, 1 -> 40, 2 -> 70, 3+ -> 100
    pf_score = min(100, pf * 33.33)
    
    # Average win/loss ratio
    avg_win = abs(expectancy_data.get('avg_win', 0))
    avg_loss = abs(expectancy_data.get('avg_loss', 1))
    win_loss_ratio = avg_win / avg_loss if avg_loss > 0 else 0
    # Scale: 0 -> 0, 1 -> 40, 2 -> 70, 3+ -> 100
    wl_score = min(100, win_loss_ratio * 33.33)
    
    # Concentration penalty (check if one strategy dominates)
    strategy_trades = defaultdict(int)
    for t in exit_trades:
        strategy_trades[t.get('strategy_name', 'Unknown')] += 1
    
    total_trades = len(exit_trades)
    max_concentration = max(strategy_trades.values()) / total_trades if total_trades > 0 else 0
    # Penalize if >80% from one strategy
    concentration_penalty = max(0, (max_concentration - 0.8) * 50) if max_concentration > 0.8 else 0
    
    # Weighted calculation
    weights = {
        'return': 0.28,
        'drawdown': 0.22,
        'win_rate': 0.16,
        'profit_factor': 0.16,
        'win_loss_ratio': 0.12
    }
    
    raw_score = (
        return_score * weights['return'] +
        drawdown_score * weights['drawdown'] +
        win_score * weights['win_rate'] +
        pf_score * weights['profit_factor'] +
        wl_score * weights['win_loss_ratio']
    )
    
    # Apply concentration penalty
    final_score = max(0, min(100, raw_score - concentration_penalty))
    
    # Map to letter grade
    if final_score >= 90:
        letter = 'A'
    elif final_score >= 75:
        letter = 'B'
    elif final_score >= 60:
        letter = 'C'
    elif final_score >= 40:
        letter = 'D'
    else:
        letter = 'F'
    
    # Generate reasons (top 3 contributing factors)
    component_contributions = [
        ('Return', return_score * weights['return'], return_score),
        ('Drawdown Control', drawdown_score * weights['drawdown'], drawdown_score),
        ('Win Rate', win_score * weights['win_rate'], win_score),
        ('Profit Factor', pf_score * weights['profit_factor'], pf_score),
        ('Win/Loss Ratio', wl_score * weights['win_loss_ratio'], wl_score)
    ]
    component_contributions.sort(key=lambda x: x[1], reverse=True)
    
    reasons = []
    for name, contrib, score in component_contributions[:3]:
        if score >= 70:
            reasons.append(f"Strong {name.lower()}")
        elif score >= 40:
            reasons.append(f"Moderate {name.lower()}")
        else:
            reasons.append(f"Weak {name.lower()}")
    
    # Generate improvement suggestions
    suggestions = []
    if drawdown_score < 50:
        suggestions.append("Consider tighter stop-losses to reduce maximum drawdown")
    if win_score < 40:
        suggestions.append("Focus on higher-probability setups to improve win rate")
    if pf_score < 50:
        suggestions.append("Let winners run longer or cut losers faster to improve profit factor")
    if wl_score < 40:
        suggestions.append("Improve risk/reward by targeting larger wins relative to losses")
    if concentration_penalty > 0:
        suggestions.append("Diversify across more strategies to reduce concentration risk")
    
    return {
        'score': round(final_score, 1),
        'letter': letter,
        'empty': False,
        'guidance': '',
        'components': {
            'net_return': {
                'value': net_return_pct,
                'score': round(return_score, 1),
                'weight': weights['return'],
                'contribution': round(return_score * weights['return'], 1)
            },
            'max_drawdown': {
                'value': max_dd,
                'score': round(drawdown_score, 1),
                'weight': weights['drawdown'],
                'contribution': round(drawdown_score * weights['drawdown'], 1)
            },
            'win_rate': {
                'value': win_rate,
                'score': round(win_score, 1),
                'weight': weights['win_rate'],
                'contribution': round(win_score * weights['win_rate'], 1)
            },
            'profit_factor': {
                'value': pf,
                'score': round(pf_score, 1),
                'weight': weights['profit_factor'],
                'contribution': round(pf_score * weights['profit_factor'], 1)
            },
            'win_loss_ratio': {
                'value': round(win_loss_ratio, 2),
                'score': round(wl_score, 1),
                'weight': weights['win_loss_ratio'],
                'contribution': round(wl_score * weights['win_loss_ratio'], 1)
            },
            'concentration_penalty': {
                'value': round(max_concentration * 100, 1),
                'penalty': round(concentration_penalty, 1)
            }
        },
        'reasons': reasons[:3],
        'suggestions': suggestions[:3],
        'trade_count': len(exit_trades),
        'computed_at': datetime.utcnow().isoformat()
    }


# =============================================================================
# Monte Carlo Simulation
# =============================================================================

def run_monte_carlo(
    trades: List[Dict[str, Any]],
    num_simulations: int = 1000,
    starting_capital: float = 100000,
    is_premium: bool = False
) -> Dict[str, Any]:
    """
    Run Monte Carlo simulation on trade returns.
    Premium users get full simulation, free users get limited preview.
    """
    exit_trades = [t for t in trades if t.get('type') == 'exit' or t.get('pnl') is not None]
    
    if len(exit_trades) < 10:
        return {
            'empty': True,
            'guidance': 'Need at least 10 completed trades for Monte Carlo analysis.',
            'preview_available': False
        }
    
    # Extract P&L returns
    returns = [float(t.get('pnl', 0) or 0) for t in exit_trades]
    
    # Limit simulations for non-premium
    actual_sims = num_simulations if is_premium else 100
    
    # Run simulations
    final_equities = []
    paths = [] if is_premium else None
    
    for sim in range(actual_sims):
        # Randomly shuffle returns (bootstrap)
        shuffled = random.sample(returns, len(returns))
        
        equity = starting_capital
        path = [equity] if is_premium else None
        
        for pnl in shuffled:
            equity += pnl
            if is_premium and path is not None:
                path.append(equity)
        
        final_equities.append(equity)
        if is_premium and paths is not None:
            paths.append(path)
    
    # Calculate percentiles
    final_equities.sort()
    
    def percentile(data, p):
        idx = int(len(data) * p / 100)
        return data[min(idx, len(data) - 1)]
    
    result = {
        'empty': False,
        'simulations': actual_sims,
        'trade_count': len(exit_trades),
        'percentiles': {
            '5th': round(percentile(final_equities, 5), 2),
            '25th': round(percentile(final_equities, 25), 2),
            '50th': round(percentile(final_equities, 50), 2),  # Median
            '75th': round(percentile(final_equities, 75), 2),
            '95th': round(percentile(final_equities, 95), 2)
        },
        'mean_final_equity': round(sum(final_equities) / len(final_equities), 2),
        'prob_profit': round(sum(1 for e in final_equities if e > starting_capital) / len(final_equities) * 100, 1),
        'prob_loss_10pct': round(sum(1 for e in final_equities if e < starting_capital * 0.9) / len(final_equities) * 100, 1),
        'worst_case': round(min(final_equities), 2),
        'best_case': round(max(final_equities), 2)
    }
    
    # Premium users get band paths for visualization
    if is_premium and paths:
        # Generate percentile bands for chart
        num_points = len(paths[0]) if paths else 0
        bands = {
            'p5': [], 'p25': [], 'p50': [], 'p75': [], 'p95': []
        }
        
        for i in range(num_points):
            point_values = sorted([p[i] for p in paths])
            bands['p5'].append(round(percentile(point_values, 5), 2))
            bands['p25'].append(round(percentile(point_values, 25), 2))
            bands['p50'].append(round(percentile(point_values, 50), 2))
            bands['p75'].append(round(percentile(point_values, 75), 2))
            bands['p95'].append(round(percentile(point_values, 95), 2))
        
        result['bands'] = bands
        result['is_premium'] = True
    else:
        result['is_premium'] = False
        result['premium_cta'] = 'Upgrade to Premium for full Monte Carlo with path visualization and probability metrics.'
    
    return result


# =============================================================================
# Distribution Calculations
# =============================================================================

def calculate_pnl_distribution(trades: List[Dict[str, Any]], bins: int = 20) -> Dict[str, Any]:
    """Calculate P&L distribution histogram."""
    exit_trades = [t for t in trades if t.get('type') == 'exit' or t.get('pnl') is not None]
    
    if not exit_trades:
        return {
            'empty': True,
            'guidance': 'No completed trades for P&L distribution.'
        }
    
    pnls = [float(t.get('pnl', 0) or 0) for t in exit_trades]
    
    # Calculate histogram
    min_pnl, max_pnl = min(pnls), max(pnls)
    if min_pnl == max_pnl:
        return {
            'empty': False,
            'histogram': [{'bin_start': min_pnl, 'bin_end': max_pnl, 'count': len(pnls)}],
            'stats': {'mean': min_pnl, 'median': min_pnl, 'std': 0}
        }
    
    bin_width = (max_pnl - min_pnl) / bins
    histogram = []
    
    for i in range(bins):
        bin_start = min_pnl + i * bin_width
        bin_end = bin_start + bin_width
        count = sum(1 for p in pnls if bin_start <= p < bin_end)
        if i == bins - 1:  # Include max in last bin
            count = sum(1 for p in pnls if bin_start <= p <= bin_end)
        histogram.append({
            'bin_start': round(bin_start, 2),
            'bin_end': round(bin_end, 2),
            'count': count
        })
    
    # Statistics
    mean_pnl = sum(pnls) / len(pnls)
    sorted_pnls = sorted(pnls)
    median_pnl = sorted_pnls[len(sorted_pnls) // 2]
    variance = sum((p - mean_pnl) ** 2 for p in pnls) / len(pnls)
    std_pnl = math.sqrt(variance)
    
    # Win/Loss split
    wins = [p for p in pnls if p > 0]
    losses = [p for p in pnls if p < 0]
    
    return {
        'empty': False,
        'histogram': histogram,
        'stats': {
            'mean': round(mean_pnl, 2),
            'median': round(median_pnl, 2),
            'std': round(std_pnl, 2),
            'min': round(min_pnl, 2),
            'max': round(max_pnl, 2),
            'total_trades': len(pnls),
            'win_count': len(wins),
            'loss_count': len(losses),
            'avg_win': round(sum(wins) / len(wins), 2) if wins else 0,
            'avg_loss': round(sum(losses) / len(losses), 2) if losses else 0
        }
    }


def calculate_duration_distribution(trades: List[Dict[str, Any]], bins: int = 15) -> Dict[str, Any]:
    """Calculate trade duration distribution."""
    durations = []
    
    # Find entry-exit pairs
    open_trades = {}
    sorted_trades = sorted(trades, key=lambda t: _parse_trade_time(t.get('timestamp', '')))
    
    for t in sorted_trades:
        key = (t.get('strategy_name'), t.get('symbol'))
        
        if t.get('type') == 'entry':
            open_trades[key] = t
        elif t.get('type') == 'exit' and key in open_trades:
            entry = open_trades.pop(key)
            entry_time = _parse_trade_time(entry.get('timestamp', ''))
            exit_time = _parse_trade_time(t.get('timestamp', ''))
            
            if entry_time != datetime.min and exit_time != datetime.min:
                duration_hours = (exit_time - entry_time).total_seconds() / 3600
                durations.append(duration_hours)
    
    if not durations:
        return {
            'empty': True,
            'guidance': 'No completed trade pairs for duration analysis.'
        }
    
    # Convert to appropriate units
    max_duration = max(durations)
    if max_duration > 168:  # > 1 week
        unit = 'days'
        durations = [d / 24 for d in durations]
    elif max_duration > 24:
        unit = 'days'
        durations = [d / 24 for d in durations]
    else:
        unit = 'hours'
    
    min_d, max_d = min(durations), max(durations)
    if min_d == max_d:
        return {
            'empty': False,
            'unit': unit,
            'histogram': [{'bin_start': min_d, 'bin_end': max_d, 'count': len(durations)}]
        }
    
    bin_width = (max_d - min_d) / bins
    histogram = []
    
    for i in range(bins):
        bin_start = min_d + i * bin_width
        bin_end = bin_start + bin_width
        count = sum(1 for d in durations if bin_start <= d < bin_end)
        if i == bins - 1:
            count = sum(1 for d in durations if bin_start <= d <= bin_end)
        histogram.append({
            'bin_start': round(bin_start, 2),
            'bin_end': round(bin_end, 2),
            'count': count
        })
    
    return {
        'empty': False,
        'unit': unit,
        'histogram': histogram,
        'stats': {
            'mean': round(sum(durations) / len(durations), 2),
            'median': round(sorted(durations)[len(durations) // 2], 2),
            'min': round(min_d, 2),
            'max': round(max_d, 2),
            'total_trades': len(durations)
        }
    }


# =============================================================================
# Heatmap Data
# =============================================================================

def calculate_heatmap(trades: List[Dict[str, Any]], heatmap_type: str = 'hour_day') -> Dict[str, Any]:
    """
    Calculate P&L heatmap by time.
    
    Types:
    - hour_day: Hour of day (x) vs Day of week (y)
    - instrument: Symbol P&L matrix
    """
    exit_trades = [t for t in trades if t.get('type') == 'exit' or t.get('pnl') is not None]
    
    if not exit_trades:
        return {
            'empty': True,
            'guidance': 'No completed trades for heatmap analysis.'
        }
    
    if heatmap_type == 'hour_day':
        # Trading hours: 9-16, Days: Mon-Fri
        hours = list(range(9, 17))
        days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']
        
        matrix = [[0.0 for _ in hours] for _ in days]
        counts = [[0 for _ in hours] for _ in days]
        
        for t in exit_trades:
            timestamp = _parse_trade_time(t.get('timestamp', ''))
            if timestamp == datetime.min:
                continue
            
            hour = timestamp.hour
            day_idx = timestamp.weekday()
            
            if 9 <= hour < 17 and day_idx < 5:
                hour_idx = hour - 9
                pnl = float(t.get('pnl', 0) or 0)
                matrix[day_idx][hour_idx] += pnl
                counts[day_idx][hour_idx] += 1
        
        # Find min/max for color scaling
        all_values = [v for row in matrix for v in row]
        min_val = min(all_values) if all_values else 0
        max_val = max(all_values) if all_values else 0
        
        return {
            'empty': False,
            'type': 'hour_day',
            'x_labels': [f'{h}:00' for h in hours],
            'y_labels': days,
            'matrix': matrix,
            'counts': counts,
            'range': {'min': round(min_val, 2), 'max': round(max_val, 2)},
            'best_slot': _find_best_slot(matrix, hours, days),
            'worst_slot': _find_worst_slot(matrix, hours, days)
        }
    
    elif heatmap_type == 'instrument':
        # Symbol x Metric matrix
        symbols = list(set(t.get('symbol', 'Unknown') for t in exit_trades))
        symbol_data = {}
        
        for symbol in symbols:
            symbol_trades = [t for t in exit_trades if t.get('symbol') == symbol]
            total_pnl = sum(float(t.get('pnl', 0) or 0) for t in symbol_trades)
            wins = sum(1 for t in symbol_trades if float(t.get('pnl', 0) or 0) > 0)
            win_rate = (wins / len(symbol_trades) * 100) if symbol_trades else 0
            
            symbol_data[symbol] = {
                'pnl': round(total_pnl, 2),
                'trades': len(symbol_trades),
                'win_rate': round(win_rate, 1)
            }
        
        # Sort by P&L
        sorted_symbols = sorted(symbol_data.keys(), key=lambda s: symbol_data[s]['pnl'], reverse=True)
        
        return {
            'empty': False,
            'type': 'instrument',
            'symbols': sorted_symbols,
            'data': symbol_data
        }
    
    return {'empty': True, 'guidance': 'Invalid heatmap type.'}


def _find_best_slot(matrix, hours, days):
    """Find the best performing time slot."""
    best_val = float('-inf')
    best_slot = None
    
    for d_idx, day in enumerate(days):
        for h_idx, hour in enumerate(hours):
            if matrix[d_idx][h_idx] > best_val:
                best_val = matrix[d_idx][h_idx]
                best_slot = {'day': day, 'hour': f'{hour}:00', 'pnl': round(best_val, 2)}
    
    return best_slot


def _find_worst_slot(matrix, hours, days):
    """Find the worst performing time slot."""
    worst_val = float('inf')
    worst_slot = None
    
    for d_idx, day in enumerate(days):
        for h_idx, hour in enumerate(hours):
            if matrix[d_idx][h_idx] < worst_val:
                worst_val = matrix[d_idx][h_idx]
                worst_slot = {'day': day, 'hour': f'{hour}:00', 'pnl': round(worst_val, 2)}
    
    return worst_slot


# =============================================================================
# Strategy Attribution
# =============================================================================

def calculate_strategy_contribution(trades: List[Dict[str, Any]]) -> Dict[str, Any]:
    """Calculate each strategy's contribution to overall performance."""
    exit_trades = [t for t in trades if t.get('type') == 'exit' or t.get('pnl') is not None]
    
    if not exit_trades:
        return {
            'empty': True,
            'guidance': 'No completed trades for strategy attribution.'
        }
    
    strategy_pnl = defaultdict(float)
    strategy_trades = defaultdict(int)
    strategy_wins = defaultdict(int)
    
    for t in exit_trades:
        name = t.get('strategy_name', 'Unknown')
        pnl = float(t.get('pnl', 0) or 0)
        
        strategy_pnl[name] += pnl
        strategy_trades[name] += 1
        if pnl > 0:
            strategy_wins[name] += 1
    
    total_pnl = sum(strategy_pnl.values())
    
    contributions = []
    running_total = 0
    
    # Sort by P&L descending
    sorted_strategies = sorted(strategy_pnl.keys(), key=lambda s: strategy_pnl[s], reverse=True)
    
    for name in sorted_strategies:
        pnl = strategy_pnl[name]
        trades_count = strategy_trades[name]
        wins = strategy_wins[name]
        
        contribution = {
            'strategy_name': name,
            'pnl': round(pnl, 2),
            'trades': trades_count,
            'win_rate': round(wins / trades_count * 100, 1) if trades_count > 0 else 0,
            'contribution_pct': round(pnl / total_pnl * 100, 1) if total_pnl != 0 else 0,
            'waterfall_start': round(running_total, 2),
            'waterfall_end': round(running_total + pnl, 2)
        }
        
        running_total += pnl
        contributions.append(contribution)
    
    return {
        'empty': False,
        'total_pnl': round(total_pnl, 2),
        'strategy_count': len(sorted_strategies),
        'contributions': contributions,
        'top_performer': sorted_strategies[0] if sorted_strategies else None,
        'bottom_performer': sorted_strategies[-1] if sorted_strategies else None
    }


# =============================================================================
# Recompute Job Management
# =============================================================================

def create_recompute_job(enabled_strategies: List[str], trigger: str = 'manual') -> Dict[str, Any]:
    """Create a new recompute job."""
    job_id = str(uuid.uuid4())
    
    job = {
        'job_id': job_id,
        'status': 'pending',
        'progress': 0,
        'enabled_strategies': enabled_strategies,
        'trigger': trigger,
        'created_at': datetime.utcnow().isoformat(),
        'started_at': None,
        'completed_at': None,
        'error': None
    }
    
    with _jobs_lock:
        _recompute_jobs[job_id] = job
    
    # Start job processing (in production, this would be async/background)
    _process_recompute_job(job_id)
    
    return {'job_id': job_id, 'status': 'pending'}


def get_recompute_job_status(job_id: str) -> Dict[str, Any]:
    """Get status of a recompute job."""
    with _jobs_lock:
        job = _recompute_jobs.get(job_id)
    
    if not job:
        return {'error': 'Job not found', 'job_id': job_id}
    
    return job


def _process_recompute_job(job_id: str):
    """Process a recompute job (simulated for MVP)."""
    with _jobs_lock:
        job = _recompute_jobs.get(job_id)
        if not job:
            return
        job['status'] = 'processing'
        job['started_at'] = datetime.utcnow().isoformat()
        job['progress'] = 10
    
    # Simulate processing time
    import time
    time.sleep(0.5)  # Simulate some work
    
    with _jobs_lock:
        job = _recompute_jobs.get(job_id)
        if job:
            job['progress'] = 100
            job['status'] = 'completed'
            job['completed_at'] = datetime.utcnow().isoformat()


# =============================================================================
# Overview Endpoint Data
# =============================================================================

def get_analytics_overview(
    enabled_strategies_only: bool = True,
    date_range: str = 'ALL'
) -> Dict[str, Any]:
    """
    Get comprehensive analytics overview for the main dashboard.
    Returns all KPIs, Flow Grade, and empty-state metadata.
    """
    strategies = get_all_strategies()
    
    # Filter to enabled strategies
    if enabled_strategies_only:
        enabled_names = [name for name, data in strategies.items() if data.get('enabled', False)]
    else:
        enabled_names = list(strategies.keys())
    
    # Get trades
    trades = get_all_trades(strategy_names=enabled_names if enabled_strategies_only else None)
    account = get_account_info()
    
    # Check empty state
    exit_trades = [t for t in trades if t.get('type') == 'exit' or t.get('pnl') is not None]
    is_empty = len(exit_trades) == 0
    
    if is_empty:
        return {
            'empty': True,
            'guidance': 'No trades yet. Enable a strategy or run a backtest to populate metrics.',
            'kpis': {},
            'flow_grade': calculate_flow_grade([], account),
            'enabled_strategies': enabled_names,
            'total_strategies': len(strategies),
            'computed_at': datetime.utcnow().isoformat()
        }
    
    # Calculate all metrics
    pnl_data = calculate_net_pnl(trades)
    win_data = calculate_win_rate(trades)
    expectancy_data = calculate_expectancy(trades)
    drawdown_data = calculate_max_drawdown(trades)
    profit_factor = calculate_profit_factor(trades)
    
    # Build KPIs
    kpis = {
        'net_pnl_usd': pnl_data['net_pnl'],
        'net_pnl_pct': pnl_data['net_pnl_percent'],
        'gross_pnl': pnl_data['gross_pnl'],
        'total_fees': pnl_data['total_fees'],
        'win_rate': win_data['win_rate'],
        'wins': win_data['wins'],
        'losses': win_data['losses'],
        'total_trades': win_data['total'],
        'profit_factor': profit_factor if profit_factor != float('inf') else 999.99,
        'expectancy': expectancy_data['expectancy'],
        'avg_win': expectancy_data['avg_win'],
        'avg_loss': expectancy_data['avg_loss'],
        'max_drawdown_pct': drawdown_data['max_drawdown_pct'],
        'max_drawdown_usd': drawdown_data['max_drawdown_value']
    }
    
    return {
        'empty': False,
        'guidance': '',
        'kpis': kpis,
        'flow_grade': calculate_flow_grade(trades, account),
        'enabled_strategies': enabled_names,
        'total_strategies': len(strategies),
        'account': {
            'starting_capital': account.get('starting_capital', 100000),
            'current_equity': account.get('equity', 100000) + pnl_data['net_pnl']
        },
        'computed_at': datetime.utcnow().isoformat()
    }


# =============================================================================
# Recent Activity / Signals
# =============================================================================

def get_recent_activity(limit: int = 20) -> Dict[str, Any]:
    """Get recent signals and trade events."""
    trades = get_all_trades()
    
    # Sort by timestamp descending
    sorted_trades = sorted(
        trades,
        key=lambda t: _parse_trade_time(t.get('timestamp', '')),
        reverse=True
    )[:limit]
    
    activity = []
    for t in sorted_trades:
        activity.append({
            'id': t.get('id'),
            'type': t.get('type', 'trade'),
            'symbol': t.get('symbol'),
            'strategy_name': t.get('strategy_name'),
            'direction': t.get('direction'),
            'price': t.get('price'),
            'pnl': t.get('pnl'),
            'timestamp': t.get('timestamp'),
            'icon': '🟢' if t.get('type') == 'entry' else ('🔴' if t.get('type') == 'exit' else '📊')
        })
    
    return {
        'empty': len(activity) == 0,
        'guidance': 'No recent activity. Signals will appear here when strategies execute.' if len(activity) == 0 else '',
        'activity': activity,
        'total': len(activity)
    }


# =============================================================================
# Trades List with Pagination
# =============================================================================

def get_trades_paginated(
    page: int = 1,
    per_page: int = 50,
    strategy_name: Optional[str] = None,
    symbol: Optional[str] = None,
    sort_by: str = 'timestamp',
    sort_order: str = 'desc'
) -> Dict[str, Any]:
    """Get paginated trades list with filtering."""
    trades = get_all_trades()
    
    # Filter by strategy
    if strategy_name:
        trades = [t for t in trades if t.get('strategy_name') == strategy_name]
    
    # Filter by symbol
    if symbol:
        trades = [t for t in trades if t.get('symbol') == symbol]
    
    # Only exit trades (completed trades with P&L)
    exit_trades = [t for t in trades if t.get('type') == 'exit' or t.get('pnl') is not None]
    
    # Sort
    reverse = sort_order == 'desc'
    if sort_by == 'timestamp':
        exit_trades.sort(key=lambda t: _parse_trade_time(t.get('timestamp', '')), reverse=reverse)
    elif sort_by == 'pnl':
        exit_trades.sort(key=lambda t: float(t.get('pnl', 0) or 0), reverse=reverse)
    elif sort_by == 'symbol':
        exit_trades.sort(key=lambda t: t.get('symbol', ''), reverse=reverse)
    
    # Paginate
    total = len(exit_trades)
    start = (page - 1) * per_page
    end = start + per_page
    page_trades = exit_trades[start:end]
    
    # Add display fields
    for t in page_trades:
        pnl = float(t.get('pnl', 0) or 0)
        t['pnl_formatted'] = f"${pnl:,.2f}"
        t['is_win'] = pnl > 0
        t['commission'] = t.get('commission', 0)
        t['net_pnl'] = pnl - float(t.get('commission', 0) or 0)
    
    return {
        'empty': total == 0,
        'guidance': 'No trades match your filters.' if total == 0 else '',
        'trades': page_trades,
        'pagination': {
            'page': page,
            'per_page': per_page,
            'total': total,
            'total_pages': math.ceil(total / per_page) if per_page > 0 else 0,
            'has_next': end < total,
            'has_prev': page > 1
        }
    }


# =============================================================================
# Equity Curve for Charts
# =============================================================================

def get_equity_curve_data(
    timeframe: str = 'ALL',
    include_drawdown: bool = True
) -> Dict[str, Any]:
    """Get equity curve data for charts."""
    trades = get_all_trades()
    account = get_account_info()
    
    equity_curve = calculate_equity_curve(trades, account.get('starting_capital', 100000))
    
    if not equity_curve or len(equity_curve) < 2:
        return {
            'empty': True,
            'guidance': 'Not enough data for equity curve. Execute more trades to see your equity progression.'
        }
    
    return {
        'empty': False,
        'curve': equity_curve,
        'starting_capital': account.get('starting_capital', 100000),
        'current_equity': equity_curve[-1]['v'] if equity_curve else account.get('starting_capital', 100000),
        'data_points': len(equity_curve)
    }
