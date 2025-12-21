"""
FlowGrid Trading - Trade Engine Unit Tests
Tests the percentage-based, strategy-independent trade calculation system.
"""

import pytest
import json
import os
import sys
from datetime import datetime
from unittest.mock import patch, MagicMock

# Add parent directory to path for imports
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.trade_engine import (
    ingest_signal,
    calculate_gross_pct,
    calculate_net_pct,
    get_position,
    get_all_positions,
    save_position,
    clear_position,
    clear_all_positions,
    get_all_percent_trades,
    save_completed_trade,
    clear_all_trades,
    compute_analytics,
    get_equity_curve_pct,
    _compute_metrics_from_trades,
    _compute_max_drawdown_pct
)


# =============================================================================
# Test Fixtures
# =============================================================================

@pytest.fixture
def clean_state():
    """Reset all positions and trades before each test."""
    clear_all_positions()
    clear_all_trades()
    yield
    # Cleanup after test
    clear_all_positions()
    clear_all_trades()


# =============================================================================
# Test: Gross Percent Calculation
# =============================================================================

class TestGrossPctCalculation:
    """Test percentage P&L calculation formulas."""
    
    def test_long_position_profit(self):
        """LONG: entry 100, exit 105 = +5%"""
        result = calculate_gross_pct('LONG', 100.0, 105.0)
        assert abs(result - 5.0) < 0.01
    
    def test_long_position_loss(self):
        """LONG: entry 100, exit 95 = -5%"""
        result = calculate_gross_pct('LONG', 100.0, 95.0)
        assert abs(result - (-5.0)) < 0.01
    
    def test_short_position_profit(self):
        """SHORT: entry 100, exit 95 = +5.26%"""
        # Formula: (entry/exit - 1) * 100 = (100/95 - 1) * 100 = 5.26%
        result = calculate_gross_pct('SHORT', 100.0, 95.0)
        assert abs(result - 5.2632) < 0.01
    
    def test_short_position_loss(self):
        """SHORT: entry 100, exit 105 = -4.76%"""
        # Formula: (entry/exit - 1) * 100 = (100/105 - 1) * 100 = -4.76%
        result = calculate_gross_pct('SHORT', 100.0, 105.0)
        assert abs(result - (-4.7619)) < 0.01
    
    def test_zero_open_price_returns_zero(self):
        """Zero open price should return 0 (avoid division by zero)."""
        result = calculate_gross_pct('LONG', 0.0, 100.0)
        assert result == 0.0
    
    def test_large_gain(self):
        """LONG: entry 100, exit 200 = +100%"""
        result = calculate_gross_pct('LONG', 100.0, 200.0)
        assert abs(result - 100.0) < 0.01


class TestNetPctCalculation:
    """Test net P&L calculation after fees."""
    
    def test_subtract_fees(self):
        """Net = Gross - Fees"""
        gross = 5.0
        fees = 0.15
        result = calculate_net_pct(gross, fees)
        assert abs(result - 4.85) < 0.001
    
    def test_loss_with_fees(self):
        """Losses become larger after fees."""
        gross = -2.0
        fees = 0.15
        result = calculate_net_pct(gross, fees)
        assert abs(result - (-2.15)) < 0.001


# =============================================================================
# Test: Signal Ingestion State Machine
# =============================================================================

