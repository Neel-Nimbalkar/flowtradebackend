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
        # Try multiple possible keys for volume spike data
        vol_spike = latest_data.get('vol_spike') or latest_data.get('volume_spike') or latest_data.get('spike')
        if vol_spike is True or vol_spike == 1:
            return True, "Volume spike detected"
        
        # If we have raw volume data, check against multiplier
        volume = latest_data.get('volume')
        avg_volume = latest_data.get('avg_volume') or latest_data.get('volume_avg')
        if volume is not None and avg_volume is not None and avg_volume > 0:
            multiplier = params.get('multiplier', 1.5)
            try:
                multiplier = float(multiplier)
            except:
                multiplier = 1.5
            passed = volume > (avg_volume * multiplier)
            return passed, f"Volume {volume:.0f} {'>' if passed else '<='} {avg_volume * multiplier:.0f} ({multiplier}x avg)"
        
        return False, "No volume spike detected"

    @staticmethod
    def check_atr(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check ATR condition - ATR is a data provider, always passes if data available"""
        atr = latest_data.get('atr')
        if atr is None:
            return False, "ATR data not available"
        return True, f"ATR value: {atr:.4f}"

    @staticmethod
    def check_threshold(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check if a value is above or below a threshold"""
        # Get the input value - could be from various sources
        value = latest_data.get('value') or latest_data.get('input') or latest_data.get('close')
        if value is None:
            return False, "Input value not available for threshold check"
        
        try:
            value = float(value)
        except:
            return False, f"Cannot convert value to number: {value}"
        
        level = params.get('level', 50)
        try:
            level = float(level)
        except:
            level = 50
        
        output = params.get('output', 'signal').lower()
        
        if output == 'above':
            passed = value > level
            return passed, f"Value {value:.4f} {'>' if passed else '<='} {level:.4f}"
        elif output == 'below':
            passed = value < level
            return passed, f"Value {value:.4f} {'<' if passed else '>='} {level:.4f}"
        else:  # 'signal' - pass if above
            passed = value > level
            return passed, f"Value {value:.4f} {'>' if passed else '<='} threshold {level:.4f}"

    @staticmethod
    def check_crossover(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check for crossover between two lines"""
        # Get current and previous values for both lines
        a_curr = latest_data.get('a') or latest_data.get('a_current')
        a_prev = latest_data.get('a_prev') or latest_data.get('a_previous')
        b_curr = latest_data.get('b') or latest_data.get('b_current')
        b_prev = latest_data.get('b_prev') or latest_data.get('b_previous')
        
        if None in [a_curr, a_prev, b_curr, b_prev]:
            # Try alternative: EMA/SMA crossover with price
            ema = latest_data.get('ema')
            ema_prev = latest_data.get('ema_prev')
            close = latest_data.get('close')
            close_prev = latest_data.get('close_prev') or latest_data.get('price_prev')
            
            if None not in [ema, ema_prev, close, close_prev]:
                a_curr, a_prev = close, close_prev
                b_curr, b_prev = ema, ema_prev
            else:
                return False, "Crossover data not available (need current and previous values for both lines)"
        
        output = params.get('output', 'cross_up').lower()
        
        # Cross up: a was below b, now a is above b
        cross_up = a_prev <= b_prev and a_curr > b_curr
        # Cross down: a was above b, now a is below b
        cross_down = a_prev >= b_prev and a_curr < b_curr
        
        if output == 'cross_up':
            return cross_up, f"Crossover UP {'detected' if cross_up else 'not detected'}"
        elif output == 'cross_down':
            return cross_down, f"Crossover DOWN {'detected' if cross_down else 'not detected'}"
        else:  # 'any'
            passed = cross_up or cross_down
            direction = 'UP' if cross_up else ('DOWN' if cross_down else 'none')
            return passed, f"Crossover {direction} {'detected' if passed else 'not detected'}"

    @staticmethod
    def check_and_gate(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """AND logic gate - both inputs must be true"""
        a = latest_data.get('a')
        b = latest_data.get('b')
        
        # Convert to boolean
        def to_bool(val):
            if val is None:
                return None
            if isinstance(val, bool):
                return val
            if isinstance(val, (int, float)):
                return val != 0
            if isinstance(val, str):
                return val.lower() in ['true', '1', 'yes', 'passed']
            return bool(val)
        
        a_bool = to_bool(a)
        b_bool = to_bool(b)
        
        if a_bool is None or b_bool is None:
            return False, f"AND gate missing input(s): a={a}, b={b}"
        
        result = a_bool and b_bool
        return result, f"AND({a_bool}, {b_bool}) = {result}"

    @staticmethod
    def check_or_gate(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """OR logic gate - either input must be true"""
        a = latest_data.get('a')
        b = latest_data.get('b')
        
        def to_bool(val):
            if val is None:
                return None
            if isinstance(val, bool):
                return val
            if isinstance(val, (int, float)):
                return val != 0
            if isinstance(val, str):
                return val.lower() in ['true', '1', 'yes', 'passed']
            return bool(val)
        
        a_bool = to_bool(a)
        b_bool = to_bool(b)
        
        if a_bool is None and b_bool is None:
            return False, f"OR gate missing all inputs: a={a}, b={b}"
        
        # For OR, None inputs are treated as False
        a_bool = a_bool if a_bool is not None else False
        b_bool = b_bool if b_bool is not None else False
        
        result = a_bool or b_bool
        return result, f"OR({a_bool}, {b_bool}) = {result}"

    @staticmethod
    def check_not_gate(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """NOT logic gate - inverts the input"""
        # Use 'in' check to handle False values correctly
        if 'a' in latest_data:
            a = latest_data['a']
        elif 'input' in latest_data:
            a = latest_data['input']
        else:
            a = None
        
        def to_bool(val):
            if val is None:
                return None
            if isinstance(val, bool):
                return val
            if isinstance(val, (int, float)):
                return val != 0
            if isinstance(val, str):
                return val.lower() in ['true', '1', 'yes', 'passed']
            return bool(val)
        
        a_bool = to_bool(a)
        
        if a_bool is None:
            return False, f"NOT gate missing input: a={a}"
        
        result = not a_bool
        return result, f"NOT({a_bool}) = {result}"

    @staticmethod
    def check_time_filter(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check if current time is within trading hours"""
        from datetime import datetime
        import pytz
        
        try:
            et_tz = pytz.timezone('US/Eastern')
            now = datetime.now(et_tz)
            
            start_hour = int(params.get('start_hour', 9))
            start_minute = int(params.get('start_minute', 30))
            end_hour = int(params.get('end_hour', 16))
            end_minute = int(params.get('end_minute', 0))
            
            start_time = now.replace(hour=start_hour, minute=start_minute, second=0, microsecond=0)
            end_time = now.replace(hour=end_hour, minute=end_minute, second=0, microsecond=0)
            
            in_range = start_time <= now <= end_time
            
            # Check exclusion zones
            exclude_first = int(params.get('exclude_first_mins', 0))
            exclude_last = int(params.get('exclude_last_mins', 0))
            
            if in_range and exclude_first > 0:
                from datetime import timedelta
                if now < start_time + timedelta(minutes=exclude_first):
                    return False, f"Time {now.strftime('%H:%M')} ET in excluded first {exclude_first} mins"
            
            if in_range and exclude_last > 0:
                from datetime import timedelta
                if now > end_time - timedelta(minutes=exclude_last):
                    return False, f"Time {now.strftime('%H:%M')} ET in excluded last {exclude_last} mins"
            
            return in_range, f"Time {now.strftime('%H:%M')} ET {'within' if in_range else 'outside'} {start_hour}:{start_minute:02d}-{end_hour}:{end_minute:02d}"
        except Exception as e:
            return True, f"Time filter error (auto-pass): {e}"

    @staticmethod
    def check_trend_filter(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check trend direction based on fast/slow EMA"""
        fast_ema = latest_data.get('fast_ema') or latest_data.get('ema_fast')
        slow_ema = latest_data.get('slow_ema') or latest_data.get('ema_slow')
        
        # Try to get from generic ema/sma if specific not available
        if fast_ema is None:
            fast_ema = latest_data.get('ema') or latest_data.get('sma')
        if slow_ema is None:
            slow_ema = latest_data.get('sma') or latest_data.get('ema')
        
        if fast_ema is None or slow_ema is None:
            return True, "Trend filter: EMA data not available (auto-pass)"
        
        output = params.get('output', 'signal').lower()
        
        is_bullish = fast_ema > slow_ema
        is_bearish = fast_ema < slow_ema
        
        if output == 'bullish':
            return is_bullish, f"Trend {'bullish' if is_bullish else 'not bullish'} (fast {fast_ema:.2f} vs slow {slow_ema:.2f})"
        elif output == 'bearish':
            return is_bearish, f"Trend {'bearish' if is_bearish else 'not bearish'} (fast {fast_ema:.2f} vs slow {slow_ema:.2f})"
        elif output == 'neutral':
            is_neutral = abs(fast_ema - slow_ema) / slow_ema < 0.001  # Within 0.1%
            return is_neutral, f"Trend {'neutral' if is_neutral else 'not neutral'}"
        else:  # 'signal'
            return is_bullish, f"Trend signal: {'BULLISH' if is_bullish else 'BEARISH'} (fast {fast_ema:.2f} vs slow {slow_ema:.2f})"

    @staticmethod
    def check_volume_filter(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check if volume meets relative threshold"""
        volume = latest_data.get('volume')
        avg_volume = latest_data.get('avg_volume') or latest_data.get('volume_avg')
        
        if volume is None or avg_volume is None or avg_volume == 0:
            return True, "Volume filter: data not available (auto-pass)"
        
        threshold = params.get('threshold', 1.0)
        try:
            threshold = float(threshold)
        except:
            threshold = 1.0
        
        rel_volume = volume / avg_volume
        passed = rel_volume >= threshold
        
        return passed, f"Rel. volume {rel_volume:.2f}x {'>=' if passed else '<'} {threshold}x threshold"

    @staticmethod
    def check_price_levels(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Price levels is a data provider, always passes if data available"""
        high = latest_data.get('high')
        low = latest_data.get('low')
        close = latest_data.get('close')
        
        if None in [high, low, close]:
            return False, "Price level data not available"
        
        output = params.get('output', 'high')
        return True, f"Price levels: H={high:.2f}, L={low:.2f}, C={close:.2f}"

    @staticmethod
    def check_support_resistance(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Support/Resistance is a data provider"""
        support = latest_data.get('support')
        resistance = latest_data.get('resistance')
        close = latest_data.get('close')
        
        if support is None and resistance is None:
            return True, "Support/Resistance: data not calculated (auto-pass)"
        
        output = params.get('output', 'support')
        if output == 'support' and support:
            return True, f"Support level: ${support:.2f}"
        elif output == 'resistance' and resistance:
            return True, f"Resistance level: ${resistance:.2f}"
        else:
            return True, f"S/R levels: S=${support}, R=${resistance}"

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
        if cond == 'near':
            # Check if price is within threshold of VWAP (default 0.05%)
            threshold_pct = float(params.get('threshold', params.get('near_threshold', 0.0005)))
            pct_diff = abs(close - vwap) / vwap
            near = pct_diff < threshold_pct
            return near, f"Price ${close:.2f} {'near' if near else 'away from'} VWAP ${vwap:.2f} (diff={pct_diff*100:.3f}%)"
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

    @staticmethod
    def check_compare(latest_data: Dict, params: Dict) -> tuple[bool, str]:
        """Check comparison between two values with operator"""
        # Get operator and what fields to compare
        operator = params.get('operator', '>')
        
        # Try to get comparison values from params first (field names to look up)
        field_a = params.get('field_a') or params.get('a_field') or params.get('input_field')
        field_b = params.get('field_b') or params.get('b_field')
        
        # Get values - either from latest_data by field name, or directly from params
        if field_a:
            a_val = latest_data.get(field_a)
        else:
            # Try common field names
            a_val = latest_data.get('a') or latest_data.get('input') or latest_data.get('value') or latest_data.get('close')
        
        if field_b:
            b_val = latest_data.get(field_b)
        else:
            # Try latest_data first, then params
            b_val = latest_data.get('b')
            if b_val is None:
                b_val = params.get('value') or params.get('threshold') or params.get('b')
                # If still none, try other common fields
                if b_val is None:
                    b_val = latest_data.get('ema') or latest_data.get('sma')
        
        # Helper to extract scalar from potential list/array
        def to_scalar(val):
            if val is None:
                return None
            if isinstance(val, (list, tuple)):
                return val[-1] if len(val) > 0 else None
            return val
        
        a_val = to_scalar(a_val)
        b_val = to_scalar(b_val)
        
        if a_val is None or b_val is None:
            return False, f"Compare data not available (a={a_val}, b={b_val})"
        
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
                return False, f"Unknown operator: {operator}"
            
            return result, f"{a_num:.4f} {operator} {b_num:.4f} = {result}"
            
        except (ValueError, TypeError) as e:
            return False, f"Compare error: {e}"

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
            skip_types = ['symbol', 'timeframe', 'lookback', 'output', 'signal', 
                         'alpaca_config', 'config', 'start', 'end', 'entry', 'exit', 'note']
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
            # Indicators
            'rsi': self.evaluator.check_rsi,
            'ema': self.evaluator.check_ema,
            'sma': self.evaluator.check_ema,  # Similar logic
            'macd': self.evaluator.check_macd,
            'bollinger': self.evaluator.check_bollinger,
            'trendline': self.evaluator.check_trendline,
            'stochastic': self.evaluator.check_stochastic,
            'vwap': self.evaluator.check_vwap,
            'obv': self.evaluator.check_obv,
            'atr': self.evaluator.check_atr,
            
            # Volume
            'volspike': self.evaluator.check_volume_spike,
            'volume_spike': self.evaluator.check_volume_spike,
            'vol_spike': self.evaluator.check_volume_spike,
            
            # Price conditions
            'price_above': self.evaluator.check_price_above,
            'price_below': self.evaluator.check_price_below,
            'price_levels': self.evaluator.check_price_levels,
            'support_resistance': self.evaluator.check_support_resistance,
            
            # Logic gates
            'and': self.evaluator.check_and_gate,
            'or': self.evaluator.check_or_gate,
            'not': self.evaluator.check_not_gate,
            'compare': self.evaluator.check_compare,
            'threshold': self.evaluator.check_threshold,
            'crossover': self.evaluator.check_crossover,
            
            # Filters
            'time_filter': self.evaluator.check_time_filter,
            'trend_filter': self.evaluator.check_trend_filter,
            'volume_filter': self.evaluator.check_volume_filter,
        }
        
        evaluator_func = evaluators.get(block_type)
        if evaluator_func:
            return evaluator_func(latest_data, params)
        
        # Data source blocks that should auto-pass (they provide data, not conditions)
        data_source_types = ['input', 'price_history', 'volume_history', 'alpaca_config', 
                            'output', 'note', 'ai_agent']
        if block_type in data_source_types:
            return True, f"Data source block '{block_type}' (auto-pass)"
        
        # Unknown block types are treated as passed (they may be config/terminal blocks)
        # This allows workflows to include custom blocks without breaking
        return True, f"Block type '{block_type}' has no condition (auto-pass)"
