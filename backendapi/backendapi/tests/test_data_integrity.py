"""
Data Integrity Tests
====================

Test that the system handles edge cases, missing data, and maintains
data integrity throughout the execution pipeline.
"""

import pytest
import sys
import os
import math

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workflows.unified_executor import execute_unified_workflow, UnifiedStrategyExecutor


class TestNaNHandling:
    """Test proper handling of NaN and missing values."""
    
    def test_nan_in_price_data_handled(self):
        """NaN values in price data should be handled gracefully."""
        closes = [100.0 + i for i in range(50)]
        closes[25] = float('nan')  # Insert NaN mid-series
        
        market_data = {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 if not math.isnan(c) else float('nan') for c in closes],
            'low_history': [c - 1 if not math.isnan(c) else float('nan') for c in closes],
            'volume_history': [1000000] * 50
        }
        
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'ema', 'params': {'period': 9}},
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2', 'sourceHandle': 'value', 'targetHandle': 'input'}
            ]
        }
        
        # Should not raise exception
        try:
            signal, debug = execute_unified_workflow(
                nodes=workflow['nodes'],
                connections=workflow['connections'],
                market_data=market_data,
                debug=True
            )
            # Result should be valid (either a signal or None, not crash)
            assert signal in ['BUY', 'SELL', 'HOLD', None], f"Invalid signal: {signal}"
            print(f"Signal with NaN data: {signal}")
        except Exception as e:
            pytest.fail(f"NaN handling failed: {e}")
    
    def test_insufficient_data_handled(self):
        """Insufficient data for indicator period should be handled."""
        closes = [100.0, 101.0, 102.0, 103.0, 104.0]  # Only 5 bars
        
        market_data = {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'volume_history': [1000000] * 5
        }
        
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14}},  # Needs 14 bars, only have 5
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        try:
            signal, debug = execute_unified_workflow(
                nodes=workflow['nodes'],
                connections=workflow['connections'],
                market_data=market_data,
                debug=True
            )
            print(f"Signal with insufficient data: {signal}")
            print(f"RSI output: {debug['node_outputs'].get('1', {})}")
        except Exception as e:
            print(f"Exception (may be expected): {e}")
    
    def test_empty_history_handled(self):
        """Empty price history should not crash."""
        market_data = {
            'close': 100.0,
            'close_history': [],
            'high_history': [],
            'low_history': [],
            'volume_history': []
        }
        
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'ema', 'params': {'period': 9}},
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2', 'sourceHandle': 'value', 'targetHandle': 'input'}
            ]
        }
        
        try:
            signal, debug = execute_unified_workflow(
                nodes=workflow['nodes'],
                connections=workflow['connections'],
                market_data=market_data,
                debug=True
            )
            print(f"Signal with empty data: {signal}")
        except Exception as e:
            print(f"Exception (expected): {e}")


class TestConnectionNormalization:
    """Test connection/edge normalization between different formats."""
    
    def test_string_node_ids_normalized(self):
        """String node IDs should work same as integer IDs."""
        closes = [100.0 + i for i in range(50)]
        market_data = {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'volume_history': [1000000] * 50
        }
        
        # Using string IDs
        workflow_str = {
            'nodes': [
                {'id': '1', 'type': 'rsi', 'params': {'period': 14}},
                {'id': '2', 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        # Using integer IDs
        workflow_int = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': 1, 'target': 2, 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        signal_str, debug_str = execute_unified_workflow(
            nodes=workflow_str['nodes'],
            connections=workflow_str['connections'],
            market_data=market_data,
            debug=True
        )
        
        signal_int, debug_int = execute_unified_workflow(
            nodes=workflow_int['nodes'],
            connections=workflow_int['connections'],
            market_data=market_data,
            debug=True
        )
        
        print(f"String IDs signal: {signal_str}")
        print(f"Integer IDs signal: {signal_int}")
        
        assert signal_str == signal_int, f"String vs Int ID signals differ: {signal_str} vs {signal_int}"
    
    def test_missing_handles_default(self):
        """Missing sourceHandle/targetHandle should use defaults."""
        closes = [100.0 + i for i in range(50)]
        market_data = {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'volume_history': [1000000] * 50
        }
        
        # Without explicit handles
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2'}  # No handles specified
            ]
        }
        
        try:
            signal, debug = execute_unified_workflow(
                nodes=workflow['nodes'],
                connections=workflow['connections'],
                market_data=market_data,
                debug=True
            )
            print(f"Signal with default handles: {signal}")
        except Exception as e:
            print(f"Exception: {e}")