class TestSignalIngestion:
    """Test the signal processing state machine."""
    
    def test_first_buy_signal_opens_long(self, clean_state):
        """First BUY signal should open LONG position."""
        result = ingest_signal(
            strategy_id='test-strat-1',
            signal='BUY',
            price=100.0,
            ts='2025-01-01T10:00:00Z'
        )
        
        assert result['accepted'] == True
        assert result['action'] == 'opened'
        assert result['opened']['side'] == 'LONG'
        assert result['opened']['entry_price'] == 100.0
        
        # Verify position state
        pos = get_position('test-strat-1')
        assert pos['position'] == 'LONG'
        assert pos['last_signal'] == 'BUY'
    
    def test_first_sell_signal_opens_short(self, clean_state):
        """First SELL signal should open SHORT position."""
        result = ingest_signal(
            strategy_id='test-strat-2',
            signal='SELL',
            price=100.0,
            ts='2025-01-01T10:00:00Z'
        )
        
        assert result['accepted'] == True
        assert result['action'] == 'opened'
        assert result['opened']['side'] == 'SHORT'
    
    def test_duplicate_signal_ignored(self, clean_state):
        """Duplicate signals should be ignored."""
        # First signal - opens position
        ingest_signal(
            strategy_id='test-strat-3',
            signal='BUY',
            price=100.0,
            ts='2025-01-01T10:00:00Z'
        )
        
        # Duplicate signal - should be ignored
        result = ingest_signal(
            strategy_id='test-strat-3',
            signal='BUY',
            price=105.0,
            ts='2025-01-01T10:01:00Z'
        )
        
        assert result['accepted'] == False
        assert result['action'] == 'ignored'
        assert result['reason'] == 'duplicate_signal'
    
    def test_long_to_short_creates_trade(self, clean_state):
        """Signal change from LONG to SHORT should complete a trade."""
        # Open LONG
        ingest_signal(
            strategy_id='test-strat-4',
            signal='BUY',
            price=100.0,
            ts='2025-01-01T10:00:00Z'
        )
        
        # Close LONG, open SHORT
        result = ingest_signal(
            strategy_id='test-strat-4',
            signal='SELL',
            price=105.0,
            ts='2025-01-01T10:05:00Z'
        )
        
        assert result['accepted'] == True
        assert result['action'] == 'closed_and_opened'
        assert result['completed_trade'] is not None
        
        # Verify trade details
        trade = result['completed_trade']
        assert trade['open_side'] == 'LONG'
        assert trade['close_side'] == 'SHORT'
        assert trade['open_price'] == 100.0
        assert trade['close_price'] == 105.0
        assert abs(trade['gross_pct'] - 5.0) < 0.01  # 5% gain
        
        # Verify new position
        assert result['opened']['side'] == 'SHORT'
        assert result['opened']['entry_price'] == 105.0
    
    def test_short_to_long_creates_trade(self, clean_state):
        """Signal change from SHORT to LONG should complete a trade."""
        # Open SHORT
        ingest_signal(
            strategy_id='test-strat-5',
            signal='SELL',
            price=105.0,
            ts='2025-01-01T10:00:00Z'
        )
        
        # Close SHORT, open LONG
        result = ingest_signal(
            strategy_id='test-strat-5',
            signal='BUY',
            price=100.0,
            ts='2025-01-01T10:05:00Z'
        )
        
        assert result['accepted'] == True
        assert result['action'] == 'closed_and_opened'
        
        # Verify SHORT was profitable (price went down)
        trade = result['completed_trade']
        assert trade['open_side'] == 'SHORT'
        assert trade['close_side'] == 'LONG'
        assert trade['gross_pct'] > 0  # Profit on SHORT when price drops
    
    def test_hold_signal_ignored(self, clean_state):
        """HOLD signals should be ignored."""
        result = ingest_signal(
            strategy_id='test-strat-6',
            signal='HOLD',
            price=100.0,
            ts='2025-01-01T10:00:00Z'
        )
        
        assert result['accepted'] == False
        assert result['action'] == 'ignored'
        assert result['reason'] == 'hold_ignored'
    
    def test_invalid_signal_rejected(self, clean_state):
        """Invalid signals should be rejected."""
        result = ingest_signal(
            strategy_id='test-strat-7',
            signal='INVALID',
            price=100.0,
            ts='2025-01-01T10:00:00Z'
        )
        
        assert result['accepted'] == False
        assert 'invalid_signal' in result['reason']


# =============================================================================
# Test: Strategy Independence
# =============================================================================

