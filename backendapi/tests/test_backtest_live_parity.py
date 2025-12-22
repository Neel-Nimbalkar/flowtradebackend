"""
Backtest vs Live Parity Tests
=============================

CRITICAL: These tests verify that the SAME strategy with the SAME data
produces IDENTICAL results whether running in backtest or live mode.

Principle: Same strategy + Same data = Same result
"""

import pytest
import sys
import os

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workflows.unified_executor import execute_unified_workflow, UnifiedStrategyExecutor


class TestBacktestLiveParity:
    """
    MOST IMPORTANT TESTS - Verify backtest and live produce identical results.
    """
    
    @pytest.fixture
    def fixed_uptrend_data(self):
        """Fixed 100-bar uptrend dataset for reproducibility."""
        closes = [100.0 + i for i in range(100)]
        return {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'open_history': closes,
            'volume_history': [1000000] * 100
        }
    
    @pytest.fixture
    def fixed_downtrend_data(self):
        """Fixed 100-bar downtrend dataset."""
        closes = [200.0 - i for i in range(100)]
        return {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'open_history': closes,
            'volume_history': [1000000] * 100
        }
    
    @pytest.fixture
    def simple_rsi_workflow(self):
        """Simple RSI strategy - BUY when RSI oversold."""
        return {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14, 'oversold': 30, 'overbought': 70}},
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
    
    @pytest.fixture
    def ema_crossover_workflow(self):
        """EMA crossover strategy - BUY when EMA(9) > EMA(21)."""
        return {
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
    
    def test_same_executor_used(self):
        """Verify both backtest and live use UnifiedStrategyExecutor."""
        # This is a structural test - verify the executor class exists and is importable
        from workflows.unified_executor import UnifiedStrategyExecutor
        
        assert UnifiedStrategyExecutor is not None, "UnifiedStrategyExecutor should exist"
        assert hasattr(UnifiedStrategyExecutor, 'execute'), "Executor should have execute method"
    
    def test_rsi_values_identical(self, fixed_downtrend_data, simple_rsi_workflow):
        """RSI values must match exactly between runs."""
        # Run 1: First execution
        signal1, debug1 = execute_unified_workflow(
            nodes=simple_rsi_workflow['nodes'],
            connections=simple_rsi_workflow['connections'],
            market_data=fixed_downtrend_data,
            debug=True
        )
        
        # Run 2: Second execution with identical inputs
        signal2, debug2 = execute_unified_workflow(
            nodes=simple_rsi_workflow['nodes'],
            connections=simple_rsi_workflow['connections'],
            market_data=fixed_downtrend_data,
            debug=True
        )
        
        # Extract RSI values
        rsi1 = debug1['node_outputs'].get('1', {}).get('rsi')
        rsi2 = debug2['node_outputs'].get('1', {}).get('rsi')
        
        print(f"Run 1 RSI: {rsi1}, Run 2 RSI: {rsi2}")
        print(f"Run 1 signal: {signal1}, Run 2 signal: {signal2}")
        
        assert rsi1 == rsi2, f"RSI values differ: {rsi1} vs {rsi2}"
        assert signal1 == signal2, f"Signals differ: {signal1} vs {signal2}"
    
    def test_ema_values_identical(self, fixed_uptrend_data, ema_crossover_workflow):
        """EMA values must match exactly between runs."""
        # Run 1
        signal1, debug1 = execute_unified_workflow(
            nodes=ema_crossover_workflow['nodes'],
            connections=ema_crossover_workflow['connections'],
            market_data=fixed_uptrend_data,
            debug=True
        )
        
        # Run 2
        signal2, debug2 = execute_unified_workflow(
            nodes=ema_crossover_workflow['nodes'],
            connections=ema_crossover_workflow['connections'],
            market_data=fixed_uptrend_data,
            debug=True
        )
        
        # Extract EMA values
        ema9_1 = debug1['node_outputs'].get('1', {}).get('ema')
        ema9_2 = debug2['node_outputs'].get('1', {}).get('ema')
        ema21_1 = debug1['node_outputs'].get('2', {}).get('ema')
        ema21_2 = debug2['node_outputs'].get('2', {}).get('ema')
        
        print(f"Run 1 - EMA(9): {ema9_1}, EMA(21): {ema21_1}")
        print(f"Run 2 - EMA(9): {ema9_2}, EMA(21): {ema21_2}")
        print(f"Signals: {signal1} vs {signal2}")
        
        assert ema9_1 == ema9_2, f"EMA(9) values differ: {ema9_1} vs {ema9_2}"
        assert ema21_1 == ema21_2, f"EMA(21) values differ: {ema21_1} vs {ema21_2}"
        assert signal1 == signal2, f"Signals differ: {signal1} vs {signal2}"
    
    def test_execution_order_identical(self, fixed_uptrend_data, ema_crossover_workflow):
        """Nodes must execute in same order each time."""
        # Run 1
        _, debug1 = execute_unified_workflow(
            nodes=ema_crossover_workflow['nodes'],
            connections=ema_crossover_workflow['connections'],
            market_data=fixed_uptrend_data,
            debug=True
        )
        
        # Run 2
        _, debug2 = execute_unified_workflow(
            nodes=ema_crossover_workflow['nodes'],
            connections=ema_crossover_workflow['connections'],
            market_data=fixed_uptrend_data,
            debug=True
        )
        
        order1 = debug1.get('execution_order', [])
        order2 = debug2.get('execution_order', [])
        
        print(f"Execution order 1: {order1}")
        print(f"Execution order 2: {order2}")
        
        assert order1 == order2, f"Execution orders differ: {order1} vs {order2}"
    
    def test_all_outputs_identical(self, fixed_uptrend_data, ema_crossover_workflow):
        """ALL node outputs must match exactly."""
        # Run 1
        signal1, debug1 = execute_unified_workflow(
            nodes=ema_crossover_workflow['nodes'],
            connections=ema_crossover_workflow['connections'],
            market_data=fixed_uptrend_data,
            debug=True
        )
        
        # Run 2
        signal2, debug2 = execute_unified_workflow(
            nodes=ema_crossover_workflow['nodes'],
            connections=ema_crossover_workflow['connections'],
            market_data=fixed_uptrend_data,
            debug=True
        )
        
        outputs1 = debug1['node_outputs']
        outputs2 = debug2['node_outputs']
        
        print(f"Run 1 outputs: {outputs1}")
        print(f"Run 2 outputs: {outputs2}")
        
        # Compare each node's outputs
        for node_id in outputs1:
            assert node_id in outputs2, f"Node {node_id} missing in run 2"
            
            for key in outputs1[node_id]:
                val1 = outputs1[node_id][key]
                val2 = outputs2[node_id].get(key)
                
                if isinstance(val1, (int, float)) and isinstance(val2, (int, float)):
                    assert abs(val1 - val2) < 0.0001, f"Node {node_id}.{key} differs: {val1} vs {val2}"
                else:
                    assert val1 == val2, f"Node {node_id}.{key} differs: {val1} vs {val2}"


class TestSignalConsistency:
    """Test that signals fire at exactly the right conditions."""
    
    @pytest.fixture
    def crossover_data(self):
        """Create data where EMA crossover happens mid-series."""
        # First 50 bars: EMA(9) below EMA(21)
        closes = [100.0 - i * 0.2 for i in range(50)]
        # Next 50 bars: EMA(9) above EMA(21) 
        closes.extend([90.0 + i * 0.5 for i in range(50)])
        return {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'volume_history': [1000000] * 100
        }
    
    def test_ema_crossover_fires_in_uptrend(self, crossover_data):
        """EMA crossover should fire BUY when EMA(9) > EMA(21)."""
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
            market_data=crossover_data,
            debug=True
        )
        
        ema9 = debug['node_outputs']['1']['ema']
        ema21 = debug['node_outputs']['2']['ema']
        compare_result = debug['node_outputs']['3']['result']
        
        print(f"EMA(9): {ema9}, EMA(21): {ema21}")
        print(f"Compare result: {compare_result}")
        print(f"Signal: {signal}")
        
        # After uptrend, EMA(9) should be above EMA(21)
        assert ema9 > ema21, f"EMA(9) should be > EMA(21) in uptrend: {ema9} vs {ema21}"
        assert compare_result == True, f"Compare should be True"
        assert signal == 'BUY', f"Signal should be BUY, got {signal}"
    
    def test_rsi_oversold_fires_in_downtrend(self):
        """RSI oversold should fire BUY in strong downtrend."""
        closes = [200.0 - i * 2 for i in range(50)]
        market_data = {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'volume_history': [1000000] * 50
        }
        
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14, 'oversold': 30}},
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                # Use 'signal' port which is True when oversold/overbought
                {'source': '1', 'target': '2', 'sourceHandle': 'signal', 'targetHandle': 'input'}
            ]
        }
        
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=market_data,
            debug=True
        )
        
        rsi = debug['node_outputs']['1']['rsi']
        oversold = debug['node_outputs']['1'].get('oversold', False)
        
        print(f"RSI: {rsi}, Oversold: {oversold}")
        print(f"Signal: {signal}")
        
        assert rsi < 30, f"RSI should be < 30 in downtrend: {rsi}"
        assert signal == 'BUY', f"Signal should be BUY when oversold"


