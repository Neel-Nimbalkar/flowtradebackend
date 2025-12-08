"""
FlowGrid Trading - Sequential Workflow Execution Engine
Processes user-built trading strategies block-by-block with stop-on-fail logic.
"""

from dataclasses import dataclass
from typing import List, Dict, Any, Optional
from enum import Enum
import os

# Toggle verbose debug output for evaluators when FLOWGRID_DEBUG=1 in env
DEBUG = os.environ.get('FLOWGRID_DEBUG', '0') == '1'

class BlockStatus(Enum):
    """Execution status for each block"""
    PENDING = "pending"
    RUNNING = "running"
    PASSED = "passed"
    FAILED = "failed"
    SKIPPED = "skipped"

@dataclass
class BlockResult:
    """Result of a single block execution"""
    block_id: int
    block_type: str
    status: BlockStatus
    message: str
    data: Dict[str, Any]
    execution_time_ms: float

@dataclass
class WorkflowResult:
    """Complete workflow execution result"""
    success: bool
    blocks: List[BlockResult]
    final_decision: Optional[str]
    total_execution_time_ms: float
    stop_reason: Optional[str]

class ConditionEvaluator:
    """Evaluates trading conditions for each block type with normalized parameter support"""

    @staticmethod
    def check_rsi(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check RSI condition with custom thresholds and modes"""
        rsi = latest_data.get('rsi')
        if rsi is None:
            return False, "RSI data not available"
        threshold_low = params.get('threshold_low', params.get('oversold', 30))
        threshold_high = params.get('threshold_high', params.get('overbought', 70))
        try:
            tl = float(threshold_low)
            th = float(threshold_high)
            threshold_low, threshold_high = (min(tl, th), max(tl, th))
        except Exception:
            threshold_low, threshold_high = 30, 70
        if DEBUG:
            print(f"[DEBUG][RSI] rsi={rsi!r} parsed_thresholds=({threshold_low},{threshold_high}) params={params}")
        condition = (params.get('rsi_condition') or params.get('condition') or 'any').lower()
        if condition == 'oversold':
            passed = rsi < threshold_low
            return passed, f"RSI {rsi:.2f} {'<' if passed else '>='} {threshold_low} (oversold target)"
        if condition == 'overbought':
            passed = rsi > threshold_high
            return passed, f"RSI {rsi:.2f} {'>' if passed else '<='} {threshold_high} (overbought target)"
        if condition == 'neutral':
            passed = threshold_low <= rsi <= threshold_high
            return passed, f"RSI {rsi:.2f} {'inside' if passed else 'outside'} neutral band ({threshold_low}-{threshold_high})"
        if condition == 'any':
            if rsi < threshold_low:
                return True, f"RSI {rsi:.2f} < {threshold_low} (oversold)"
            if rsi > threshold_high:
                return True, f"RSI {rsi:.2f} > {threshold_high} (overbought)"
            return False, f"RSI {rsi:.2f} in neutral range ({threshold_low}-{threshold_high})"
        return False, f"Unmatched RSI condition: {condition}"

    @staticmethod
    def check_ema(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check EMA/SMA condition"""
        ema = latest_data.get('ema')
        close = latest_data.get('close')
        if ema is None or close is None:
            return False, "EMA or price data not available"
        direction = params.get('direction', 'above').lower()
        if direction == 'above':
            passed = close > ema
            return passed, f"Price ${close:.2f} {'>' if passed else '<='} EMA ${ema:.2f}"
        if direction == 'below':
            passed = close < ema
            return passed, f"Price ${close:.2f} {'<' if passed else '>='} EMA ${ema:.2f}"
        return False, f"Unknown EMA direction: {direction}"

    @staticmethod
    def check_macd(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check MACD histogram with cross and magnitude conditions"""
        hist = latest_data.get('macd_hist')
        prev = latest_data.get('macd_hist_prev')
        if hist is None:
            return False, "MACD data not available"
        cond = (params.get('macd_condition') or params.get('direction') or 'any').lower()
        th = params.get('macd_hist_threshold', 0)
        try:
            th = float(th)
        except Exception:
            th = 0
        if cond == 'positive':
            passed = hist > max(0, th)
            return passed, f"MACD hist {hist:.4f} {'>' if passed else '<='} {max(0,th):.4f} (positive momentum)"
        if cond == 'negative':
            passed = hist < min(0, -th)
            return passed, f"MACD hist {hist:.4f} {'<' if passed else '>='} {min(0,-th):.4f} (negative momentum)"
        if cond == 'bullish_cross' and prev is not None:
            passed = prev <= 0 and hist > 0
            return passed, f"MACD hist cross {'UP' if passed else 'no bullish cross'} (prev {prev:.4f} -> {hist:.4f})"
        if cond == 'bearish_cross' and prev is not None:
            passed = prev >= 0 and hist < 0
            return passed, f"MACD hist cross {'DOWN' if passed else 'no bearish cross'} (prev {prev:.4f} -> {hist:.4f})"
        if cond == 'any':
            passed = hist > th or hist < -th
            return passed, f"MACD hist {hist:.4f} {'outside' if passed else 'within'} +/-{th:.4f} band"
        return False, f"Unmatched MACD condition: {cond}"

    @staticmethod
    def check_volume_spike(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check volume spike condition"""
        vol_spike = latest_data.get('vol_spike', False)
        if vol_spike:
            return True, "Volume spike detected"
        return False, "No volume spike detected"

    @staticmethod
    def check_price_above(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check if price is above a threshold"""
        close = latest_data.get('close')
        if close is None:
            return False, "Price data not available"
        threshold = params.get('threshold', 0)
        passed = close > threshold
        return passed, f"Price ${close:.2f} {'>' if passed else '<='} ${threshold:.2f}"

    @staticmethod
    def check_price_below(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check if price is below a threshold"""
        close = latest_data.get('close')
        if close is None:
            return False, "Price data not available"
        threshold = params.get('threshold', 0)
        passed = close < threshold
        return passed, f"Price ${close:.2f} {'<' if passed else '>='} ${threshold:.2f}"

    @staticmethod
    def check_bollinger(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check Bollinger Band condition with squeeze/expansion"""
        close = latest_data.get('close')
        upper = latest_data.get('boll_upper')
        lower = latest_data.get('boll_lower')
        if None in [close, upper, lower]:
            return False, "Bollinger Band data not available"
        bw = latest_data.get('boll_bandwidth')
        condition = (params.get('boll_condition') or params.get('condition') or 'any').lower()
        squeeze_th = params.get('boll_squeeze_threshold', 0.05)
        try:
            squeeze_th = float(squeeze_th)
        except Exception:
            squeeze_th = 0.05
        if condition == 'touch_lower':
            passed = close <= lower
            return passed, f"Price ${close:.2f} {'<=' if passed else '>'} lower band ${lower:.2f}"
        if condition == 'touch_upper':
            passed = close >= upper
            return passed, f"Price ${close:.2f} {'>=' if passed else '<'} upper band ${upper:.2f}"
        if condition == 'outside':
            passed = close > upper or close < lower
            return passed, f"Price ${close:.2f} {'outside' if passed else 'inside'} bands (${lower:.2f}-${upper:.2f})"
        if condition == 'squeeze' and bw is not None:
            passed = bw <= squeeze_th
            return passed, f"Bandwidth {bw:.4f} {'<=' if passed else '>'} {squeeze_th} (squeeze)"
        if condition == 'expansion' and bw is not None:
            passed = bw > squeeze_th
            return passed, f"Bandwidth {bw:.4f} {'>' if passed else '<='} {squeeze_th} (expansion)"
        if condition == 'any':
            passed = close <= lower or close >= upper
            return passed, f"Price ${close:.2f} {'hit' if passed else 'inside'} outer bands (${lower:.2f}-${upper:.2f})"
        return False, f"Unmatched Bollinger condition: {condition}"

    @staticmethod
    def check_trendline(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check trendline breakout condition"""
        if 'trend_support' not in latest_data and 'trend_resistance' not in latest_data:
            return False, "Trendline data not available"
        breakout = latest_data.get('trend_breakout')
        direction = params.get('direction', 'bullish').lower()
        if direction == 'bullish':
            passed = breakout == 'bullish'
            return passed, f"{'Bullish breakout detected' if passed else 'No bullish breakout detected'}"
        if direction == 'bearish':
            passed = breakout == 'bearish'
            return passed, f"{'Bearish breakdown detected' if passed else 'No bearish breakdown detected'}"
        return False, f"Unknown trendline direction: {direction}"

    @staticmethod
    def check_stochastic(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check Stochastic %K condition with custom thresholds"""
        stoch_k = latest_data.get('stoch_k')
        if stoch_k is None:
            return False, "Stochastic data not available"
        low = params.get('stoch_low', params.get('oversold', 20))
        high = params.get('stoch_high', params.get('overbought', 80))
        try:
            low_f = float(low)
            high_f = float(high)
            low, high = min(low_f, high_f), max(low_f, high_f)
        except Exception:
            low, high = 20, 80
        condition = (params.get('stoch_condition') or params.get('condition') or 'any').lower()
        if condition == 'oversold':
            passed = stoch_k < low
            return passed, f"Stochastic %K {stoch_k:.2f} {'<' if passed else '>='} {low} (oversold target)"
        if condition == 'overbought':
            passed = stoch_k > high
            return passed, f"Stochastic %K {stoch_k:.2f} {'>' if passed else '<='} {high} (overbought target)"
        if condition == 'any':
            passed = stoch_k < low or stoch_k > high
            return passed, f"Stochastic %K {stoch_k:.2f} {'outside' if passed else 'inside'} range ({low}-{high})"
        return False, f"Stochastic %K {stoch_k:.2f} in range ({low}-{high})"

    @staticmethod
    def check_vwap(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check VWAP relation conditions"""
        vwap = latest_data.get('vwap')
        close = latest_data.get('close')
        if vwap is None or close is None:
            return False, "VWAP data not available"
        cond = (params.get('vwap_condition') or params.get('condition') or 'any').lower()
        if cond == 'above':
            passed = close > vwap
            return passed, f"Price ${close:.2f} {'>' if passed else '<='} VWAP ${vwap:.2f}"
        if cond == 'below':
            passed = close < vwap
            return passed, f"Price ${close:.2f} {'<' if passed else '>='} VWAP ${vwap:.2f}"
        if cond in ['cross_up', 'cross_down']:
            return False, "VWAP cross detection requires previous bar (not implemented)"
        if cond == 'any':
            near = abs(close - vwap) / vwap < 0.0005
            return near, f"Price ${close:.2f} {'near' if near else 'away from'} VWAP ${vwap:.2f}"
        return False, f"Unmatched VWAP condition: {cond}"

    @staticmethod
    def check_obv(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check OBV trend/placeholder divergence conditions"""
        obv = latest_data.get('obv')
        prev = latest_data.get('obv_prev')
        close = latest_data.get('close')
        if obv is None:
            return False, "OBV data not available"
        cond = (params.get('obv_condition') or params.get('condition') or 'any').lower()
        if cond == 'rising' and prev is not None:
            passed = obv > prev
            return passed, f"OBV {obv:.0f} {'>' if passed else '<='} prev {prev:.0f} (rising)"
        if cond == 'falling' and prev is not None:
            passed = obv < prev
            return passed, f"OBV {obv:.0f} {'<' if passed else '>='} prev {prev:.0f} (falling)"
        if cond.startswith('divergence') and prev is not None and 'price_prev' in latest_data:
            price_prev = latest_data.get('price_prev')
            price_dir = 'up' if close > price_prev else 'down' if close < price_prev else 'flat'
            obv_dir = 'up' if obv > prev else 'down' if obv < prev else 'flat'
            if cond == 'divergence_bull':
                passed = price_dir == 'down' and obv_dir == 'up'
                return passed, f"Bull divergence price {price_dir}, OBV {obv_dir}"
            if cond == 'divergence_bear':
                passed = price_dir == 'up' and obv_dir == 'down'
                return passed, f"Bear divergence price {price_dir}, OBV {obv_dir}"
        if cond == 'any':
            return True, f"OBV {obv:.0f} (no specific condition)"
        return False, f"Unmatched OBV condition: {cond}"

class WorkflowEngine:
    """Sequential workflow execution engine"""
    
    def __init__(self):
        self.evaluator = ConditionEvaluator()
    
    def execute_workflow(self, blocks: List[Dict], latest_data: Dict) -> WorkflowResult:
        """
        Execute workflow blocks sequentially, stopping on first failure.
        
        Args:
            blocks: List of block definitions with type, params, conditions
            latest_data: Latest market data from backend
        
        Returns:
            WorkflowResult with execution details
        """
        import time
        start_time = time.time()
        results = []
        
        for i, block in enumerate(blocks):
            block_start = time.time()
            block_type = block.get('type')
            block_id = block.get('id', i)
            params = block.get('params', {})
            
            # Skip non-condition blocks (config, input, output, signal, etc.)
            # These are configuration or terminal blocks that don't need condition evaluation
            skip_types = ['symbol', 'timeframe', 'lookback', 'input', 'output', 'signal', 
                         'ai_agent', 'alpaca_config', 'config', 'start', 'end', 'entry', 'exit']
            if block_type in skip_types:
                results.append(BlockResult(
                    block_id=block_id,
                    block_type=block_type,
                    status=BlockStatus.SKIPPED,
                    message=f"Configuration/terminal block (no condition check)",
                    data={},
                    execution_time_ms=(time.time() - block_start) * 1000
                ))
                continue

            if DEBUG and block_type == 'rsi':
                print(f"[DEBUG][EXECUTE] Evaluating block #{block_id} type={block_type} params={params} latest_rsi={latest_data.get('rsi')}")
            passed, message = self._evaluate_block(block_type, latest_data, params)
            block_time = (time.time() - block_start) * 1000
            status = BlockStatus.PASSED if passed else BlockStatus.FAILED

            # Detailed trace logging for each block to aid debugging of signals
            try:
                # pick a small subset of latest_data that's relevant and safe to print
                keys_to_log = ['close', 'price', 'rsi', 'ema', 'macd_hist', 'vol_spike', 'boll_upper', 'boll_middle', 'boll_lower', 'stoch_k', 'vwap']
                snapshot = {k: latest_data.get(k) for k in keys_to_log if k in latest_data}
                print(f"[TRACE] Block #{block_id} type={block_type} params={params} -> passed={passed} message={message} data={snapshot}")
            except Exception:
                try:
                    print(f"[TRACE] Block #{block_id} type={block_type} params={params} -> passed={passed} message={message}")
                except Exception:
                    pass

            # Collect relevant latest_data for this block type
            relevant_keys = set(params.keys()) | set([block_type])
            block_data = {
                'condition_met': passed,
                'params': params,
                'latest_data': {k: latest_data.get(k) for k in latest_data.keys() if k in relevant_keys or k.startswith(block_type)}
            }

            results.append(BlockResult(
                block_id=block_id,
                block_type=block_type,
                status=status,
                message=message,
                data=block_data,
                execution_time_ms=block_time
            ))
            
            status = BlockStatus.PASSED if passed else BlockStatus.FAILED
            
            results.append(BlockResult(
                block_id=block_id,
                block_type=block_type,
                status=status,
                message=message,
                data={'condition_met': passed},
                execution_time_ms=block_time
            ))
            
            # Stop on failure
            if not passed:
                # Mark remaining blocks as skipped
                for j in range(i + 1, len(blocks)):
                    skip_block = blocks[j]
                    results.append(BlockResult(
                        block_id=skip_block.get('id', j),
                        block_type=skip_block.get('type'),
                        status=BlockStatus.SKIPPED,
                        message="Skipped due to previous block failure",
                        data={},
                        execution_time_ms=0
                    ))
                
                total_time = (time.time() - start_time) * 1000
                return WorkflowResult(
                    success=False,
                    blocks=results,
                    final_decision="REJECTED",
                    total_execution_time_ms=total_time,
                    stop_reason=f"Block {block_id} ({block_type}) failed: {message}"
                )
        
        # All blocks passed
        total_time = (time.time() - start_time) * 1000
        return WorkflowResult(
            success=True,
            blocks=results,
            final_decision="CONFIRMED",
            total_execution_time_ms=total_time,
            stop_reason=None
        )
    
    def _evaluate_block(self, block_type: str, latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Route to appropriate condition checker"""
        
        evaluators = {
            'rsi': self.evaluator.check_rsi,
            'ema': self.evaluator.check_ema,
            'sma': self.evaluator.check_ema,  # Similar logic
            'macd': self.evaluator.check_macd,
            'volspike': self.evaluator.check_volume_spike,
            'bollinger': self.evaluator.check_bollinger,
            'trendline': self.evaluator.check_trendline,
            'stochastic': self.evaluator.check_stochastic,
            'price_above': self.evaluator.check_price_above,
            'price_below': self.evaluator.check_price_below,
            'vwap': self.evaluator.check_vwap,
            'obv': self.evaluator.check_obv,
        }
        
        evaluator_func = evaluators.get(block_type)
        if evaluator_func:
            return evaluator_func(latest_data, params)
        else:
            # Unknown block types are treated as passed (they may be config/terminal blocks)
            # This allows workflows to include custom blocks without breaking
            return True, f"Block type '{block_type}' has no condition (auto-pass)"