class TestStrategyIndependence:
    """Test that strategies maintain independent position states."""
    
    def test_multiple_strategies_independent_positions(self, clean_state):
        """Different strategies should have independent positions."""
        # Strategy A: Open LONG
        ingest_signal(
            strategy_id='strat-A',
            signal='BUY',
            price=100.0,
            ts='2025-01-01T10:00:00Z'
        )
        
        # Strategy B: Open SHORT (at same time)
        ingest_signal(
            strategy_id='strat-B',
            signal='SELL',
            price=100.0,
            ts='2025-01-01T10:00:00Z'
        )
        
        # Verify independent positions
        pos_a = get_position('strat-A')
        pos_b = get_position('strat-B')
        
        assert pos_a['position'] == 'LONG'
        assert pos_b['position'] == 'SHORT'
    
    def test_signal_in_one_strategy_doesnt_affect_other(self, clean_state):
        """A signal in one strategy should not affect another."""
        # Both strategies open LONG
        ingest_signal(strategy_id='strat-A', signal='BUY', price=100.0, ts='2025-01-01T10:00:00Z')
        ingest_signal(strategy_id='strat-B', signal='BUY', price=100.0, ts='2025-01-01T10:00:00Z')
        
        # Strategy A closes (SELL)
        result = ingest_signal(
            strategy_id='strat-A',
            signal='SELL',
            price=110.0,
            ts='2025-01-01T10:05:00Z'
        )
        
        # Strategy A completed a trade
        assert result['completed_trade'] is not None
        
        # Strategy B should still be LONG (unchanged)
        pos_b = get_position('strat-B')
        assert pos_b['position'] == 'LONG'
        assert pos_b['last_signal'] == 'BUY'


# =============================================================================
# Test: Alternating Position Enforcement
# =============================================================================

class TestAlternatingPositions:
    """Test that positions strictly alternate LONG ↔ SHORT."""
    
    def test_trade_sides_are_opposite(self, clean_state):
        """Completed trade open_side and close_side must be opposite."""
        # Open LONG
        ingest_signal(strategy_id='test-alt', signal='BUY', price=100.0, ts='2025-01-01T10:00:00Z')
        
        # Close LONG, open SHORT
        result = ingest_signal(strategy_id='test-alt', signal='SELL', price=105.0, ts='2025-01-01T10:01:00Z')
        trade1 = result['completed_trade']
        
        # Close SHORT, open LONG
        result = ingest_signal(strategy_id='test-alt', signal='BUY', price=100.0, ts='2025-01-01T10:02:00Z')
        trade2 = result['completed_trade']
        
        # Verify alternation
        assert trade1['open_side'] != trade1['close_side']
        assert trade2['open_side'] != trade2['close_side']
        
        # Trade 1: LONG → SHORT
        assert trade1['open_side'] == 'LONG'
        assert trade1['close_side'] == 'SHORT'
        
        # Trade 2: SHORT → LONG
        assert trade2['open_side'] == 'SHORT'
        assert trade2['close_side'] == 'LONG'


# =============================================================================
# Test: Analytics Calculation
# =============================================================================

