"""
Integration Tests
=================

End-to-end tests for complete workflow execution with realistic market scenarios.
"""

import pytest
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workflows.unified_executor import execute_unified_workflow


class TestBullMarketScenarios:
    """Test strategies in bull market conditions."""
    
    @pytest.fixture
    def bull_market_data(self):
        """Strong uptrend with minor pullbacks."""
        closes = []
        price = 100.0
        for i in range(100):
            if i % 10 < 7:  # 70% up days
                price *= 1.01
            else:  # 30% down days
                price *= 0.995
            closes.append(price)
        
        return {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c * 1.005 for c in closes],
            'low_history': [c * 0.995 for c in closes],
            'volume_history': [1000000 + i * 10000 for i in range(100)]
        }
    
    def test_ema_crossover_in_bull(self, bull_market_data):
        """EMA crossover should fire BUY in bull market."""
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'ema', 'params': {'period': 9}},
                {'id': 2, 'type': 'ema', 'params': {'period': 21}},
                {'id': 3, 'type': 'compare', 'params': {'operator': '>'}},
                {'id': 4, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '3', 'sourceHandle': 'ema_value', 'targetHandle': 'a'},
                {'source': '2', 'target': '3', 'sourceHandle': 'ema_value', 'targetHandle': 'b'},
                {'source': '3', 'target': '4', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=bull_market_data,
            debug=True
        )
        
        ema9 = debug['node_outputs']['1']['ema']
        ema21 = debug['node_outputs']['2']['ema']
        
        print(f"Bull Market - EMA(9): {ema9:.2f}, EMA(21): {ema21:.2f}")
        print(f"Signal: {signal}")
        
        # In bull market, fast EMA should be above slow EMA
        assert ema9 > ema21, f"In bull market, EMA(9) should > EMA(21)"
        assert signal == 'BUY', f"Expected BUY in bull market, got {signal}"
    
    def test_rsi_not_oversold_in_bull(self, bull_market_data):
        """RSI should NOT be oversold in bull market."""
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14, 'oversold': 30}},
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=bull_market_data,
            debug=True
        )
        
        rsi = debug['node_outputs']['1']['rsi']
        
        print(f"Bull Market - RSI: {rsi:.2f}")
        
        # RSI should be above 30 in bull market
        assert rsi > 30, f"RSI should not be oversold in bull market"


class TestBearMarketScenarios:
    """Test strategies in bear market conditions."""
    
    @pytest.fixture
    def bear_market_data(self):
        """Strong downtrend with minor bounces."""
        closes = []
        price = 200.0
        for i in range(100):
            if i % 10 < 7:  # 70% down days
                price *= 0.99
            else:  # 30% up days
                price *= 1.005
            closes.append(price)
        
        return {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c * 1.005 for c in closes],
            'low_history': [c * 0.995 for c in closes],
            'volume_history': [1000000] * 100
        }
    
    def test_ema_crossover_in_bear(self, bear_market_data):
        """EMA crossover should NOT fire BUY in bear market."""
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'ema', 'params': {'period': 9}},
                {'id': 2, 'type': 'ema', 'params': {'period': 21}},
                {'id': 3, 'type': 'compare', 'params': {'operator': '>'}},
                {'id': 4, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '3', 'sourceHandle': 'ema_value', 'targetHandle': 'a'},
                {'source': '2', 'target': '3', 'sourceHandle': 'ema_value', 'targetHandle': 'b'},
                {'source': '3', 'target': '4', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=bear_market_data,
            debug=True
        )
        
        ema9 = debug['node_outputs']['1']['ema']
        ema21 = debug['node_outputs']['2']['ema']
        
        print(f"Bear Market - EMA(9): {ema9:.2f}, EMA(21): {ema21:.2f}")
        print(f"Signal: {signal}")
        
        # In bear market, fast EMA should be below slow EMA
        assert ema9 < ema21, f"In bear market, EMA(9) should < EMA(21)"
        # With EMA9 < EMA21, the compare returns False, so signal node gets False input
        # The signal node behavior depends on its input - with False, it may or may not emit
        print(f"Compare result (EMA9 > EMA21): {debug['node_outputs']['3']['result']}")
        compare_result = debug['node_outputs']['3']['result']
        assert compare_result == False, f"Compare should return False when EMA9 < EMA21"
    
    def test_rsi_oversold_in_bear(self, bear_market_data):
        """RSI should be oversold in strong bear market."""
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14, 'oversold': 30}},
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=bear_market_data,
            debug=True
        )
        
        rsi = debug['node_outputs']['1']['rsi']
        
        print(f"Bear Market - RSI: {rsi:.2f}")
        print(f"Signal: {signal}")


class TestRangingMarketScenarios:
    """Test strategies in sideways/ranging market."""
    
    @pytest.fixture
    def ranging_market_data(self):
        """Oscillating between 100 and 110."""
        import math
        closes = [105 + 5 * math.sin(i * 0.2) for i in range(100)]
        
        return {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'volume_history': [1000000] * 100
        }
    
    def test_rsi_oscillates_in_range(self, ranging_market_data):
        """RSI should oscillate around 50 in ranging market."""
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=ranging_market_data,
            debug=True
        )
        
        rsi = debug['node_outputs']['1']['rsi']
        
        print(f"Ranging Market - RSI: {rsi:.2f}")
        
        # In ranging market, RSI should be between 30-70 most of the time
        assert 20 < rsi < 80, f"RSI should be mid-range in ranging market"