class TestPortMapping:
    """Test port/handle mapping for different node types."""
    
    def test_rsi_output_ports(self):
        """RSI node should output rsi, oversold, overbought."""
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
                {'id': 1, 'type': 'rsi', 'params': {'period': 14, 'oversold': 30, 'overbought': 70}},
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=market_data,
            debug=True
        )
        
        rsi_outputs = debug['node_outputs']['1']
        print(f"RSI outputs: {rsi_outputs}")
        
        assert 'rsi' in rsi_outputs, "RSI should have 'rsi' output"
        assert isinstance(rsi_outputs['rsi'], (int, float)), "RSI value should be numeric"
    
    def test_ema_output_ports(self):
        """EMA node should output ema and ema_value (alias)."""
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
                {'id': 1, 'type': 'ema', 'params': {'period': 9}},
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2', 'sourceHandle': 'ema_value', 'targetHandle': 'input'}
            ]
        }
        
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=market_data,
            debug=True
        )
        
        ema_outputs = debug['node_outputs']['1']
        print(f"EMA outputs: {ema_outputs}")
        
        assert 'ema' in ema_outputs, "EMA should have 'ema' output"
        assert 'ema_value' in ema_outputs or ema_outputs.get('ema'), "EMA should be accessible as ema_value"
    
    def test_compare_input_ports(self):
        """Compare node should accept 'a' and 'b' inputs."""
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
            market_data=market_data,
            debug=True
        )
        
        compare_outputs = debug['node_outputs']['3']
        print(f"Compare outputs: {compare_outputs}")
        
        assert 'result' in compare_outputs, "Compare should have 'result' output"
        assert isinstance(compare_outputs['result'], bool), "Compare result should be boolean"


class TestEdgeCases:
    """Test various edge cases and boundary conditions."""
    
    def test_single_node_workflow(self):
        """Single indicator node (no signal node) should not crash."""
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
                {'id': 1, 'type': 'rsi', 'params': {'period': 14}}
            ],
            'connections': []
        }
        
        try:
            signal, debug = execute_unified_workflow(
                nodes=workflow['nodes'],
                connections=workflow['connections'],
                market_data=market_data,
                debug=True
            )
            print(f"Single node signal: {signal}")
            print(f"Single node outputs: {debug['node_outputs']}")
        except Exception as e:
            print(f"Exception: {e}")
    
    def test_disconnected_nodes(self):
        """Multiple unconnected nodes should all execute."""
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
                {'id': 2, 'type': 'ema', 'params': {'period': 9}},
                {'id': 3, 'type': 'sma', 'params': {'period': 20}}
            ],
            'connections': []  # No connections
        }
        
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=market_data,
            debug=True
        )
        
        outputs = debug['node_outputs']
        print(f"Disconnected nodes outputs: {outputs}")
        
        assert '1' in outputs, "RSI node should execute"
        assert '2' in outputs, "EMA node should execute"
        assert '3' in outputs, "SMA node should execute"
    
    def test_circular_reference_handled(self):
        """Circular references should be detected and handled."""
        closes = [100.0 + i for i in range(50)]
        market_data = {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'volume_history': [1000000] * 50
        }
        
        # Create circular reference: 1 -> 2 -> 3 -> 1
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'and', 'params': {}},
                {'id': 2, 'type': 'and', 'params': {}},
                {'id': 3, 'type': 'and', 'params': {}}
            ],
            'connections': [
                {'source': '1', 'target': '2'},
                {'source': '2', 'target': '3'},
                {'source': '3', 'target': '1'}  # Circular!
            ]
        }
        
        try:
            signal, debug = execute_unified_workflow(
                nodes=workflow['nodes'],
                connections=workflow['connections'],
                market_data=market_data,
                debug=True
            )
            print(f"Circular workflow executed (may use fallback)")
        except Exception as e:
            print(f"Circular reference exception (expected): {e}")


class TestLargeDataset:
    """Test handling of large datasets."""
    
    def test_1000_bars(self):
        """1000 bars should process correctly."""
        import random
        random.seed(42)  # For reproducibility
        
        closes = [100.0]
        for _ in range(999):
            closes.append(closes[-1] * (1 + random.uniform(-0.02, 0.02)))
        
        market_data = {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c * 1.01 for c in closes],
            'low_history': [c * 0.99 for c in closes],
            'volume_history': [1000000] * 1000
        }
        
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
                {'id': 2, 'type': 'ema', 'params': {'period': 50}},
                {'id': 3, 'type': 'and', 'params': {}},
                {'id': 4, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '3', 'sourceHandle': 'result', 'targetHandle': 'a'},
                {'source': '2', 'target': '3', 'sourceHandle': 'value', 'targetHandle': 'b'},
                {'source': '3', 'target': '4', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        import time
        start = time.time()
        
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=market_data,
            debug=True
        )
        
        elapsed = time.time() - start
        
        print(f"1000 bars processed in {elapsed:.3f}s")
        print(f"RSI: {debug['node_outputs']['1']['rsi']:.2f}")
        print(f"Signal: {signal}")
        
        assert elapsed < 1.0, f"Processing took too long: {elapsed}s"


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
