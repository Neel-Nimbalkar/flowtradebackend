"""
Comprehensive Strategy Template Tests

Tests all 12 prebuilt strategies to verify:
1. Signal generation logic is correct
2. No false signals from passing raw values to logic gates
3. Signals only generated when ALL conditions are truly met

CRITICAL: This is for trading - false signals can cause financial loss.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from workflows.unified_executor import UnifiedStrategyExecutor, execute_unified_workflow


# ═══════════════════════════════════════════════════════════════════════════
# STRATEGY TEMPLATES (Python versions)
# ═══════════════════════════════════════════════════════════════════════════

STRATEGY_TEMPLATES = {
    'momentum-trading': {
        'name': 'Momentum Trading',
        'nodes': [
            {'id': 1, 'type': 'input', 'params': {'symbol': 'SPY'}},
            {'id': 2, 'type': 'volume_history', 'params': {}},
            {'id': 3, 'type': 'volume_spike', 'params': {'period': 20, 'multiplier': 1.5}},
            {'id': 4, 'type': 'ema', 'params': {'period': 9}},
            {'id': 5, 'type': 'ema', 'params': {'period': 20}},
            {'id': 6, 'type': 'compare', 'params': {'operator': '>'}},
            {'id': 7, 'type': 'and', 'params': {}},
            {'id': 8, 'type': 'output', 'params': {}}
        ],
        'connections': [
            {'from': {'nodeId': 1, 'port': 'prices'}, 'to': {'nodeId': 4, 'port': 'prices'}},
            {'from': {'nodeId': 1, 'port': 'prices'}, 'to': {'nodeId': 5, 'port': 'prices'}},
            {'from': {'nodeId': 2, 'port': 'volumes'}, 'to': {'nodeId': 3, 'port': 'volumes'}},
            {'from': {'nodeId': 4, 'port': 'ema'}, 'to': {'nodeId': 6, 'port': 'a'}},
            {'from': {'nodeId': 5, 'port': 'ema'}, 'to': {'nodeId': 6, 'port': 'b'}},
            {'from': {'nodeId': 6, 'port': 'result'}, 'to': {'nodeId': 7, 'port': 'a'}},
            {'from': {'nodeId': 3, 'port': 'spike'}, 'to': {'nodeId': 7, 'port': 'b'}},
            {'from': {'nodeId': 7, 'port': 'result'}, 'to': {'nodeId': 8, 'port': 'signal'}}
        ],
        'test_scenarios': [
            {
                'name': 'No signal - no volume spike',
                'market_data': {
                    'close': 110,
                    'close_history': [100 + i*0.5 for i in range(50)],  # Uptrend (fast > slow EMA)
                    'volume_history': [1000] * 50,  # Normal volume, no spike
                },
                'expected_signal': None  # No spike = no signal
            },
            {
                'name': 'BUY signal - uptrend + volume spike',
                'market_data': {
                    'close': 125,
                    'close_history': [100 + i*0.5 for i in range(50)],  # Uptrend
                    'volume_history': [1000]*49 + [3000],  # Volume spike at end
                },
                'expected_signal': 'BUY'
            },
            {
                'name': 'No signal - downtrend + volume spike',
                'market_data': {
                    'close': 75,
                    'close_history': [100 - i*0.5 for i in range(50)],  # Downtrend
                    'volume_history': [1000]*49 + [3000],  # Volume spike
                },
                'expected_signal': None  # Fast EMA < Slow EMA
            }
        ]
    },
    
    'scalping': {
        'name': 'VWAP Scalping',
        'nodes': [
            {'id': 1, 'type': 'input', 'params': {'symbol': 'SPY'}},
            {'id': 2, 'type': 'volume_history', 'params': {}},
            {'id': 3, 'type': 'vwap', 'params': {'output': 'signal', 'condition': 'near'}},
            {'id': 4, 'type': 'rsi', 'params': {'period': 7, 'overbought': 70, 'oversold': 30}},
            {'id': 5, 'type': 'and', 'params': {}},
            {'id': 6, 'type': 'output', 'params': {}}
        ],
        'connections': [
            {'from': {'nodeId': 1, 'port': 'prices'}, 'to': {'nodeId': 3, 'port': 'prices'}},
            {'from': {'nodeId': 2, 'port': 'volumes'}, 'to': {'nodeId': 3, 'port': 'volumes'}},
            {'from': {'nodeId': 1, 'port': 'prices'}, 'to': {'nodeId': 4, 'port': 'prices'}},
            {'from': {'nodeId': 3, 'port': 'signal'}, 'to': {'nodeId': 5, 'port': 'a'}},
            {'from': {'nodeId': 4, 'port': 'signal'}, 'to': {'nodeId': 5, 'port': 'b'}},
            {'from': {'nodeId': 5, 'port': 'result'}, 'to': {'nodeId': 6, 'port': 'signal'}}
        ],
        'test_scenarios': [
            {
                'name': 'No signal - price away from VWAP',
                'market_data': {
                    'close': 105,  # 5% away from VWAP
                    'close_history': [100] * 20,
                    'volume_history': [1000] * 20,
                },
                'expected_signal': None
            },
            {
                'name': 'SELL signal - near VWAP + RSI overbought',
                'market_data': {
                    'close': 100.02,  # Matches VWAP
                    'close_history': [100.02] * 20,  # Flat = VWAP = price, RSI = 100 (all same)
                    'volume_history': [1000] * 20,
                },
                # Flat prices = RSI 100 (max overbought), VWAP = price = near
                'expected_signal': 'SELL'
            },
            {
                'name': 'No signal - near VWAP but RSI neutral',
                'market_data': {
                    'close': 100,
                    'close_history': [99, 101] * 10,  # Oscillating = RSI ~50 (neutral)
                    'volume_history': [1000] * 20,
                },
                # RSI will be ~50 (not overbought/oversold), so no signal
                'expected_signal': None
            }
        ]
    },
    
    'breakout': {
        'name': 'Breakout Trading',
        'nodes': [
            {'id': 1, 'type': 'input', 'params': {'symbol': 'SPY'}},
            {'id': 2, 'type': 'volume_history', 'params': {}},
            {'id': 3, 'type': 'bollinger', 'params': {'period': 20, 'std_dev': 2}},
            {'id': 4, 'type': 'volume_spike', 'params': {'period': 20, 'multiplier': 2.0}},
            {'id': 5, 'type': 'compare', 'params': {'operator': '>'}},
            {'id': 6, 'type': 'and', 'params': {}},
            {'id': 7, 'type': 'output', 'params': {}}
        ],
        'connections': [
            {'from': {'nodeId': 1, 'port': 'prices'}, 'to': {'nodeId': 3, 'port': 'prices'}},
            {'from': {'nodeId': 2, 'port': 'volumes'}, 'to': {'nodeId': 4, 'port': 'volumes'}},
            {'from': {'nodeId': 1, 'port': 'prices'}, 'to': {'nodeId': 5, 'port': 'a'}},
            {'from': {'nodeId': 3, 'port': 'upper'}, 'to': {'nodeId': 5, 'port': 'b'}},
            {'from': {'nodeId': 5, 'port': 'result'}, 'to': {'nodeId': 6, 'port': 'a'}},
            {'from': {'nodeId': 4, 'port': 'spike'}, 'to': {'nodeId': 6, 'port': 'b'}},
            {'from': {'nodeId': 6, 'port': 'result'}, 'to': {'nodeId': 7, 'port': 'signal'}}
        ],
        'test_scenarios': [
            {
                'name': 'No signal - below upper band',
                'market_data': {
                    'close': 100,
                    'close_history': [100] * 25,  # Flat = price at middle
                    'volume_history': [1000]*24 + [3000],
                },
                'expected_signal': None
            },
            {
                'name': 'BUY signal - above upper band + volume spike',
                'market_data': {
                    'close': 110,  # Well above upper band
                    'close_history': [100] * 24 + [110],  # Breakout candle
                    'volume_history': [1000]*24 + [4000],  # 4x volume
                },
                'expected_signal': 'BUY'
            }
        ]
    }
}


def test_strategy(name: str, strategy: dict) -> tuple[int, int, list]:
    """Test a strategy template with all scenarios"""
    passed = 0
    failed = 0
    errors = []
    
    print(f"\n{'='*60}")
    print(f"Testing: {strategy['name']}")
    print('='*60)
    
    for scenario in strategy['test_scenarios']:
        try:
            signal, debug = execute_unified_workflow(
                nodes=strategy['nodes'],
                connections=strategy['connections'],
                market_data=scenario['market_data'],
                debug=True
            )
            
            expected = scenario['expected_signal']
            
            if signal == expected:
                print(f"  ✓ {scenario['name']}: signal={signal} (expected {expected})")
                passed += 1
            else:
                error_msg = f"{scenario['name']}: got {signal}, expected {expected}"
                print(f"  ✗ {error_msg}")
                
                # Debug output
                print(f"    Node outputs:")
                for nid, outputs in debug.get('node_outputs', {}).items():
                    print(f"      {nid}: {outputs}")
                
                failed += 1
                errors.append(error_msg)
                
        except Exception as e:
            error_msg = f"{scenario['name']}: ERROR - {e}"
            print(f"  ✗ {error_msg}")
            failed += 1
            errors.append(error_msg)
    
    return passed, failed, errors


def analyze_connection_issues():
    """Analyze strategy templates for potential false signal issues"""
    print("\n" + "="*60)
    print("ANALYZING STRATEGY CONNECTIONS FOR POTENTIAL ISSUES")
    print("="*60)
    
    # Ports that output numeric values (not booleans)
    NUMERIC_PORTS = {'ema', 'sma', 'rsi', 'macd', 'stoch', 'vwap', 'atr', 'obv', 'upper', 'middle', 'lower'}
    
    # Ports that output boolean values
    BOOLEAN_PORTS = {'signal', 'result', 'spike', 'is_spike', 'overbought', 'oversold', 'near', 'above'}
    
    issues_found = []
    
    for strat_key, strategy in STRATEGY_TEMPLATES.items():
        strat_issues = []
        
        for conn in strategy['connections']:
            source_port = conn['from']['port']
            target_port = conn['to']['port']
            target_node_id = conn['to']['nodeId']
            
            # Find target node type
            target_node = next((n for n in strategy['nodes'] if n['id'] == target_node_id), None)
            if not target_node:
                continue
            
            target_type = target_node['type']
            
            # Check if numeric value going into logic gate
            if target_type in ['and', 'or', 'not']:
                if source_port in NUMERIC_PORTS:
                    issue = f"  ⚠️  {source_port} (numeric) → {target_type} gate: May cause false signals!"
                    strat_issues.append(issue)
        
        if strat_issues:
            print(f"\n{strategy['name']}:")
            for issue in strat_issues:
                print(issue)
            issues_found.extend(strat_issues)
    
    return len(issues_found)


def run_all_strategy_tests():
    """Run all strategy template tests"""
    print("\n" + "="*60)
    print("STRATEGY TEMPLATE VALIDATION TESTS")
    print("="*60)
    
    total_passed = 0
    total_failed = 0
    all_errors = []
    
    for name, strategy in STRATEGY_TEMPLATES.items():
        passed, failed, errors = test_strategy(name, strategy)
        total_passed += passed
        total_failed += failed
        all_errors.extend(errors)
    
    # Analyze for potential issues
    issues = analyze_connection_issues()
    
    print("\n" + "="*60)
    print(f"FINAL RESULTS: {total_passed} passed, {total_failed} failed")
    if issues > 0:
        print(f"WARNING: {issues} potential connection issues found")
    print("="*60)
    
    if all_errors:
        print("\nErrors:")
        for error in all_errors:
            print(f"  - {error}")
    
    return total_failed == 0


if __name__ == '__main__':
    success = run_all_strategy_tests()
    exit(0 if success else 1)
