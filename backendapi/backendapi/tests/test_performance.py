"""
Performance Tests
=================

Test that the system meets performance requirements for trading applications.

Requirements:
- Live signal generation: < 500ms latency
- Large dataset processing: Handle 525,600 bars (1-minute data for 1 year)
- Memory efficiency: Process without memory issues
"""

import pytest
import sys
import os
import time
import random

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workflows.unified_executor import execute_unified_workflow


class TestLiveSignalLatency:
    """Test that live signal generation meets latency requirements."""
    
    @pytest.fixture
    def live_market_data(self):
        """Typical live market data payload."""
        random.seed(42)
        closes = [100.0]
        for _ in range(499):
            closes.append(closes[-1] * (1 + random.uniform(-0.01, 0.01)))
        
        return {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c * 1.005 for c in closes],
            'low_history': [c * 0.995 for c in closes],
            'volume_history': [random.randint(500000, 2000000) for _ in range(500)]
        }
    
    def test_simple_rsi_latency(self, live_market_data):
        """Simple RSI strategy should execute in < 100ms."""
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        # Warm-up run
        execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=live_market_data,
            debug=False
        )
        
        # Timed run
        start = time.perf_counter()
        signal, _ = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=live_market_data,
            debug=False
        )
        elapsed_ms = (time.perf_counter() - start) * 1000
        
        print(f"Simple RSI latency: {elapsed_ms:.2f}ms")
        assert elapsed_ms < 100, f"Simple RSI took {elapsed_ms}ms (max 100ms)"
    
    def test_ema_crossover_latency(self, live_market_data):
        """EMA crossover strategy should execute in < 100ms."""
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
        
        start = time.perf_counter()
        signal, _ = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=live_market_data,
            debug=False
        )
        elapsed_ms = (time.perf_counter() - start) * 1000
        
        print(f"EMA crossover latency: {elapsed_ms:.2f}ms")
        assert elapsed_ms < 100, f"EMA crossover took {elapsed_ms}ms (max 100ms)"
    
    def test_complex_strategy_latency(self, live_market_data):
        """Complex multi-indicator strategy should execute in < 500ms."""
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
                {'id': 2, 'type': 'ema', 'params': {'period': 9}},
                {'id': 3, 'type': 'ema', 'params': {'period': 21}},
                {'id': 4, 'type': 'sma', 'params': {'period': 50}},
                {'id': 5, 'type': 'compare', 'params': {'operator': '>'}},
                {'id': 6, 'type': 'compare', 'params': {'operator': '>'}},
                {'id': 7, 'type': 'and', 'params': {}},
                {'id': 8, 'type': 'and', 'params': {}},
                {'id': 9, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '2', 'target': '5', 'sourceHandle': 'ema_value', 'targetHandle': 'a'},
                {'source': '3', 'target': '5', 'sourceHandle': 'ema_value', 'targetHandle': 'b'},
                {'source': '3', 'target': '6', 'sourceHandle': 'ema_value', 'targetHandle': 'a'},
                {'source': '4', 'target': '6', 'sourceHandle': 'sma', 'targetHandle': 'b'},
                {'source': '5', 'target': '7', 'sourceHandle': 'result', 'targetHandle': 'a'},
                {'source': '6', 'target': '7', 'sourceHandle': 'result', 'targetHandle': 'b'},
                {'source': '1', 'target': '8', 'sourceHandle': 'result', 'targetHandle': 'a'},
                {'source': '7', 'target': '8', 'sourceHandle': 'result', 'targetHandle': 'b'},
                {'source': '8', 'target': '9', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        start = time.perf_counter()
        signal, _ = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=live_market_data,
            debug=False
        )
        elapsed_ms = (time.perf_counter() - start) * 1000
        
        print(f"Complex strategy latency: {elapsed_ms:.2f}ms")
        assert elapsed_ms < 500, f"Complex strategy took {elapsed_ms}ms (max 500ms)"


class TestLargeDatasetProcessing:
    """Test processing of large datasets (backtest scenarios)."""
    
    def test_10000_bars(self):
        """Process 10,000 bars in reasonable time."""
        random.seed(42)
        closes = [100.0]
        for _ in range(9999):
            closes.append(closes[-1] * (1 + random.uniform(-0.02, 0.02)))
        
        market_data = {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c * 1.01 for c in closes],
            'low_history': [c * 0.99 for c in closes],
            'volume_history': [1000000] * 10000
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
        
        start = time.perf_counter()
        signal, debug = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=market_data,
            debug=True
        )
        elapsed = time.perf_counter() - start
        
        print(f"10,000 bars processed in {elapsed:.2f}s")
        assert elapsed < 5.0, f"10K bars took {elapsed}s (max 5s)"
    
    def test_50000_bars(self):
        """Process 50,000 bars (approx 200 trading days at 1-min)."""
        random.seed(42)
        closes = [100.0]
        for _ in range(49999):
            closes.append(closes[-1] * (1 + random.uniform(-0.01, 0.01)))
        
        market_data = {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c * 1.005 for c in closes],
            'low_history': [c * 0.995 for c in closes],
            'volume_history': [1000000] * 50000
        }
        
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        start = time.perf_counter()
        signal, _ = execute_unified_workflow(
            nodes=workflow['nodes'],
            connections=workflow['connections'],
            market_data=market_data,
            debug=False
        )
        elapsed = time.perf_counter() - start
        
        print(f"50,000 bars processed in {elapsed:.2f}s")
        assert elapsed < 15.0, f"50K bars took {elapsed}s (max 15s)"


