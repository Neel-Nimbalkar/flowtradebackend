"""
UnifiedStrategyExecutor - Single execution engine for both backtesting and live signals.

PRINCIPLE: Same strategy + Same data = Same result (backtest or live)

This module provides a graph-based workflow executor that:
- Parses workflow nodes and connections
- Builds dependency graph from connections
- Topologically sorts nodes for execution order
- Calculates indicator values (EMA, RSI, MACD, Bollinger, etc.)
- Passes outputs from source nodes to target nodes via ports
- Evaluates logic gates (AND, OR, NOT, Compare) with actual inputs
- Returns final signal (BUY, SELL, or None)
"""

from typing import Dict, List, Any, Optional, Tuple
from collections import defaultdict, deque
import logging

logger = logging.getLogger(__name__)


class UnifiedStrategyExecutor:
    """
    Unified graph-based workflow executor for trading strategies.
    
    Used by BOTH /execute_backtest AND /api/workflows/execute_v2 endpoints
    to ensure identical signal generation.
    """
    
    def __init__(
        self,
        nodes: List[Dict],
        connections: List[Dict],
        market_data: Dict,
        debug: bool = False
    ):
        """
        Initialize the unified executor.
        
        Args:
            nodes: List of node dictionaries with id, type, params/configValues
            connections: List of connection dicts with from/to nodeId/port
            market_data: Dict with:
                - close: Current bar close price (float)
                - close_history: Array of historical closes for indicator calculation
                - high_history: Array of historical highs (optional)
                - low_history: Array of historical lows (optional)
                - volume_history: Array of historical volumes (optional)
                - open, high, low, volume: Current bar values
                - timestamp: Current bar timestamp
            debug: Enable debug logging
        """
        self.debug = debug
        self.market_data = market_data
        
        # Normalize nodes - create lookup by ID
        self.nodes = {}
        for n in nodes:
            node_id = self._normalize_id(n.get('id'))
            self.nodes[node_id] = {
                'id': node_id,
                'type': n.get('type', '').lower(),
                'params': n.get('params') or n.get('configValues') or {}
            }
        
        # Normalize and store connections
        self.connections = self._normalize_connections(connections)
        
        # Build dependency graph
        self.children, self.parents = self._build_graph()
        
        # Node outputs: node_id -> {port: value}
        self.node_outputs: Dict[int, Dict[str, Any]] = {}
        
        # Track signal direction context for inference
        self.signal_context = {
            'rsi_oversold': False,
            'rsi_overbought': False,
            'ema_bullish': False,
            'ema_bearish': False,
            'macd_bullish': False,
            'macd_bearish': False,
        }
    
    def _to_strict_bool(self, value: Any) -> bool:
        """
        Convert value to boolean with STRICT rules.
        
        CRITICAL: Only treats True, 1, 1.0 as True.
        Raw indicator values (RSI=52, EMA=150) are NOT truthy for logic gates.
        
        This prevents false signals from passing numeric indicator values
        directly to logic gates.
        """
        if value is None:
            return False
        if isinstance(value, bool):
            return value
        if isinstance(value, (int, float)):
            # Only 1 or 1.0 is True (output of compare/logic gates)
            return value == 1 or value == 1.0
        # For strings or other types, use standard bool
        return bool(value)
    
    def _normalize_id(self, node_id: Any) -> int:
        """Normalize node ID to integer."""
        if node_id is None:
            return -1
        if isinstance(node_id, int):
            return node_id
        if isinstance(node_id, str):
            try:
                return int(node_id)
            except ValueError:
                # Hash string IDs
                return hash(node_id) % 1000000
        return int(node_id)
    
    def _normalize_connections(self, connections: List[Dict]) -> List[Dict]:
        """
        Normalize connection formats to consistent structure.
        
        Handles:
        - {from: {nodeId, port}, to: {nodeId, port}} format
        - {source, target, sourcePort, targetPort} format
        - String vs integer node IDs
        """
        normalized = []
        
        for conn in connections:
            # Handle {from: {nodeId, port}, to: {nodeId, port}} format
            if 'from' in conn and 'to' in conn:
                from_info = conn.get('from', {})
                to_info = conn.get('to', {})
                
                normalized.append({
                    'source_node': self._normalize_id(from_info.get('nodeId')),
                    'source_port': from_info.get('port', 'value'),
                    'target_node': self._normalize_id(to_info.get('nodeId')),
                    'target_port': to_info.get('port', 'input')
                })
            
            # Handle {source, target, sourcePort, targetPort} format
            elif 'source' in conn and 'target' in conn:
                normalized.append({
                    'source_node': self._normalize_id(conn.get('source')),
                    'source_port': conn.get('sourcePort') or conn.get('sourceHandle', 'value'),
                    'target_node': self._normalize_id(conn.get('target')),
                    'target_port': conn.get('targetPort') or conn.get('targetHandle', 'input')
                })
            
            # Handle {sourceNode, targetNode} format
            elif 'sourceNode' in conn and 'targetNode' in conn:
                normalized.append({
                    'source_node': self._normalize_id(conn.get('sourceNode')),
                    'source_port': conn.get('sourcePort', 'value'),
                    'target_node': self._normalize_id(conn.get('targetNode')),
                    'target_port': conn.get('targetPort', 'input')
                })
        
        return normalized
    
    def _build_graph(self) -> Tuple[Dict, Dict]:
        """
        Build adjacency list and reverse adjacency list from connections.
        
        Returns:
            Tuple of (children, parents) where:
            - children: Dict[node_id, List[node_id]] - nodes that depend on this node
            - parents: Dict[node_id, List[Tuple[node_id, source_port, target_port]]] - nodes this depends on
        """
        children = defaultdict(list)  # node -> list of nodes that depend on it
        parents = defaultdict(list)   # node -> list of (source_node, source_port, target_port)
        
        for conn in self.connections:
            source = conn['source_node']
            target = conn['target_node']
            source_port = conn['source_port']
            target_port = conn['target_port']
            
            if source in self.nodes and target in self.nodes:
                children[source].append(target)
                parents[target].append((source, source_port, target_port))
        
        return children, parents
    
    def _topological_sort(self) -> List[int]:
        """
        Sort nodes in execution order using Kahn's algorithm.
        Nodes with no dependencies come first.
        
        Returns:
            List of node IDs in execution order
            
        Raises:
            ValueError: If cycle detected in graph
        """
        # Calculate in-degree for each node
        in_degree = {node_id: 0 for node_id in self.nodes.keys()}
        
        for target, parent_list in self.parents.items():
            in_degree[target] = len(parent_list)
        
        # Start with nodes that have no dependencies (in-degree 0)
        queue = deque([node_id for node_id, degree in in_degree.items() if degree == 0])
        sorted_nodes = []
        
        while queue:
            node_id = queue.popleft()
            sorted_nodes.append(node_id)
            
            # Reduce in-degree for all children
            for child in self.children.get(node_id, []):
                in_degree[child] -= 1
                if in_degree[child] == 0:
                    queue.append(child)
        
        # Check for cycle
        if len(sorted_nodes) != len(self.nodes):
            remaining = set(self.nodes.keys()) - set(sorted_nodes)
            raise ValueError(f"Cycle detected in graph. Remaining nodes: {remaining}")
        
        return sorted_nodes
    
    def _get_node_inputs(self, node_id: int) -> Dict[str, Any]:
        """
        Collect outputs from all parent nodes for a given node.
        
        Returns:
            Dict[port_name, value] - inputs organized by target port
        """
        inputs = {}
        
        for source_id, source_port, target_port in self.parents.get(node_id, []):
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
                # For price inputs, check multiple names
                elif target_port in ['price', 'prices', 'input'] and 'close' in source_outputs:
                    inputs[target_port] = source_outputs['close']
        
        return inputs
    
    # ═══════════════════════════════════════════════════════════════════════════
    # INDICATOR CALCULATIONS
    # ═══════════════════════════════════════════════════════════════════════════
    
    def _calculate_ema(self, prices: List[float], period: int) -> Optional[float]:
        """
        Calculate Exponential Moving Average.
        
        Formula: EMA = price * k + ema_prev * (1 - k), where k = 2 / (period + 1)
        """
        if not prices or len(prices) < period:
            return None
        
        k = 2 / (period + 1)
        
        # Initial EMA is SMA of first 'period' values
        ema = sum(prices[:period]) / period
        
        # Calculate EMA for remaining values
        for price in prices[period:]:
            ema = price * k + ema * (1 - k)
        
        return ema
    
    def _calculate_sma(self, prices: List[float], period: int) -> Optional[float]:
        """Calculate Simple Moving Average."""
        if not prices or len(prices) < period:
            return None
        return sum(prices[-period:]) / period
    
    def _calculate_rsi(self, prices: List[float], period: int = 14) -> Optional[float]:
        """
        Calculate Relative Strength Index.
        
        Formula: RSI = 100 - (100 / (1 + RS)), where RS = avg_gain / avg_loss
        """
        if not prices or len(prices) < period + 1:
            return None
        
        # Calculate price changes
        changes = [prices[i] - prices[i-1] for i in range(1, len(prices))]
        
        # Separate gains and losses
        gains = [max(c, 0) for c in changes]
        losses = [abs(min(c, 0)) for c in changes]
        
        # Initial average gain and loss
        avg_gain = sum(gains[:period]) / period
        avg_loss = sum(losses[:period]) / period
        
        # Smooth averages for remaining values
        for i in range(period, len(changes)):
            avg_gain = (avg_gain * (period - 1) + gains[i]) / period
            avg_loss = (avg_loss * (period - 1) + losses[i]) / period
        
        if avg_loss == 0:
            return 100.0
        
        rs = avg_gain / avg_loss
        rsi = 100 - (100 / (1 + rs))
        
        return rsi
    
    def _calculate_macd(
        self,
        prices: List[float],
        fast: int = 12,
        slow: int = 26,
        signal: int = 9
    ) -> Optional[Dict[str, float]]:
        """
        Calculate MACD indicator.
        
        Returns:
            Dict with 'macd_line', 'signal_line', 'histogram'
        """
        if not prices or len(prices) < slow + signal:
            return None
        
        # Calculate EMAs
        fast_ema = self._calculate_ema(prices, fast)
        slow_ema = self._calculate_ema(prices, slow)
        
        if fast_ema is None or slow_ema is None:
            return None
        
        macd_line = fast_ema - slow_ema
        
        # Calculate signal line (EMA of MACD values)
        # For simplicity, we approximate by using the current MACD value
        # In production, you'd want to track historical MACD values
        signal_line = macd_line * 0.9  # Simplified
        
        # For proper signal line, calculate MACD history
        macd_history = []
        for i in range(slow, len(prices)):
            fast_ema_i = self._calculate_ema(prices[:i+1], fast)
            slow_ema_i = self._calculate_ema(prices[:i+1], slow)
            if fast_ema_i is not None and slow_ema_i is not None:
                macd_history.append(fast_ema_i - slow_ema_i)
        
        if len(macd_history) >= signal:
            signal_line = self._calculate_ema(macd_history, signal)
        
        histogram = macd_line - (signal_line or 0)
        
        return {
            'macd_line': macd_line,
            'signal_line': signal_line,
            'histogram': histogram
        }
    
    def _calculate_bollinger(
        self,
        prices: List[float],
        period: int = 20,
        std_dev: float = 2.0
    ) -> Optional[Dict[str, float]]:
        """
        Calculate Bollinger Bands.
        
        Returns:
            Dict with 'upper', 'middle', 'lower'
        """
        if not prices or len(prices) < period:
            return None
        
        recent_prices = prices[-period:]
        middle = sum(recent_prices) / period
        
        # Calculate standard deviation
        variance = sum((p - middle) ** 2 for p in recent_prices) / period
        std = variance ** 0.5
        
        upper = middle + (std_dev * std)
        lower = middle - (std_dev * std)
        
        return {
            'upper': upper,
            'middle': middle,
            'lower': lower
        }
    
    def _calculate_vwap(
        self,
        prices: List[float],
        volumes: List[float]
    ) -> Optional[float]:
        """Calculate Volume Weighted Average Price."""
        if not prices or not volumes or len(prices) != len(volumes):
            return None
        
        cumulative_pv = sum(p * v for p, v in zip(prices, volumes))
        cumulative_vol = sum(volumes)
        
        if cumulative_vol == 0:
            return None
        
        return cumulative_pv / cumulative_vol
    
    def _calculate_volume_spike(
        self,
        volumes: List[float],
        period: int = 20,
        multiplier: float = 1.5
    ) -> Tuple[bool, float]:
        """
        Detect volume spike.
        
        Returns:
            Tuple of (is_spike, ratio)
        """
        if not volumes or len(volumes) < period:
            return False, 1.0
        
        avg_vol = sum(volumes[-period-1:-1]) / period
        current_vol = volumes[-1]
        
        if avg_vol == 0:
            return False, 1.0
        
        ratio = current_vol / avg_vol
        is_spike = ratio > multiplier
        
        return is_spike, ratio
    
    def _calculate_atr(
        self,
        highs: List[float],
        lows: List[float],
        closes: List[float],
        period: int = 14
    ) -> Optional[float]:
        """
        Calculate Average True Range.
        
        Args:
            highs: List of high prices
            lows: List of low prices
            closes: List of close prices
            period: ATR period
            
        Returns:
            ATR value or None if insufficient data
        """
        if not highs or not lows or not closes:
            return None
        if len(highs) < period + 1 or len(lows) < period + 1 or len(closes) < period + 1:
            return None
        
        # Calculate True Range for each bar
        true_ranges = []
        for i in range(1, len(closes)):
            high_low = highs[i] - lows[i]
            high_close = abs(highs[i] - closes[i-1])
            low_close = abs(lows[i] - closes[i-1])
            true_range = max(high_low, high_close, low_close)
            true_ranges.append(true_range)
        
        if len(true_ranges) < period:
            return None
        
        # Calculate ATR as simple moving average of True Range
        atr = sum(true_ranges[-period:]) / period
        return atr
    
    def _calculate_stochastic(
        self,
        highs: List[float],
        lows: List[float],
        closes: List[float],
        k_period: int = 14,
        d_period: int = 3
    ) -> Optional[Dict[str, float]]:
        """
        Calculate Stochastic Oscillator (%K and %D).
        
        Args:
            highs: List of high prices
            lows: List of low prices
            closes: List of close prices
            k_period: Period for %K calculation
            d_period: Period for %D smoothing
            
        Returns:
            Dict with 'k' and 'd' values or None if insufficient data
        """
        if not highs or not lows or not closes:
            return None
        if len(highs) < k_period or len(lows) < k_period or len(closes) < k_period:
            return None
        
        # Calculate %K
        recent_highs = highs[-k_period:]
        recent_lows = lows[-k_period:]
        current_close = closes[-1]
        
        highest_high = max(recent_highs)
        lowest_low = min(recent_lows)
        
        if highest_high == lowest_low:
            k_value = 50.0  # Neutral when no range
        else:
            k_value = ((current_close - lowest_low) / (highest_high - lowest_low)) * 100.0
        
        # Calculate %D (SMA of %K)
        # For simplicity, we'll just return K; proper %D would need K history
        d_value = k_value  # Simplified - would need to track K values for proper SMA
        
        return {'k': k_value, 'd': d_value}
    
    # ═══════════════════════════════════════════════════════════════════════════
    # NODE EXECUTION
    # ═══════════════════════════════════════════════════════════════════════════
    
    def _execute_node(self, node_id: int) -> Dict[str, Any]:
        """
        Execute a single node and compute its output.
        
        Returns:
            Dict of output port values
        """
        node = self.nodes.get(node_id)
        if not node:
            return {}
        
        node_type = node['type']
        params = node['params']
        inputs = self._get_node_inputs(node_id)
        
        outputs = {}
        
        # Get historical data
        close_history = self.market_data.get('close_history', [])
        volume_history = self.market_data.get('volume_history', [])
        high_history = self.market_data.get('high_history', [])
        low_history = self.market_data.get('low_history', [])
        current_close = self.market_data.get('close', 0)
        
        # ═══════════════════════════════════════════════════════════════════
        # INPUT NODE - Provides market data to the workflow
        # ═══════════════════════════════════════════════════════════════════
        if node_type == 'input':
            outputs = {
                'price': current_close,
                'close': current_close,
                'prices': close_history,
                'open': self.market_data.get('open', current_close),
                'high': self.market_data.get('high', current_close),
                'low': self.market_data.get('low', current_close),
                'volume': self.market_data.get('volume', 0),
                'volumes': volume_history,
                'value': current_close
            }
            
            if self.debug:
                logger.info(f"[EXEC] Node {node_id} (input): price={current_close:.2f}, history_len={len(close_history)}")
        
        # ═══════════════════════════════════════════════════════════════════
        # VOLUME HISTORY NODE - Provides volume data
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'volume_history':
            outputs = {
                'volume': self.market_data.get('volume', 0),
                'volume_history': volume_history,
                'volumes': volume_history,
                'value': self.market_data.get('volume', 0)
            }
            
            if self.debug:
                logger.info(f"[EXEC] Node {node_id} (volume_history): current={self.market_data.get('volume', 0)}, history_len={len(volume_history)}")
        
        # ═══════════════════════════════════════════════════════════════════
        # EMA INDICATOR
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'ema':
            period = int(params.get('period', params.get('length', 9)))
            
            # Use close_history from market_data
            ema_value = self._calculate_ema(close_history, period)
            
            if ema_value is not None:
                # Boolean signal: price above EMA = bullish
                above_ema = current_close > ema_value
                
                outputs = {
                    'ema': ema_value,
                    'ema_value': ema_value,  # Alias for common port names
                    'value': ema_value,
                    'output': ema_value,
                    'signal': above_ema,  # Boolean: True if price above EMA
                    'above': above_ema,
                    'below': not above_ema
                }
                
                # Track EMA relationship to price for signal inference
                if current_close > ema_value:
                    self.signal_context['ema_bullish'] = True
                else:
                    self.signal_context['ema_bearish'] = True
                
                if self.debug:
                    logger.info(f"[EXEC] Node {node_id} (ema): period={period}, value={ema_value:.4f}, above={above_ema}")
            else:
                outputs = {'ema': None, 'ema_value': None, 'value': None, 'output': None, 'signal': False, 'above': False, 'below': False}
                if self.debug:
                    logger.warning(f"[EXEC] Node {node_id} (ema): Not enough data (need {period}, have {len(close_history)})")
        
        # ═══════════════════════════════════════════════════════════════════
        # SMA INDICATOR
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'sma':
            period = int(params.get('period', params.get('length', 20)))
            sma_value = self._calculate_sma(close_history, period)
            
            if sma_value is not None:
                above_sma = current_close > sma_value
                outputs = {
                    'sma': sma_value, 
                    'value': sma_value,
                    'signal': above_sma,  # Boolean: True if price above SMA
                    'above': above_sma,
                    'below': not above_sma
                }
                if self.debug:
                    logger.info(f"[EXEC] Node {node_id} (sma): period={period}, value={sma_value:.4f}, above={above_sma}")
            else:
                outputs = {'sma': None, 'value': None, 'signal': False, 'above': False, 'below': False}
        
        # ═══════════════════════════════════════════════════════════════════
        # RSI INDICATOR
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'rsi':
            period = int(params.get('period', params.get('length', 14)))
            oversold = float(params.get('oversold', params.get('threshold_low', 30)))
            overbought = float(params.get('overbought', params.get('threshold_high', 70)))
            
            rsi_value = self._calculate_rsi(close_history, period)
            
            if rsi_value is not None:
                is_oversold = rsi_value < oversold
                is_overbought = rsi_value > overbought
                
                outputs = {
                    'rsi': rsi_value,
                    'value': rsi_value,
                    'oversold': is_oversold,
                    'overbought': is_overbought,
                    'signal': is_oversold or is_overbought
                }
                
                # Track for signal inference
                if is_oversold:
                    self.signal_context['rsi_oversold'] = True
                elif is_overbought:
                    self.signal_context['rsi_overbought'] = True
                
                if self.debug:
                    logger.info(f"[EXEC] Node {node_id} (rsi): period={period}, value={rsi_value:.2f}, oversold={is_oversold}, overbought={is_overbought}")
            else:
                outputs = {'rsi': None, 'value': None, 'oversold': False, 'overbought': False, 'signal': False}
        
        # ═══════════════════════════════════════════════════════════════════
        # MACD INDICATOR
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'macd':
            fast = int(params.get('fast', params.get('fastPeriod', 12)))
            slow = int(params.get('slow', params.get('slowPeriod', 26)))
            signal_period = int(params.get('signal', params.get('signalPeriod', 9)))
            
            macd_data = self._calculate_macd(close_history, fast, slow, signal_period)
            
            if macd_data:
                hist = macd_data['histogram']
                is_bullish = hist > 0 if hist is not None else False
                macd_above_signal = macd_data['macd_line'] > macd_data['signal_line'] if macd_data['signal_line'] else False
                
                outputs = {
                    'macd': macd_data['macd_line'],
                    'macd_line': macd_data['macd_line'],
                    'signal_line': macd_data['signal_line'],  # The actual signal line VALUE
                    'histogram': hist,
                    'value': hist,
                    'result': is_bullish,
                    'signal': is_bullish,  # Boolean: True when histogram > 0 (bullish)
                    'bullish': is_bullish,
                    'bearish': not is_bullish
                }
                
                # Track for signal inference
                if is_bullish:
                    self.signal_context['macd_bullish'] = True
                else:
                    self.signal_context['macd_bearish'] = True
                
                if self.debug:
                    logger.info(f"[EXEC] Node {node_id} (macd): histogram={hist:.4f}, bullish={is_bullish}")
            else:
                outputs = {'macd': None, 'signal_line': None, 'histogram': None, 'value': None, 'result': False, 'signal': False, 'bullish': False, 'bearish': True}
        
        # ═══════════════════════════════════════════════════════════════════
        # BOLLINGER BANDS INDICATOR
        # ═══════════════════════════════════════════════════════════════════
        elif node_type in ['bollinger', 'bollingerbands']:
            period = int(params.get('period', params.get('length', 20)))
            std_dev = float(params.get('numStd', params.get('std_dev', params.get('std', 2))))
            
            bb_data = self._calculate_bollinger(close_history, period, std_dev)
            
            if bb_data:
                below_lower = current_close < bb_data['lower']
                above_upper = current_close > bb_data['upper']
                
                outputs = {
                    'upper': bb_data['upper'],
                    'middle': bb_data['middle'],
                    'lower': bb_data['lower'],
                    'value': bb_data['middle'],
                    'signal': below_lower or above_upper
                }
                
                if self.debug:
                    logger.info(f"[EXEC] Node {node_id} (bollinger): upper={bb_data['upper']:.2f}, lower={bb_data['lower']:.2f}, close={current_close:.2f}")
            else:
                outputs = {'upper': None, 'middle': None, 'lower': None, 'value': None, 'signal': False}
        
        # ═══════════════════════════════════════════════════════════════════
        # VWAP INDICATOR
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'vwap':
            vwap_value = self._calculate_vwap(close_history, volume_history)
            
            if vwap_value is not None:
                above_vwap = current_close > vwap_value
                
                # Check VWAP condition from params (default: 'signal' means proximity check for scalping)
                condition = params.get('condition', params.get('vwap_condition', 'any')).lower()
                output_type = params.get('output', 'value').lower()
                
                # Calculate proximity to VWAP (within 0.05% threshold)
                threshold_pct = float(params.get('threshold', params.get('near_threshold', 0.0005)))
                pct_diff = abs(current_close - vwap_value) / vwap_value
                near_vwap = pct_diff < threshold_pct
                
                # Determine signal based on condition type
                if condition == 'above':
                    signal_result = above_vwap
                    signal_msg = 'above' if above_vwap else 'below'
                elif condition == 'below':
                    signal_result = not above_vwap
                    signal_msg = 'below' if not above_vwap else 'above'
                elif condition in ['near', 'any'] or output_type == 'signal':
                    # Default for scalping: price must be NEAR VWAP
                    signal_result = near_vwap
                    signal_msg = f"near (diff={pct_diff*100:.3f}%)" if near_vwap else f"away (diff={pct_diff*100:.3f}%)"
                else:
                    signal_result = above_vwap
                    signal_msg = 'above' if above_vwap else 'below'
                
                outputs = {
                    'vwap': vwap_value,
                    'value': vwap_value,
                    'signal': signal_result,
                    'result': signal_result,
                    'above': above_vwap,
                    'near': near_vwap,
                    'pct_diff': pct_diff
                }
                
                if self.debug:
                    logger.info(f"[EXEC] Node {node_id} (vwap): value={vwap_value:.2f}, price={current_close:.2f}, signal={signal_result} ({signal_msg})")
            else:
                outputs = {'vwap': None, 'value': None, 'signal': False, 'result': False, 'above': False, 'near': False}
        
        # ═══════════════════════════════════════════════════════════════════
        # VOLUME SPIKE INDICATOR
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'volume_spike':
            period = int(params.get('period', 20))
            multiplier = float(params.get('multiplier', 1.5))
            
            is_spike, ratio = self._calculate_volume_spike(volume_history, period, multiplier)
            
            outputs = {
                'spike': is_spike,
                'is_spike': is_spike,
                'signal': is_spike,
                'result': is_spike,
                'value': is_spike,
                'ratio': ratio
            }
            
            if self.debug:
                logger.info(f"[EXEC] Node {node_id} (volume_spike): spike={is_spike}, ratio={ratio:.2f}")
        
        # ═══════════════════════════════════════════════════════════════════
        # COMPARE NODE - Compares two numeric values
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'compare':
            # Try to find values from inputs - be flexible about port names
            a_val = inputs.get('a') or inputs.get('input') or inputs.get('value')
            b_val = inputs.get('b')
            
            # If a_val not found, try any available numeric input from first connection
            if a_val is None and inputs:
                # Get first available numeric value from inputs
                for port_name, port_val in inputs.items():
                    if port_val is not None and port_name not in ['result', 'signal']:
                        a_val = port_val
                        break
            
            # If b is not connected, try to get it from params
            if b_val is None:
                b_val = params.get('value') or params.get('threshold') or params.get('b')
                # If still None, default to 0 for comparisons
                if b_val is None:
                    b_val = 0.0
                    if self.debug:
                        logger.info(f"[EXEC] Node {node_id} (compare): b not connected or in params, defaulting to 0")
            
            operator = params.get('operator', '>')
            
            # Helper to extract scalar from potential list/array
            def to_scalar(val):
                if val is None:
                    return None
                if isinstance(val, (list, tuple)):
                    return val[-1] if len(val) > 0 else None
                return val
            
            a_val = to_scalar(a_val)
            b_val = to_scalar(b_val)
            
            if a_val is not None and b_val is not None:
                try:
                    a_num = float(a_val) if not isinstance(a_val, bool) else (1.0 if a_val else 0.0)
                    b_num = float(b_val) if not isinstance(b_val, bool) else (1.0 if b_val else 0.0)
                    
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
                        logger.info(f"[EXEC] Node {node_id} (compare): {a_num:.4f} {operator} {b_num:.4f} = {result}")
                        
                except (ValueError, TypeError) as e:
                    outputs = {'result': False, 'value': False}
                    if self.debug:
                        logger.warning(f"[EXEC] Node {node_id} (compare): Error - {e}")
            else:
                outputs = {'result': False, 'value': False}
                if self.debug:
                    logger.warning(f"[EXEC] Node {node_id} (compare): Missing inputs - a={a_val}, b={b_val}, available_ports={list(inputs.keys())}")
        
        # ═══════════════════════════════════════════════════════════════════
        # THRESHOLD NODE - Compares single value against threshold
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'threshold':
            value = inputs.get('value') or inputs.get('input') or inputs.get('a')
            threshold = float(params.get('threshold', params.get('value', 0)))
            operator = params.get('operator', params.get('direction', '>')).lower()
            
            # Handle list/array inputs by taking the last value
            if isinstance(value, (list, tuple)):
                value = value[-1] if len(value) > 0 else None
            
            if value is not None:
                try:
                    val_num = float(value)
                    
                    if operator in ['>', 'above']:
                        result = val_num > threshold
                    elif operator in ['<', 'below']:
                        result = val_num < threshold
                    elif operator == '>=':
                        result = val_num >= threshold
                    elif operator == '<=':
                        result = val_num <= threshold
                    else:
                        result = val_num > threshold
                    
                    outputs = {'result': result, 'value': result}
                    
                    if self.debug:
                        logger.info(f"[EXEC] Node {node_id} (threshold): {val_num:.4f} {operator} {threshold} = {result}")
                        
                except (ValueError, TypeError):
                    outputs = {'result': False, 'value': False}
            else:
                outputs = {'result': False, 'value': False}
                if self.debug:
                    logger.warning(f"[EXEC] Node {node_id} (threshold): Missing input value")
        
        # ═══════════════════════════════════════════════════════════════════
        # CROSSOVER NODE - Detects when fast crosses slow
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'crossover':
            fast = inputs.get('fast') or inputs.get('a')
            slow = inputs.get('slow') or inputs.get('b')
            direction = params.get('direction', 'above').lower()
            
            if fast is not None and slow is not None:
                try:
                    fast_val = float(fast)
                    slow_val = float(slow)
                    
                    # Simple comparison (true crossover would need historical values)
                    if direction in ['above', 'bullish']:
                        result = fast_val > slow_val
                    else:
                        result = fast_val < slow_val
                    
                    outputs = {'result': result, 'crossed': result, 'value': result}
                    
                    if self.debug:
                        logger.info(f"[EXEC] Node {node_id} (crossover): fast={fast_val:.4f}, slow={slow_val:.4f}, direction={direction}, result={result}")
                        
                except (ValueError, TypeError):
                    outputs = {'result': False, 'crossed': False, 'value': False}
            else:
                outputs = {'result': False, 'crossed': False, 'value': False}
        
        # ═══════════════════════════════════════════════════════════════════
        # AND NODE - Logical AND of all inputs
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'and':
            # CRITICAL: Use strict bool conversion to prevent raw indicator values
            # from being treated as True (e.g., RSI=52 should NOT be True)
            a_val = inputs.get('a')
            b_val = inputs.get('b')
            
            # Also check for generic 'input' ports if a/b not connected
            if a_val is None:
                a_val = inputs.get('input')
            if b_val is None:
                # Check for any other input port
                for port, val in inputs.items():
                    if port not in ['a', 'input'] and val is not None and b_val is None:
                        b_val = val
                        break
            
            if a_val is not None and b_val is not None:
                a_bool = self._to_strict_bool(a_val)
                b_bool = self._to_strict_bool(b_val)
                result = a_bool and b_bool
            else:
                # Collect all input values
                all_values = []
                for port, val in inputs.items():
                    if val is not None:
                        all_values.append(self._to_strict_bool(val))
                result = all(all_values) if all_values else False
                a_bool = all_values[0] if len(all_values) > 0 else None
                b_bool = all_values[1] if len(all_values) > 1 else None
            
            # Include input values in outputs for debugging in Results Panel
            outputs = {
                'result': result, 
                'value': result,
                'a': a_val,
                'b': b_val,
                'a_bool': a_bool if 'a_bool' in dir() else self._to_strict_bool(a_val) if a_val is not None else None,
                'b_bool': b_bool if 'b_bool' in dir() else self._to_strict_bool(b_val) if b_val is not None else None
            }
            
            if self.debug:
                logger.info(f"[EXEC] Node {node_id} (and): a={a_val}, b={b_val}, result={result}")
        
        # ═══════════════════════════════════════════════════════════════════
        # OR NODE - Logical OR of all inputs
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'or':
            a_val = inputs.get('a')
            b_val = inputs.get('b')
            
            # Also check for generic 'input' ports if a/b not connected
            if a_val is None:
                a_val = inputs.get('input')
            if b_val is None:
                for port, val in inputs.items():
                    if port not in ['a', 'input'] and val is not None and b_val is None:
                        b_val = val
                        break
            
            if a_val is not None and b_val is not None:
                a_bool = self._to_strict_bool(a_val)
                b_bool = self._to_strict_bool(b_val)
                result = a_bool or b_bool
            else:
                all_values = []
                for port, val in inputs.items():
                    if val is not None:
                        all_values.append(self._to_strict_bool(val))
                result = any(all_values) if all_values else False
                a_bool = all_values[0] if len(all_values) > 0 else None
                b_bool = all_values[1] if len(all_values) > 1 else None
            
            # Include input values in outputs for debugging in Results Panel
            outputs = {
                'result': result, 
                'value': result,
                'a': a_val,
                'b': b_val,
                'a_bool': a_bool if 'a_bool' in dir() else self._to_strict_bool(a_val) if a_val is not None else None,
                'b_bool': b_bool if 'b_bool' in dir() else self._to_strict_bool(b_val) if b_val is not None else None
            }
            
            if self.debug:
                logger.info(f"[EXEC] Node {node_id} (or): a={a_val}, b={b_val}, result={result}")
        
        # ═══════════════════════════════════════════════════════════════════
        # NOT NODE - Logical NOT
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'not':
            input_val = inputs.get('input') or inputs.get('a') or inputs.get('value')
            
            if input_val is not None:
                result = not self._to_strict_bool(input_val)
            else:
                result = True  # NOT(nothing) = True
            
            outputs = {'result': result, 'value': result}
            
            if self.debug:
                logger.info(f"[EXEC] Node {node_id} (not): input={input_val}, result={result}")
        
        # ═══════════════════════════════════════════════════════════════════
        # OUTPUT NODE - Final signal output
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'output':
            # Get input value - prioritize 'signal' and 'result' (boolean) ports over raw values
            signal_input = inputs.get('signal', inputs.get('result', inputs.get('input', inputs.get('a', inputs.get('value')))))
            
            # CRITICAL: Use strict bool - raw indicator values should NOT trigger signals
            signal_bool = self._to_strict_bool(signal_input)
            
            outputs = {'result': signal_bool, 'signal': signal_bool, 'value': signal_bool}
            
            if self.debug:
                logger.info(f"[EXEC] Node {node_id} (output): input={signal_input} (type={type(signal_input).__name__}), signal={signal_bool}")
        
        # ═══════════════════════════════════════════════════════════════════
        # SIGNAL NODE - Trading signal output
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'signal':
            # Get the signal type from params (BUY or SELL)
            signal_type = params.get('type', params.get('direction', params.get('action', 'BUY')))
            
            # Get the input condition - check specific ports in priority order
            # CRITICAL: Must distinguish between False (explicit) and None (not connected)
            signal_input = None
            for port in ['signal', 'result', 'input', 'a', 'value']:
                if port in inputs:
                    signal_input = inputs[port]
                    break
            
            # If no known ports, check if we have ANY input
            if signal_input is None and inputs:
                # Look for any value in inputs
                for key, val in inputs.items():
                    signal_input = val
                    break
            
            # CRITICAL: Use strict bool - raw indicator values should NOT fire signals
            if signal_input is not None:
                signal_fires = self._to_strict_bool(signal_input)
            else:
                # No input connected - FAIL SAFE: don't fire signals without explicit condition
                # This prevents false signals when users forget to connect the condition
                signal_fires = False
                if self.debug:
                    logger.warning(f"[EXEC] Node {node_id} (signal): NO INPUT CONNECTED - signal will NOT fire")
            
            outputs = {
                'result': signal_fires,
                'signal': signal_fires,
                'signal_type': signal_type if signal_fires else None,
                'type': signal_type,
                'value': signal_fires
            }
            
            # Store the signal direction for final signal inference
            if signal_fires:
                self.signal_context['signal_type'] = signal_type
                self.signal_context['signal_fires'] = True
            
            if self.debug:
                logger.info(f"[EXEC] Node {node_id} (signal): input={signal_input} (type={type(signal_input).__name__}), fires={signal_fires}, type={signal_type}")
        
        # ═══════════════════════════════════════════════════════════════════
        # ATR INDICATOR
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'atr':
            period = int(params.get('period', params.get('length', 14)))
            
            atr_value = self._calculate_atr(high_history, low_history, close_history, period)
            
            if atr_value is not None:
                outputs = {
                    'atr': atr_value,
                    'value': atr_value
                }
                
                if self.debug:
                    logger.info(f"[EXEC] Node {node_id} (atr): period={period}, value={atr_value:.4f}")
            else:
                outputs = {'atr': None, 'value': None}
        
        # ═══════════════════════════════════════════════════════════════════
        # STOCHASTIC INDICATOR
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'stochastic':
            k_period = int(params.get('kPeriod', params.get('k_period', params.get('period', 14))))
            d_period = int(params.get('dPeriod', params.get('d_period', 3)))
            oversold = float(params.get('oversold', params.get('threshold_low', 20)))
            overbought = float(params.get('overbought', params.get('threshold_high', 80)))
            
            stoch_data = self._calculate_stochastic(high_history, low_history, close_history, k_period, d_period)
            
            if stoch_data:
                k_value = stoch_data['k']
                d_value = stoch_data['d']
                is_oversold = k_value < oversold
                is_overbought = k_value > overbought
                
                outputs = {
                    'k': k_value,
                    'd': d_value,
                    'stoch_k': k_value,
                    'stoch_d': d_value,
                    'value': k_value,
                    'oversold': is_oversold,
                    'overbought': is_overbought,
                    'signal': is_oversold or is_overbought
                }
                
                if self.debug:
                    logger.info(f"[EXEC] Node {node_id} (stochastic): k={k_value:.2f}, d={d_value:.2f}, oversold={is_oversold}, overbought={is_overbought}")
            else:
                outputs = {'k': None, 'd': None, 'value': None, 'oversold': False, 'overbought': False, 'signal': False}
        
        # ═══════════════════════════════════════════════════════════════════
        # SUPPORT/RESISTANCE INDICATOR
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'support_resistance':
            lookback = int(params.get('lookback', params.get('period', 20)))
            output_type = params.get('output', 'support').lower()
            
            # Calculate support and resistance from price history
            if close_history and len(close_history) >= lookback and high_history and low_history:
                recent_highs = high_history[-lookback:]
                recent_lows = low_history[-lookback:]
                recent_closes = close_history[-lookback:]
                
                # Basic S/R: highest high and lowest low in lookback
                resistance = max(recent_highs) if recent_highs else None
                support = min(recent_lows) if recent_lows else None
                
                # Calculate pivot points
                h = recent_highs[-1] if recent_highs else 0
                l = recent_lows[-1] if recent_lows else 0
                c = recent_closes[-1] if recent_closes else 0
                pivot = (h + l + c) / 3 if (h and l and c) else None
                
                # Price position relative to S/R
                current_close = close_history[-1] if close_history else 0
                near_support = abs(current_close - support) / support < 0.01 if support else False
                near_resistance = abs(current_close - resistance) / resistance < 0.01 if resistance else False
                above_pivot = current_close > pivot if pivot else False
                
                outputs = {
                    'support': support,
                    'resistance': resistance,
                    'pivot': pivot,
                    'value': support if output_type == 'support' else resistance,
                    'near_support': near_support,
                    'near_resistance': near_resistance,
                    'above_pivot': above_pivot,
                    'signal': True  # Data provider, always passes
                }
                
                if self.debug:
                    logger.info(f"[EXEC] Node {node_id} (support_resistance): S=${support:.2f}, R=${resistance:.2f}, Pivot=${pivot:.2f}")
            else:
                outputs = {
                    'support': None, 'resistance': None, 'pivot': None, 'value': None,
                    'near_support': False, 'near_resistance': False, 'above_pivot': False, 'signal': True
                }
        
        # ═══════════════════════════════════════════════════════════════════
        # NOTE NODE - Skip (visual only)
        # ═══════════════════════════════════════════════════════════════════
        elif node_type == 'note':
            outputs = {}
        
        # ═══════════════════════════════════════════════════════════════════
        # UNKNOWN NODE - Pass through
        # ═══════════════════════════════════════════════════════════════════
        else:
            if self.debug:
                logger.warning(f"[EXEC] Node {node_id}: Unknown type '{node_type}'")
            # Pass through any inputs
            outputs = inputs.copy() if inputs else {}
        
        # Store outputs
        self.node_outputs[node_id] = outputs
        return outputs
    
    def _get_output_node_value(self) -> Optional[bool]:
        """Get the boolean value from the OUTPUT or SIGNAL node."""
        # First check for explicit signal nodes
        for node_id, node in self.nodes.items():
            if node['type'] == 'signal':
                outputs = self.node_outputs.get(node_id, {})
                result = outputs.get('result')
                if self.debug:
                    logger.info(f"[OUTPUT] Found signal node {node_id}: outputs={outputs}, result={result}")
                if result is not None:
                    return result
        
        # Then check for output nodes
        for node_id, node in self.nodes.items():
            if node['type'] == 'output':
                outputs = self.node_outputs.get(node_id, {})
                result = outputs.get('result')
                if self.debug:
                    logger.info(f"[OUTPUT] Found output node {node_id}: outputs={outputs}, result={result}")
                # Return the result directly - don't use 'or' chaining which hides False values
                return result
        
        # If no output/signal nodes, check if any terminal node (no outgoing connections) has a truthy result
        terminal_nodes = self._find_terminal_nodes()
        if self.debug:
            logger.info(f"[OUTPUT] No output/signal nodes found, checking terminal nodes: {terminal_nodes}")
        for node_id in terminal_nodes:
            outputs = self.node_outputs.get(node_id, {})
            # CRITICAL: Use strict bool to avoid treating numeric values (like RSI=52) as True
            # Check boolean ports first, then fall back to value with strict conversion
            result = self._to_strict_bool(outputs.get('result')) or \
                     self._to_strict_bool(outputs.get('signal')) or \
                     self._to_strict_bool(outputs.get('value'))
            if self.debug:
                logger.info(f"[OUTPUT] Terminal node {node_id}: outputs={outputs}, strict_result={result}")
            if result:
                return True  # Return explicit True, not the numeric value
        
        return False  # Default to False (no signal) instead of None
    
    def _find_terminal_nodes(self) -> List[str]:
        """Find nodes with no outgoing connections (leaf nodes)."""
        nodes_with_outgoing = set()
        for conn in self.connections:
            source = str(conn.get('source') or conn.get('from') or conn.get('fromNodeId') or '')
            if source:
                nodes_with_outgoing.add(source)
        
        terminal = []
        for node_id in self.nodes:
            if node_id not in nodes_with_outgoing:
                terminal.append(node_id)
        return terminal
    
    def _infer_signal_direction(self) -> str:
        """
        Infer whether True condition means BUY or SELL.
        
        Logic:
        - Explicit signal from 'signal' node → Use that
        - RSI oversold → BUY
        - RSI overbought → SELL
        - EMA bullish (fast > slow) → BUY
        - EMA bearish → SELL
        - MACD bullish (histogram > 0) → BUY
        - Default: Check output node params, then BUY
        """
        # Check for explicit signal type from signal node first (highest priority)
        if self.signal_context.get('signal_fires') and self.signal_context.get('signal_type'):
            return self.signal_context['signal_type']
        
        # Check RSI (most specific indicator)
        if self.signal_context['rsi_oversold']:
            return 'BUY'
        if self.signal_context['rsi_overbought']:
            return 'SELL'
        
        # Check EMA crossover
        if self.signal_context['ema_bullish']:
            return 'BUY'
        if self.signal_context['ema_bearish']:
            return 'SELL'
        
        # Check MACD
        if self.signal_context['macd_bullish']:
            return 'BUY'
        if self.signal_context['macd_bearish']:
            return 'SELL'
        
        # Check signal node params for explicit signal
        for node_id, node in self.nodes.items():
            if node['type'] == 'signal':
                params = node['params']
                explicit = params.get('type') or params.get('signal') or params.get('action') or params.get('side')
                if explicit and str(explicit).upper() in ['BUY', 'SELL', 'LONG', 'SHORT']:
                    return 'BUY' if str(explicit).upper() in ['BUY', 'LONG'] else 'SELL'
        
        # Check output node params for explicit signal
        for node_id, node in self.nodes.items():
            if node['type'] == 'output':
                params = node['params']
                explicit = params.get('signal') or params.get('action') or params.get('side')
                if explicit and str(explicit).upper() in ['BUY', 'SELL', 'LONG', 'SHORT']:
                    return 'BUY' if str(explicit).upper() in ['BUY', 'LONG'] else 'SELL'
        
        # Default to BUY
        return 'BUY'
    
    def execute(self) -> Tuple[Optional[str], Dict]:
        """
        Execute the complete workflow and return signal.
        
        Returns:
            Tuple of (signal, debug_info) where:
            - signal is 'BUY', 'SELL', or None
            - debug_info contains execution details
        """
        debug_info = {
            'node_outputs': {},
            'execution_order': [],
            'final_condition': None,
            'signal_direction': None,
            'nodes_count': len(self.nodes),
            'connections_count': len(self.connections)
        }
        
        try:
            # 1. Topological sort
            sorted_nodes = self._topological_sort()
            debug_info['execution_order'] = sorted_nodes
            
            if self.debug:
                logger.info(f"[GRAPH] Executing {len(sorted_nodes)} nodes in order: {sorted_nodes}")
            
            # 2. Execute nodes in sorted order
            for node_id in sorted_nodes:
                self._execute_node(node_id)
            
            # Store node outputs in debug info
            debug_info['node_outputs'] = {
                str(k): {pk: (pv if not isinstance(pv, float) else round(pv, 4)) 
                        for pk, pv in v.items()}
                for k, v in self.node_outputs.items()
            }
            
            # 3. Get final result from OUTPUT node
            output_value = self._get_output_node_value()
            debug_info['final_condition'] = output_value
            
            if not output_value:
                if self.debug:
                    logger.info(f"[GRAPH] Output is False or missing - no signal")
                return None, debug_info
            
            # 4. Infer signal direction
            signal = self._infer_signal_direction()
            debug_info['signal_direction'] = signal
            
            if self.debug:
                logger.info(f"[GRAPH] Final signal: {signal}")
            
            return signal, debug_info
            
        except Exception as e:
            logger.error(f"[GRAPH] Execution error: {e}")
            debug_info['error'] = str(e)
            return None, debug_info


def execute_unified_workflow(
    nodes: List[Dict],
    connections: List[Dict],
    market_data: Dict,
    debug: bool = False
) -> Tuple[Optional[str], Dict]:
    """
    Convenience function to execute a workflow using the unified executor.
    
    This is the SINGLE entry point for both backtesting and live signal generation.
    
    Args:
        nodes: List of node dictionaries
        connections: List of connection dictionaries  
        market_data: Dict with close, close_history, volume_history, etc.
        debug: Enable debug logging
        
    Returns:
        Tuple of (signal, debug_info)
    """
    executor = UnifiedStrategyExecutor(
        nodes=nodes,
        connections=connections,
        market_data=market_data,
        debug=debug
    )
    return executor.execute()