class TestAnalyticsCalculation:
    """Test analytics metrics computation."""
    
    def test_empty_trades_returns_empty_metrics(self, clean_state):
        """Empty trade list should return empty metrics."""
        analytics = compute_analytics(use_cache=False)
        
        assert analytics['empty'] == True
        assert analytics['metrics']['trade_count'] == 0
        assert analytics['metrics']['net_return_pct'] == 0.0
    
    def test_win_rate_calculation(self, clean_state):
        """Test win rate is calculated correctly."""
        # Create some trades manually
        trades = [
            {'net_pct': 5.0, 'close_ts': '2025-01-01T10:00:00Z'},
            {'net_pct': 3.0, 'close_ts': '2025-01-01T10:01:00Z'},
            {'net_pct': -2.0, 'close_ts': '2025-01-01T10:02:00Z'},
            {'net_pct': 4.0, 'close_ts': '2025-01-01T10:03:00Z'},
        ]
        
        metrics = _compute_metrics_from_trades(trades)
        
        # 3 wins, 1 loss = 75% win rate
        assert metrics['wins'] == 3
        assert metrics['losses'] == 1
        assert metrics['win_rate'] == 75.0
    
    def test_profit_factor_calculation(self, clean_state):
        """Test profit factor = sum(wins) / abs(sum(losses))."""
        trades = [
            {'net_pct': 10.0, 'close_ts': '2025-01-01T10:00:00Z'},
            {'net_pct': -5.0, 'close_ts': '2025-01-01T10:01:00Z'},
        ]
        
        metrics = _compute_metrics_from_trades(trades)
        
        # Profit factor = 10 / 5 = 2.0
        assert metrics['profit_factor'] == 2.0
    
    def test_max_drawdown_calculation(self, clean_state):
        """Test max drawdown calculation."""
        trades = [
            {'net_pct': 10.0, 'close_ts': '2025-01-01T10:00:00Z'},  # +10%
            {'net_pct': -15.0, 'close_ts': '2025-01-01T10:01:00Z'},  # -5% cumulative
            {'net_pct': 5.0, 'close_ts': '2025-01-01T10:02:00Z'},   # 0% cumulative
        ]
        
        # Peak was at +10%, trough at -5% → drawdown = 15%
        max_dd = _compute_max_drawdown_pct(trades)
        assert max_dd == 15.0
    
    def test_expectancy_calculation(self, clean_state):
        """Test expectancy = (win_rate * avg_win) - (loss_rate * avg_loss)."""
        trades = [
            {'net_pct': 4.0, 'close_ts': '2025-01-01T10:00:00Z'},
            {'net_pct': 6.0, 'close_ts': '2025-01-01T10:01:00Z'},
            {'net_pct': -2.0, 'close_ts': '2025-01-01T10:02:00Z'},
            {'net_pct': -4.0, 'close_ts': '2025-01-01T10:03:00Z'},
        ]
        
        metrics = _compute_metrics_from_trades(trades)
        
        # Win rate: 50% (2 wins, 2 losses)
        # Avg win: (4 + 6) / 2 = 5
        # Avg loss: (2 + 4) / 2 = 3
        # Expectancy: 0.5 * 5 - 0.5 * 3 = 2.5 - 1.5 = 1.0
        assert metrics['win_rate'] == 50.0
        assert metrics['avg_win_pct'] == 5.0
        assert metrics['avg_loss_pct'] == 3.0  # Stored as positive
        assert metrics['expectancy'] == 1.0


# =============================================================================
# Test: Edge Cases
# =============================================================================

class TestEdgeCases:
    """Test edge cases and error handling."""
    
    def test_missing_strategy_id_rejected(self, clean_state):
        """Missing strategy_id should be rejected."""
        result = ingest_signal(
            strategy_id='',
            signal='BUY',
            price=100.0,
            ts='2025-01-01T10:00:00Z'
        )
        
        assert result['accepted'] == False
        assert 'missing_strategy_id' in result['reason']
    
    def test_zero_price_rejected(self, clean_state):
        """Zero price should be rejected."""
        result = ingest_signal(
            strategy_id='test-strat',
            signal='BUY',
            price=0.0,
            ts='2025-01-01T10:00:00Z'
        )
        
        assert result['accepted'] == False
        assert 'price' in result['reason'].lower()
    
    def test_negative_price_rejected(self, clean_state):
        """Negative price should be rejected."""
        result = ingest_signal(
            strategy_id='test-strat',
            signal='BUY',
            price=-100.0,
            ts='2025-01-01T10:00:00Z'
        )
        
        assert result['accepted'] == False


# =============================================================================
# Test: Position Persistence
# =============================================================================

class TestPositionPersistence:
    """Test that positions persist across module reloads."""
    
    def test_position_saved_to_file(self, clean_state):
        """Position should be saved to file."""
        ingest_signal(
            strategy_id='persist-test',
            signal='BUY',
            price=100.0,
            ts='2025-01-01T10:00:00Z'
        )
        
        # Verify position exists
        pos = get_position('persist-test')
        assert pos['position'] == 'LONG'
        
        # Verify file exists and contains position
        from api.trade_engine import POSITIONS_FILE
        assert os.path.exists(POSITIONS_FILE)
        
        with open(POSITIONS_FILE, 'r') as f:
            data = json.load(f)
        
        assert 'persist-test' in data
        assert data['persist-test']['position'] == 'LONG'


# =============================================================================
# Run Tests
# =============================================================================

if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