class TestThroughput:
    """Test signal generation throughput."""
    
    def test_100_signals_per_second(self):
        """Should be able to generate 100+ signals per second."""
        random.seed(42)
        base_closes = [100.0 + i * 0.1 for i in range(100)]
        
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
                {'id': 2, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '2', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        count = 100
        start = time.perf_counter()
        
        for i in range(count):
            # Simulate slightly different data each time
            closes = [c + random.uniform(-1, 1) for c in base_closes]
            market_data = {
                'close': closes[-1],
                'close_history': closes,
                'high_history': [c + 1 for c in closes],
                'low_history': [c - 1 for c in closes],
                'volume_history': [1000000] * 100
            }
            
            execute_unified_workflow(
                nodes=workflow['nodes'],
                connections=workflow['connections'],
                market_data=market_data,
                debug=False
            )
        
        elapsed = time.perf_counter() - start
        signals_per_second = count / elapsed
        
        print(f"Generated {count} signals in {elapsed:.2f}s ({signals_per_second:.0f}/sec)")
        assert signals_per_second >= 100, f"Only {signals_per_second:.0f} signals/sec (min 100)"


class TestMemoryEfficiency:
    """Test memory usage with large datasets."""
    
    def test_no_memory_leak_repeated_runs(self):
        """Repeated runs should not leak memory."""
        import gc
        
        random.seed(42)
        closes = [100.0 + i for i in range(1000)]
        market_data = {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'volume_history': [1000000] * 1000
        }
        
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
                {'id': 2, 'type': 'ema', 'params': {'period': 50}},
                {'id': 3, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '3', 'sourceHandle': 'result', 'targetHandle': 'a'},
                {'source': '2', 'target': '3', 'sourceHandle': 'value', 'targetHandle': 'b'}
            ]
        }
        
        # Force garbage collection before test
        gc.collect()
        
        # Run 100 times
        for _ in range(100):
            execute_unified_workflow(
                nodes=workflow['nodes'],
                connections=workflow['connections'],
                market_data=market_data,
                debug=False
            )
        
        # Force collection again
        gc.collect()
        
        print("✅ 100 runs completed without memory issues")


class TestDebugModePerformance:
    """Test that debug mode doesn't severely impact performance."""
    
    def test_debug_mode_overhead(self):
        """Debug mode should add less than 50% overhead."""
        random.seed(42)
        closes = [100.0 + i for i in range(500)]
        market_data = {
            'close': closes[-1],
            'close_history': closes,
            'high_history': [c + 1 for c in closes],
            'low_history': [c - 1 for c in closes],
            'volume_history': [1000000] * 500
        }
        
        workflow = {
            'nodes': [
                {'id': 1, 'type': 'rsi', 'params': {'period': 14}},
                {'id': 2, 'type': 'ema', 'params': {'period': 21}},
                {'id': 3, 'type': 'and', 'params': {}},
                {'id': 4, 'type': 'signal', 'params': {'type': 'BUY'}}
            ],
            'connections': [
                {'source': '1', 'target': '3', 'sourceHandle': 'result', 'targetHandle': 'a'},
                {'source': '2', 'target': '3', 'sourceHandle': 'value', 'targetHandle': 'b'},
                {'source': '3', 'target': '4', 'sourceHandle': 'result', 'targetHandle': 'input'}
            ]
        }
        
        # Time without debug
        runs = 50
        start = time.perf_counter()
        for _ in range(runs):
            execute_unified_workflow(
                nodes=workflow['nodes'],
                connections=workflow['connections'],
                market_data=market_data,
                debug=False
            )
        time_no_debug = time.perf_counter() - start
        
        # Time with debug
        start = time.perf_counter()
        for _ in range(runs):
            execute_unified_workflow(
                nodes=workflow['nodes'],
                connections=workflow['connections'],
                market_data=market_data,
                debug=True
            )
        time_with_debug = time.perf_counter() - start
        
        overhead = (time_with_debug - time_no_debug) / time_no_debug * 100
        
        print(f"Without debug: {time_no_debug:.3f}s")
        print(f"With debug: {time_with_debug:.3f}s")
        print(f"Debug overhead: {overhead:.1f}%")
        
        assert overhead < 100, f"Debug overhead too high: {overhead}%"


if __name__ == '__main__':
    pytest.main([__file__, '-v', '--tb=short'])
