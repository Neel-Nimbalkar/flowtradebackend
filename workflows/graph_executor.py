"""
Graph-based workflow executor that processes node connections.
Replaces sequential workflow_engine.py for signal generation in backtesting.

This module properly handles:
- Node dependencies via connections
- Topological sorting for correct execution order
- Logic gates (AND, OR, NOT) with actual boolean inputs
- Compare nodes with actual numeric values
- Signal inference based on indicator conditions
"""

from typing import Dict, List, Any, Optional, Tuple
import logging

logger = logging.getLogger(__name__)


class GraphExecutor:
    """
    Executes workflows as directed acyclic graphs (DAGs).
    
    Key features:
    - Respects connections between nodes
    - Processes nodes in topological order
    - Evaluates logic gates with actual inputs
    - Extracts final signal from OUTPUT node
    """
    
    def __init__(
        self,
        nodes: List[Dict],
        connections: List[Dict],
        market_data: Dict,
        indicator_values: Dict[str, Dict[int, Any]] = None,
        debug: bool = False
    ):
        """
        Initialize the graph executor.
        
        Args:
            nodes: List of node dictionaries with id, type, params
            connections: List of connection dicts with from/to nodeId/port
            market_data: Dict with close, close_history, volume, etc.
            indicator_values: Pre-calculated indicator values by type and node_id
            debug: Enable debug logging
        """
        self.nodes = {n.get('id'): n for n in nodes}
        self.connections = connections
        self.market_data = market_data
        self.indicator_values = indicator_values or {}
        self.debug = debug
        
        # Node outputs: node_id -> {port: value}
        self.node_outputs: Dict[int, Dict[str, Any]] = {}
        
        # Build dependency graph
        self.dependencies = self._build_dependencies()
        
    def execute(self) -> Tuple[Optional[str], Dict]:
        """
        Execute the workflow graph and return final signal.
        
        Returns:
            Tuple of (signal, debug_info) where signal is 'BUY', 'SELL', or None
        """
        debug_info = {
            'nodes_processed': [],
            'signal_direction': None,
            'output_value': None
        }
        
        try:
            # 1. Topological sort
            sorted_nodes = self._topological_sort()
            
            if self.debug:
                logger.info(f"[GraphExecutor] Processing {len(sorted_nodes)} nodes in order")
            
            # 2. Execute nodes in order
            for node_id in sorted_nodes:
                result = self._execute_node(node_id)
                debug_info['nodes_processed'].append({
                    'id': node_id,
                    'type': self.nodes[node_id].get('type'),
                    'output': result
                })
            
            # 3. Extract final signal from OUTPUT node
            signal, direction = self._get_final_signal()
            debug_info['signal_direction'] = direction
            debug_info['output_value'] = self._get_output_value()
            
            return signal, debug_info
            
        except Exception as e:
            logger.error(f"[GraphExecutor] Execution error: {e}")
            debug_info['error'] = str(e)
            return None, debug_info
    
    def _build_dependencies(self) -> Dict[int, List[Tuple[int, str, str]]]:
        """
        Build dependency graph from connections.
        
        Returns:
            Dict mapping node_id -> [(source_node_id, source_port, target_port)]
        """
        deps = {node_id: [] for node_id in self.nodes.keys()}
        
        for conn in self.connections:
            from_info = conn.get('from', {})
            to_info = conn.get('to', {})
            
            from_node = from_info.get('nodeId')
            to_node = to_info.get('nodeId')
            from_port = from_info.get('port', 'output')
            to_port = to_info.get('port', 'input')
            
            if from_node is not None and to_node is not None:
                if to_node in deps:
                    deps[to_node].append((from_node, from_port, to_port))
        
        return deps
    
    def _topological_sort(self) -> List[int]:
        """
        Sort nodes in execution order using Kahn's algorithm.
        Nodes with no dependencies come first.
        """
        # Calculate in-degree for each node
        in_degree = {node_id: len(deps) for node_id, deps in self.dependencies.items()}
        
        # Start with nodes that have no dependencies
        queue = [node_id for node_id, degree in in_degree.items() if degree == 0]
        sorted_nodes = []
        
        while queue:
            node_id = queue.pop(0)
            sorted_nodes.append(node_id)
            
            # Reduce in-degree for nodes that depend on this one
            for target_id, deps in self.dependencies.items():
                for (source_id, _, _) in deps:
                    if source_id == node_id:
                        in_degree[target_id] -= 1
                        if in_degree[target_id] == 0 and target_id not in sorted_nodes:
                            queue.append(target_id)
        
        # Add any remaining nodes (disconnected)
        for node_id in self.nodes.keys():
            if node_id not in sorted_nodes:
                sorted_nodes.append(node_id)
        
        return sorted_nodes
    
    def _get_node_inputs(self, node_id: int) -> Dict[str, Any]:
        """
        Get all input values for a node from its connected parents.
        
        Returns:
            Dict mapping port_name -> value
        """
        inputs = {}
        
        for (source_id, source_port, target_port) in self.dependencies.get(node_id, []):
            if source_id in self.node_outputs:
                source_outputs = self.node_outputs[source_id]
                
                # Try to get the specific port value
                if source_port in source_outputs:
                    inputs[target_port] = source_outputs[source_port]
                # Fall back to common output names
                elif 'value' in source_outputs:
                    inputs[target_port] = source_outputs['value']
                elif 'result' in source_outputs:
                    inputs[target_port] = source_outputs['result']
                elif 'signal' in source_outputs:
                    inputs[target_port] = source_outputs['signal']
        
        return inputs
    
    def _execute_node(self, node_id: int) -> Dict[str, Any]:
        """
        Execute a single node and store its outputs.
        """
        node = self.nodes.get(node_id)
        if not node:
            return {}
        
        node_type = node.get('type', '')
        params = node.get('params', {}) or node.get('configValues', {}) or {}
        inputs = self._get_node_inputs(node_id)
        
        outputs = {}
        
        # ═══════════════════════════════════════════════════════════════════
        # INPUT NODES - Provide market data
        # ═══════════════════════════════════════════════════════════════════
        if node_type == 'input':
            outputs = {
                'prices': self.market_data.get('close'),
                'close': self.market_data.get('close'),
                'price': self.market_data.get('close'),
                'open': self.market_data.get('open'),
                'high': self.market_data.get('high'),
                'low': self.market_data.get('low'),
                'value': self.market_data.get('close')
            }
        
        elif node_type == 'volume_history':
            outputs = {
                'volumes': self.market_data.get('volume'),
                'volume': self.market_data.get('volume'),
                'value': self.market_data.get('volume')
            }
        
        # ═══════════════════════════════════════════════════════════════════
        # INDICATOR NODES - Use pre-calculated values
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'ema':
            ema_values = self.indicator_values.get('ema', {})
            if self.debug:
                logger.info(f"  [EMA] Node {node_id}: Looking up in ema_values. Keys={list(ema_values.keys())}, node_id type={type(node_id)}")
            if node_id in ema_values:
                val = ema_values[node_id]
                outputs = {'ema': val, 'value': val}
                if self.debug:
                    logger.info(f"  [EMA] Node {node_id}: Found value={val}")
            else:
                # Try string key as fallback
                str_node_id = str(node_id)
                if str_node_id in ema_values:
                    val = ema_values[str_node_id]
                    outputs = {'ema': val, 'value': val}
                    if self.debug:
                        logger.info(f"  [EMA] Node {node_id}: Found via string key value={val}")
                else:
                    if self.debug:
                        logger.warning(f"  [EMA] Node {node_id}: NOT FOUND in ema_values!")
        
        elif node_type == 'sma':
            sma_values = self.indicator_values.get('sma', {})
            if node_id in sma_values:
                val = sma_values[node_id]
                outputs = {'sma': val, 'value': val}
        
        elif node_type == 'rsi':
            rsi_values = self.indicator_values.get('rsi', {})
            if node_id in rsi_values:
                val = rsi_values[node_id]
                oversold = float(params.get('oversold', 30))
                overbought = float(params.get('overbought', 70))
                outputs = {
                    'rsi': val,
                    'value': val,
                    'signal': val < oversold or val > overbought,
                    'oversold': val < oversold,
                    'overbought': val > overbought
                }
        
        elif node_type == 'macd':
            macd_values = self.indicator_values.get('macd', {})
            if node_id in macd_values:
                macd_data = macd_values[node_id]
                hist = macd_data.get('histogram', 0)
                outputs = {
                    'macd': macd_data.get('macd'),
                    'signal': macd_data.get('signal'),
                    'histogram': hist,
                    'value': hist,
                    'result': hist > 0 if hist else False
                }
        
        elif node_type in ['bollinger', 'bollingerBands']:
            bb_values = self.indicator_values.get('bollinger', {})
            if node_id in bb_values:
                bb_data = bb_values[node_id]
                close = self.market_data.get('close', 0)
                outputs = {
                    'upper': bb_data.get('upper'),
                    'middle': bb_data.get('middle'),
                    'lower': bb_data.get('lower'),
                    'value': bb_data.get('middle'),
                    'signal': close < bb_data.get('lower', 0) or close > bb_data.get('upper', float('inf'))
                }
        
        elif node_type == 'vwap':
            vwap_values = self.indicator_values.get('vwap', {})
            if node_id in vwap_values:
                val = vwap_values[node_id]
                close = self.market_data.get('close', 0)
                outputs = {
                    'vwap': val,
                    'value': val,
                    'signal': close > val  # Above VWAP = bullish
                }
        
        elif node_type == 'volume_spike':
            vol_spike_values = self.indicator_values.get('volume_spike', {})
            if node_id in vol_spike_values:
                val = vol_spike_values[node_id]
                outputs = {
                    'spike': val,
                    'signal': val,
                    'result': val,
                    'value': val
                }
        
        # ═══════════════════════════════════════════════════════════════════
        # LOGIC NODES - Process inputs
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'compare':
            a_val = inputs.get('a') or inputs.get('value') or inputs.get('input')
            b_val = inputs.get('b')
            
            # If b is not connected, try to get it from params (threshold/value)
            if b_val is None:
                b_val = params.get('value') or params.get('threshold') or params.get('b')
            
            if a_val is not None and b_val is not None:
                try:
                    # Convert to numeric if possible
                    a_num = float(a_val) if not isinstance(a_val, bool) else (1.0 if a_val else 0.0)
                    b_num = float(b_val) if not isinstance(b_val, bool) else (1.0 if b_val else 0.0)
                    
                    operator = params.get('operator', '>')
                    
                    if operator == '>':
                        result = a_num > b_num
                    elif operator == '>=':
                        result = a_num >= b_num
                    elif operator == '<':
                        result = a_num < b_num
                    elif operator == '<=':
                        result = a_num <= b_num
                    elif operator == '==':
                        result = abs(a_num - b_num) < 0.0001
                    elif operator == '!=':
                        result = abs(a_num - b_num) >= 0.0001
                    else:
                        result = False
                    
                    outputs = {'result': result, 'value': result}
                    
                    if self.debug:
                        logger.info(f"  [COMPARE] Node {node_id}: {a_num:.2f} {operator} {b_num:.2f} = {result}")
                        
                except (ValueError, TypeError) as e:
                    outputs = {'result': False, 'value': False}
                    if self.debug:
                        logger.warning(f"  [COMPARE] Node {node_id}: Error comparing {a_val} and {b_val}: {e}")
            else:
                outputs = {'result': False, 'value': False}
                if self.debug:
                    logger.warning(f"  [COMPARE] Node {node_id}: Missing inputs a={a_val}, b={b_val}")
        
        elif node_type == 'and':
            a_val = inputs.get('a')
            b_val = inputs.get('b')
            
            if a_val is not None and b_val is not None:
                a_bool = bool(a_val) if not isinstance(a_val, bool) else a_val
                b_bool = bool(b_val) if not isinstance(b_val, bool) else b_val
                result = a_bool and b_bool
                outputs = {'result': result, 'value': result}
                
                if self.debug:
                    logger.info(f"  [AND] Node {node_id}: {a_bool} AND {b_bool} = {result}")
            else:
                # Check if there are any inputs at all
                all_inputs = list(inputs.values())
                if all_inputs:
                    result = all(bool(v) for v in all_inputs if v is not None)
                    outputs = {'result': result, 'value': result}
                else:
                    outputs = {'result': False, 'value': False}
        
        elif node_type == 'or':
            a_val = inputs.get('a')
            b_val = inputs.get('b')
            
            if a_val is not None and b_val is not None:
                a_bool = bool(a_val) if not isinstance(a_val, bool) else a_val
                b_bool = bool(b_val) if not isinstance(b_val, bool) else b_val
                result = a_bool or b_bool
                outputs = {'result': result, 'value': result}
                
                if self.debug:
                    logger.info(f"  [OR] Node {node_id}: {a_bool} OR {b_bool} = {result}")
            else:
                all_inputs = list(inputs.values())
                if all_inputs:
                    result = any(bool(v) for v in all_inputs if v is not None)
                    outputs = {'result': result, 'value': result}
                else:
                    outputs = {'result': False, 'value': False}
        
        elif node_type == 'not':
            a_val = inputs.get('a') or inputs.get('input')
            
            if a_val is not None:
                a_bool = bool(a_val) if not isinstance(a_val, bool) else a_val
                result = not a_bool
                outputs = {'result': result, 'value': result}
            else:
                outputs = {'result': True, 'value': True}  # NOT(nothing) = True
        
        elif node_type == 'threshold':
            value = inputs.get('value') or inputs.get('a') or inputs.get('input')
            
            if value is not None:
                try:
                    val_num = float(value)
                    threshold = float(params.get('threshold', params.get('value', 0)))
                    direction = params.get('direction', 'above').lower()
                    
                    if direction == 'above':
                        result = val_num > threshold
                    else:
                        result = val_num < threshold
                    
                    outputs = {'result': result, 'value': result}
                    
                    if self.debug:
                        logger.info(f"  [THRESHOLD] Node {node_id}: {val_num:.2f} {direction} {threshold} = {result}")
                except (ValueError, TypeError):
                    outputs = {'result': False, 'value': False}
            else:
                outputs = {'result': False, 'value': False}
        
        elif node_type == 'crossover':
            fast = inputs.get('fast') or inputs.get('a')
            slow = inputs.get('slow') or inputs.get('b')
            
            if fast is not None and slow is not None:
                try:
                    direction = params.get('direction', 'bullish').lower()
                    if direction == 'bullish':
                        result = float(fast) > float(slow)
                    else:
                        result = float(fast) < float(slow)
                    outputs = {'result': result, 'value': result}
                except (ValueError, TypeError):
                    outputs = {'result': False, 'value': False}
            else:
                outputs = {'result': False, 'value': False}
        
        # ═══════════════════════════════════════════════════════════════════
        # OUTPUT NODE - Collect final signal
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'output':
            signal_input = inputs.get('signal') or inputs.get('input') or inputs.get('a')
            
            if signal_input is not None:
                signal_bool = bool(signal_input) if not isinstance(signal_input, bool) else signal_input
                outputs = {'result': signal_bool, 'signal': signal_bool, 'value': signal_bool}
            else:
                outputs = {'result': False, 'signal': False, 'value': False}
        
        # ═══════════════════════════════════════════════════════════════════
        # NOTE NODE - Skip (visual only)
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'note':
            outputs = {}  # Notes have no outputs
        
        # Store outputs
        self.node_outputs[node_id] = outputs
        return outputs
    
    def _get_output_value(self) -> Optional[bool]:
        """Get the boolean value from the OUTPUT node."""
        for node_id, node in self.nodes.items():
            if node.get('type') == 'output':
                outputs = self.node_outputs.get(node_id, {})
                return outputs.get('result') or outputs.get('signal')
        return None
    
    def _get_final_signal(self) -> Tuple[Optional[str], str]:
        """
        Extract BUY/SELL signal from OUTPUT node.
        
        Returns:
            Tuple of (signal, direction_reasoning)
        """
        output_value = self._get_output_value()
        
        if not output_value:
            return None, "Output is False or missing"
        
        # Output node returned True - now determine signal direction
        
        # Check for explicit signal in output node params
        for node_id, node in self.nodes.items():
            if node.get('type') == 'output':
                params = node.get('params', {}) or node.get('configValues', {}) or {}
                explicit = params.get('signal') or params.get('action')
                if explicit and explicit.upper() in ['BUY', 'SELL', 'LONG', 'SHORT']:
                    signal = 'BUY' if explicit.upper() in ['BUY', 'LONG'] else 'SELL'
                    return signal, f"Explicit output signal: {explicit}"
        
        # Infer direction from indicator conditions
        direction = self._infer_signal_direction()
        return direction, f"Inferred from indicators"
    
    def _infer_signal_direction(self) -> str:
        """
        Infer whether True condition means BUY or SELL based on indicator states.
        
        Heuristics:
        1. RSI < oversold → BUY, RSI > overbought → SELL
        2. EMA fast > slow (bullish crossover) → BUY
        3. MACD histogram positive → BUY
        4. Price above VWAP → BUY
        5. Price below lower Bollinger → BUY (mean reversion)
        """
        
        # Check RSI conditions
        rsi_values = self.indicator_values.get('rsi', {})
        for node_id, rsi_val in rsi_values.items():
            node = self.nodes.get(node_id, {})
            params = node.get('params', {}) or node.get('configValues', {}) or {}
            oversold = float(params.get('oversold', 30))
            overbought = float(params.get('overbought', 70))
            
            if rsi_val < oversold:
                return 'BUY'
            elif rsi_val > overbought:
                return 'SELL'
        
        # Check EMA crossover direction
        ema_values = self.indicator_values.get('ema', {})
        if len(ema_values) >= 2:
            # Sort by period to identify fast vs slow
            ema_with_periods = []
            for node_id, ema_val in ema_values.items():
                node = self.nodes.get(node_id, {})
                params = node.get('params', {}) or node.get('configValues', {}) or {}
                period = int(params.get('period', 20))
                ema_with_periods.append((period, ema_val))
            
            ema_with_periods.sort(key=lambda x: x[0])  # Sort by period
            if len(ema_with_periods) >= 2:
                fast_ema = ema_with_periods[0][1]  # Shortest period
                slow_ema = ema_with_periods[1][1]  # Longer period
                
                if fast_ema > slow_ema:
                    return 'BUY'  # Bullish crossover
                else:
                    return 'SELL'  # Bearish crossover
        
        # Check MACD
        macd_values = self.indicator_values.get('macd', {})
        for node_id, macd_data in macd_values.items():
            hist = macd_data.get('histogram', 0)
            if hist is not None:
                return 'BUY' if hist > 0 else 'SELL'
        
        # Check VWAP position
        vwap_values = self.indicator_values.get('vwap', {})
        close = self.market_data.get('close', 0)
        for node_id, vwap_val in vwap_values.items():
            if close > vwap_val:
                return 'BUY'
            else:
                return 'SELL'
        
        # Check Bollinger Bands
        bb_values = self.indicator_values.get('bollinger', {})
        for node_id, bb_data in bb_values.items():
            upper = bb_data.get('upper', float('inf'))
            lower = bb_data.get('lower', 0)
            
            if close < lower:
                return 'BUY'  # Oversold, expect bounce
            elif close > upper:
                return 'SELL'  # Overbought, expect reversal
        
        # Default to BUY if we can't determine direction
        return 'BUY'


def execute_workflow_graph(
    nodes: List[Dict],
    connections: List[Dict],
    market_data: Dict,
    indicator_values: Dict[str, Dict[int, Any]],
    debug: bool = False
) -> Tuple[Optional[str], Dict]:
    """
    Convenience function to execute a workflow graph.
    
    Args:
        nodes: List of node dictionaries
        connections: List of connection dictionaries
        market_data: Current bar data
        indicator_values: Pre-calculated indicator values
        debug: Enable debug logging
        
    Returns:
        Tuple of (signal, debug_info)
    """
    executor = GraphExecutor(
        nodes=nodes,
        connections=connections,
        market_data=market_data,
        indicator_values=indicator_values,
        debug=debug
    )
    return executor.execute()