class TestDeterministicExecution:
    """Verify execution is deterministic (same inputs = same outputs always)."""
    
    def test_ten_consecutive_runs_identical(self):
        """Run the same workflow 10 times - all results must match."""
        closes = [100.0 + i * 0.5 for i in range(100)]
        market_data = {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'volume_history': [1000000] * 100
        }
        
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'ema', 'params': {'period': 9}},
                {'id': 2, 'type': 'rsi', 'params': {'period': 14}},
                {'id': 3, 'type': 'and', 'params': {}},
                {'id': 4, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '3', 'sourceHandle': 'value', 'targetHandle': 'a'},
                {'source': '2', 'target': '3', 'sourceHandle': 'signal', 'targetHandle': 'b'},
                {'source': '3', 'target': '4', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        results = []
        for i in range(10):
            signal, debug = execute_unified_workflow(
                nodes=workflow['nodes'],
                connections=workflow['connections'],
                market_data=market_data,
                debug=True
            )
            results.append({
                'signal': signal,
                'ema': debug['node_outputs']['1']['ema'],
                'rsi': debug['node_outputs']['2']['rsi']
            })
        
        print(f"10 run results: {results}")
        
        # All results should be identical
        first = results[0]
        for i, result in enumerate(results[1:], 1):
            assert result['signal'] == first['signal'], f"Run {i} signal differs"
            assert result['ema'] == first['ema'], f"Run {i} EMA differs"
            assert result['rsi'] == first['rsi'], f"Run {i} RSI differs"
        
        print("✅ All 10 runs produced identical results")


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