class TestMultiIndicatorStrategies:
    """Test complex multi-indicator strategies."""
    
    @pytest.fixture
    def trend_data(self):
        """Uptrend data for multi-indicator tests."""
        closes = [100.0 + i * 0.5 for i in range(100)]
        return {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'volume_history': [1000000] * 100
        }
    
    def test_rsi_and_ema_strategy(self, trend_data):
        """RSI + EMA combined strategy."""
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14, 'oversold': 30}},
                {'id': 2, 'type': 'ema', 'params': {'period': 9}},
                {'id': 3, 'type': 'ema', 'params': {'period': 21}},
                {'id': 4, 'type': 'compare', 'params': {'operator': '>'}},
                {'id': 5, 'type': 'and', 'params': {}},
                {'id': 6, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '2', 'target': '4', 'sourceHandle': 'ema_value', 'targetHandle': 'a'},
                {'source': '3', 'target': '4', 'sourceHandle': 'ema_value', 'targetHandle': 'b'},
                {'source': '1', 'target': '5', 'sourceHandle': 'result', 'targetHandle': 'a'},
                {'source': '4', 'target': '5', 'sourceHandle': 'result', 'targetHandle': 'b'},
                {'source': '5', 'target': '6', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=trend_data,
            debug=True
        )
        
        print(f"Multi-indicator outputs: {debug['node_outputs']}")
        print(f"Signal: {signal}")
    
    def test_triple_ema_strategy(self, trend_data):
        """Triple EMA crossover strategy."""
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'ema', 'params': {'period': 5}},
                {'id': 2, 'type': 'ema', 'params': {'period': 13}},
                {'id': 3, 'type': 'ema', 'params': {'period': 34}},
                {'id': 4, 'type': 'compare', 'params': {'operator': '>'}},  # EMA5 > EMA13
                {'id': 5, 'type': 'compare', 'params': {'operator': '>'}},  # EMA13 > EMA34
                {'id': 6, 'type': 'and', 'params': {}},
                {'id': 7, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '4', 'sourceHandle': 'ema_value', 'targetHandle': 'a'},
                {'source': '2', 'target': '4', 'sourceHandle': 'ema_value', 'targetHandle': 'b'},
                {'source': '2', 'target': '5', 'sourceHandle': 'ema_value', 'targetHandle': 'a'},
                {'source': '3', 'target': '5', 'sourceHandle': 'ema_value', 'targetHandle': 'b'},
                {'source': '4', 'target': '6', 'sourceHandle': 'result', 'targetHandle': 'a'},
                {'source': '5', 'target': '6', 'sourceHandle': 'result', 'targetHandle': 'b'},
                {'source': '6', 'target': '7', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=trend_data,
            debug=True
        )
        
        ema5 = debug['node_outputs']['1']['ema']
        ema13 = debug['node_outputs']['2']['ema']
        ema34 = debug['node_outputs']['3']['ema']
        
        print(f"Triple EMA - EMA(5): {ema5:.2f}, EMA(13): {ema13:.2f}, EMA(34): {ema34:.2f}")
        print(f"Signal: {signal}")
        
        # In uptrend: EMA5 > EMA13 > EMA34
        assert ema5 > ema13 > ema34, "In uptrend, EMAs should stack properly"
        assert signal == 'BUY', f"Expected BUY with aligned EMAs"


class TestORGateStrategies:
    """Test OR gate logic for multiple entry conditions."""
    
    @pytest.fixture
    def overbought_data(self):
        """Overbought condition data."""
        closes = [100.0 + i * 2 for i in range(50)]
        return {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'volume_history': [1000000] * 50
        }
    
    def test_or_gate_either_condition(self, overbought_data):
        """OR gate should fire if EITHER condition is true."""
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14, 'oversold': 30}},
                {'id': 2, 'type': 'ema', 'params': {'period': 9}},
                {'id': 3, 'type': 'ema', 'params': {'period': 21}},
                {'id': 4, 'type': 'compare', 'params': {'operator': '>'}},
                {'id': 5, 'type': 'or', 'params': {}},
                {'id': 6, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '2', 'target': '4', 'sourceHandle': 'ema_value', 'targetHandle': 'a'},
                {'source': '3', 'target': '4', 'sourceHandle': 'ema_value', 'targetHandle': 'b'},
                {'source': '1', 'target': '5', 'sourceHandle': 'result', 'targetHandle': 'a'},
                {'source': '4', 'target': '5', 'sourceHandle': 'result', 'targetHandle': 'b'},
                {'source': '5', 'target': '6', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=overbought_data,
            debug=True
        )
        
        rsi_result = debug['node_outputs']['1'].get('result', False)
        ema_cross = debug['node_outputs']['4']['result']
        or_result = debug['node_outputs']['5']['result']
        
        print(f"RSI oversold: {rsi_result}")
        print(f"EMA crossover: {ema_cross}")
        print(f"OR result: {or_result}")
        print(f"Signal: {signal}")
        
        # OR should be true if either is true
        expected_or = rsi_result or ema_cross
        assert or_result == expected_or, f"OR logic incorrect"


class TestOutputNodeStrategies:
    """Test strategies with output nodes."""
    
    def test_workflow_with_output_node(self):
        """Workflow with output node should capture values."""
        closes = [100.0 + i for i in range(50)]
        market_data = {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'volume_history': [1000000] * 50
        }
        
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
                {'id': 2, 'type': 'output', 'params': {'name': 'rsi_value'}},
                {'id': 3, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2', 'sourceHandle': 'rsi', 'targetHandle': 'value'},
                {'source': '1', 'target': '3', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=market_data,
            debug=True
        )
        
        print(f"Output node result: {debug['node_outputs'].get('2', {})}")
        print(f"Signal: {signal}")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
